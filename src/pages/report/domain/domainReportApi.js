import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchProcessListByTenantId, resolveProcessListTenantId } from "../../processlist/processListApi.js";
import { formatReportAmount, reportAmountAdd } from "../shared/reportAmountFormat.js";

export const formatAmount = formatReportAmount;

/**
 * Same `POST /api/process/process-list` endpoint as `fetchProcessListByTenantId`, but reads the raw
 * DTO rows directly instead of going through `normalizeProcessListRows` — that helper deliberately
 * drops `category === "BANK"` rows for the Games Process List page. Group-scope Domain Report wants
 * exactly those BANK rows (PROFIT/SALARY/COMMISSION/BONUS payroll processes).
 */
async function fetchBankProcessesByTenantId(tenantId, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const res = await fetch(buildApiUrl("api/process/process-list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tid),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !(json?.success === true)) {
    throw new Error(json?.message || "Failed to load processes");
  }
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .filter((dto) => String(dto?.process?.category || "").trim().toUpperCase() === "BANK")
    .map((dto) => ({
      id: dto?.id ?? dto?.process?.id,
      process: String(dto?.process?.code || "").trim(),
      display_text: String(dto?.process?.code || "").trim(),
    }))
    .filter((row) => row.id != null && row.process);
}

/** Resolve the single tenantId a scope points at (company mode / one leg of an aggregate loop). */
function resolveDomainReportTenantId(scope) {
  const id = Number(scope?.scopeCompanyId ?? scope?.uiCompanyId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function resolveDomainReportTenantIds(reportScope) {
  const mergeCompanyIds =
    reportScope?.mode === "aggregate" && Array.isArray(reportScope.mergeCompanyIds)
      ? reportScope.mergeCompanyIds.filter((id) => Number(id) > 0)
      : [];
  if (mergeCompanyIds.length > 0) return mergeCompanyIds.map((id) => Number(id));
  const id = resolveDomainReportTenantId(reportScope);
  return id ? [id] : [];
}

/** Spring POST /api/report/domain-report/list body (tenant-only, no currency dimension). */
function buildSpringDomainReportRequest({ tenantId, dateFrom, dateTo, processId, category }) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const pid = Number(processId);
  return {
    tenantId: tid,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    processId: Number.isFinite(pid) && pid > 0 ? pid : null,
    category: category === "BANK" ? "BANK" : "GAME",
  };
}

/** Spring DomainReportDTO row → table row fields (aligned to backend camelCase). */
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

const ZERO_TOTALS = { turnover: "0", win: "0", lose: "0", win_lose: "0" };

/**
 * Single-tenant fetch via Spring POST /api/report/domain-report/list.
 * The Spring response list ends with one synthesized row (totalRow=true) carrying the Total —
 * split it out here so callers get { rows, totals } regardless of how many tenants get merged.
 */
async function fetchDomainReportOnce({ tenantId, dateFrom, dateTo, processId, category, signal }) {
  const body = buildSpringDomainReportRequest({ tenantId, dateFrom, dateTo, processId, category });

  const res = await fetch(buildApiUrl("api/report/domain-report/list"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load report");
  }

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

/**
 * Domain Report list. "aggregate" scope loops per company tenant and merges client-side — the
 * Spring backend only ever answers for one tenant at a time. Group scope (SALARY/COMMISSION/BONUS/
 * PROFIT payroll) resolves to the group's own entity tenant (see reportScope.js) and reports on
 * BANK-category processes instead of GAME.
 */
export async function fetchDomainReport(params, options = {}) {
  const { dateFrom, dateTo, processId, reportScope } = params;
  const category = reportScope?.mode === "group" ? "BANK" : "GAME";

  const { signal } = options;
  const tenantIds = resolveDomainReportTenantIds(reportScope);
  if (!tenantIds.length) {
    throw new Error("tenantIdRequired");
  }

  let rows = [];
  let totals = { ...ZERO_TOTALS };
  for (const tenantId of tenantIds) {
    const part = await fetchDomainReportOnce({ tenantId, dateFrom, dateTo, processId, category, signal });
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

/** Spring process-list row → Domain Report process dropdown option. */
function normalizeSpringProcessOption(row) {
  const code = String(row?.process_name || "").trim();
  const desc = String(row?.description || "").trim();
  return {
    id: row?.id,
    process: code,
    description: desc,
    display_text: desc ? `${code} (${desc})` : code,
  };
}

/**
 * Process dropdown data source, all via Spring `POST /api/process/process-list`. Company/aggregate
 * scope reads GAME-category rows through `fetchProcessListByTenantId` (same helper Games Process
 * List uses), looped per tenant for aggregate mode. Group scope reads BANK-category rows (SALARY/
 * COMMISSION/BONUS/PROFIT) for the group's own entity tenant via fetchBankProcessesByTenantId.
 */
export async function fetchProcesses(reportScope, options = {}) {
  const { signal } = options;
  const tenantIds = resolveDomainReportTenantIds(reportScope);
  if (!tenantIds.length) return [];

  if (reportScope?.mode === "group") {
    const seen = new Set();
    const merged = [];
    for (const tenantId of tenantIds) {
      const rows = await fetchBankProcessesByTenantId(tenantId, signal);
      for (const opt of rows) {
        if (opt.id == null || seen.has(opt.id)) continue;
        seen.add(opt.id);
        merged.push(opt);
      }
    }
    merged.sort((a, b) => a.process.localeCompare(b.process));
    return merged;
  }

  const seen = new Set();
  const merged = [];
  for (const tenantId of tenantIds) {
    const rows = await fetchProcessListByTenantId(tenantId, signal);
    for (const row of rows) {
      const opt = normalizeSpringProcessOption(row);
      if (opt.id == null || seen.has(opt.id)) continue;
      seen.add(opt.id);
      merged.push(opt);
    }
  }
  merged.sort((a, b) => a.process.localeCompare(b.process));
  return merged;
}
