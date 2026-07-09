import {
  computeGroupAggregateEarningsAmount,
  isGroupAggregateEarningsPayload,
  netProfitFromDashboardPayload,
} from "./dashboardKpi.js";
import { getCurrencyColor } from "./dashboardEarnings.js";

/** @typedef {'earnings' | 'profit' | 'netProfit'} CompanyBreakdownView */

/** Viewer multiplier for a single company dashboard payload (group ownership chain). */
export function resolveCompanyProfitMultiplier(data) {
  if (!data?.has_group_ownership) return 0;
  const pct = parseFloat(data.ownership_percentage) || 0;
  const grpPct = parseFloat(data.group_equity_percentage) || 0;
  const grpAccPct = parseFloat(data.group_account_percentage) || 0;
  const linkMul = parseFloat(data._link_multiplier || 0) || 0;
  const hasLink = linkMul > 0 && linkMul !== 1;
  const directPct = pct / 100;
  if (hasLink) {
    const viewerGroupShare = grpAccPct > 0 ? grpAccPct / 100 : 1;
    return linkMul * viewerGroupShare;
  }
  if (directPct > 0) return directPct;
  return (grpPct / 100) * (grpAccPct / 100);
}

export function computeCompanyGroupShare(netProfit, groupEquityPct) {
  const np = parseFloat(netProfit) || 0;
  const pct = parseFloat(groupEquityPct) || 0;
  return np * (pct / 100);
}

/** @param {CompanyBreakdownView} view */
export function companyRowDisplayAmount(row, view = "earnings") {
  if (!row) return 0;
  if (view === "netProfit") {
    return parseFloat(row.net_profit) || 0;
  }
  if (view === "profit") {
    const share = parseFloat(row.group_share);
    if (Number.isFinite(share)) return share;
    return computeCompanyGroupShare(row.net_profit, row.group_equity_pct);
  }
  return parseFloat(row.my_earning) || 0;
}

export function normalizeSubsidiaryEarningsByCompany(apiRows) {
  if (!Array.isArray(apiRows)) return [];
  return apiRows
    .map((row) => {
      const netProfit = parseFloat(row.net_profit) || 0;
      const groupEquityPct = parseFloat(row.group_equity_pct) || 0;
      const groupShareRaw = parseFloat(row.group_share);
      const groupShare = Number.isFinite(groupShareRaw)
        ? groupShareRaw
        : computeCompanyGroupShare(netProfit, groupEquityPct);
      return {
        company_pk: row.company_pk,
        company_id: String(row.company_id || "").trim(),
        group_id: String(row.group_id || "").trim().toUpperCase(),
        net_profit: netProfit,
        group_equity_pct: groupEquityPct,
        account_pct: parseFloat(row.account_pct) || 0,
        group_share: groupShare,
        my_earning: parseFloat(row.my_earning) || 0,
      };
    })
    .filter((row) => row.company_id);
}

/** Single-subsidiary group ledger: earnings tab row = full group-aggregate earnings (matches KPI card). */
export function applySingleSubsidiaryGroupEarningsRows(rows, dashboardData, options = {}) {
  if (!Array.isArray(rows) || rows.length !== 1 || !dashboardData) return rows;
  if (!isGroupAggregateEarningsPayload(dashboardData, options)) return rows;
  const full = computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig: false });
  if (!Number.isFinite(full)) return rows;
  return [{ ...rows[0], my_earning: full }];
}

/** Net-profit row for group All merge — does not require ownership setup on payload. */
export function buildCompanyNetProfitRowFromPayload(companyRow, data, viewGroup = "") {
  if (!companyRow || !data) return null;
  const netProfit = netProfitFromDashboardPayload(data);
  const nativeG = companyRow?.group_id ? String(companyRow.group_id).trim().toUpperCase() : "";
  const linkG = companyRow?.link_source_group
    ? String(companyRow.link_source_group).trim().toUpperCase()
    : "";
  const groupId = (viewGroup || linkG || nativeG || "").toUpperCase();
  const companyId = String(companyRow?.company_id || companyRow?.id || "").trim();
  if (!companyId) return null;
  return {
    company_pk: parseInt(companyRow?.id, 10) || null,
    company_id: companyId,
    group_id: groupId,
    net_profit: netProfit,
    group_equity_pct: parseFloat(data.group_equity_percentage) || 0,
    account_pct: parseFloat(data.group_account_percentage) || 0,
    group_share: netProfit,
    my_earning: 0,
  };
}

export function buildCompanyNetProfitRowsFromPairs(pairs, viewGroupFallback = "") {
  const rows = [];
  for (const pair of pairs || []) {
    const company = pair?.company;
    const data = pair?.data;
    if (!company || !data) continue;
    const viewGroup = pair.viewGroup ?? viewGroupFallback;
    const row = buildCompanyNetProfitRowFromPayload(company, data, viewGroup);
    if (row) rows.push(row);
  }
  return sortCompanyBreakdownRows(rows, "netProfit");
}

export function buildCompanyBreakdownRowFromPayload(companyRow, data, viewGroup = "") {
  if (!data?.has_group_ownership) return null;
  const netProfit = netProfitFromDashboardPayload(data);
  const grpPct = parseFloat(data.group_equity_percentage) || 0;
  const groupShare = computeCompanyGroupShare(netProfit, grpPct);
  const myEarning = netProfit * resolveCompanyProfitMultiplier(data);
  const nativeG = companyRow?.group_id ? String(companyRow.group_id).trim().toUpperCase() : "";
  const linkG = companyRow?.link_source_group
    ? String(companyRow.link_source_group).trim().toUpperCase()
    : "";
  const groupId = (viewGroup || linkG || nativeG || "").toUpperCase();
  return {
    company_pk: parseInt(companyRow?.id, 10) || null,
    company_id: String(companyRow?.company_id || companyRow?.id || "").trim(),
    group_id: groupId,
    net_profit: netProfit,
    group_equity_pct: grpPct,
    account_pct: parseFloat(data.group_account_percentage) || 0,
    group_share: groupShare,
    my_earning: myEarning,
  };
}

/** Build company rows from parallel company + dashboard payload pairs (group All merge). */
export function buildCompanyBreakdownRowsFromPairs(pairs, viewGroupFallback = "") {
  const rows = [];
  for (const pair of pairs || []) {
    const company = pair?.company;
    const data = pair?.data;
    if (!company || !data) continue;
    const viewGroup = pair.viewGroup ?? viewGroupFallback;
    const row = buildCompanyBreakdownRowFromPayload(company, data, viewGroup);
    if (row) rows.push(row);
  }
  return sortCompanyBreakdownRows(rows, "earnings");
}

export function mergeCompanyBreakdownRowLists(lists) {
  const map = new Map();
  for (const list of lists || []) {
    for (const row of list || []) {
      const key = `${row.group_id || ""}:${row.company_pk ?? row.company_id}`;
      const prev = map.get(key);
      if (prev) {
        prev.my_earning = (parseFloat(prev.my_earning) || 0) + (parseFloat(row.my_earning) || 0);
        prev.group_share = (parseFloat(prev.group_share) || 0) + (parseFloat(row.group_share) || 0);
        prev.net_profit = (parseFloat(prev.net_profit) || 0) + (parseFloat(row.net_profit) || 0);
      } else {
        map.set(key, { ...row });
      }
    }
  }
  return sortCompanyBreakdownRows(Array.from(map.values()), "earnings");
}

/** @param {CompanyBreakdownView} view */
export function sortCompanyBreakdownRows(rows, view = "earnings") {
  return [...(rows || [])].sort(
    (a, b) =>
      Math.abs(companyRowDisplayAmount(b, view)) - Math.abs(companyRowDisplayAmount(a, view))
  );
}

function resolveCompanyPickerSortIndex(row, orderIndex) {
  const code = String(row?.company_id || "")
    .trim()
    .toUpperCase();
  const pk = parseInt(row?.company_pk, 10);
  if (Number.isFinite(pk) && pk > 0 && orderIndex.has(`pk:${pk}`)) {
    return orderIndex.get(`pk:${pk}`);
  }
  if (code && orderIndex.has(`code:${code}`)) {
    return orderIndex.get(`code:${code}`);
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Match dashboard company pill order (e.g. 95, AG, CX, RS). */
export function sortCompanyBreakdownRowsByPicker(rows, pickerCompanies = []) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!Array.isArray(pickerCompanies) || !pickerCompanies.length) {
    return rows;
  }
  const orderIndex = new Map();
  pickerCompanies.forEach((company, idx) => {
    const code = String(company?.company_id || "")
      .trim()
      .toUpperCase();
    const pk = parseInt(company?.id, 10);
    if (code) orderIndex.set(`code:${code}`, idx);
    if (Number.isFinite(pk) && pk > 0) orderIndex.set(`pk:${pk}`, idx);
  });
  return [...rows].sort((a, b) => {
    const idxA = resolveCompanyPickerSortIndex(a, orderIndex);
    const idxB = resolveCompanyPickerSortIndex(b, orderIndex);
    if (idxA !== idxB) return idxA - idxB;
    return String(a.company_id || "").localeCompare(String(b.company_id || ""));
  });
}

/** @param {CompanyBreakdownView} view */
export function sumCompanyBreakdownAmount(rows, view = "earnings") {
  return (rows || []).reduce((sum, row) => sum + companyRowDisplayAmount(row, view), 0);
}

/** @param {CompanyBreakdownView} view */
export function buildCompanyBreakdownPieSlices(rows, view = "earnings") {
  return (rows || [])
    .map((row, index) => {
      const earnings = companyRowDisplayAmount(row, view);
      if (!earnings) return null;
      const label = row.group_id ? `${row.company_id} · ${row.group_id}` : row.company_id;
      return {
        code: label,
        company_id: row.company_id,
        group_id: row.group_id,
        earnings,
        value: Math.abs(earnings),
        fill: getCurrencyColor(row.company_id, index),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);
}

/** @param {CompanyBreakdownView} view */
export function buildCompanyBreakdownShareByCode(rows, view = "earnings") {
  const total = (rows || []).reduce(
    (sum, row) => sum + Math.abs(companyRowDisplayAmount(row, view)),
    0
  );
  const map = {};
  for (const row of rows || []) {
    const key = row.group_id ? `${row.company_id} · ${row.group_id}` : row.company_id;
    const amount = Math.abs(companyRowDisplayAmount(row, view));
    map[key] = total > 0 ? (amount / total) * 100 : 0;
  }
  return { total, map };
}

export function computeCompanyBreakdownSharePct(row, shareByCode) {
  const key = row.group_id ? `${row.company_id} · ${row.group_id}` : row.company_id;
  const pct = shareByCode?.map?.[key];
  return pct != null ? Math.round(pct * 10) / 10 : null;
}

/** @param {CompanyBreakdownView} view */
export function computeCompanyBreakdownCenterMetrics(rows, view = "earnings") {
  if (!rows?.length) return { pct: "0", code: "—" };
  const { total, map } = buildCompanyBreakdownShareByCode(rows, view);
  if (total <= 0) return { pct: "0", code: rows[0]?.company_id || "—" };
  let top = rows[0];
  let topPct = 0;
  for (const row of rows) {
    const key = row.group_id ? `${row.company_id} · ${row.group_id}` : row.company_id;
    const pct = map[key] || 0;
    if (pct > topPct) {
      topPct = pct;
      top = row;
    }
  }
  return {
    pct: String(Math.round(topPct * 10) / 10),
    code: top?.company_id || "—",
  };
}

// Legacy aliases used during migration
export const buildCompanyProfitRowsFromPairs = buildCompanyBreakdownRowsFromPairs;
export const mergeCompanyProfitRowLists = mergeCompanyBreakdownRowLists;
export const buildCompanyProfitPieSlices = (rows) => buildCompanyBreakdownPieSlices(rows, "earnings");
export const buildCompanyProfitShareByCode = (rows) => buildCompanyBreakdownShareByCode(rows, "earnings");
export const computeCompanyProfitSharePct = computeCompanyBreakdownSharePct;
export const computeCompanyProfitCenterMetrics = (rows) =>
  computeCompanyBreakdownCenterMetrics(rows, "earnings");
export const sumCompanyProfitEarnings = (rows) => sumCompanyBreakdownAmount(rows, "earnings");
