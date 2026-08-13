import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchProcessListByTenantId } from "../../processlist/processListApi.js";
import { formatReportAmount, reportAmountAdd } from "../shared/reportAmountFormat.js";
import { customerReportScopeApiParams } from "../shared/reportScope.js";

export const formatAmount = formatReportAmount;

function appendScopeParams(params, scope) {
  const { companyId, viewGroup, groupId, groupsAll, groupAll, groupAggregate } =
    customerReportScopeApiParams(scope);
  if (companyId) params.append("company_id", String(companyId));
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) params.append("view_group", vg);
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  if (gid) params.append("group_id", gid);
  if (groupsAll) params.append("groups_all", "1");
  if (groupAll) params.append("group_all", "1");
  if (groupAggregate) params.append("group_aggregate", "1");
  if (scope?.mode) params.append("report_scope", scope.mode);
}

/**
 * Group-only scope (AP/IG payroll: SALARY/COMMISSION/BONUS) is a different data domain — those are
 * BANK-category processes, but the Spring Domain Report endpoint only reports on GAME-category
 * processes (see docs/domain-report-spring-migration.md). No Spring equivalent exists for this scope
 * yet, so it keeps hitting the legacy PHP endpoint unchanged.
 */
async function fetchDomainReportLegacy(
  { dateFrom, dateTo, processId, reportScope, selectedCurrencies = [], showAllCurrencies = true },
  options = {},
) {
  const { signal } = options;
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (processId) params.append("process_id", processId);
  appendScopeParams(params, reportScope);
  if (!showAllCurrencies && Array.isArray(selectedCurrencies) && selectedCurrencies.length > 0) {
    params.append("currency", selectedCurrencies.join(","));
  }

  const res = await fetch(buildApiUrl(`api/reports/domain_report_api.php?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load report");
  }
  return json;
}

async function fetchProcessesLegacy(reportScope, options = {}) {
  const { signal } = options;
  const params = new URLSearchParams();
  params.append("action", "processes");
  appendScopeParams(params, reportScope);
  const url = buildApiUrl(`api/reports/domain_report_api.php?${params.toString()}`);
  const res = await fetch(url, { credentials: "include", signal });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load processes");
  }
  return json.data || [];
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
function buildSpringDomainReportRequest({ tenantId, dateFrom, dateTo, processId }) {
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
async function fetchDomainReportOnce({ tenantId, dateFrom, dateTo, processId, signal }) {
  const body = buildSpringDomainReportRequest({ tenantId, dateFrom, dateTo, processId });

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
 * Domain Report list. Group "aggregate" scope loops per company tenant and merges client-side —
 * the Spring backend only ever answers for one tenant at a time. Group-only scope (SALARY/COMMISSION/
 * BONUS payroll) stays on the legacy PHP call — see fetchDomainReportLegacy.
 */
export async function fetchDomainReport(params, options = {}) {
  const { dateFrom, dateTo, processId, reportScope } = params;

  if (reportScope?.mode === "group") {
    return fetchDomainReportLegacy(params, options);
  }

  const { signal } = options;
  const tenantIds = resolveDomainReportTenantIds(reportScope);
  if (!tenantIds.length) {
    throw new Error("tenantIdRequired");
  }

  let rows = [];
  let totals = { ...ZERO_TOTALS };
  for (const tenantId of tenantIds) {
    const part = await fetchDomainReportOnce({ tenantId, dateFrom, dateTo, processId, signal });
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
 * Process dropdown data source. Company/aggregate scope: Spring `POST /api/process/process-list`
 * (already filters out BANK-category processes, same helper Games Process List uses), looped per
 * tenant for aggregate mode. Group-only scope: legacy PHP (see fetchProcessesLegacy) — SALARY/
 * COMMISSION/BONUS are BANK-category processes with no Spring Domain Report equivalent yet.
 */
export async function fetchProcesses(reportScope, options = {}) {
  if (reportScope?.mode === "group") {
    return fetchProcessesLegacy(reportScope, options);
  }

  const { signal } = options;
  const tenantIds = resolveDomainReportTenantIds(reportScope);
  if (!tenantIds.length) return [];

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
