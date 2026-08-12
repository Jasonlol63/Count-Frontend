import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  companiesInGroupList,
  pickDefaultSubsidiaryForGroup,
  pickGroupAnchorCompany,
} from "../../../utils/company/sharedCompanyFilter.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import {
  fetchDomainCompanyPermissions,
  isBankOnlyCategoryCompany,
} from "../shared/maintenanceCompanyApi.js";
import { fetchProcesses as fetchDomainReportProcesses } from "../../report/domain/domainReportApi.js";
import { mapDomainGroupProcesses } from "../../report/domain/domainReportGroupProcesses.js";
import { fetchProcessListByTenantId } from "../../processlist/processListApi.js";
import {
  transactionMaintenanceScopeCacheKey,
  transactionMaintenanceUsesGroupProcesses,
} from "./transactionMaintenanceScope.js";

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
    msg.includes("err_quic")
  );
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

export async function fetchProcesses(companyId, scope = null) {
  return fetchProcessesForMaintenance(companyId, "", scope);
}

export async function fetchProcessesForPermission(companyId, permission, scope = null) {
  return fetchProcessesForMaintenance(companyId, permission, scope);
}

export async function fetchProcessesForMaintenance(companyId, permission, scope = null) {
  const payrollChannel = Boolean(scope?.c168Channel || scope?.companyPayrollChannel);
  if (String(permission).toLowerCase() === "bank" || payrollChannel) {
    return [
      { id: "PROFIT", process_name: "PROFIT", description: null },
      { id: "SALARY", process_name: "SALARY", description: null },
      { id: "COMMISSION", process_name: "COMMISSION", description: null },
      { id: "BONUS", process_name: "BONUS", description: null },
    ];
  }
  if (scope && transactionMaintenanceUsesGroupProcesses(scope) && !payrollChannel) {
    const apiList = await fetchDomainReportProcesses(scope, { credentials: "include" });
    return mapProcessesForMaintenanceSelect(mapDomainGroupProcesses(apiList));
  }
  // Company mode: every GAME-category process under the current tenant (Spring `/api/process/process-list`,
  // same source as the Process List page — BANK rows are already filtered out by normalizeProcessListRows).
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const rows = await fetchProcessListByTenantId(effectiveId);
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

/**
 * Active-permission pick, forcing "Bank" for payroll-channel companies (C168 / bank-only, e.g. OK2).
 *
 * `fetchCompanyPermissions` → `fetchDomainCompanyPermissions` calls the legacy `api/domain/domain_api.php`
 * endpoint, which the Spring backend never implemented (the reverse proxy sends every `/api/*` path
 * straight to Spring now, so it 500s). Its catch-all fallback returns the full default permission list
 * (`["Games","Bank",...]`), and `pickTransactionMaintenancePermission` always prefers Games/Gambling first —
 * so a bank-only company silently gets defaulted to GAME category even though its real rows are BANK.
 * `fetchProcessesForMaintenance` already works around this same broken call for the Process dropdown via
 * `scope.companyPayrollChannel`/`scope.c168Channel`; mirror that override here so category resolution
 * agrees with what the dropdown actually shows (SALARY/BONUS/PROFIT/COMMISSION are BANK-category processes).
 */
export function resolveTransactionMaintenanceActivePermission(permissions, saved, scope = null) {
  if (scope?.c168Channel || scope?.companyPayrollChannel) return "Bank";
  return pickTransactionMaintenancePermission(permissions, saved);
}

/**
 * Resolve the `category` sent to the Spring endpoint (Loan/Rate/Money → Games).
 * Required by the backend — it hard-filters `data_captures.category` so GAME/BANK rows never mix.
 *
 * Bank permission always maps to "Bank" (→ BANK), even for payroll-channel/C168 companies:
 * `data_captures.category` is set purely from the submitted process's own `process.category`
 * (DataCaptureSummaryServiceImpl), and SALARY/BONUS/PROFIT/COMMISSION are BANK-category
 * processes — there is no "payroll companies store Bank data as GAME" behavior on the backend.
 */
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

/** Client-side text filter across visible columns. */
export function filterTransactionMaintenanceRowsBySearch(rows, searchTerm) {
  const q = String(searchTerm || "").trim().toUpperCase();
  const list = Array.isArray(rows) ? rows : [];
  if (!q) return list;
  const fields = [
    "process",
    "id_product",
    "account",
    "description",
    "remark",
    "currency",
    "rate",
    "cr",
    "dr",
    "percent",
    "created_by",
    "deleted_by",
    "dts_created",
    "dts_deleted",
  ];
  const filtered = list
    .filter((row) =>
      fields.some((field) => {
        const value = String(row?.[field] ?? "").toUpperCase();
        return value !== "" && value.includes(q);
      }),
    )
    .map((row) => ({ ...row }));
  return renumberMaintenanceRows(filtered);
}

/** 按 dts_created（新→旧）+ id 降序合并多公司结果（Group 聚合视图）。 */
function parseMaintenanceDtsTimestamp(value) {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime();
}

function compareMaintenanceRows(a, b) {
  const tsA = parseMaintenanceDtsTimestamp(a.dts_created);
  const tsB = parseMaintenanceDtsTimestamp(b.dts_created);
  if (tsA !== tsB) return tsB - tsA;
  return Number(b.id ?? 0) - Number(a.id ?? 0);
}

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Spring LocalDateTime → dd/MM/yyyy HH:mm:ss for existing table display. */
function formatTransactionMaintenanceCreatedAt(value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value) && value.length >= 3) {
    const [y, m, d, hh = 0, mm = 0, ss = 0] = value;
    return `${pad2(d)}/${pad2(m)}/${y} ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  const raw = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw;
  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6] || "00"}`;
  }
  return raw;
}

/**
 * Spring POST /api/maintenance/transaction-maintenance/list body (tenant-only).
 * `category` is required — the backend hard-filters GAME/BANK, never mixes them.
 */
export function buildSpringTransactionMaintenanceRequest({
  tenantId,
  dateFrom,
  dateTo,
  process,
  category,
  q,
} = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const cat = String(category || "").trim();
  if (!cat) {
    throw new Error("categoryRequired");
  }
  return {
    tenantId: tid,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    process: String(process || "").trim() || null,
    category: cat,
    q: String(q || "").trim() || null,
  };
}

/** Spring TransactionLineMaintenanceRow → table row fields (aligned to backend camelCase). */
export function normalizeSpringTransactionMaintenanceRow(row) {
  if (!row || typeof row !== "object") return null;
  const isDeleted = row.deleted === true || row.deleted === 1 || row.deleted === "1";
  return {
    id: row.id ?? null,
    dts_created: formatTransactionMaintenanceCreatedAt(row.dtsCreated),
    process: row.process ?? "",
    id_product: row.idProduct ?? "",
    account: row.account ?? "",
    description: row.description ?? "",
    remark: row.remark ?? "",
    percent: row.percent ?? "",
    currency: String(row.currency || "").trim().toUpperCase(),
    rate: row.rate ?? "",
    cr: row.cr,
    dr: row.dr,
    created_by: row.createdBy ?? "",
    is_deleted: isDeleted ? 1 : 0,
    deleted_by: row.deletedBy ?? "",
    dts_deleted: formatTransactionMaintenanceCreatedAt(row.deletedAt),
  };
}

/** Single-tenant fetch via Spring POST /api/maintenance/transaction-maintenance/list (no pagination). */
async function fetchTransactionMaintenanceOnce({
  tenantId,
  dateFrom,
  dateTo,
  process,
  category,
  q,
  signal,
}) {
  const body = buildSpringTransactionMaintenanceRequest({
    tenantId,
    dateFrom,
    dateTo,
    process,
    category,
    q,
  });

  let response;
  try {
    response = await fetch(buildApiUrl("api/maintenance/transaction-maintenance/list"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    rethrowIfAborted(err, signal);
    const wrapped = new Error(err?.message || "Failed to fetch");
    wrapped.isMaintenanceTransfer = true;
    throw wrapped;
  }

  const data = await response.json();
  if (!data?.success) {
    throw new Error(data?.message || "Search failed");
  }

  const rows = Array.isArray(data.data) ? data.data : [];
  return renumberMaintenanceRows(
    rows.map(normalizeSpringTransactionMaintenanceRow).filter(Boolean),
  );
}

/** Resolve the single tenantId a scope points at (company mode / one leg of an aggregate loop). */
function resolveTransactionMaintenanceTenantId(scope) {
  const id = Number(scope?.scopeCompanyId ?? scope?.uiCompanyId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Search transaction maintenance data via the Spring endpoint (tenant-only, no pagination).
 * Group "aggregate" scope still loops per company client-side and merges — the backend has
 * never supported cross-company queries, that behavior was always driven from the frontend.
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
      const rows = await fetchTransactionMaintenanceOnce({
        tenantId: Number(scopedCompanyId),
        dateFrom,
        dateTo,
        process: processFilter,
        category: categoryFilter,
        q: null,
        signal,
      });
      if (!rows.length) continue;
      merged = merged.length ? mergeSortedMaintenanceRows(merged, rows) : rows;
      emitProgress(merged);
    }
    return renumberMaintenanceRows(merged);
  }

  const tenantId = resolveTransactionMaintenanceTenantId(scope);
  if (!tenantId) {
    throw new Error("tenantIdRequired");
  }
  const rows = await fetchTransactionMaintenanceOnce({
    tenantId,
    dateFrom,
    dateTo,
    process: processFilter,
    category: categoryFilter,
    q: null,
    signal,
  });
  emitProgress(rows);
  return rows;
}

export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`auth/switch-tenant?tenant_id=${companyId}`), {
    method: "POST",
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
