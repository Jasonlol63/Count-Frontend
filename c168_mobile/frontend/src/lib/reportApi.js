import { buildApiUrl } from "../utils/apiUrl.js";
import MoneyDecimal from "./money/moneyDecimal.js";
import { fetchAccountListByTenantId } from "./accountApi.js";
import { fetchTenantIdByCode } from "./tenantAccessibleApi.js";

/** Desktop-aligned report amount display (HALF_UP + abs < 0.005 → 0). */
export function formatReportAmount(value) {
  const zero = () => MoneyDecimal.formatThousands(MoneyDecimal.formatFixedHalfUp("0", 2), 2);
  if (value === null || value === undefined) return zero();
  const raw = String(value).trim();
  if (raw === "" || raw === "-") return zero();
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return zero();
  try {
    const absSmall = MoneyDecimal.cmp(MoneyDecimal.abs(cleaned), "0.005") < 0;
    const core = absSmall ? "0" : cleaned;
    return MoneyDecimal.formatThousands(MoneyDecimal.formatFixedHalfUp(core, 2), 2);
  } catch {
    return zero();
  }
}

export function reportAmountTone(value) {
  try {
    const n = MoneyDecimal.cmp(String(value ?? "0").replace(/,/g, ""), "0");
    if (n > 0) return "is-pos";
    if (n < 0) return "is-neg";
  } catch {
    /* ignore */
  }
  return "";
}

export function reportAmountAdd(a, b) {
  try {
    const sum = MoneyDecimal.add(String(a || "0"), String(b || "0"));
    return MoneyDecimal.stripTrailingZeros(sum.toFixed(8));
  } catch {
    return "0";
  }
}

/**
 * Bank-only company gating — desktop no longer calls a per-company permissions API for
 * this at all (`companyMatchesBankOnlyPillScope` in
 * Count-frontend/src/utils/company/companyCategoryFlags.js`). It reads `permissions` off
 * the already-loaded company row if present, else a `peekCompanySessionFlags` cache
 * populated by desktop's own session-sync plumbing that mobile does not have an
 * equivalent of, and **defaults to "not bank-only" when nothing is known** — mobile just
 * always takes that same default (permissive) path. Net effect: a bank-only company is no
 * longer pre-blocked from opening Domain/Customer Report on mobile before this is wired to
 * a real signal; it isn't a security gate, just a friendlier-error nicety, so this is a
 * soft simplification, not a functional regression of anything load-bearing.
 */
export async function fetchCompanyPermissions() {
  return [];
}

export function isBankOnlyCategoryCompany() {
  return false;
}

export async function companyIsBankOnly() {
  return false;
}

/** Desktop GROUP_PAYROLL_PROCESS_CODES parity. */
const DOMAIN_GROUP_CODES = ["PROFIT", "SALARY", "COMMISSION", "BONUS"];

function normalizeProcessCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s*\(.*$/, "");
}

function groupsAllChildScopes(scope) {
  if (scope?.mode !== "groupsAll") return null;
  const ids = Array.isArray(scope.groupIds) ? scope.groupIds : [];
  return ids
    .map((gid) => String(gid || "").trim().toUpperCase())
    .filter(Boolean)
    .map((groupId) => ({ mode: "group", companyId: null, groupId }));
}

async function mapGroupsAll(scope, mapper, { signal } = {}) {
  const children = groupsAllChildScopes(scope);
  if (!children?.length) return null;
  const settled = await Promise.all(
    children.map(async (child) => {
      try {
        return await mapper(child);
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        return null;
      }
    }),
  );
  return settled.filter(Boolean);
}

/** Resolve a scope (company id already numeric, or a group code) to a single tenant id. */
async function resolveScopeTenantId(scope, { signal } = {}) {
  if (scope?.mode === "group" && scope.groupId) {
    return fetchTenantIdByCode(scope.groupId, { signal });
  }
  const cid = Number(scope?.companyId);
  return Number.isFinite(cid) && cid > 0 ? cid : null;
}

/* ------------------------------------------------------------------ */
/* Process dropdown — Spring `POST /api/process/process-list`.         */
/* Company scope reads GAME-category rows; group scope (SALARY/        */
/* COMMISSION/BONUS/PROFIT payroll) reads BANK-category rows for the    */
/* group's own tenant — same split as desktop's domainReportApi.js.     */
/* ------------------------------------------------------------------ */

async function fetchProcessListRows(tenantId, { signal } = {}) {
  const res = await fetch(buildApiUrl("api/process/process-list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tenantId),
    signal,
  });
  const json = await res.json();
  if (!res.ok || json?.success !== true) {
    throw new Error(json?.message || "Failed to load processes");
  }
  return Array.isArray(json.data) ? json.data : [];
}

async function fetchDomainProcessesOnce(scope, { signal } = {}) {
  const tenantId = await resolveScopeTenantId(scope, { signal });
  if (!tenantId) return [];
  const rows = await fetchProcessListRows(tenantId, { signal });
  if (scope?.mode === "group") {
    return rows
      .filter((dto) => String(dto?.process?.category || "").trim().toUpperCase() === "BANK")
      .map((dto) => ({
        id: dto?.id ?? dto?.process?.id,
        process: String(dto?.process?.code || "").trim(),
        display_text: String(dto?.process?.code || "").trim(),
      }))
      .filter((row) => row.id != null && row.process);
  }
  return rows
    .filter((dto) => String(dto?.process?.category || "").trim().toUpperCase() === "GAME")
    .map((dto) => {
      const code = String(dto?.process?.code || "").trim();
      const desc = String(dto?.process?.description || "").trim();
      return { id: dto?.id ?? dto?.process?.id, process: code, display_text: desc ? `${code} (${desc})` : code };
    })
    .filter((row) => row.id != null && row.process);
}

function mapDomainGroupProcesses(apiList) {
  const rows = Array.isArray(apiList) ? apiList : [];
  const mapped = DOMAIN_GROUP_CODES.map((code) => {
    const row = rows.find((p) => {
      const fromProcess = normalizeProcessCode(p.process ?? p.process_id);
      const fromDisplay = normalizeProcessCode(p.display_text);
      return fromProcess === code || fromDisplay === code || fromDisplay.startsWith(`${code} `);
    });
    const id = row?.id != null ? Number(row.id) : 0;
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id, process: code, display_text: code };
  }).filter(Boolean);
  return mapped.length > 0 ? mapped : rows;
}

function mergeUniqueById(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const row of list || []) {
      const id = Number(row?.id);
      const key = Number.isFinite(id) && id > 0 ? `id:${id}` : normalizeProcessCode(row?.process ?? row?.display_text);
      if (!key || byId.has(key)) continue;
      byId.set(key, row);
    }
  }
  return [...byId.values()];
}

export async function fetchDomainProcesses(scope, { signal } = {}) {
  const merged = await mapGroupsAll(scope, (child) => fetchDomainProcessesOnce(child, { signal }), { signal });
  if (merged !== null) return mapDomainGroupProcesses(mergeUniqueById(merged));
  const rows = await fetchDomainProcessesOnce(scope, { signal });
  return scope?.mode === "group" ? mapDomainGroupProcesses(rows) : rows;
}

/* ------------------------------------------------------------------ */
/* Domain Report — Spring `POST /api/report/domain-report/list`.        */
/* ------------------------------------------------------------------ */

const ZERO_TOTALS = { turnover: "0", win: "0", lose: "0", win_lose: "0" };

function normalizeSpringDomainReportRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    process: row.processCode ?? "",
    description: row.description ?? "",
    turnover: row.turnoverAmount,
    win: row.winAmount,
    lose: row.loseAmount,
    win_lose: row.winLoseAmount,
  };
}

async function fetchDomainReportOnce({ scope, dateFrom, dateTo, processId }, { signal } = {}) {
  const tenantId = await resolveScopeTenantId(scope, { signal });
  if (!tenantId) throw new Error("Failed to load report");
  const category = scope?.mode === "group" ? "BANK" : "GAME";
  const pid = Number(processId);
  const body = {
    tenantId,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    processId: Number.isFinite(pid) && pid > 0 ? pid : null,
    category,
  };
  const res = await fetch(buildApiUrl("api/report/domain-report/list"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || json.error || "Failed to load report");

  const allRows = Array.isArray(json.data) ? json.data : [];
  let totals = { ...ZERO_TOTALS };
  const rows = [];
  for (const raw of allRows) {
    if (raw?.totalRow) {
      totals = {
        turnover: raw.turnoverAmount ?? "0",
        win: raw.winAmount ?? "0",
        lose: raw.loseAmount ?? "0",
        win_lose: raw.winLoseAmount ?? "0",
      };
      continue;
    }
    const row = normalizeSpringDomainReportRow(raw);
    if (row) rows.push(row);
  }
  return { rows, totals };
}

export async function fetchDomainReport({ scope, dateFrom, dateTo, processId }, { signal } = {}) {
  const merged = await mapGroupsAll(
    scope,
    (child) => fetchDomainReportOnce({ scope: child, dateFrom, dateTo, processId }, { signal }),
    { signal },
  );
  if (merged !== null) {
    if (!merged.length) throw new Error("Failed to load report");
    let rows = [];
    let totals = { ...ZERO_TOTALS };
    for (const part of merged) {
      rows = rows.concat(part.rows);
      totals = {
        turnover: reportAmountAdd(totals.turnover, part.totals.turnover),
        win: reportAmountAdd(totals.win, part.totals.win),
        lose: reportAmountAdd(totals.lose, part.totals.lose),
        win_lose: reportAmountAdd(totals.win_lose, part.totals.win_lose),
      };
    }
    return { success: true, data: rows, totals, date_from: dateFrom, date_to: dateTo };
  }
  const { rows, totals } = await fetchDomainReportOnce({ scope, dateFrom, dateTo, processId }, { signal });
  return { success: true, data: rows, totals, date_from: dateFrom, date_to: dateTo };
}

/* ------------------------------------------------------------------ */
/* Customer Report accounts / currencies / report.                     */
/* ------------------------------------------------------------------ */

export async function fetchCustomerAccounts(scope, { signal } = {}) {
  const merged = await mapGroupsAll(
    scope,
    async (child) => {
      const tid = await resolveScopeTenantId(child, { signal });
      return tid ? fetchAccountListByTenantId(tid, signal) : [];
    },
    { signal },
  );
  const lists = merged !== null ? merged : [await (async () => {
    const tid = await resolveScopeTenantId(scope, { signal });
    return tid ? fetchAccountListByTenantId(tid, signal) : [];
  })()];
  return mergeUniqueById(lists);
}

/**
 * Currency filter options for the Customer Report picker. Desktop's customerReportApi.js
 * has no dedicated "scope currencies" fetch any more (the old `get_scope_account_currencies_api.php`
 * has no direct Spring successor) — this uses `POST /api/currency/list?tenant_id=` (the
 * tenant's full configured currency set) as the option list instead of "only currencies
 * actually assigned to an account in this scope". Slightly broader than the old behavior,
 * but functionally safe: it can only ever show a filter option with no matching rows, never
 * hide one that has data.
 */
export async function fetchReportCurrencies(scope, { signal } = {}) {
  const tenantId = await resolveScopeTenantId(scope, { signal });
  if (!tenantId) return [];
  const res = await fetch(buildApiUrl(`api/currency/list?tenant_id=${encodeURIComponent(tenantId)}`), {
    method: "POST",
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) return [];
  return (Array.isArray(json.data) ? json.data : [])
    .map((row) => String(row?.code || "").trim().toUpperCase())
    .filter((code) => /^[A-Z]{3,5}$/.test(code))
    .map((code) => ({ code }));
}

function normalizeSpringCustomerReportRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.accountRowId ?? null,
    account_id: row.accountCode ?? "",
    name: row.accountName ?? "",
    currency: row.currencyCode ? String(row.currencyCode).trim().toUpperCase() : null,
    win: row.winAmount,
    lose: row.loseAmount,
  };
}

async function fetchCustomerReportOnce(
  { scope, dateFrom, dateTo, accountId, showAll, selectedCurrencies, showAllCurrencies },
  { signal } = {},
) {
  const tenantId = await resolveScopeTenantId(scope, { signal });
  if (!tenantId) throw new Error("Failed to load report");
  const aid = Number(accountId);
  const body = {
    tenantId,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    accountId: Number.isFinite(aid) && aid > 0 ? aid : null,
    currencyCodes:
      !showAllCurrencies && Array.isArray(selectedCurrencies) && selectedCurrencies.length > 0
        ? selectedCurrencies.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
        : null,
    showAll: Boolean(showAll),
  };
  const res = await fetch(buildApiUrl("api/report/customer-report/list"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || json.error || "Failed to load report");

  const allRows = Array.isArray(json.data) ? json.data : [];
  let totalWin = "0";
  let totalLose = "0";
  const rows = [];
  for (const raw of allRows) {
    if (raw?.totalRow) {
      totalWin = raw.winAmount ?? "0";
      totalLose = raw.loseAmount ?? "0";
      continue;
    }
    const row = normalizeSpringCustomerReportRow(raw);
    if (row) rows.push(row);
  }
  return { rows, totalWin, totalLose };
}

export async function fetchCustomerReport(
  { scope, dateFrom, dateTo, accountId, showAll, selectedCurrencies, showAllCurrencies },
  { signal } = {},
) {
  const args = { dateFrom, dateTo, accountId, showAll, selectedCurrencies, showAllCurrencies };
  const merged = await mapGroupsAll(
    scope,
    (child) => fetchCustomerReportOnce({ ...args, scope: child }, { signal }),
    { signal },
  );
  const parts = merged !== null ? merged : [await fetchCustomerReportOnce({ ...args, scope }, { signal })];
  if (merged !== null && !parts.length) throw new Error("Failed to load report");

  let rows = [];
  let totalWin = "0";
  let totalLose = "0";
  for (const part of parts) {
    rows = rows.concat(part.rows);
    totalWin = reportAmountAdd(totalWin, part.totalWin);
    totalLose = reportAmountAdd(totalLose, part.totalLose);
  }
  return { success: true, data: rows, total_win: totalWin, total_lose: totalLose, date_from: dateFrom, date_to: dateTo };
}
