import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { formatDmy, parseDdMmYyyyToYmd, parseYmd } from "../../../utils/date/dateUtils.js";
import {
  companiesInGroupList,
  pickDefaultSubsidiaryForGroup,
  pickGroupAnchorCompany,
} from "../../../utils/company/sharedCompanyFilter.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import {
  fetchDomainCompanyPermissions,
  fetchMaintenanceProcesses,
  isBankOnlyCategoryCompany,
} from "../shared/maintenanceCompanyApi.js";
import { fetchProcesses as fetchDomainReportProcesses } from "../../report/domain/domainReportApi.js";
import { mapDomainGroupProcesses } from "../../report/domain/domainReportGroupProcesses.js";
import {
  transactionMaintenanceScopeApiParams,
  transactionMaintenanceScopeCacheKey,
  transactionMaintenanceUsesGroupProcesses,
} from "./transactionMaintenanceScope.js";

/** 宽日期兜底分片（游标分页下通常整段一次查完；仅超范围或失败再分片）。 */
const MAINTENANCE_CHUNK_DAYS = 90;
const MAINTENANCE_CHUNK_THRESHOLD_DAYS = 400;
/** 首屏尽快出表；后续大批量游标拉取（后端 UNION 单查询，每页只扫 page_size 行）。 */
const MAINTENANCE_FIRST_PAGE_SIZE = 800;
const MAINTENANCE_PAGE_SIZES = [5000, 3500, 2000, 1000, 500];
const MAINTENANCE_MAX_PAGES = 100;
const MAINTENANCE_FETCH_RETRIES = 4;
const MAINTENANCE_RETRY_BASE_MS = 400;

function isFetchAbortError(err, signal) {
  if (signal?.aborted) return true;
  if (err?.name === "AbortError") return true;
  return false;
}

function rethrowIfAborted(err, signal) {
  if (!isFetchAbortError(err, signal)) return;
  if (err?.name === "AbortError") throw err;
  throw new DOMException("The operation was aborted.", "AbortError");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMaintenanceTransferError(err) {
  if (err?.isMaintenanceTransfer) return true;
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("http2") ||
    msg.includes("quic") ||
    msg.includes("err_quic") ||
    msg.includes("incomplete") ||
    msg.includes("unexpected end") ||
    msg.includes("search failed (502)") ||
    msg.includes("search failed (503)") ||
    msg.includes("search failed (504)") ||
    msg.includes("search failed (413)") ||
    msg.includes("search failed (524)") ||
    msg.includes("search failed (520)") ||
    msg.includes("search failed (0)")
  );
}

function throwMaintenanceTransferError(message = "Failed to fetch") {
  const err = new Error(message);
  err.isMaintenanceTransfer = true;
  throw err;
}

export async function fetchCompanyPermissions(companyCode) {
  return fetchDomainCompanyPermissions(companyCode, { credentials: true });
}

export { isBankOnlyCategoryCompany };

/** ProcessSelect rows: { id, process_name, description }. */
export function mapProcessesForMaintenanceSelect(apiList) {
  return (Array.isArray(apiList) ? apiList : []).map((row) => {
    const processName = String(
      row.process_name ?? row.process ?? row.process_id ?? "",
    ).trim();
    return {
      id: row.id,
      process_name: processName,
      description: row.description ?? null,
    };
  });
}

function appendMaintenanceScopeToParams(params, scope) {
  const {
    companyId,
    viewGroup,
    groupId,
    reportScope,
    groupsAll,
    groupAll,
    groupOnly,
    groupAggregate,
  } = transactionMaintenanceScopeApiParams(scope);
  if (companyId) params.append("company_id", String(companyId));
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) params.append("view_group", vg);
  const gid = groupId
    ? String(groupId).trim().toUpperCase()
    : vg;
  if (gid) params.append("group_id", gid);
  if (groupsAll) params.append("groups_all", "1");
  if (groupAll) params.append("group_all", "1");
  if (reportScope) params.append("report_scope", reportScope);
  if (groupOnly) params.append("group_only", "1");
  if (groupAggregate) params.append("group_aggregate", "1");
}

export async function fetchProcesses(companyId, scope = null) {
  return fetchProcessesForMaintenance(companyId, "", scope);
}

export async function fetchProcessesForPermission(companyId, permission, scope = null) {
  return fetchProcessesForMaintenance(companyId, permission, scope);
}

export async function fetchProcessesForMaintenance(companyId, permission, scope = null) {
  if (scope && transactionMaintenanceUsesGroupProcesses(scope)) {
    const apiList = await fetchDomainReportProcesses(scope, { credentials: "include" });
    return mapProcessesForMaintenanceSelect(mapDomainGroupProcesses(apiList));
  }
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const rows = await fetchMaintenanceProcesses(effectiveId, {
    credentials: true,
    permission,
  });
  return mapProcessesForMaintenanceSelect(rows);
}

/**
 * Load permission/category + process list when Company is cleared (group-only).
 * Uses a group anchor company for permissions UI only — does not select that company.
 */
export async function bootstrapTransactionMaintenanceMeta({
  companies,
  groupId = null,
  anchorCompany = null,
}) {
  const anchor =
    anchorCompany ??
    (groupId ? companiesInGroupList(companies, groupId)[0] : null) ??
    (Array.isArray(companies) ? companies[0] : null) ??
    null;
  const code = anchor?.company_id ? String(anchor.company_id) : "";
  const companyPerms = code
    ? await fetchCompanyPermissions(code)
    : filterTransactionMaintenancePermissions(["Games", "Gambling", "Bank"]);
  const savedPerm = code ? localStorage.getItem(`selectedPermission_${code}`) : null;
  const activePermission = pickTransactionMaintenancePermission(companyPerms, savedPerm);
  return { permissions: companyPerms, activePermission };
}

/** Transaction Maintenance 仅 Games/Gambling/Bank 有数据；Loan/Rate/Money 与其它维护页共用 localStorage 时会误传。 */
const TXN_MAINTENANCE_SEARCH_CATEGORIES = new Set(["games", "gambling", "bank"]);
const TXN_MAINTENANCE_EMPTY_CATEGORIES = new Set(["loan", "rate", "money"]);
/** 与 Payment 等页共用 localStorage；Bank 在本页会跳过 Data Capture，默认不恢复 saved Bank。 */
const TXN_MAINTENANCE_IGNORE_SAVED_CATEGORIES = new Set(["loan", "rate", "money", "bank"]);

/** 本页可选的 Category 按钮（过滤 Loan/Rate/Money）。 */
export function filterTransactionMaintenancePermissions(permissions) {
  const perms = Array.isArray(permissions) ? permissions : [];
  const filtered = perms.filter((p) =>
    TXN_MAINTENANCE_SEARCH_CATEGORIES.has(String(p).toLowerCase()),
  );
  return filtered.length > 0 ? filtered : perms;
}

/** 选择默认 Category：优先 Games/Gambling，忽略 Loan/Rate/Money/Bank 的 localStorage。 */
export function pickTransactionMaintenancePermission(permissions, saved) {
  const perms = filterTransactionMaintenancePermissions(permissions);
  const savedLower = String(saved ?? "").toLowerCase();
  if (
    saved &&
    perms.includes(saved) &&
    !TXN_MAINTENANCE_IGNORE_SAVED_CATEGORIES.has(savedLower)
  ) {
    return saved;
  }
  return (
    perms.find((p) => {
      const lower = String(p).toLowerCase();
      return lower === "games" || lower === "gambling";
    }) ||
    perms.find((p) => String(p).toLowerCase() === "bank") ||
    perms[0] ||
    ""
  );
}

/** 传给 maintenance_search_api 的 category（Loan/Rate/Money → Games）。 */
export function resolveTransactionMaintenanceCategory(permission) {
  const raw = String(permission ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (TXN_MAINTENANCE_EMPTY_CATEGORIES.has(lower)) return "Games";
  if (lower === "gambling") return "Games";
  return raw;
}

/** Select All 误传占位文案时视为未选 Process。 */
export function normalizeMaintenanceProcessFilter(process) {
  const raw = String(process ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (
    lower === "select all" ||
    lower === "--select all--" ||
    raw === "全部" ||
    raw === "--全部--"
  ) {
    return "";
  }
  return raw;
}

function renumberMaintenanceRows(rows) {
  rows.forEach((row, index) => {
    row.no = index + 1;
  });
  return rows;
}

function finalizeMaintenanceRows(rows) {
  const merged = [...rows];
  merged.sort(compareMaintenanceRows);
  return renumberMaintenanceRows(merged);
}

/** 两段均已按 compareMaintenanceRows 降序时 O(n) 归并。 */
function mergeSortedMaintenanceRows(left, right) {
  if (!left.length) return renumberMaintenanceRows([...right]);
  if (!right.length) return renumberMaintenanceRows([...left]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (compareMaintenanceRows(left[i], right[j]) <= 0) {
      out.push(left[i++]);
    } else {
      out.push(right[j++]);
    }
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return renumberMaintenanceRows(out);
}

/** 同日期段内分页结果可直接追加（API 已全局降序）。 */
function appendMaintenancePageRows(existing, pageRows) {
  if (!pageRows.length) return existing;
  if (!existing.length) return renumberMaintenanceRows([...pageRows]);
  return renumberMaintenanceRows(existing.concat(pageRows));
}

/**
 * Search transaction maintenance data.
 * Automatically: splits wide date ranges → paginates each slice → retries → splits again on failure.
 */
export async function searchTransactionData({
  dateFrom,
  dateTo,
  process,
  category,
  scope,
  signal,
  onFirstPage,
  onProgress,
}) {
  const processFilter = normalizeMaintenanceProcessFilter(process);
  const categoryFilter = resolveTransactionMaintenanceCategory(category);
  const emitProgress = (rows) => {
    if (!rows.length) return;
    const snapshot = renumberMaintenanceRows([...rows]);
    if (typeof onProgress === "function") onProgress(snapshot);
    else if (typeof onFirstPage === "function") onFirstPage(snapshot);
  };

  const mergeCompanyIds =
    scope?.mode === "aggregate" && Array.isArray(scope.mergeCompanyIds)
      ? scope.mergeCompanyIds.filter((id) => Number(id) > 0)
      : [];

  if (mergeCompanyIds.length > 0) {
    let merged = [];
    for (const scopedCompanyId of mergeCompanyIds) {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      const subScope = {
        ...scope,
        mode: "company",
        scopeCompanyId: Number(scopedCompanyId),
        uiCompanyId: Number(scopedCompanyId),
        mergeCompanyIds: [Number(scopedCompanyId)],
        groupsAllMode: false,
        groupAllMode: false,
      };
      const part = await fetchMaintenanceDateRangeResilient({
        dateFrom,
        dateTo,
        process: processFilter,
        category: categoryFilter,
        scope: subScope,
        signal,
        onProgress:
          typeof onProgress === "function"
            ? (rows) => {
                if (!rows.length) return;
                merged = merged.length
                  ? mergeSortedMaintenanceRows(merged, finalizeMaintenanceRows(rows))
                  : finalizeMaintenanceRows(rows);
                emitProgress(merged);
              }
            : undefined,
      });
      if (!part.length) continue;
      merged = merged.length
        ? mergeSortedMaintenanceRows(merged, finalizeMaintenanceRows(part))
        : finalizeMaintenanceRows(part);
      if (typeof onProgress === "function") emitProgress(merged);
    }
    return renumberMaintenanceRows(merged);
  }

  const merged = await fetchMaintenanceDateRangeResilient({
    dateFrom,
    dateTo,
    process: processFilter,
    category: categoryFilter,
    scope,
    signal,
    onProgress: emitProgress,
  });
  return renumberMaintenanceRows(merged);
}

async function fetchMaintenanceDateRangeResilient({
  dateFrom,
  dateTo,
  process,
  category,
  scope,
  signal,
  onProgress,
}) {
  const daySpan = maintenanceDateSpanDays(dateFrom, dateTo);
  const ranges =
    daySpan > MAINTENANCE_CHUNK_THRESHOLD_DAYS
      ? splitMaintenanceDateRange(dateFrom, dateTo, MAINTENANCE_CHUNK_DAYS)
      : [{ dateFrom, dateTo }];
  const rangesNewestFirst = [...ranges].reverse();

  if (rangesNewestFirst.length === 1) {
    return fetchMaintenanceRangeWithSplit({
      dateFrom: rangesNewestFirst[0].dateFrom,
      dateTo: rangesNewestFirst[0].dateTo,
      process,
      category,
      scope,
      signal,
      onProgress,
    });
  }

  let merged = [];
  for (const range of rangesNewestFirst) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const part = await fetchMaintenanceRangeWithSplit({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      process,
      category,
      scope,
      signal,
    });
    if (!part.length) continue;
    merged = merged.length
      ? mergeSortedMaintenanceRows(merged, finalizeMaintenanceRows(part))
      : finalizeMaintenanceRows(part);
    if (typeof onProgress === "function") onProgress(merged);
  }
  return merged;
}

async function fetchMaintenanceRangeWithSplit(params) {
  const { onProgress, ...rest } = params;
  try {
    return await fetchAllPagesForRange(rest, 0, onProgress);
  } catch (err) {
    rethrowIfAborted(err, params.signal);
    if (!isMaintenanceTransferError(err)) throw err;

    const daySpan = maintenanceDateSpanDays(params.dateFrom, params.dateTo);
    if (daySpan <= 1) {
      return fetchAllPagesForRange(rest, MAINTENANCE_PAGE_SIZES.length - 1, onProgress);
    }

    const [olderRange, newerRange] = splitMaintenanceDateRangeHalf(params.dateFrom, params.dateTo);
    const newer = await fetchMaintenanceRangeWithSplit({
      ...rest,
      dateFrom: newerRange.dateFrom,
      dateTo: newerRange.dateTo,
      onProgress,
    });
    const older = await fetchMaintenanceRangeWithSplit({
      ...rest,
      dateFrom: olderRange.dateFrom,
      dateTo: olderRange.dateTo,
    });
    if (!newer.length) return finalizeMaintenanceRows(older);
    if (!older.length) return newer;
    return mergeSortedMaintenanceRows(newer, finalizeMaintenanceRows(older));
  }
}

function maintenancePageSizeForRequest(isFirstPage, pageSizeIndex) {
  if (isFirstPage) return MAINTENANCE_FIRST_PAGE_SIZE;
  return MAINTENANCE_PAGE_SIZES[Math.min(pageSizeIndex, MAINTENANCE_PAGE_SIZES.length - 1)];
}

async function fetchAllPagesForRange(params, pageSizeIndex, onProgress) {
  const fetchBatch = async ({ cursor, page }) => {
    const pageSize = maintenancePageSizeForRequest(page === 1 && !cursor, pageSizeIndex);
    try {
      return await fetchMaintenancePageWithRetries({
        ...params,
        cursor,
        pageSize,
        page: cursor ? 1 : page,
      });
    } catch (err) {
      rethrowIfAborted(err, params.signal);
      if (isMaintenanceTransferError(err) && pageSizeIndex < MAINTENANCE_PAGE_SIZES.length - 1) {
        return fetchAllPagesForRange(params, pageSizeIndex + 1, onProgress);
      }
      throw err;
    }
  };

  let all = [];
  let cursor = null;
  let currentPage = 1;
  let loops = 0;

  while (loops < MAINTENANCE_MAX_PAGES) {
    if (params.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const result = await fetchBatch({ cursor, page: currentPage });
    if (result.data?.length) {
      all = appendMaintenancePageRows(all, result.data);
      if (typeof onProgress === "function") onProgress(all);
    }
    if (!result.pagination?.has_more) break;
    const nextCursor = result.pagination?.next_cursor;
    if (nextCursor) {
      cursor = nextCursor;
      currentPage = 1;
    } else {
      cursor = null;
      currentPage += 1;
    }
    loops += 1;
  }

  return all;
}

async function fetchMaintenancePageWithRetries(params) {
  let lastErr;
  for (let attempt = 0; attempt < MAINTENANCE_FETCH_RETRIES; attempt += 1) {
    try {
      return await searchTransactionMaintenanceOnce(params);
    } catch (err) {
      lastErr = err;
      rethrowIfAborted(err, params.signal);
      if (!isMaintenanceTransferError(err)) throw err;
      if (attempt < MAINTENANCE_FETCH_RETRIES - 1) {
        await sleep(MAINTENANCE_RETRY_BASE_MS * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

function splitMaintenanceDateRangeHalf(dateFrom, dateTo) {
  const start = parseMaintenanceDmyDate(dateFrom);
  const totalDays = maintenanceDateSpanDays(dateFrom, dateTo);
  const mid = new Date(start);
  mid.setDate(mid.getDate() + Math.floor(totalDays / 2) - 1);
  const rightStart = new Date(mid);
  rightStart.setDate(rightStart.getDate() + 1);
  return [
    { dateFrom, dateTo: formatDmy(mid) },
    { dateFrom: formatDmy(rightStart), dateTo },
  ];
}

function maintenanceDateSpanDays(dateFrom, dateTo) {
  const start = parseMaintenanceDmyDate(dateFrom);
  const end = parseMaintenanceDmyDate(dateTo);
  if (!start || !end || start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function parseMaintenanceDmyDate(dmy) {
  const ymd = parseDdMmYyyyToYmd(dmy);
  return ymd ? parseYmd(ymd) : null;
}

function splitMaintenanceDateRange(dateFrom, dateTo, maxDays) {
  const start = parseMaintenanceDmyDate(dateFrom);
  const end = parseMaintenanceDmyDate(dateTo);
  if (!start || !end || start > end) return [{ dateFrom, dateTo }];

  const chunks = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ dateFrom: formatDmy(cursor), dateTo: formatDmy(chunkEnd) });
    cursor.setTime(chunkEnd.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

function parseMaintenanceDtsTimestamp(value) {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime();
}

function compareMaintenanceRows(a, b) {
  const dateA = a.transaction_date ?? "";
  const dateB = b.transaction_date ?? "";
  if (dateA !== dateB) return dateB.localeCompare(dateA);

  const tsA = parseMaintenanceDtsTimestamp(a.dts_created);
  const tsB = parseMaintenanceDtsTimestamp(b.dts_created);
  if (tsA !== tsB) return tsB - tsA;

  const capA = Number(a.capture_id ?? 0);
  const capB = Number(b.capture_id ?? 0);
  if (capA !== capB) return capB - capA;

  const detA = Number(a.capture_detail_id ?? 0);
  const detB = Number(b.capture_detail_id ?? 0);
  if (detA !== detB) return detB - detA;

  return Number(b.transaction_id ?? 0) - Number(a.transaction_id ?? 0);
}

async function searchTransactionMaintenanceOnce({
  dateFrom,
  dateTo,
  process,
  category,
  scope,
  signal,
  page = 1,
  pageSize = MAINTENANCE_FIRST_PAGE_SIZE,
  cursor = null,
}) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  params.append("page_size", String(pageSize));
  if (cursor) {
    params.append("cursor", cursor);
    params.append("page", "1");
  } else {
    params.append("page", String(page));
  }
  if (process) params.append("process", process);
  appendMaintenanceScopeToParams(params, scope);
  if (category) params.append("category", category);

  const url = buildApiUrl(`api/transactions/maintenance_search_api.php?${params.toString()}`);
  let response;
  try {
    response = await fetch(url, {
      credentials: "include",
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    rethrowIfAborted(err, signal);
    if (isMaintenanceTransferError(err)) throw err;
    throwMaintenanceTransferError(err?.message || "Failed to fetch");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      const status = response.status || 0;
      if (status >= 500 || status === 0 || status === 413 || status === 524) {
        throwMaintenanceTransferError("Failed to fetch");
      }
      throw new Error(`HTTP ${status}`);
    }
    throwMaintenanceTransferError("Failed to fetch");
  }

  if (!response.ok || !data.success) {
    const detail = data.error || data.message;
    const status = response.status || 0;
    if (!detail && (status >= 500 || status === 0 || status === 413 || status === 524)) {
      throwMaintenanceTransferError("Failed to fetch");
    }
    throw new Error(detail || `HTTP ${status}`);
  }

  const rows = Array.isArray(data.data) ? data.data : [];
  const pagination = data.pagination ?? {
    page,
    page_size: pageSize,
    total: rows.length,
    has_more: false,
    next_cursor: null,
  };

  return { data: rows, pagination };
}

export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`), {
    credentials: "include",
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to update session company');
  }
  return result.data;
}

/** Group-only: sync anchor subsidiary + view_group before maintenance search APIs run. */
export async function syncTransactionMaintenanceGroupAnchorSession(
  companies,
  groupId,
  sessionCompanyId = null,
  options = {},
) {
  const { notify = true } = options;
  const g = groupId ? String(groupId).trim().toUpperCase() : "";
  if (!g) return false;
  const anchor =
    pickDefaultSubsidiaryForGroup(companies, g, {
      preferredCompanyId: sessionCompanyId,
    }) ?? pickGroupAnchorCompany(companies, g);
  const id = anchor?.id != null ? Number(anchor.id) : Number.NaN;
  if (!Number.isFinite(id) || id <= 0) return false;
  const json = await syncCompanySessionApi(id, g);
  if (json?.success && notify) notifyCompanySessionUpdated();
  return Boolean(json?.success);
}

export function isMaintenanceRecoverableError(err) {
  if (!err || err?.name === "AbortError") return false;
  return isMaintenanceTransferError(err);
}

export function getMaintenanceSearchUserMessage(
  err,
  { loadingMessage = "Loading data…", narrowRangeMessage = "Loading is taking longer. Try a shorter date range or select a Process." } = {},
) {
  if (!err || isMaintenanceRecoverableError(err)) {
    return loadingMessage;
  }
  const detail = String(err?.message || "").trim();
  return detail || narrowRangeMessage;
}

export function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '-';
  const val = parseFloat(value);
  if (isNaN(val)) return '-';
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** React Query 缓存：区分「加载完成」与「中途切换公司被中断的半成品」。 */
export function packMaintenanceCache(rows, complete = false) {
  return { rows: Array.isArray(rows) ? rows : [], complete: Boolean(complete) };
}

export function getMaintenanceCacheRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.rows) ? data.rows : [];
}

/** 仅 complete===true 视为可长期复用的完整结果；无缓存/数组旧缓存视为未完成。 */
export function isMaintenanceCacheComplete(data) {
  if (!data) return false;
  if (Array.isArray(data)) return false;
  return data.complete === true;
}

/** React Query queryKey（与 TransactionMaintenancePage 一致）。 */
export function buildTransactionMaintenanceQueryKey({
  scope,
  dateFrom,
  dateTo,
  process,
  category,
}) {
  return [
    "transaction-maintenance",
    transactionMaintenanceScopeCacheKey(scope),
    dateFrom,
    dateTo,
    normalizeMaintenanceProcessFilter(process),
    category || "",
  ];
}
