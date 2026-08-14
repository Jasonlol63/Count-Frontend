import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { pathnameIs } from "../../../utils/routing/pageRoutes.js";
import { formatDmyDash } from "../../../utils/date/dateUtils.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import { ymdToDmy } from "../lib/dashboardDateUtils.js";
import { useRealtimeDomain } from "../../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../../lib/realtime/realtimeEvents.js";
import {
  bindDashboardSessionCache,
  buildDashboardCacheKey,
  clearEarningsFromScopeKeys,
  earningsRowsAreUsable,
  findSharedDashboardEarnings,
  getDashboardCache,
  getDashboardPayloadCache,
  isDashboardSessionBootstrapped,
  isDashboardSessionWarmDone,
  markDashboardSessionBootstrapped,
  markDashboardSessionWarmDone,
  patchDashboardCache,
  sanitizeDuplicateNonPrimaryEarnings,
  setDashboardCache,
  setDashboardPayloadCache,
} from "../../../utils/dashboard/dashboardCache.js";
import {
  attachGroupAggregateEarningsFields,
  finalizeMergedGroupLedgerDashboard,
  mergeEarningsByCurrency,
  mergeGroupData,
} from "../../../utils/dashboard/dashboardMerge.js";
import {
  convertToBaseAmount,
  fetchFrankfurterRates,
  frankfurterMissingQuotes,
  frankfurterRatesPartiallyUsable,
  isFrankfurterRatesPayloadComplete,
  peekFrankfurterRatesCache,
  peekFrankfurterRatesCacheOrDerived,
  resolveFrankfurterDate,
  sumConvertedEarnings,
  sumConvertedKpiMetrics,
  warmFrankfurterRatesForCurrencies,
} from "../../../utils/dashboard/frankfurterRates.js";
import { DASHBOARD_API, DASHBOARD_BOOTSTRAP_API, DASHBOARD_PROFIT_COLOR, isDashboardHistoricalOwnershipMonth } from "../lib/dashboardConstants.js";
import {
  buildEmptyDashboardPayload,
  companyCurrencyCacheState,
} from "../lib/dashboardEmptyScope.js";
import {
  buildChartRows,
  buildSkeletonChartRows,
  makeDashboardChartXTick,
  resolveDailyChartXAxisTicks,
} from "../lib/dashboardChart.jsx";
import {
  chartMonthSpan,
  formatChartDateRangeText,
  parseYmd,
  previousMonthEquivalentRange,
  shouldAggregateChartByMonth,
} from "../lib/dashboardDateUtils.js";
import { formatI18nTemplate } from "../lib/dashboardFormat.js";
import { buildKpiCompare, computeKpiMetrics, mergeDashboardOwnershipFields, viewerHasEarningsConfig } from "../lib/dashboardKpi.js";
import {
  mergeCompanyBreakdownRowLists,
  normalizeSubsidiaryEarningsByCompany,
  buildCompanyNetProfitRowsFromPairs,
} from "../lib/dashboardCompanyProfit.js";
import {
  applyTenantLedgerToParams,
  LEDGER_GROUP,
} from "../../../utils/company/tenantLedgerParams.js";
import {
  canAccessGroupLedgerForGroup,
  canPrefetchCompanyScope,
  canUseGroupOnlyMode,
  companyLoginCanUseGroupsAllLedger,
  companyLoginHasGroupLedgerPrivilege,
  filterCompaniesForDashboardApiAccess,
  companyLoginRequiresSubsidiaryWithGroup,
  getLoginIdentifier,
  isGroupLogin,
  isCompanyLogin,
  resolveVisibleGroupIds,
  filterGroupIdsForLedgerAccess,
} from "../../../utils/company/loginScope.js";
import { mapPanelCurrencyRows, sortIds } from "../lib/dashboardEarnings.js";
import {
  companiesInGroupList,
  companiesPickerInGroupList,
  companiesForCompanyPicker,
  companyRowIsGroupEntity,
  dedupeOwnerCompaniesByCode,
  filterCompaniesWithDisplayId,
  pickDefaultCompanyForGroup,
  pickGroupAnchorCompany,
  notifyDashboardGroupFilterChanged,
  buildDashboardSidebarNotifyOptions,
  notifyDashboardCurrencyFilterChanged,
  clearDashboardGroupFilterKeepCompany,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  resolveCrossPageCurrencyPreference,
  buildDashboardCurrencyScopeKey,
  clearDashboardScopedCurrency,
  readDashboardSelectedCurrency,
  applyLoginScopeToSessionStorageIfNeeded,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
  resolveOwnerDashboardGroupIds,
  isVirtualGroupLinkCompanyRow,
  fetchOwnerCompaniesAll,
  getCachedOwnerCompanies,
  fetchOwnerGroupsAll,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyWhenClosingGroup,
  resolveCompanyWhenPickingAllGroups,
  resolveCompanyPickWhenSwitchingGroup,
  independentCompaniesForPicker,
  allGroupedCompaniesForPicker,
  resolveGroupAllMergeCompanyList,
  resolveGroupsAllMergeCompanyList,
  resolveIndependentAllMergeCompanyList,
  isSubsidiaryCompanyRow,
  companyRowIsIndependent,
  normalizeNativeCompanyGroupId,
  normalizeCompanyGroupId,
  persistDashboardGroupOnlyMode,
  persistDashboardGroupAllMode,
  readDashboardSelectedCompanyId,
  persistDashboardSelectedCompany,
  persistDashboardKnownCompanyIds,
  findCompanyAddedSinceLastBoot,
  notifyDashboardGcBootstrapReady,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  DASHBOARD_GROUP_FILTER_EVENT,
  persistDashboardGroupFilter,
  persistDashboardGroupsAllMode,
  persistGroupsAllSidebarGroup,
  readGroupsAllSidebarGroup,
  resolveGroupsAllSidebarAnchorGroup,
  isDashboardGroupsAllMode,
  readPersistedDashboardGcFilter,
  resolveGcFilterBootCompanyId,
  reconcileDashboardGroupFilterOptOutFromPersisted,
  dashboardFilterEventMatchesPersisted,
  excludeGroupLabelsFromCompanyPicker,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import { peekCompanySessionFlags } from "../../../utils/company/companySessionFlagsCache.js";
import { useCrossPageCurrencySync } from "../../../utils/company/useCrossPageCurrencySync.js";
import { saveUserCurrencyOrder } from "../../transaction/lib/transactionApi.js";
import {
  mergeCurrencyCodesWithSavedOrder,
  persistCurrencyDisplayOrder,
  persistUserCurrencyDisplayOrder,
  readUserCurrencyDisplayOrder,
  resolvePreferredCurrencyDisplayOrder,
  resolveSavedCurrencyOrder,
} from "../../../utils/company/currencyDisplayOrder.js";

/** Company login with only grouped subsidiaries: idle until user picks AP/IG (no independent company). */
function companyDashboardAwaitingGroupPick(me, companies, groupIds) {
  if (!companyLoginRequiresSubsidiaryWithGroup(me)) return false;
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return independentCompaniesForPicker(companies, gids).length === 0;
}

/** Company login bound to a grouped subsidiary (e.g. C168 under AP) — boot with session company + group. */
function resolveCompanyLoginGroupedSubsidiary(me, companies, groupIds) {
  if (!me || !companyLoginRequiresSubsidiaryWithGroup(me)) return null;
  const cid = me.company_id ? parseInt(me.company_id, 10) : Number.NaN;
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  const row = companies.find((c) => parseInt(c.id, 10) === cid);
  if (!row || companyRowIsIndependent(row, gids)) return null;
  const group = normalizeCompanyGroupId(row) || normalizeNativeCompanyGroupId(row);
  if (!group) return null;
  return { companyId: cid, row, group: String(group).trim().toUpperCase() };
}

/** Per-company view_group for API access (linked companies under AP/IG, etc.). */
function resolveViewGroupForCompany(companyRow, fallbackGroup = null) {
  if (!companyRow) {
    return fallbackGroup ? String(fallbackGroup).trim().toUpperCase() : null;
  }
  const link = companyRow.link_source_group
    ? String(companyRow.link_source_group).trim().toUpperCase()
    : "";
  if (link) return link;
  const native = companyRow.group_id
    ? String(companyRow.group_id).trim().toUpperCase()
    : "";
  if (native) return native;
  return fallbackGroup ? String(fallbackGroup).trim().toUpperCase() : null;
}

/** Group ledger dashboard API params (view_group + group_only; never legacy group-entity company row). */
function appendGroupLedgerDashboardParams(q, groupKey) {
  const g = String(groupKey || "").trim().toUpperCase();
  if (!g) return "";
  applyTenantLedgerToParams(q, { ledger: LEDGER_GROUP, groupId: g, companyId: null });
  q.set("view_group", g);
  return g;
}

/** Query params for group-only dashboard currency (matches loadCurrencies group-only branch). */
function buildGroupOnlyScopeCurrencyQuery(companies, groupKey) {
  const g = String(groupKey).trim().toUpperCase();
  const anchor = pickGroupAnchorCompany(companies, g);
  const anchorId = anchor?.id != null ? parseInt(anchor.id, 10) : null;
  const q = new URLSearchParams();
  if (anchorId) {
    q.set("company_id", String(anchorId));
    q.set("view_group", g);
    q.set("group_id", g);
    q.set("group_aggregate", "1");
  } else {
    appendGroupLedgerDashboardParams(q, g);
  }
  return q;
}

/** Group-ledger account currencies for one group tab (AP / IG). */
async function fetchGroupLedgerCurrencyCodes(companies, groupKey, me) {
  const g = String(groupKey || "").trim().toUpperCase();
  if (!g || (me && !canAccessGroupLedgerForGroup(me, g, companies))) return [];
  const q = buildGroupOnlyScopeCurrencyQuery(companies, g);
  if (!q.get("company_id") && !q.get("group_id")) return [];
  try {
    const packed = await fetchCurrencyListHttpDeduped(
      currencyListHttpInflight,
      "api/transactions/get_scope_account_currencies_api.php",
      q.toString()
    );
    if (!packed?.res?.ok || !packed.json?.success || !Array.isArray(packed.json.data)) return [];
    return packed.json.data.map((r) => String(r.code).toUpperCase()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Currencies from company Currency Setting table (reliable for group-all merge). */
async function fetchCompanyCurrencySettingCodes(companyId, companyRow, viewGroup, groupIds) {
  const cid = parseInt(companyId, 10);
  if (!Number.isFinite(cid) || cid <= 0) return [];

  const vg = viewGroup ? normalizeDashboardViewGroup(viewGroup) : "";
  const queries = [];
  if (vg) {
    const subQ = new URLSearchParams({ company_id: String(cid) });
    appendDashboardSubsidiaryScopeParams(subQ, vg);
    queries.push(subQ);
  }
  if (!vg || (companyRow && companyRowIsIndependent(companyRow, groupIds))) {
    queries.push(new URLSearchParams({ company_id: String(cid) }));
  }

  for (const q of queries) {
    try {
      const packed = await fetchCurrencyListHttpDeduped(
        currencyListHttpInflight,
        "api/transactions/get_company_currencies_api.php",
        q.toString()
      );
      if (
        packed?.res?.ok &&
        packed.json?.success &&
        Array.isArray(packed.json.data) &&
        packed.json.data.length
      ) {
        return packed.json.data.map((r) => String(r.code).toUpperCase()).filter(Boolean);
      }
    } catch {
      /* try next query shape */
    }
  }

  if (vg) {
    const subQ = buildSubsidiaryCompanyCurrencyQuery(cid, vg);
    if (subQ) {
      try {
        const packed = await fetchCurrencyListHttpDeduped(
          currencyListHttpInflight,
          "api/transactions/get_scope_account_currencies_api.php",
          subQ
        );
        if (
          packed?.res?.ok &&
          packed.json?.success &&
          Array.isArray(packed.json.data) &&
          packed.json.data.length
        ) {
          return packed.json.data.map((r) => String(r.code).toUpperCase()).filter(Boolean);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return [];
}

/**
 * Account-linked currencies for one company (same source as independent single-company dashboard).
 * Does not use bare Currency Setting rows.
 */
async function fetchCompanyAccountCurrencyCodes(companyId) {
  const cid = parseInt(companyId, 10);
  if (!Number.isFinite(cid) || cid <= 0) return [];
  try {
    const q = new URLSearchParams({ company_id: String(cid) });
    const packed = await fetchCurrencyListHttpDeduped(
      currencyListHttpInflight,
      "api/transactions/get_scope_account_currencies_api.php",
      q.toString()
    );
    if (packed?.res?.ok && packed.json?.success && Array.isArray(packed.json.data)) {
      return packed.json.data.map((r) => String(r.code).toUpperCase()).filter(Boolean);
    }
  } catch {
    /* ignore */
  }
  return [];
}

/** Union currencies for Company "All" (single group or Group "All" + Company "All"). */
async function fetchGroupAllMergeCurrencyCodes(
  companies,
  mergeCompanyIds,
  { groupsAllMode = false, selectedGroup = null, groupIds = [], cacheRef = null } = {}
) {
  const ids = (mergeCompanyIds || []).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return [];

  const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  // Independents Company All: same rule as picking MS1 alone — only account-linked codes,
  // not Currency Setting leftovers that never appear on a single independent company.
  const independentAll = !groupsAllMode && !groupKey;

  const results = await Promise.all(
    ids.map(async (cid) => {
      // IndepAll: never trust cache (warm/settings may have seeded MYR that single-company scope never uses).
      if (!independentAll) {
        const cached = cacheRef?.get?.(cid);
        if (cached?.length) return cached;
      }

      const row = companies.find((c) => parseInt(c.id, 10) === cid);
      const vg = groupsAllMode ? resolveViewGroupForCompany(row, selectedGroup) : groupKey;
      const rowCodes = independentAll
        ? await fetchCompanyAccountCurrencyCodes(cid)
        : await fetchCompanyCurrencySettingCodes(cid, row, vg, groupIds);
      if (cacheRef) {
        if (independentAll) cacheRef.set(cid, rowCodes);
        else if (rowCodes.length) cacheRef.set(cid, rowCodes);
      }
      return rowCodes;
    })
  );

  const merged = new Set(results.flat());
  // Group/settings path only: refill from cache if network miss. Independents:all must keep
  // account-linked emptiness (do not resurrect Currency Setting MYR seeded into company cache).
  if (!merged.size && cacheRef && !independentAll) {
    for (const cid of ids) {
      const cc = cacheRef.get(cid);
      if (cc?.length) cc.forEach((c) => merged.add(c));
    }
  }
  return [...merged];
}

function normalizeDashboardViewGroup(viewGroup) {
  return viewGroup ? String(viewGroup).trim().toUpperCase() : "";
}

/** Always pass view_group with subsidiary_accounts_only so group-tab drill-down passes API access checks. */
function appendDashboardSubsidiaryScopeParams(q, viewGroup) {
  q.set("subsidiary_accounts_only", "1");
  const vg = normalizeDashboardViewGroup(viewGroup);
  if (vg) {
    q.set("view_group", vg);
    q.set("group_id", vg);
  }
}

/** Group tab on company-scoped dashboard requests (subsidiary or group-entity). */
function appendDashboardGroupTabParams(q, viewGroup, { subsidiaryOnly = false } = {}) {
  const vg = normalizeDashboardViewGroup(viewGroup);
  if (!vg) {
    if (subsidiaryOnly) q.set("subsidiary_accounts_only", "1");
    return;
  }
  q.set("view_group", vg);
  q.set("group_id", vg);
  if (subsidiaryOnly) q.set("subsidiary_accounts_only", "1");
}

/** Subsidiary drill-down currency query — safe for company login without group ledger. */
function buildSubsidiaryCompanyCurrencyQuery(companyId, viewGroup) {
  const id = parseInt(companyId, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const q = new URLSearchParams({ company_id: String(id) });
  appendDashboardSubsidiaryScopeParams(q, viewGroup);
  return q.toString();
}

/** True when a scope-currency request requires group ledger permission (not subsidiary path). */
function scopeCurrencyQueryUsesGroupLedger(queryString) {
  const params = new URLSearchParams(queryString);
  if (params.get("group_aggregate") === "1") return true;
  if (params.get("group_only") === "1") return true;
  const vg = params.get("view_group") || params.get("group_id");
  if (!vg) return false;
  if (params.get("subsidiary_accounts_only") === "1") return false;
  if (params.get("company_ids")) return false;
  if (params.get("company_id")) return false;
  return true;
}

function mayWarmGroupLedgerCurrencies(me, groupCode, companies) {
  if (!groupCode || !me) return false;
  return canAccessGroupLedgerForGroup(me, groupCode, companies);
}

/** Group All + no company pill: AP+IG group-ledger KPI/currency scope (group login or privileged company login). */
function isGroupsAllLedgerDataScope({ groupsAllMode, groupAllMode, companyId, me }) {
  const singleCid = companyId != null && companyId !== "" ? parseInt(companyId, 10) : Number.NaN;
  if (!groupsAllMode || groupAllMode || !me || (Number.isFinite(singleCid) && singleCid > 0)) {
    return false;
  }
  if (isGroupLogin(me) && canUseGroupOnlyMode(me)) return true;
  return companyLoginCanUseGroupsAllLedger(me);
}

/** Group ID "All" with no active company: union AP+IG group-ledger currencies. */
function isGroupsAllLedgerCurrencyScope({ groupsAllMode, groupAllMode, companyId, me }) {
  return isGroupsAllLedgerDataScope({ groupsAllMode, groupAllMode, companyId, me });
}

/** Stable signature so identical company lists do not retrigger prefetch/bootstrap effects. */
function companiesListSignature(rows) {
  return (rows || [])
    .map((c) =>
      [c.id, c.company_id ?? "", c.group_id ?? "", c.link_source_group ?? ""].join(":")
    )
    .sort()
    .join("|");
}

/** Group ledger view: group selected, no subsidiary company pill active. */
function isDashboardGroupOnlyCurrencyScope({
  companyId,
  selectedGroup,
  groupsAllMode,
  groupAllMode,
  mergedSubsetIds,
}) {
  if (groupsAllMode || groupAllMode) return false;
  if (mergedSubsetIds?.length > 1) return false;
  const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  if (!groupKey) return false;
  const singleCid = companyId != null ? parseInt(companyId, 10) : Number.NaN;
  return !(Number.isFinite(singleCid) && singleCid > 0);
}

/** Apply saved user order; unknown codes append after ordered ones. */
function orderDashboardCurrencyCodes(codes, order) {
  if (!Array.isArray(order) || !order.length) return codes;
  const set = new Set(codes);
  const ordered = [...order.map((c) => String(c).toUpperCase()).filter((c) => set.has(c))];
  const rest = codes.filter((c) => !ordered.includes(c));
  return [...ordered, ...rest];
}

/** company_id used to load/save currency pill display order (per-company preference). */
function resolveDashboardCurrencyOrderCompanyId({
  companyId,
  selectedGroup,
  companies,
  me,
  companiesForPicker,
}) {
  const singleCid = companyId != null ? parseInt(companyId, 10) : null;
  if (Number.isFinite(singleCid) && singleCid > 0) return singleCid;
  const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  if (groupKey) {
    const anchorId = pickGroupAnchorCompany(companies, groupKey)?.id;
    const n = anchorId != null ? parseInt(anchorId, 10) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  const sessionCid = me?.company_id != null ? parseInt(me.company_id, 10) : NaN;
  if (Number.isFinite(sessionCid) && sessionCid > 0) return sessionCid;
  const first = companiesForPicker?.[0]?.id;
  const firstN = first != null ? parseInt(first, 10) : NaN;
  return Number.isFinite(firstN) && firstN > 0 ? firstN : null;
}

function persistDashboardCurrencyDisplayOrder(displayOrderRef, orderCompanyId, order) {
  if (orderCompanyId == null || !Array.isArray(order) || !order.length) return;
  displayOrderRef.current.set(
    orderCompanyId,
    order.map((c) => String(c).toUpperCase()).filter(Boolean)
  );
}

function applyDashboardCurrencyDisplayOrder(
  codes,
  orderCompanyId,
  displayOrderRef,
  userOrderRef,
) {
  if (!Array.isArray(codes) || !codes.length) return codes;
  const saved = resolvePreferredCurrencyDisplayOrder(orderCompanyId, {
    displayOrderByCompanyRef: displayOrderRef,
    sessionOrderRef: userOrderRef,
  });
  if (!saved?.length) return codes;
  return orderDashboardCurrencyCodes(codes, saved);
}

function applyResolvedCurrencyOrder(
  codes,
  orderCompanyId,
  apiOrder,
  displayOrderRef,
  userOrderRef,
) {
  const savedOrder = resolvePreferredCurrencyDisplayOrder(orderCompanyId, {
    apiOrder,
    displayOrderByCompanyRef: displayOrderRef,
    sessionOrderRef: userOrderRef,
  });
  const merged = mergeCurrencyCodesWithSavedOrder(codes, savedOrder);
  const usedUserPreference =
    userOrderRef?.current?.length || readUserCurrencyDisplayOrder()?.length;
  if (orderCompanyId != null && merged.length && !usedUserPreference) {
    persistCurrencyDisplayOrder(orderCompanyId, merged);
    persistDashboardCurrencyDisplayOrder(displayOrderRef, orderCompanyId, merged);
  }
  return merged;
}

function writeDashboardGroupCurrencyCaches(groupRef, { groupKey, groupsAllMode, groupAllMode, codes }) {
  if (!Array.isArray(codes) || !codes.length) return;
  if (groupAllMode && groupKey) {
    groupRef.set(`${groupKey}:ALL`, codes);
    persistGroupAllCurrencyCodes(groupKey, codes);
  }
  if (groupAllMode && groupsAllMode) {
    groupRef.set("GROUPS:ALL", codes);
    persistGroupsAllCurrencyCodes(codes);
  }
  if (groupKey && !groupAllMode) {
    groupRef.set(groupKey, codes);
  } else if (groupsAllMode && !groupAllMode) {
    groupRef.set("GROUPS:ALL", codes);
    persistGroupsAllCurrencyCodes(codes);
  }
}

const DASHBOARD_GROUPS_ALL_CURRENCIES_KEY = "dashboard_groups_all_currency_codes";
const DASHBOARD_GROUP_ALL_CURRENCIES_PREFIX = "dashboard_group_all_currency_codes:";

function readPersistedGroupsAllCurrencyCodes() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DASHBOARD_GROUPS_ALL_CURRENCIES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const list = parsed.map((c) => String(c).toUpperCase()).filter(Boolean);
    return list.length ? list : null;
  } catch {
    return null;
  }
}

function persistGroupsAllCurrencyCodes(codes) {
  if (typeof sessionStorage === "undefined" || !Array.isArray(codes) || !codes.length) return;
  try {
    sessionStorage.setItem(
      DASHBOARD_GROUPS_ALL_CURRENCIES_KEY,
      JSON.stringify([...new Set(codes.map((c) => String(c).toUpperCase()).filter(Boolean))])
    );
  } catch {
    /* quota / private mode */
  }
}

function readPersistedGroupAllCurrencyCodes(groupKey) {
  if (typeof sessionStorage === "undefined" || !groupKey) return null;
  try {
    const g = String(groupKey).trim().toUpperCase();
    const raw = sessionStorage.getItem(`${DASHBOARD_GROUP_ALL_CURRENCIES_PREFIX}${g}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const list = parsed.map((c) => String(c).toUpperCase()).filter(Boolean);
    return list.length ? list : null;
  } catch {
    return null;
  }
}

function persistGroupAllCurrencyCodes(groupKey, codes) {
  if (typeof sessionStorage === "undefined" || !groupKey || !Array.isArray(codes) || !codes.length) {
    return;
  }
  try {
    const g = String(groupKey).trim().toUpperCase();
    sessionStorage.setItem(
      `${DASHBOARD_GROUP_ALL_CURRENCIES_PREFIX}${g}`,
      JSON.stringify([...new Set(codes.map((c) => String(c).toUpperCase()).filter(Boolean))])
    );
  } catch {
    /* quota / private mode */
  }
}

function mirrorDashboardEarningsAcrossCurrencies(
  earnings,
  currencies,
  resolveScopeKey,
  primaryCode = null,
  primaryEarnings = null
) {
  if (!Array.isArray(earnings) || !earnings.length || !resolveScopeKey) return;
  const codes = [...new Set(
    (currencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
  )];
  if (!earningsRowsAreUsable(earnings, codes, primaryCode, primaryEarnings)) return;
  for (const code of codes) {
    const key = resolveScopeKey({ currencyCode: code, showAllCurrencies: false });
    if (key) patchDashboardCache(key, { earnings });
  }
}

function alignPrimaryCurrencyRows(rows, primaryCode, primaryNetProfit, primaryEarnings) {
  if (!Array.isArray(rows)) return rows;
  const primary = String(primaryCode || "").trim().toUpperCase();
  if (!primary) return rows;
  return rows.map((row) => {
    if (String(row?.code || "").trim().toUpperCase() !== primary) return row;
    const next = { ...row };
    if (primaryNetProfit != null && Number.isFinite(Number(primaryNetProfit))) {
      next.netProfit = Number(primaryNetProfit);
    }
    if (primaryEarnings != null && Number.isFinite(Number(primaryEarnings))) {
      next.earnings = Number(primaryEarnings);
    }
    return next;
  });
}

function normalizeEarningsRowsForDisplay(rows, primaryCode, primaryNetProfit, primaryEarnings) {
  return sanitizeDuplicateNonPrimaryEarnings(
    alignPrimaryCurrencyRows(rows, primaryCode, primaryNetProfit, primaryEarnings),
    primaryCode,
    primaryEarnings
  );
}

function dashboardEarningsRowsComplete(rows, codes, primaryCode = null, primaryEarnings = null) {
  if (!Array.isArray(codes) || codes.length <= 1) return true;
  return earningsRowsAreUsable(rows, codes, primaryCode, primaryEarnings);
}

/** True when trend chart still needs a deferred chart bootstrap fetch. */
function dashboardPayloadNeedsChartDaily(data) {
  if (!data) return true;
  if (data._chart_daily_settled === true) return false;
  const daily = data?.daily_data;
  if (!daily || Array.isArray(daily)) return true;
  return !(
    Object.keys(daily.capital || {}).length > 0 ||
    Object.keys(daily.expenses || {}).length > 0 ||
    Object.keys(daily.profit || {}).length > 0
  );
}

/**
 * Any painted→target scope change (company / date / group / All):
 * KPI + trend + multi-currency pie must swap in one frame.
 */
function dashboardRequiresPieAtomicPaint(displayKey, targetKey) {
  if (!targetKey) return false;
  return String(displayKey || "") !== String(targetKey || "");
}

/** Mark payload so empty years do not re-fetch chart forever. */
function markDashboardChartSettled(data) {
  if (!data || typeof data !== "object") return data;
  return {
    ...data,
    _chart_daily_settled: true,
    daily_data: data.daily_data && !Array.isArray(data.daily_data)
      ? data.daily_data
      : { capital: {}, expenses: {}, profit: {} },
  };
}

function isBenignFetchError(err) {
  if (!err) return true;
  if (err.name === "AbortError") return true;
  const msg = String(err.message || err).toLowerCase();
  return msg.includes("abort");
}

/** Sync hydrate filter + companies so first paint can resolve scope/cache before bootstrap. */
function readInitialDashboardPageState() {
  try {
    if (typeof sessionStorage === "undefined") {
      return { companies: [], filter: null };
    }
    const persisted = readPersistedDashboardGcFilter();
    return {
      companies: getCachedOwnerCompanies() || [],
      filter: {
        companyId: persisted.groupOnly || persisted.groupAllMode ? null : persisted.companyId,
        selectedGroup: persisted.groupsAllMode ? null : persisted.selectedGroup,
        groupsAllMode: persisted.groupsAllMode,
        groupAllMode: persisted.groupAllMode,
      },
    };
  } catch {
    return { companies: [], filter: null };
  }
}

/** Coalesce rapid scope updates (company pick + currency hydrate) into one load. */
const LOAD_DASHBOARD_DEBOUNCE_MS = 90;
const DASHBOARD_STALE_RETRY_MAX = 3;
const EARNINGS_INCOMPLETE_RETRY_MAX = 5;
const PREFETCH_WAIT_MAX_ROUNDS = 40;
/** Coalesce rapid filter switches into one currency reload. */
const LOAD_CURRENCIES_COALESCE_MS = 300;
/** Defer session sync so dashboard fetch gets connection priority on company pick. */
const COMPANY_SESSION_DEFER_MS = 2000;
/** Defer group-all currency refresh while dashboard merge is in flight. */
const CURRENCY_REFRESH_DEFER_MS = 600;
/** Parallel company dashboard fetches when merging Group/Company "All". */
/** Module-level dedupe for currency-list helpers used outside the hook instance. */
const currencyListHttpInflight = new Map();

const MERGE_DASHBOARD_PARALLEL_BATCH = 8;
/** Idle delay before one-time session warm of picker companies (current currency only). */
const SESSION_DASHBOARD_WARM_DELAY_MS = 600;
/** Cross-group / independent company warm after active scope settles. */
const CROSS_GROUP_COMPANY_WARM_DELAY_MS = 2000;
/**
 * Atomic-paint scope load: give the primary KPI/chart request a short head start on the
 * connection/server before the Currency card's own per-currency fan-out follows — starting
 * fully simultaneously competes with KPI/chart right when that matters most; starting only
 * after KPI/chart fully resolves (the old behavior) makes the Currency card pay KPI/chart's
 * time PLUS its own on top. This splits the difference.
 */
const EARNINGS_OTHERS_STAGGER_MS = 150;
/** Parallel kpi bootstrap requests when filling multi-currency earnings sidebar. */
/** Parallel secondary-currency earnings captures (FE fans out; avoids PHP serial foreach).
 * Raised from 4 → 12 so a normal scope's whole currency list fires as one wave instead of
 * ceil(n/4) sequential batches — that stacked wait was the Currency card's 2-4s tail behind
 * KPI/chart. 12 comfortably covers the live currency roster without going unbounded. */
const EARNINGS_KPI_PARALLEL_BATCH = 12;
/**
 * Company All / Group All pie: each "one currency" request here is NOT light — under
 * group_all, `loadMergedDashboard` routes through `fetchMergedCompanyDashboards`, which
 * tries `tryGroupAllBootstrap` first: one HTTP call, but the server walks every company
 * in the group *serially* (see that function's comment — this is the documented "main
 * Company All first-paint stall").
 *
 * Tried lowering this to 3 assuming concurrent requests were contending for server
 * capacity and slowing each other down — measured slower, not faster. `runTasksInBatches`
 * batches are sequential (each batch fully awaited before the next starts), so a lower
 * batch size trades "one wave, wait for the slowest" for "N/3 waves, wait for the sum of
 * each wave's slowest" — and since each request's cost here is dominated by its own fixed
 * per-company server-side loop (not by how many sibling requests are in flight), there was
 * no per-request speedup to offset that added sequential cost. Back to firing (essentially)
 * the whole currency list as one wave, same as the normal-scope batch — the real fix for
 * this path is the backend serial-per-company loop itself, not frontend concurrency.
 */
const EARNINGS_KPI_PARALLEL_BATCH_GROUP_ALL = 12;
/** Defer trend-chart daily fetch so MoM previous can use DB first (skip for month-bucket ranges). */
const CHART_DAILY_DEFER_MS = 250;
/** Sibling currency warm — start after settle so early currency clicks hit cache. */
const CURRENCY_PREFETCH_DELAY_MS = 1200;
/** Long date ranges: slightly sooner once painted (single-company packs are lighter). */
const CURRENCY_PREFETCH_DELAY_LONG_RANGE_MS = 900;
/**
 * Company All sibling-currency warm uses heavy group_all packs — wait longer so a
 * quick date change (本月→今年) is not starved by stale-range full bootstraps.
 */
const CURRENCY_PREFETCH_DELAY_GROUP_ALL_MS = 2800;
const CURRENCY_PREFETCH_DELAY_GROUP_ALL_LONG_RANGE_MS = 4200;
/** After Company All settles, warm picker companies (behind currency warm). */
/** After Company All full paint (KPI+chart+pie) — stay clear of the pie fan-out. */
const COMPANY_ALL_COMPANY_WARM_DELAY_MS = 5500;
const COMPANY_ALL_COMPANY_WARM_DELAY_LONG_RANGE_MS = 8000;
/** After picking a company, warm siblings quickly so cold CX/RS/VG feel hot. */
const COMPANY_SWITCH_PREFETCH_DELAY_MS = 250;

function scheduleChartDailyLoad(cacheKey, resolveScopeKey, loadChartDaily, dateFrom, dateTo) {
  const deferMs =
    dateFrom && dateTo && shouldAggregateChartByMonth(dateFrom, dateTo) ? 0 : CHART_DAILY_DEFER_MS;
  window.setTimeout(() => {
    if (resolveScopeKey() === cacheKey) {
      void loadChartDaily(cacheKey);
    }
  }, deferMs);
}

async function runTasksInBatches(items, batchSize, runTask) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map((item) => runTask(item)));
    results.push(...settled);
  }
  return results;
}


function dashboardFetchInit(signal) {
  return signal ? { credentials: "include", signal } : { credentials: "include" };
}

/** Coalesce identical bootstrap requests (active scope + background prefetch). */
function fetchBootstrapDeduped(inflightMap, requestKey, fetcher) {
  if (inflightMap.has(requestKey)) {
    return inflightMap.get(requestKey);
  }
  const promise = fetcher().finally(() => {
    inflightMap.delete(requestKey);
  });
  inflightMap.set(requestKey, promise);
  return promise;
}

/** Sort csv list params so identical bootstrap calls share one inflight key. */
function normalizeBootstrapCsvParam(params, name) {
  const raw = params.get(name);
  if (!raw) return;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return;
  parts.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  params.set(name, parts.join(","));
}

/** Strip client-only query params so prefetch and active loads share one HTTP round-trip. */
function normalizeBootstrapDedupeKey(queryString) {
  const params = new URLSearchParams(queryString);
  params.delete("prefetch");
  normalizeBootstrapCsvParam(params, "currencies");
  normalizeBootstrapCsvParam(params, "company_ids");
  return params.toString();
}

/** Dedupe concurrent user_currency_order_api GETs (ignore cache-bust `_t`). */
async function fetchUserCurrencyOrderHttpDeduped(inflightMap, orderCompanyId) {
  const dedupeKey =
    orderCompanyId != null && Number.isFinite(Number(orderCompanyId))
      ? `cid:${Number(orderCompanyId)}`
      : "cid:none";
  const existing = inflightMap.get(dedupeKey);
  if (existing) return existing;
  const ordParams = new URLSearchParams({ _t: String(Date.now()) });
  if (orderCompanyId != null && Number.isFinite(Number(orderCompanyId))) {
    ordParams.set("company_id", String(orderCompanyId));
  }
  const promise = fetch(
    buildApiUrl(`api/transactions/user_currency_order_api.php?${ordParams.toString()}`),
    { credentials: "include" }
  )
    .then(async (res) => {
      if (!res) return null;
      try {
        return await res.json();
      } catch {
        return null;
      }
    })
    .catch(() => null)
    .finally(() => {
      if (inflightMap.get(dedupeKey) === promise) {
        inflightMap.delete(dedupeKey);
      }
    });
  inflightMap.set(dedupeKey, promise);
  return promise;
}

/** HTTP-level dedupe: callers parse json independently (prefetch vs active load). */
async function fetchBootstrapHttpDeduped(inflightMap, requestKey, init) {
  const dedupeKey = normalizeBootstrapDedupeKey(requestKey);
  const existing = inflightMap.get(dedupeKey);
  if (existing) return existing;
  const promise = (async () => {
    // Fetch with normalized query so server + dedupe see the same key.
    const res = await fetch(
      buildApiUrl(`${DASHBOARD_BOOTSTRAP_API}?${dedupeKey}`),
      init ?? { credentials: "include" }
    );
    const json = await res.json();
    return { res, json };
  })().finally(() => {
    if (inflightMap.get(dedupeKey) === promise) {
      inflightMap.delete(dedupeKey);
    }
  });
  inflightMap.set(dedupeKey, promise);
  return promise;
}

/** Dedupe concurrent identical currency-list GETs (scope / company currencies). */
async function fetchCurrencyListHttpDeduped(inflightMap, apiPath, queryString) {
  const dedupeKey = `${apiPath}?${String(queryString || "")}`;
  const existing = inflightMap.get(dedupeKey);
  if (existing) return existing;
  const promise = (async () => {
    const res = await fetch(buildApiUrl(dedupeKey), { credentials: "include" });
    const json = await res.json();
    return { res, json };
  })()
    .catch(() => null)
    .finally(() => {
      if (inflightMap.get(dedupeKey) === promise) {
        inflightMap.delete(dedupeKey);
      }
    });
  inflightMap.set(dedupeKey, promise);
  return promise;
}

/** Dedupe concurrent identical dashboard_api.php GETs (pie secondary currencies). */
async function fetchDashboardApiHttpDeduped(inflightMap, queryString, init) {
  const dedupeKey = String(queryString || "");
  const existing = inflightMap.get(dedupeKey);
  if (existing) return existing;
  const promise = (async () => {
    const res = await fetch(
      buildApiUrl(`${DASHBOARD_API}?${dedupeKey}`),
      init ?? { credentials: "include" }
    );
    const json = await res.json();
    return { res, json };
  })().finally(() => {
    if (inflightMap.get(dedupeKey) === promise) {
      inflightMap.delete(dedupeKey);
    }
  });
  inflightMap.set(dedupeKey, promise);
  return promise;
}

/** buildDashboardCacheKey → company|dateFrom|dateTo|… */
function parseDashboardCacheKeyDates(scopeKey) {
  const parts = String(scopeKey || "").split("|");
  if (parts.length < 3) return null;
  const from = parts[1];
  const to = parts[2];
  if (!from || !to) return null;
  return { from, to };
}

function cacheKeysShareDateRange(a, b) {
  const da = parseDashboardCacheKeyDates(a);
  const db = parseDashboardCacheKeyDates(b);
  if (!da || !db) return false;
  return da.from === db.from && da.to === db.to;
}

function stampDashboardPayloadRange(data, from, to) {
  if (!data || typeof data !== "object") return data;
  if (data._dash_date_from === from && data._dash_date_to === to) return data;
  return { ...data, _dash_date_from: from, _dash_date_to: to };
}

/** Reject scope-cache hits stamped for a different range (prevents All synthesize cross-period bleed). */
function dashboardPayloadRangeMatches(data, from, to) {
  if (!data || typeof data !== "object") return false;
  const df = data._dash_date_from;
  const dt = data._dash_date_to;
  if (df == null || dt == null) return true; // legacy: trust key; stamps applied on write going forward
  return String(df) === String(from) && String(dt) === String(to);
}

function sortCurrencyCodesForBootstrap(codes) {
  if (!Array.isArray(codes) || codes.length <= 1) return codes;
  return [...codes].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
  );
}

/** Painted company pill from cache key segment 0 (`sub:127`, numeric id, or All/group ledger). */
function parsePaintedCompanyIdFromScopeKey(scopeKey, fallbackCompanyId) {
  if (!scopeKey) return fallbackCompanyId;
  const raw = String(scopeKey).split("|")[0];
  if (!raw) return null;
  if (
    raw === "groups:all" ||
    raw === "independents:all" ||
    raw.startsWith("groupAll:") ||
    raw.startsWith("group:") ||
    raw.startsWith("subset:")
  ) {
    return null;
  }
  if (raw.startsWith("sub:")) {
    const id = parseInt(raw.slice(4), 10);
    return Number.isFinite(id) && id > 0 ? id : fallbackCompanyId;
  }
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : fallbackCompanyId;
}

/** Company/subsidiary scopes need a resolved display currency before bootstrap. */
function dashboardScopeNeedsCurrency({
  companyId,
  usesGroupLedgerDashboard,
  groupAllMode,
  groupsAllMode,
  mergedSubsetIds,
}) {
  if (usesGroupLedgerDashboard || groupAllMode || groupsAllMode) return false;
  if (mergedSubsetIds?.length > 1) return false;
  return companyId != null;
}

/** Best-effort currency for API/cache before React state settles (subsidiary MYR, etc.). */
function resolveProvisionalDashboardCurrency({
  currencyCode,
  companyId,
  currenciesRef,
  currenciesByCompanyRef,
}) {
  if (currencyCode) return String(currencyCode).trim().toUpperCase();
  const cid = companyId != null ? parseInt(companyId, 10) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) {
    const fromCompany = currenciesByCompanyRef?.current?.get(cid)?.[0];
    if (fromCompany) return String(fromCompany).trim().toUpperCase();
  }
  const fromList = currenciesRef?.current?.[0];
  return fromList ? String(fromList).trim().toUpperCase() : "";
}

function resolveDashboardActiveCurrency({
  codes,
  scopeKey,
  isCompanyOnlyScope,
  isGroupOnlyScope,
  prev,
}) {
  if (!codes.length) return "";
  if (isGroupOnlyScope) {
    return (
      readDashboardSelectedCurrency(scopeKey, { availableCodes: codes, scopeOnly: true }) ||
      codes[0] ||
      ""
    );
  }
  const persisted = resolveCrossPageCurrencyPreference({ scopeKey, availableCodes: codes });
  if (persisted && codes.includes(persisted)) return persisted;
  if (isCompanyOnlyScope) return codes[0] || "";
  const isCompanyScope = scopeKey && String(scopeKey).startsWith("company:");
  if (!isCompanyScope && prev && codes.includes(prev)) return prev;
  return codes[0] || "";
}

export function useDashboardPage({ i18n, dateFrom, dateTo }) {
  const { me, sessionReady } = useAuthSession();
  const location = useLocation();
  const initialPageState = useMemo(() => readInitialDashboardPageState(), []);
  const [loadError, setLoadError] = useState("");
  const [companies, setCompanies] = useState(initialPageState.companies);
  const [companyId, setCompanyId] = useState(initialPageState.filter?.companyId ?? null);
  const [selectedGroup, setSelectedGroup] = useState(initialPageState.filter?.selectedGroup ?? null);
  const [groupsAllMode, setGroupsAllMode] = useState(Boolean(initialPageState.filter?.groupsAllMode));
  const [groupAllMode, setGroupAllMode] = useState(Boolean(initialPageState.filter?.groupAllMode));
  const [mergedSubsetIds, setMergedSubsetIds] = useState(null);
  const [currencies, setCurrencies] = useState([]);
  const [currencyCode, setCurrencyCode] = useState("");
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [multiCurrencyKpi, setMultiCurrencyKpi] = useState(null);
  const [multiCurrencyKpiPrev, setMultiCurrencyKpiPrev] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardDataPrev, setDashboardDataPrev] = useState(null);
  const [loading, setLoading] = useState(true);
  const [earningsByCurrency, setEarningsByCurrency] = useState([]);
  const [earningsByCurrencyPrev, setEarningsByCurrencyPrev] = useState([]);
  const [earningsByCurrencyLoading, setEarningsByCurrencyLoading] = useState(false);
  const [exchangeRates, setExchangeRates] = useState({
    rates: {},
    date: null,
    unsupported: [],
    scopeKey: "",
  });
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesError, setExchangeRatesError] = useState("");
  const [chartVisible, setChartVisible] = useState([true, true, true, true]);
  const [earningsPanelView, setEarningsPanelView] = useState("currency");
  const [companyAccessModal, setCompanyAccessModal] = useState({ open: false, message: "" });
  /** Matches `dashboardScopeKey` when `dashboardData` reflects the active filter scope. */
  const [displayScopeKey, setDisplayScopeKey] = useState("");
  const displayScopeKeyRef = useRef(displayScopeKey);
  displayScopeKeyRef.current = displayScopeKey;

  const currencyCodeRef = useRef(currencyCode);
  const earningsFetchGenRef = useRef(0);
  const earningsByCurrencyRef = useRef([]);
  const earningsRetryTimerRef = useRef(null);
  const prevEarningsCurrenciesSigRef = useRef("");
  const upgradeActiveScopeEarningsRef = useRef(null);
  const dashboardFetchGenRef = useRef(0);
  /** Scope that last failed loadDashboard — suppress stale-gen retry storms. */
  const dashboardFetchFailedScopeRef = useRef("");
  const dashboardStaleRetryRef = useRef({ scopeKey: "", attempts: 0 });
  const earningsIncompleteRetryRef = useRef(0);
  const earningsLoadInFlightRef = useRef("");
  /** Group IDs (AP/IG) that returned viewer earnings config on the last Group All load. */
  const earningsEnabledGroupIdsRef = useRef([]);
  const earningsScopeUpgradeRef = useRef({ scopeKey: "", attempts: 0 });
  /** Aborts in-flight dashboard API calls when scope changes again. */
  const dashboardFetchAbortRef = useRef(null);
  /** Last scope key passed to loadDashboard — abort when currency/mode slice changes. */
  const dashboardFetchScopeRef = useRef("");
  /** Company/group/date slice — abort in-flight active load only when this changes. */
  const dashboardFetchStructuralScopeRef = useRef("");
  /** Bumped on each group/company pick — defers background prefetch until interaction settles. */
  const scopeInteractionGenRef = useRef(0);
  const dashboardDataRef = useRef(null);
  const dateFromRef = useRef(dateFrom);
  const dateToRef = useRef(dateTo);
  const companySwitchGenRef = useRef(0);
  const currencyLoadGenRef = useRef(0);
  const loadCurrenciesRef = useRef(null);
  const loadCurrenciesCoalesceTimerRef = useRef(null);
  /** Skip redundant currency network reloads for the same filter scope. */
  const currencyScopeLoadedRef = useRef({ key: "", count: 0 });
  const primeCurrenciesFromCacheRef = useRef(null);
  const skipNextCurrencyClickRef = useRef(false);
  /** After company pill change, next currency resolve picks the first pill (MYR). */
  const preferFirstCurrencyRef = useRef(false);
  const scopeCurrencyKeyRef = useRef("");
  const bootstrapGcOnceRef = useRef(false);
  const meRef = useRef(me);
  meRef.current = me;
  const currenciesRef = useRef(currencies);
  currenciesRef.current = currencies;
  earningsByCurrencyRef.current = earningsByCurrency;
  const exchangeRatesRef = useRef(exchangeRates);
  exchangeRatesRef.current = exchangeRates;
  const currencyPrefetchFailedRef = useRef(new Set());
  const currencyPrefetchDeniedCompanyRef = useRef(new Set());
  const currencyPrefetchDeniedGroupRef = useRef(new Set());
  const dashboardPrefetchFailedRef = useRef(new Set());
  const bootstrapInflightRef = useRef(new Map());
  const currencyPrefetchInflightRef = useRef(new Map());
  /** Dedupe identical dashboard_api.php earnings/kpi captures (group + subsidiary pie). */
  const dashboardApiInflightRef = useRef(new Map());
  /** Dedupe concurrent user_currency_order_api.php by company_id (ignore `_t`). */
  const userCurrencyOrderInflightRef = useRef(new Map());
  /** Dedupe concurrent get_*_currencies list GETs by full query string. */
  const currencyListInflightRef = useRef(new Map());
  /** Scope key while loadCurrencies network work is in flight. */
  const currencyLoadInFlightScopeRef = useRef("");
  /** Scope key while a full bootstrap (KPI + earnings) is in flight for the active view. */
  const dashboardBootstrapInFlightRef = useRef("");
  const dashboardFetchInFlightScopeRef = useRef("");
  /** True while FE-parallel secondary-currency earnings are filling atomic pie. */
  const earningsParallelInFlightRef = useRef("");
  /**
   * Coalesce concurrent Company All / group pie earnings jobs (same dates+codes).
   * Prevents upgradeActiveScopeEarnings + useEffect + loadDashboard from ×2 fan-out.
   */
  const groupAllEarningsInflightRef = useRef(new Map());
  /** Late-bound: Company All sibling-currency warm (defined after merge helpers). */
  const fetchGroupAllMergedDashboardRef = useRef(null);
  const enrichGroupAllMergedDashboardRef = useRef(null);
  const prefetchDashboardCompanyRef = useRef(null);
  const prefetchDashboardGroupAllRef = useRef(null);
  const previousPeriodFetchGenRef = useRef(0);
  const previousPeriodInFlightRef = useRef("");
  const exchangeRatesFetchGenRef = useRef(0);
  const chartDailyFetchGenRef = useRef(0);
  const chartDailyInFlightRef = useRef("");
  const loadDashboardTriggerKeyRef = useRef("");
  const loadDashboardStructuralKeyRef = useRef("");
  const loadDashboardRef = useRef(null);
  const ensureDeferredDashboardLoadsRef = useRef(null);
  /** Prevents synchronous DASHBOARD_GROUP_FILTER_EVENT ↔ sync re-entry stack overflow. */
  const syncGcFilterInFlightRef = useRef(false);
  const [gcBootstrapReady, setGcBootstrapReady] = useState(false);
  const [groupFilterOptOutTick, setGroupFilterOptOutTick] = useState(0);
  /** @type {React.MutableRefObject<Map<number, string[]>>} */
  const currenciesByCompanyRef = useRef(new Map());
  /** @type {React.MutableRefObject<Map<string, string[]>>} */
  const currenciesByGroupRef = useRef(new Map());
  /** @type {React.MutableRefObject<Map<number, string[]>>} User drag/API display order per company_id. */
  const currencyDisplayOrderByCompanyRef = useRef(new Map());
  /** User-level pill order: same sort across group/company filter switches. */
  const userCurrencyDisplayOrderRef = useRef(readUserCurrencyDisplayOrder());

  const buildScopeCurrencyKey = useCallback(
    () =>
      [
        selectedGroup || "",
        companyId ?? "",
        groupsAllMode ? "1" : "0",
        groupAllMode ? "1" : "0",
        mergedSubsetIds?.join(",") ?? "",
      ].join("|"),
    [selectedGroup, companyId, groupsAllMode, groupAllMode, mergedSubsetIds]
  );

  const groupOnlyDashboard = Boolean(
    !companyId &&
      selectedGroup &&
      !groupsAllMode &&
      !groupAllMode &&
      me &&
      canUseGroupOnlyMode(me)
  );

  /**
   * Group-level KPI (AP/IG): group ledger API or group-entity row only — never merge subsidiaries (e.g. C168).
   * Company "All" (groupAllMode) aggregates subsidiaries via merge, not group ledger.
   */
  const usesGroupLedgerDashboard = useMemo(() => {
    if (groupsAllMode && !groupAllMode) return false;
    if (groupAllMode) return false;
    if (!selectedGroup) return false;
    if (!companyId) return canUseGroupOnlyMode(me, selectedGroup, companies);
    const row = companies.find((c) => parseInt(c.id, 10) === parseInt(companyId, 10));
    return companyRowIsGroupEntity(row, selectedGroup);
  }, [groupsAllMode, groupAllMode, selectedGroup, companyId, companies, me]);

  /** View group for API/KPI when Group tab is implicit (e.g. All Groups + C168 → AP). */
  const dashboardViewGroup = useMemo(() => {
    if (selectedGroup) return String(selectedGroup).trim().toUpperCase();
    if (groupsAllMode && companyId != null) {
      const row = companies.find((c) => parseInt(c.id, 10) === parseInt(companyId, 10));
      return resolveViewGroupForCompany(row, null);
    }
    return null;
  }, [selectedGroup, groupsAllMode, companyId, companies]);

  /** Subsidiary drill-down under a group tab (e.g. C168 under AP) — isolate from group-ledger data. */
  const subsidiaryDashboardScope = useMemo(() => {
    if (companyId == null || groupAllMode) return false;
    const row = companies.find((c) => parseInt(c.id, 10) === parseInt(companyId, 10));
    if (groupsAllMode) {
      const vg = resolveViewGroupForCompany(row, null);
      return !!(row && vg && !companyRowIsGroupEntity(row, vg));
    }
    if (!selectedGroup) return false;
    return !usesGroupLedgerDashboard;
  }, [companyId, selectedGroup, groupsAllMode, groupAllMode, usesGroupLedgerDashboard, companies]);

  /** KPI earnings: group aggregate or subsidiary drill-down ownership multipliers. */
  const resolveKpiOwnershipOpts = useCallback(
    (cid = companyId, grp = selectedGroup) => {
      if (groupsAllMode && groupAllMode && (cid == null || cid === "")) {
        return { groupsAllCompaniesAggregate: true };
      }
      if (groupAllMode && grp) {
        return { groupAggregateEarnings: true, groupAllCompaniesEarningsSum: true };
      }
      if (groupsAllMode && !groupAllMode && (cid == null || cid === "")) {
        return { groupAggregateEarnings: true };
      }
      if (!groupAllMode && !groupsAllMode && grp) {
        if (cid == null) return { groupAggregateEarnings: true };
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
        if (companyRowIsGroupEntity(row, grp)) return { groupAggregateEarnings: true };
      }
      if (groupsAllMode && !groupAllMode && cid != null && cid !== "") {
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
        const vg = resolveViewGroupForCompany(row, null);
        if (row && vg && !companyRowIsGroupEntity(row, vg)) {
          return { subsidiaryGroupDrillDown: true };
        }
        return {};
      }
      if (cid == null || groupAllMode || !grp) return {};
      const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
      if (companyRowIsGroupEntity(row, grp)) return {};
      return { subsidiaryGroupDrillDown: true };
    },
    [companyId, selectedGroup, groupsAllMode, groupAllMode, companies]
  );

  /** Group All with no company = AP+IG ledger KPI (group login or company owner with group ledger). */
  const groupsAllGroupLevel =
    groupsAllMode &&
    companyId == null &&
    !groupAllMode &&
    canUseGroupOnlyMode(me) &&
    (isGroupLogin(me) || companyLoginCanUseGroupsAllLedger(me));
  const groupAggregateMode =
    groupAllMode || groupOnlyDashboard || groupsAllGroupLevel || usesGroupLedgerDashboard;
  /** All-currency merge: any scope with 2+ currencies (single company or group aggregate). */
  const canShowAllCurrencies = currencies.length > 1;
  const conversionBaseCurrency =
    (currencyCode && currencies.includes(currencyCode) ? currencyCode : currencies[0]) || "";

  const resolveDashboardScopeKey = useCallback(
    (overrides = {}) => {
      const cid = overrides.companyId !== undefined ? overrides.companyId : companyId;
      const selGroup =
        overrides.selectedGroup !== undefined ? overrides.selectedGroup : selectedGroup;
      const gAll = overrides.groupsAllMode !== undefined ? overrides.groupsAllMode : groupsAllMode;
      const gaMode = overrides.groupAllMode !== undefined ? overrides.groupAllMode : groupAllMode;
      const subset =
        overrides.mergedSubsetIds !== undefined ? overrides.mergedSubsetIds : mergedSubsetIds;
      const cur = overrides.currencyCode !== undefined ? overrides.currencyCode : currencyCode;
      let effectiveCur = cur ? String(cur).trim().toUpperCase() : "";
      const list = currenciesRef.current.length ? currenciesRef.current : currencies;
      if (!effectiveCur && gaMode && cid == null && list[0]) {
        effectiveCur = String(list[0]).trim().toUpperCase();
      }
      if (!effectiveCur && cid != null && list[0]) {
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
        const usesLedger =
          !gAll &&
          !gaMode &&
          selGroup &&
          row &&
          companyRowIsGroupEntity(row, selGroup);
        if (!usesLedger) {
          effectiveCur = String(list[0]).trim().toUpperCase();
        }
      }
      const from = overrides.dateFrom ?? dateFrom;
      const to = overrides.dateTo ?? dateTo;
      const showAll =
        overrides.showAllCurrencies !== undefined ? overrides.showAllCurrencies : showAllCurrencies;
      const allCurActive = showAll && canShowAllCurrencies;
      const convBase = overrides.conversionBaseCurrency ?? conversionBaseCurrency;

      let scopeCompanyKey = cid ?? null;
      const usesLedger = (() => {
        if (gAll && !gaMode) return false;
        if (gaMode) return false;
        if (!selGroup) return false;
        if (cid == null) return canUseGroupOnlyMode(me, selGroup, companies);
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
        return companyRowIsGroupEntity(row, selGroup);
      })();
      if (!effectiveCur && cid == null && usesLedger && list[0]) {
        effectiveCur = String(list[0]).trim().toUpperCase();
      }
      const subScope = cid != null && !gAll && !gaMode && selGroup && !usesLedger;

      if (subScope && scopeCompanyKey != null) {
        scopeCompanyKey = `sub:${scopeCompanyKey}`;
      }
      if (scopeCompanyKey == null && usesLedger && selGroup) {
        scopeCompanyKey = `group:${selGroup}`;
      }
      if (scopeCompanyKey == null && gAll) {
        scopeCompanyKey = "groups:all";
      }
      if (scopeCompanyKey == null && gaMode && selGroup) {
        scopeCompanyKey = `groupAll:${selGroup}`;
      }
      // Company "All" with no Group tab (independent companies merge).
      if (scopeCompanyKey == null && gaMode) {
        scopeCompanyKey = "independents:all";
      }
      if (scopeCompanyKey == null && subset?.length > 1) {
        scopeCompanyKey = `subset:${subset.join(",")}`;
      }
      if (!scopeCompanyKey) return "";

      return buildDashboardCacheKey({
        companyId: scopeCompanyKey,
        dateFrom: from,
        dateTo: to,
        currencyCode: effectiveCur,
        selectedGroup: selGroup,
        groupsAllMode: gAll,
        groupAllMode: gaMode,
        mergedSubsetIds: subset,
        showAllCurrencies: allCurActive,
        conversionBaseCurrency: convBase,
      });
    },
    [
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      mergedSubsetIds,
      dateFrom,
      dateTo,
      currencyCode,
      currencies,
      showAllCurrencies,
      canShowAllCurrencies,
      conversionBaseCurrency,
      companies,
      me,
    ]
  );

  const dashboardScopeKey = useMemo(() => resolveDashboardScopeKey(), [resolveDashboardScopeKey]);
  const currenciesScopeSig = useMemo(
    () => (currencies.length > 1 ? [...currencies].sort().join(",") : ""),
    [currencies]
  );

  const dashboardStructuralScopeKey = useMemo(
    () =>
      [
        companyId,
        selectedGroup,
        groupsAllMode ? "1" : "0",
        groupAllMode ? "1" : "0",
        mergedSubsetIds?.join(",") ?? "",
        dateFrom,
        dateTo,
        showAllCurrencies && canShowAllCurrencies ? "1" : "0",
      ].join("|"),
    [
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      mergedSubsetIds,
      dateFrom,
      dateTo,
      showAllCurrencies,
      canShowAllCurrencies,
    ]
  );

  const listCurrencyScopeKeys = useCallback(
    (codes = currencies) =>
      (codes || []).map((code) =>
        resolveDashboardScopeKey({ currencyCode: code, showAllCurrencies: false })
      ),
    [resolveDashboardScopeKey, currencies]
  );

  const resolveSharedDashboardEarnings = useCallback(
    (codes = currencies, primaryCode = currencyCodeRef.current, primaryEarnings = null) =>
      findSharedDashboardEarnings(
        listCurrencyScopeKeys(codes),
        codes,
        primaryCode,
        primaryEarnings
      ),
    [listCurrencyScopeKeys, currencies]
  );

  const cacheEntryHasFullEarnings = useCallback(
    (entry, codes, primaryCode = null, primaryEarnings = null) => {
      if (!Array.isArray(codes) || codes.length <= 1) return true;
      return dashboardEarningsRowsComplete(entry?.earnings, codes, primaryCode, primaryEarnings);
    },
    []
  );

  /** Complete per-currency earnings rows safe to apply to UI state (never undefined). */
  const getCompleteCachedEarnings = useCallback(
    (entry, codes, primaryCode = null, primaryEarnings = null) => {
      if (!Array.isArray(codes) || codes.length <= 1) return null;
      const rows = entry?.earnings;
      if (!dashboardEarningsRowsComplete(rows, codes, primaryCode, primaryEarnings)) return null;
      return rows;
    },
    []
  );

  /** Earnings for the active scope (exact cache key first, then sibling currency caches). */
  const resolveScopeDashboardEarnings = useCallback(
    (
      codes = currencies,
      scopeKey = dashboardScopeKey,
      primaryCode = currencyCodeRef.current,
      primaryEarnings = null
    ) => {
      const list = Array.isArray(codes) ? codes : currencies;
      if (!Array.isArray(list) || !list.length) return null;
      const direct = scopeKey
        ? getCompleteCachedEarnings(
            getDashboardCache(scopeKey),
            list,
            primaryCode,
            primaryEarnings
          )
        : null;
      if (direct) return direct;
      const shared = resolveSharedDashboardEarnings(list, primaryCode, primaryEarnings);
      if (shared && dashboardEarningsRowsComplete(shared, list, primaryCode, primaryEarnings)) {
        return shared;
      }
      return null;
    },
    [dashboardScopeKey, currencies, resolveSharedDashboardEarnings, getCompleteCachedEarnings]
  );

  const resolveCodesForEarningsBootstrap = useCallback(() => {
    if (groupsAllMode && groupAllMode) {
      const groupsAllCodes = currenciesByGroupRef.current.get("GROUPS:ALL");
      if (groupsAllCodes?.length > 1) return groupsAllCodes;
      const persistedAll = readPersistedGroupsAllCurrencyCodes();
      if (persistedAll?.length > 1) return persistedAll;
    }
    if (groupAllMode && selectedGroup) {
      const g = String(selectedGroup).trim().toUpperCase();
      const groupAllCodes = currenciesByGroupRef.current.get(`${g}:ALL`);
      if (groupAllCodes?.length > 1) return groupAllCodes;
    }
    return (
      (subsidiaryDashboardScope && companyId != null
        ? currenciesByCompanyRef.current.get(parseInt(companyId, 10)) ?? currenciesRef.current
        : selectedGroup && currenciesRef.current.length > 0 && !subsidiaryDashboardScope
          ? currenciesRef.current
          : companyId != null
            ? currenciesByCompanyRef.current.get(parseInt(companyId, 10))
            : null) ??
      (currenciesRef.current.length > 1 ? currenciesRef.current : null)
    );
  }, [subsidiaryDashboardScope, companyId, selectedGroup, groupAllMode, groupsAllMode]);

  const resolvePrefetchBootstrapCodes = useCallback((targetCompanyId, viewGroup, isActiveScope = false) => {
    const id = parseInt(targetCompanyId, 10);
    const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
    return (
      (Number.isFinite(id) ? currenciesByCompanyRef.current.get(id) : null) ??
      (vg ? currenciesByGroupRef.current.get(vg) : null) ??
      (isActiveScope && currenciesRef.current.length > 1 ? currenciesRef.current : null)
    );
  }, []);

  useEffect(
    () => () => {
      dashboardFetchAbortRef.current?.abort();
      if (earningsRetryTimerRef.current) {
        window.clearTimeout(earningsRetryTimerRef.current);
      }
      if (loadCurrenciesCoalesceTimerRef.current) {
        window.clearTimeout(loadCurrenciesCoalesceTimerRef.current);
      }
    },
    []
  );

  const bootstrap = useCallback(async (signal) => {
    setLoadError("");
    const u = meRef.current;
    if (!sessionReady || !u) return;
    try {
      const cjRows = await fetchOwnerCompaniesAll({ signal, throwOnError: true, me: u });
      await fetchOwnerGroupsAll(u, { signal });
      const scopedCompanies = cjRows;
      setCompanies((prev) =>
        companiesListSignature(prev) === companiesListSignature(scopedCompanies)
          ? prev
          : scopedCompanies
      );
      applyLoginScopeToSessionStorageIfNeeded(u, scopedCompanies);

      // Sticky Group/Company memory (below) keeps repeat visits fast, but it also means a
      // company created after the last boot in this tab (e.g. a brand-new standalone
      // company with no group) never gets picked — the cached selection always still
      // resolves fine. Detect that case once and pre-seed the persisted selection with the
      // new company, same as if the user had just clicked it; a genuinely fresh tab (no
      // prior snapshot) or an unchanged company list is a no-op, so daily AP/C168-style use
      // is unaffected.
      if (!isDashboardGroupOnlyMode() && !isDashboardGroupsAllMode()) {
        const addedCompany = findCompanyAddedSinceLastBoot(scopedCompanies);
        if (addedCompany) {
          persistDashboardSelectedCompany(addedCompany.id);
          persistDashboardGroupFilter(addedCompany.group_id || null);
        }
      }
      persistDashboardKnownCompanyIds(scopedCompanies);

      const bootSessionKey = [
        u?.user_id ?? u?.id ?? "",
        u?.login_scope ?? "",
        u?.login_identifier ?? "",
      ].join("|");
      bindDashboardSessionCache(bootSessionKey);

      if (bootstrapGcOnceRef.current) return;

      if (isDashboardSessionBootstrapped(bootSessionKey)) {
        const persistedRefresh = readPersistedDashboardGcFilter();
        if (persistedRefresh.groupsAllMode) {
          setGroupsAllMode(true);
          setGroupAllMode(Boolean(persistedRefresh.groupAllMode));
          setSelectedGroup(null);
          setCompanyId(
            persistedRefresh.groupOnly || persistedRefresh.groupAllMode
              ? null
              : persistedRefresh.companyId
          );
        }
        bootstrapGcOnceRef.current = true;
        setGcBootstrapReady(true);
        setLoading(false);
        if (persistedRefresh.groupsAllMode && persistedRefresh.groupAllMode) {
          primeCurrenciesFromCacheRef.current?.({
            companyId: null,
            selectedGroup: null,
            groupsAllMode: true,
            groupAllMode: true,
          });
        } else if (persistedRefresh.groupAllMode && persistedRefresh.selectedGroup) {
          primeCurrenciesFromCacheRef.current?.({
            companyId: null,
            selectedGroup: persistedRefresh.selectedGroup,
            groupsAllMode: false,
            groupAllMode: true,
          });
        }
        primeDashboardFromCacheRef.current?.({
          companyId:
            persistedRefresh.groupOnly || persistedRefresh.groupAllMode
              ? null
              : persistedRefresh.companyId,
          selectedGroup: persistedRefresh.groupsAllMode
            ? null
            : persistedRefresh.selectedGroup,
          groupsAllMode: persistedRefresh.groupsAllMode,
          groupAllMode: persistedRefresh.groupAllMode,
          mergedSubsetIds: null,
        });
        window.setTimeout(() => {
          void scheduleLoadCurrenciesRef.current?.(true);
        }, 0);
        return;
      }

      const clearedOptOut = reconcileDashboardGroupFilterOptOutFromPersisted();
      if (clearedOptOut) setGroupFilterOptOutTick((n) => n + 1);

      const persisted = readPersistedDashboardGcFilter();
      const groupFilterOptOut =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
      const groupOnlyBoot =
        !groupFilterOptOut && persisted.groupOnly && persisted.companyId == null;
      const groupLoginBoot =
        !groupFilterOptOut &&
        isGroupLogin(u) &&
        persisted.companyId == null &&
        readDashboardSelectedCompanyId() == null &&
        !persisted.groupsAllMode &&
        !persisted.groupAllMode;

      if ((groupOnlyBoot || groupLoginBoot) && canUseGroupOnlyMode(u)) {
        const ident = getLoginIdentifier(u);
        const group =
          persisted.selectedGroup ||
          ident ||
          resolveInitialSelectedGroupFromSession(scopedCompanies, null, u);
        if (group) {
          setSelectedGroup(group);
          if (groupOnlyBoot) {
            persistDashboardGroupFilter(group);
            persistDashboardGroupOnlyMode(true);
            persistDashboardSelectedCompany(null);
          }
        }
        setCompanyId(null);
        setDashboardData(null);
        setDashboardDataPrev(null);
        setDisplayScopeKey("");
        setLoading(false);
        bootstrapGcOnceRef.current = true;
        markDashboardSessionBootstrapped(bootSessionKey);
        setGcBootstrapReady(true);
        if (group) {
          notifyDashboardGroupFilterChanged(
            group,
            null,
            buildDashboardSidebarNotifyOptions(null, group),
          );
        }
        return;
      }

      const scopedGroupIds = sortedUniqueGroupIds(scopedCompanies);
      const awaitingGroupPick = companyDashboardAwaitingGroupPick(u, scopedCompanies, scopedGroupIds);
      const loginSubsidiary = resolveCompanyLoginGroupedSubsidiary(
        u,
        scopedCompanies,
        scopedGroupIds
      );

      if (
        loginSubsidiary &&
        !groupFilterOptOut &&
        !persisted.groupsAllMode &&
        !persisted.selectedGroup &&
        !Boolean(persisted.groupAllMode)
      ) {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
        }
        const { companyId: bootCid, group, row: bootRow } = loginSubsidiary;
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(group);
        persistDashboardGroupFilter(group);
        setCompanyId(bootCid);
        persistDashboardFilterState(group, bootCid, { allowGroupOnly: false });
        setLoading(false);
        bootstrapGcOnceRef.current = true;
        markDashboardSessionBootstrapped(bootSessionKey);
        setGcBootstrapReady(true);
        notifyDashboardGroupFilterChanged(
          group,
          bootCid,
          buildDashboardSidebarNotifyOptions(bootRow, group, { ignoreGroupOnly: true }),
        );
        window.setTimeout(() => {
          void syncCompanySessionApi(bootCid, group).then((json) => {
            if (!json?.success || !json?.data) return;
            notifyCompanySessionUpdated(json.data);
            notifyDashboardGroupFilterChanged(group, bootCid, {
              ...buildDashboardSidebarNotifyOptions(bootRow, group, { ignoreGroupOnly: true }),
              hasGambling: json.data.has_gambling,
              hasBank: json.data.has_bank,
            });
          });
        }, 120);
        return;
      }

      if (
        awaitingGroupPick &&
        !persisted.groupsAllMode &&
        !persisted.selectedGroup &&
        !loginSubsidiary
      ) {
        if (!groupFilterOptOut && typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
        }
        setGroupsAllMode(false);
        setSelectedGroup(null);
        setCompanyId(null);
        setCurrencies([]);
        setCurrencyCode("");
        setDashboardData(null);
        setDashboardDataPrev(null);
        setDisplayScopeKey("");
        persistDashboardSelectedCompany(null);
        persistDashboardGroupOnlyMode(false);
        persistDashboardGroupsAllMode(false);
        persistDashboardFilterState(null, null, { allowGroupOnly: false, groupsAllMode: false });
        setLoading(false);
        bootstrapGcOnceRef.current = true;
        markDashboardSessionBootstrapped(bootSessionKey);
        setGcBootstrapReady(true);
        notifyDashboardGroupFilterChanged(null, null);
        return;
      }

      const fallbackId =
        scopedCompanies.length === 1
          ? parseInt(scopedCompanies[0].id, 10)
          : u.company_id
            ? parseInt(u.company_id, 10)
            : null;
      const boot = resolveGcFilterBootCompanyId({
        sessionCompanyId: fallbackId,
        defaultRowId: scopedCompanies[0]?.id,
      });
      let cid =
        boot.companyId != null
          ? parseInt(boot.companyId, 10)
          : resolveBootCompanyId({ sessionCompanyId: fallbackId, defaultRowId: scopedCompanies[0]?.id });
      if (cid && !scopedCompanies.some((c) => parseInt(c.id, 10) === parseInt(cid, 10))) {
        cid = resolveBootCompanyId({ defaultRowId: parseInt(scopedCompanies[0].id, 10) });
      }
      if (
        awaitingGroupPick &&
        !persisted.selectedGroup &&
        !persisted.groupsAllMode &&
        !loginSubsidiary
      ) {
        cid = null;
      }

      const current =
        cid != null ? scopedCompanies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10)) : null;
      const bootGroupsAllMode =
        !groupFilterOptOut && (Boolean(persisted.groupsAllMode) || isDashboardGroupsAllMode());
      let group = bootGroupsAllMode
        ? null
        : groupFilterOptOut
          ? null
          : boot.selectedGroup ||
            persisted.selectedGroup ||
            resolveInitialSelectedGroupFromSession(scopedCompanies, current, u);
      setGroupsAllMode(bootGroupsAllMode);
      setSelectedGroup(group);

      if (!groupFilterOptOut && isDashboardGroupOnlyMode() && !canUseGroupOnlyMode(u)) {
        persistDashboardFilterState(group, cid, {
          allowGroupOnly: false,
          groupsAllMode: bootGroupsAllMode,
        });
      }

      let bootCid = cid != null ? parseInt(cid, 10) : null;
      const bootGroupAllMode = Boolean(boot.groupAllMode);
      if (bootGroupAllMode) {
        bootCid = null;
      } else if (bootGroupsAllMode) {
        if (companyLoginCanUseGroupsAllLedger(u)) {
          bootCid = null;
        } else {
          const persistedCompany = persisted.companyId;
          bootCid =
            persistedCompany != null && Number.isFinite(Number(persistedCompany))
              ? Number(persistedCompany)
              : null;
          if (bootCid == null && !bootGroupAllMode && isCompanyLogin(u) && !isGroupLogin(u)) {
            const fromMe = u?.company_id != null ? parseInt(u.company_id, 10) : Number.NaN;
            if (Number.isFinite(fromMe) && fromMe > 0) {
              bootCid = fromMe;
            } else {
              const pick = resolveCompanyWhenPickingAllGroups(
                scopedCompanies,
                null,
                scopedGroupIds
              );
              if (pick?.id) bootCid = parseInt(pick.id, 10);
            }
          }
        }
      } else if (groupFilterOptOut) {
        const pick = resolveCompanyWhenClosingGroup(
          scopedCompanies,
          bootCid ?? persisted.companyId ?? null,
          scopedGroupIds
        );
        bootCid = pick?.id ? parseInt(pick.id, 10) : null;
      } else if (!groupFilterOptOut && bootCid == null && group) {
        const pick = pickDefaultCompanyForGroup(scopedCompanies, group, { me: u });
        if (pick?.id) bootCid = parseInt(pick.id, 10);
      }
      setGroupAllMode(bootGroupAllMode);
      if (bootCid != null && group) {
        const bootRow = scopedCompanies.find((c) => parseInt(c.id, 10) === parseInt(bootCid, 10));
        if (bootRow && companyRowIsGroupEntity(bootRow, group)) {
          const subPick = pickDefaultSubsidiaryForGroup(scopedCompanies, group, {
            me: u,
            preferredCompanyId: bootCid,
          });
          if (subPick?.id) {
            bootCid = parseInt(subPick.id, 10);
          }
        }
      }
      setCompanyId(bootCid);
      if (bootCid != null) {
        persistDashboardFilterState(bootGroupsAllMode ? null : group, bootCid, {
          allowGroupOnly: false,
          groupsAllMode: bootGroupsAllMode,
        });
      } else if (bootGroupsAllMode) {
        if (bootGroupAllMode) {
          persistDashboardFilterState(null, null, {
            allowGroupOnly: false,
            companyAllMode: true,
            groupsAllMode: true,
          });
        } else {
          persistDashboardGroupsAllMode(true);
          persistDashboardGroupOnlyMode(false);
          persistDashboardGroupAllMode(false);
          persistDashboardSelectedCompany(null);
        }
      }
      if (bootCid == null) setLoading(false);
      bootstrapGcOnceRef.current = true;
      markDashboardSessionBootstrapped(bootSessionKey);
      setGcBootstrapReady(true);
      if (bootCid != null) {
        const bootRow = scopedCompanies.find((c) => parseInt(c.id, 10) === parseInt(bootCid, 10));
        const notifyOpts = buildDashboardSidebarNotifyOptions(bootRow, bootGroupsAllMode ? null : group, {
          ignoreGroupOnly: true,
        });
        notifyDashboardGroupFilterChanged(bootGroupsAllMode ? null : group, bootCid, notifyOpts);
        window.setTimeout(() => {
          void syncCompanySessionApi(bootCid, group).then((json) => {
          if (!json?.success || !json?.data) return;
          notifyCompanySessionUpdated(json.data);
          notifyDashboardGroupFilterChanged(group, bootCid, {
            ...notifyOpts,
            hasGambling: json.data.has_gambling,
            hasBank: json.data.has_bank,
          });
          });
        }, 120);
      } else if (bootGroupsAllMode) {
        notifyDashboardGroupFilterChanged(
          null,
          null,
          buildDashboardSidebarNotifyOptions(null, readGroupsAllSidebarGroup()),
        );
        window.setTimeout(() => {
          void scheduleLoadCurrenciesRef.current?.(true);
        }, 0);
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      setLoadError(err?.message || i18n.failedToLoadDashboard);
      setLoading(false);
      bootstrapGcOnceRef.current = true;
      const u = meRef.current;
      const bootSessionKey = [
        u?.user_id ?? u?.id ?? "",
        u?.login_scope ?? "",
        u?.login_identifier ?? "",
      ].join("|");
      if (bootSessionKey) markDashboardSessionBootstrapped(bootSessionKey);
      setGcBootstrapReady(true);
    }
  }, [sessionReady, i18n.failedToLoadDashboard]);

  const bootstrapSessionKey = useMemo(
    () =>
      [
        me?.user_id ?? me?.id ?? "",
        me?.login_scope ?? "",
        me?.login_identifier ?? "",
      ].join("|"),
    [me?.user_id, me?.id, me?.login_scope, me?.login_identifier]
  );

  /** Returning visit: unlock loadDashboard before async bootstrap finishes. */
  useLayoutEffect(() => {
    if (!sessionReady || !me || !bootstrapSessionKey) return undefined;
    bindDashboardSessionCache(bootstrapSessionKey);
    if (isDashboardSessionBootstrapped(bootstrapSessionKey)) {
      setGcBootstrapReady(true);
    }
    return undefined;
  }, [sessionReady, me?.user_id, me?.id, bootstrapSessionKey]);

  useEffect(() => {
    if (!sessionReady || !bootstrapSessionKey) return undefined;
    const controller = new AbortController();
    bootstrap(controller.signal);
    return () => controller.abort();
  }, [bootstrap, sessionReady, bootstrapSessionKey]);

  const { resetAnchorSessionRef } = useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId: me?.company_id,
  });

  useEffect(() => {
    if (!gcBootstrapReady) return;
    notifyDashboardGcBootstrapReady();
  }, [gcBootstrapReady]);

  const companiesSig = useMemo(() => companiesListSignature(companies), [companies]);

  /** Re-apply UserList / AccountList persisted Group+Company when returning to Dashboard. */
  const syncGcFilterFromPersisted = useCallback(() => {
    if (!gcBootstrapReady || !companies.length) return;
    if (syncGcFilterInFlightRef.current) return;
    syncGcFilterInFlightRef.current = true;
    try {
      const clearedOptOut = reconcileDashboardGroupFilterOptOutFromPersisted();
      if (clearedOptOut) setGroupFilterOptOutTick((n) => n + 1);

      const persisted = readPersistedDashboardGcFilter();
      const optOut =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";

      if (persisted.groupsAllMode) {
        const targetCompanyId =
          persisted.groupOnly || persisted.groupAllMode ? null : persisted.companyId;
        const targetGroupAllMode = Boolean(persisted.groupAllMode);
        const groupsAllSame = groupsAllMode;
        const groupAllSame = groupAllMode === targetGroupAllMode;
        const selGroupSame = selectedGroup == null;
        let companySame;
        if (targetCompanyId != null) {
          companySame =
            companyId != null &&
            Number(companyId) === Number(targetCompanyId) &&
            !groupAllMode;
        } else if (targetGroupAllMode) {
          companySame = companyId == null && groupAllMode;
        } else {
          companySame = companyId == null && !groupAllMode;
        }
        if (groupsAllSame && groupAllSame && selGroupSame && companySame) {
          if (!currenciesRef.current?.length && targetGroupAllMode) {
            primeCurrenciesFromCacheRef.current?.({
              companyId: null,
              selectedGroup: null,
              groupsAllMode: true,
              groupAllMode: true,
            });
            void scheduleLoadCurrenciesRef.current?.(true);
          }
          return;
        }

        setGroupsAllMode(true);
        setGroupAllMode(targetGroupAllMode);
        setSelectedGroup(null);
        setCompanyId(targetCompanyId);
        primeCurrenciesFromCacheRef.current?.({
          companyId: null,
          selectedGroup: null,
          groupsAllMode: true,
          groupAllMode: targetGroupAllMode,
        });
        void scheduleLoadCurrenciesRef.current?.(true);
        return;
      }

      if (
        !persisted.selectedGroup &&
        !persisted.groupsAllMode &&
        (optOut || companyLoginRequiresSubsidiaryWithGroup(meRef.current))
      ) {
        if (optOut) {
          const independents = independentCompaniesForPicker(companies, groupIds);
          const persistedCid =
            persisted.companyId != null && Number.isFinite(Number(persisted.companyId))
              ? Number(persisted.companyId)
              : Number.NaN;
          const currentCid = companyId != null ? Number(companyId) : Number.NaN;
          let targetCompanyId = null;
          if (
            Number.isFinite(persistedCid) &&
            independents.some((c) => Number(c.id) === persistedCid)
          ) {
            targetCompanyId = persistedCid;
          } else if (
            Number.isFinite(currentCid) &&
            independents.some((c) => Number(c.id) === currentCid)
          ) {
            targetCompanyId = currentCid;
          }
          if (selectedGroup == null && companyId === targetCompanyId) {
            return;
          }
          setGroupsAllMode(false);
          setGroupAllMode(false);
          setSelectedGroup(null);
          setCompanyId(targetCompanyId);
          return;
        }

        const awaitingPick = companyDashboardAwaitingGroupPick(
          meRef.current,
          companies,
          groupIds
        );
        const loginSub = resolveCompanyLoginGroupedSubsidiary(
          meRef.current,
          companies,
          groupIds
        );
        const targetCompanyId =
          awaitingPick && !loginSub
            ? null
            : loginSub
              ? loginSub.companyId
              : persisted.companyId != null && Number.isFinite(Number(persisted.companyId))
                ? Number(persisted.companyId)
                : companyId;
        const targetGroup = loginSub ? loginSub.group : null;
        if (
          (targetGroup == null || selectedGroup === targetGroup) &&
          (targetCompanyId == null || companyId === targetCompanyId)
        ) {
          return;
        }
        setGroupsAllMode(false);
        setGroupAllMode(false);
        if (targetGroup != null) setSelectedGroup(targetGroup);
        else setSelectedGroup(null);
        if (targetCompanyId != null) setCompanyId(targetCompanyId);
        else setCompanyId(null);
        return;
      }

      if (!persisted.selectedGroup) return;

      const targetGroup = String(persisted.selectedGroup).trim().toUpperCase();
      const targetCompanyId = persisted.groupOnly || persisted.groupAllMode ? null : persisted.companyId;
      const targetGroupAllMode = Boolean(persisted.groupAllMode);
      const groupSame = String(selectedGroup || "").trim().toUpperCase() === targetGroup;
      let companySame;
      if (targetCompanyId != null) {
        companySame =
          companyId != null &&
          Number(companyId) === Number(targetCompanyId) &&
          !groupAllMode;
      } else if (targetGroupAllMode) {
        companySame = companyId == null && groupAllMode;
      } else {
        companySame = companyId == null && !groupAllMode;
      }
      if (groupSame && companySame) return;

      setGroupsAllMode(false);
      setGroupAllMode(targetGroupAllMode);
      setSelectedGroup(targetGroup);
      setCompanyId(targetCompanyId);
      if (targetCompanyId != null) {
        persistDashboardGroupOnlyMode(false);
      }
      // Sidebar is updated by whoever persisted the filter (UserList, pick handlers, bootstrap).
      // Re-dispatching here during the same synchronous event stack caused infinite recursion.
    } finally {
      syncGcFilterInFlightRef.current = false;
    }
  }, [
    gcBootstrapReady,
    companiesSig,
    me?.user_id,
    me?.id,
    me?.login_scope,
    selectedGroup,
    companyId,
    groupAllMode,
    groupsAllMode,
  ]);

  useEffect(() => {
    if (!pathnameIs("dashboard", location.pathname)) return;
    syncGcFilterFromPersisted();
  }, [location.pathname, syncGcFilterFromPersisted]);

  useEffect(() => {
    const onFilterChanged = (e) => {
      if (e?.detail && !dashboardFilterEventMatchesPersisted(e.detail)) return;
      syncGcFilterFromPersisted();
    };
    window.addEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChanged);
    return () => window.removeEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChanged);
  }, [syncGcFilterFromPersisted]);

  const groupIds = useMemo(
    () => resolveVisibleGroupIds(resolveOwnerDashboardGroupIds(companies, me), me, companies),
    [companies, me],
  );

  /** Groups All merge/picker: only groups with ledger permission (AP yes / IG no → AP only). */
  const ledgerGroupIds = useMemo(
    () => filterGroupIdsForLedgerAccess(me, groupIds, companies),
    [me, groupIds, companies]
  );

  const companiesForPicker = useMemo(() => {
    const preferredId = companyId ?? me?.company_id ?? null;
    const groupFilterOptOut =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
    const pickerViewGroup = groupsAllMode
      ? null
      : selectedGroup
        ? String(selectedGroup).trim().toUpperCase()
        : null;
    const apiAccessiblePicker = (list) =>
      filterCompaniesForDashboardApiAccess(me, list, companies, pickerViewGroup);
    if (groupsAllMode) {
      return apiAccessiblePicker(
        dedupeOwnerCompaniesByCode(
          allGroupedCompaniesForPicker(companies, ledgerGroupIds),
          preferredId
        )
      );
    }
    if (selectedGroup && !groupFilterOptOut) {
      const effectiveGroup = String(selectedGroup).trim().toUpperCase();
      const list = dedupeOwnerCompaniesByCode(
        companiesForCompanyPicker(companies, effectiveGroup, groupIds),
        preferredId
      );
      if (list.length) return apiAccessiblePicker(list);
      return apiAccessiblePicker(
        dedupeOwnerCompaniesByCode(
          excludeGroupLabelsFromCompanyPicker(
            filterCompaniesWithDisplayId(companiesPickerInGroupList(companies, effectiveGroup)),
            groupIds
          ),
          preferredId
        )
      );
    }
    const independent = dedupeOwnerCompaniesByCode(
      independentCompaniesForPicker(companies, groupIds),
      preferredId
    );
    return apiAccessiblePicker(independent);
  }, [
    companies,
    selectedGroup,
    groupsAllMode,
    groupIds,
    ledgerGroupIds,
    companyId,
    me,
    me?.company_id,
    groupFilterOptOutTick,
  ]);

  const resolveMergeCompanyList = useCallback(() => {
    let list = [];
    if (groupsAllMode) list = resolveGroupsAllMergeCompanyList(companies, ledgerGroupIds);
    else if (selectedGroup) {
      list = resolveGroupAllMergeCompanyList(companies, selectedGroup, groupIds);
    } else {
      // No Group tab: Company "All" merges independent (ungrouped) picker companies.
      list = resolveIndependentAllMergeCompanyList(companies, groupIds);
    }
    return filterCompaniesForDashboardApiAccess(
      meRef.current,
      list,
      companies,
      groupsAllMode ? null : selectedGroup
    );
  }, [companies, selectedGroup, groupsAllMode, groupIds, ledgerGroupIds]);

  const applyCompanySelection = useCallback((id, options = {}) => {
    const clearSubset = options.clearSubset !== false;
    const clearGroupAll = options.clearGroupAll !== false;
    setCompanyId(parseInt(id, 10));
    if (clearGroupAll) setGroupAllMode(false);
    if (clearSubset) setMergedSubsetIds(null);
  }, []);

  const resetCurrencyForCompanySwitch = useCallback((cid, group) => {
    const scopeKey = buildDashboardCurrencyScopeKey({
      companyId: cid,
      selectedGroup: group,
    });
    if (scopeKey) clearDashboardScopedCurrency(scopeKey);
    preferFirstCurrencyRef.current = true;
  }, []);

  const resolveActiveCurrencyForScope = useCallback((params) => {
    if (preferFirstCurrencyRef.current) {
      preferFirstCurrencyRef.current = false;
      return params.codes?.[0] || "";
    }
    return resolveDashboardActiveCurrency(params);
  }, []);

  const clearCompanySelection = useCallback((groupForPersist) => {
    const g =
      groupForPersist ??
      selectedGroup ??
      (typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("dashboard_group_filter")
        : null);
    persistDashboardFilterState(g, null);
    setCompanyId(null);
    setGroupAllMode(false);
    setMergedSubsetIds(null);
    setDashboardData(null);
    setDashboardDataPrev(null);
    setDisplayScopeKey("");
    setEarningsByCurrency([]);
    setEarningsByCurrencyLoading(false);
    setShowAllCurrencies(false);
    setMultiCurrencyKpi(null);
    setMultiCurrencyKpiPrev(null);
    setLoading(false);
    setLoadError("");
    notifyDashboardGroupFilterChanged(
      g ? String(g).trim().toUpperCase() : null,
      null,
      buildDashboardSidebarNotifyOptions(null, g),
    );
  }, [selectedGroup]);

  const syncCompanySession = useCallback(
    async (id, viewGroup = selectedGroup, syncGen = null) => {
      const gen = syncGen ?? ++companySwitchGenRef.current;
      try {
        const q = new URLSearchParams({ company_id: String(id) });
        const vg = viewGroup ? String(viewGroup).trim() : "";
        if (vg) q.set("view_group", vg);
        const res = await fetch(
          buildApiUrl(`api/session/update_company_session_api.php?${q.toString()}`),
          {
            credentials: "include",
          }
        );
        const j = await res.json();
        if (gen !== companySwitchGenRef.current) return false;
        if (!res.ok || !j.success) {
          const reason = String(j?.data?.reason || "").toLowerCase();
          const msg = String(j?.message || j?.error || "");
          const lower = msg.toLowerCase();
          const shouldShowModal =
            reason === "expired" ||
            reason === "no_set" ||
            lower.includes("company has expired") ||
            lower.includes("group has expired") ||
            lower.includes("company expiration date is not set") ||
            lower.includes("date is not set");
          if (shouldShowModal) {
            const modalMessage =
              reason === "expired"
                ? "This company since login has expired. Please contact the Customer Service."
                : reason === "no_set"
                  ? "Please contact the Customer Service to set the expiration date."
                  : lower.includes("not set")
                    ? "Please contact the Customer Service to set the expiration date."
                    : "This company since login has expired. Please contact the Customer Service.";
            setCompanyAccessModal({ open: true, message: modalMessage });
            setLoadError(modalMessage);
          } else {
            setLoadError(j.message || j.error || i18n.couldNotSwitchCompany);
          }
          return false;
        }
        if (gen !== companySwitchGenRef.current) return false;
        if (typeof window.updateSidebarDataCaptureVisibility === "function" && j?.data) {
          window.updateSidebarDataCaptureVisibility(j.data.has_gambling, j.data.has_bank);
        }
        if (j?.data) {
          notifyCompanySessionUpdated(j?.data ?? null);
        }
        return true;
      } catch (err) {
        if (gen !== companySwitchGenRef.current) return false;
        if (!isBenignFetchError(err)) {
          setLoadError(i18n.couldNotSwitchCompany);
        }
        return false;
      }
    },
    [i18n.couldNotSwitchCompany, selectedGroup]
  );

  const applyCurrencyCodes = useCallback((codes, cid) => {
    const effectiveCompanyId = cid ?? companyId;
    if (!codes.length) {
      const emptyCid =
        effectiveCompanyId != null ? parseInt(effectiveCompanyId, 10) : Number.NaN;
      if (Number.isFinite(emptyCid) && emptyCid > 0) {
        currenciesByCompanyRef.current.set(emptyCid, []);
      }
      setCurrencies([]);
      setCurrencyCode("");
      window.setTimeout(() => {
        void loadDashboardRef.current?.();
      }, 0);
      return;
    }
    const orderCompanyId = resolveDashboardCurrencyOrderCompanyId({
      companyId: effectiveCompanyId != null ? parseInt(effectiveCompanyId, 10) : null,
      selectedGroup,
      companies,
      me,
      companiesForPicker,
    });
    const ordered = applyDashboardCurrencyDisplayOrder(
      codes,
      orderCompanyId,
      currencyDisplayOrderByCompanyRef,
      userCurrencyDisplayOrderRef,
    );
    setCurrencies(ordered);
    const scopeKey = buildDashboardCurrencyScopeKey({
      companyId: effectiveCompanyId,
      selectedGroup,
    });
    const isGroupOnlyScope = isDashboardGroupOnlyCurrencyScope({
      companyId: effectiveCompanyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      mergedSubsetIds,
    });
    const isCompanyOnlyScope =
      effectiveCompanyId != null &&
      parseInt(effectiveCompanyId, 10) > 0 &&
      !selectedGroup &&
      !groupsAllMode &&
      !groupAllMode;
    setCurrencyCode((prev) =>
      resolveActiveCurrencyForScope({
        codes: ordered,
        scopeKey,
        isCompanyOnlyScope,
        isGroupOnlyScope,
        prev,
      })
    );
    if (cid != null && ordered.length) {
      currenciesByCompanyRef.current.set(cid, ordered);
      if (!userCurrencyDisplayOrderRef.current?.length) {
        persistDashboardCurrencyDisplayOrder(currencyDisplayOrderByCompanyRef, cid, ordered);
      }
    }
  }, [companyId, selectedGroup, groupsAllMode, groupAllMode, mergedSubsetIds, companies, me, companiesForPicker, resolveActiveCurrencyForScope]);

  /** Instant currency pills when switching group/company — uses in-memory cache from prior visits. */
  const primeCurrenciesFromCache = useCallback(
    (scope = {}) => {
      const cid = scope.companyId !== undefined ? scope.companyId : companyId;
      const group = scope.selectedGroup !== undefined ? scope.selectedGroup : selectedGroup;
      const gAll = scope.groupsAllMode !== undefined ? scope.groupsAllMode : groupsAllMode;
      const singleCid =
        cid != null && cid !== "" ? parseInt(cid, 10) : Number.NaN;
      const groupKey = group ? String(group).trim().toUpperCase() : null;
      const isCompanyOnlyScope =
        Number.isFinite(singleCid) &&
        singleCid > 0 &&
        !groupKey &&
        !gAll &&
        !(scope.groupAllMode ?? groupAllMode);
      const isGroupOnlyScope =
        Boolean(groupKey) &&
        !(Number.isFinite(singleCid) && singleCid > 0) &&
        !(scope.groupAllMode ?? groupAllMode) &&
        !gAll;
      // scope.clearOnMiss ignored: never wipe currency pills on cache miss mid-flight.

      let cached = null;
      if (Number.isFinite(singleCid) && singleCid > 0) {
        cached = currenciesByCompanyRef.current.get(singleCid) ?? null;
      }
      const gaMode = scope.groupAllMode ?? groupAllMode;
      const pickRow =
        Number.isFinite(singleCid) && singleCid > 0
          ? companies.find((c) => parseInt(c.id, 10) === singleCid)
          : null;
      const pickIsGroupEntity =
        Boolean(groupKey) && pickRow && companyRowIsGroupEntity(pickRow, groupKey);
      /** IG+CX drill-down: company pills only — never group merge / group ledger fallbacks. */
      const isSubsidiaryCurrencyScope =
        Number.isFinite(singleCid) &&
        singleCid > 0 &&
        Boolean(groupKey) &&
        !gaMode &&
        !gAll &&
        !pickIsGroupEntity;

      if (isSubsidiaryCurrencyScope) {
        if (!cached?.length) {
          // Keep previous pills while loadCurrencies is still in flight.
          return false;
        }
      } else {
        if (!cached?.length && groupKey && gaMode) {
          cached =
            currenciesByGroupRef.current.get(`${groupKey}:ALL`) ??
            readPersistedGroupAllCurrencyCodes(groupKey);
        }
        if (!cached?.length && groupKey && !isCompanyOnlyScope && !gaMode) {
          cached = currenciesByGroupRef.current.get(groupKey) ?? null;
        }
        if (!cached?.length && gaMode && companies?.length) {
          // Independent Company "All" (no group tab): merge ungrouped picker companies.
          const gaMergeList = gAll
            ? resolveGroupsAllMergeCompanyList(companies, ledgerGroupIds)
            : groupKey
              ? resolveGroupAllMergeCompanyList(companies, groupKey, groupIds)
              : resolveIndependentAllMergeCompanyList(companies, groupIds);
          const mergeRows = filterCompaniesForDashboardApiAccess(
            meRef.current,
            gaMergeList,
            companies,
            gAll ? null : groupKey
          );
          const merged = new Set();
          for (const row of mergeRows) {
            const rowCid = parseInt(row.id, 10);
            if (!Number.isFinite(rowCid) || rowCid <= 0) continue;
            const cc = currenciesByCompanyRef.current.get(rowCid);
            if (cc?.length) cc.forEach((c) => merged.add(c));
          }
          if (merged.size) cached = [...merged];
        }
        if (
          !cached?.length &&
          groupKey &&
          !isCompanyOnlyScope &&
          !isGroupOnlyScope &&
          !gaMode &&
          companies?.length
        ) {
          const merged = new Set();
          for (const row of companiesForCompanyPicker(companies, groupKey, groupIds)) {
            const rowCid = parseInt(row.id, 10);
            if (!Number.isFinite(rowCid) || rowCid <= 0) continue;
            const cc = currenciesByCompanyRef.current.get(rowCid);
            if (cc?.length) cc.forEach((c) => merged.add(c));
          }
          if (merged.size) cached = [...merged];
        }
        if (
          !cached?.length &&
          gAll &&
          !(Number.isFinite(singleCid) && singleCid > 0) &&
          (!(scope.groupAllMode ?? groupAllMode) ||
            companyLoginCanUseGroupsAllLedger(meRef.current))
        ) {
          const merged = new Set();
          for (const gid of ledgerGroupIds) {
            const g = String(gid).trim().toUpperCase();
            const gc = currenciesByGroupRef.current.get(g);
            if (gc?.length) gc.forEach((c) => merged.add(c));
          }
          if (merged.size) cached = [...merged];
        }
        if (!cached?.length && gAll) {
          cached =
            currenciesByGroupRef.current.get("GROUPS:ALL") ??
            (gaMode ? readPersistedGroupsAllCurrencyCodes() : null);
          if (cached?.length) {
            currenciesByGroupRef.current.set("GROUPS:ALL", cached);
          }
        }
      }
      if (!cached?.length) {
        // Keep previous currency pills until network load settles (avoids height churn).
        return false;
      }

      const orderCompanyId = resolveDashboardCurrencyOrderCompanyId({
        companyId: Number.isFinite(singleCid) && singleCid > 0 ? singleCid : null,
        selectedGroup: groupKey,
        companies,
        me,
        companiesForPicker,
      });
      const list = applyDashboardCurrencyDisplayOrder(
        [...cached],
        orderCompanyId,
        currencyDisplayOrderByCompanyRef,
        userCurrencyDisplayOrderRef,
      );
      setCurrencies(list);
      const scopeKey = buildDashboardCurrencyScopeKey({
        companyId: Number.isFinite(singleCid) && singleCid > 0 ? singleCid : null,
        selectedGroup: groupKey,
      });
      const nextCode = resolveActiveCurrencyForScope({
        codes: list,
        scopeKey,
        isCompanyOnlyScope,
        isGroupOnlyScope,
        prev: currencyCodeRef.current,
      });
      setCurrencyCode(nextCode);
      if (isGroupOnlyScope && nextCode) {
        notifyDashboardCurrencyFilterChanged(nextCode, scopeKey);
      }
      return true;
    },
    [
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      companies,
      groupIds,
      ledgerGroupIds,
      me,
      companiesForPicker,
      resolveActiveCurrencyForScope,
    ]
  );
  primeCurrenciesFromCacheRef.current = primeCurrenciesFromCache;

  const orderCurrencyCodes = useCallback(
    (codes, order) => orderDashboardCurrencyCodes(codes, order),
    []
  );

  const loadCurrencies = useCallback(async () => {
    const scopeKey = buildScopeCurrencyKey();
    if (!meRef.current) return;

    // Short-circuit before bumping gen — avoids aborting an in-flight load that already
    // populated pills. MYR-only scopes settle at count===1; requiring >1 re-stormed
    // user_currency_order_api on every dashboardData tick.
    if (
      currencyScopeLoadedRef.current.key === scopeKey &&
      currencyScopeLoadedRef.current.count >= 1 &&
      currenciesRef.current.length >= 1
    ) {
      return;
    }
    if (currencyLoadInFlightScopeRef.current === scopeKey) {
      return;
    }

    scopeCurrencyKeyRef.current = scopeKey;
    const gen = ++currencyLoadGenRef.current;
    currencyLoadInFlightScopeRef.current = scopeKey;
    try {
    const singleCid = companyId != null ? parseInt(companyId, 10) : null;
    const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
    const effectiveGroupKey =
      groupKey ??
      (groupsAllMode && Number.isFinite(singleCid) && singleCid > 0
        ? resolveViewGroupForCompany(
            companies.find((c) => parseInt(c.id, 10) === singleCid),
            null
          )
        : null);

    const companySubsidiaryScopeIdle =
      companyLoginRequiresSubsidiaryWithGroup(me) &&
      !groupsAllMode &&
      !groupAllMode &&
      companyId == null &&
      (!groupKey || !canUseGroupOnlyMode(me, groupKey, companies));
    if (companySubsidiaryScopeIdle) {
      setCurrencies([]);
      setCurrencyCode("");
      return;
    }
    const singleCompanyScope =
      Number.isFinite(singleCid) &&
      singleCid > 0 &&
      !groupKey &&
      !groupsAllMode &&
      !groupAllMode &&
      !(mergedSubsetIds && mergedSubsetIds.length > 1);
    const groupsAllLedgerCurrencyScope = isGroupsAllLedgerCurrencyScope({
      groupsAllMode,
      groupAllMode,
      companyId: singleCid,
      me,
    });
    const useGroupAccCurrency = Boolean(groupKey) || groupsAllMode || singleCompanyScope;
    let groupOnlyCurrencyScope = false;

    const commitCurrencyList = (codes) => {
      if (gen !== currencyLoadGenRef.current) return;
      if (scopeCurrencyKeyRef.current !== scopeKey) return;
      const list = [...new Set(codes.map((c) => String(c).toUpperCase()).filter(Boolean))];
      setCurrencies(list);
      const currencyScopeKey = buildDashboardCurrencyScopeKey({ companyId, selectedGroup });
      const isGroupOnlyScope = groupOnlyCurrencyScope;
      const isCompanyOnlyScope =
        singleCompanyScope &&
        !groupKey &&
        !groupsAllMode &&
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1);
      const nextCode = resolveActiveCurrencyForScope({
        codes: list,
        scopeKey: currencyScopeKey,
        isCompanyOnlyScope,
        isGroupOnlyScope,
        prev: currencyCodeRef.current,
      });
      setCurrencyCode(nextCode);
      if (isGroupOnlyScope && nextCode) {
        notifyDashboardCurrencyFilterChanged(nextCode, currencyScopeKey);
      }
      if (Number.isFinite(singleCid) && singleCid > 0) {
        // Persist empty [] too — distinguishes "not loaded" vs "confirmed no currencies".
        currenciesByCompanyRef.current.set(singleCid, list);
        if (list.length) {
          persistDashboardCurrencyDisplayOrder(currencyDisplayOrderByCompanyRef, singleCid, list);
        }
      } else {
        writeDashboardGroupCurrencyCaches(currenciesByGroupRef.current, {
          groupKey,
          groupsAllMode,
          groupAllMode,
          codes: list,
        });
      }
      currencyScopeLoadedRef.current = { key: scopeKey, count: list.length };
      // Empty currency settle does not always change React state — re-kick loadDashboard.
      if (list.length === 0) {
        window.setTimeout(() => {
          void loadDashboardRef.current?.();
        }, 0);
      }
    };

    const deferGroupAllCurrencyNetworkRefresh = (refreshFn) => {
      const wait = () => {
        if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;
        if (dashboardFetchInFlightScopeRef.current) {
          window.setTimeout(wait, 250);
          return;
        }
        void refreshFn();
      };
      window.setTimeout(wait, CURRENCY_REFRESH_DEFER_MS);
    };

    /** Group "All" aggregate: union group-ledger currencies from every visible group (AP + IG). */
    if (groupsAllLedgerCurrencyScope) {
      const gids = filterGroupIdsForLedgerAccess(me, groupIds, companies);
      if (!gids.length) {
        commitCurrencyList([]);
        return;
      }
      try {
        groupOnlyCurrencyScope = true;
        const orderCompanyId = resolveDashboardCurrencyOrderCompanyId({
          companyId: null,
          selectedGroup: null,
          companies,
          me,
          companiesForPicker,
        });

        const currencyResults = await Promise.all(
          gids.map(async (gid) => {
            const g = String(gid).trim().toUpperCase();
            const cached = currenciesByGroupRef.current.get(g);
            if (cached?.length) return cached;
            const rowCodes = await fetchGroupLedgerCurrencyCodes(companies, g, me);
            if (rowCodes.length) {
              currenciesByGroupRef.current.set(g, rowCodes);
            }
            return rowCodes;
          })
        );

        if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

        let codes = [...new Set(currencyResults.flat())];
        const ordJson = orderCompanyId
          ? await fetchUserCurrencyOrderHttpDeduped(
              userCurrencyOrderInflightRef.current,
              orderCompanyId
            )
          : null;

        if (ordJson) {
          codes = applyResolvedCurrencyOrder(
            codes,
            orderCompanyId,
            ordJson?.data?.order,
            currencyDisplayOrderByCompanyRef,
            userCurrencyDisplayOrderRef,
          );
        } else {
          codes = applyDashboardCurrencyDisplayOrder(
            codes,
            orderCompanyId,
            currencyDisplayOrderByCompanyRef,
            userCurrencyDisplayOrderRef,
          );
        }
        if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

        if (codes.length) {
          currenciesByGroupRef.current.set("GROUPS:ALL", codes);
        }
        commitCurrencyList(codes);
      } catch {
        /* Keep previous currency pills on transient errors. */
      }
      return;
    }

    /** Company "All": union currencies from every merged subsidiary (deduped). */
    if (groupAllMode && !(Number.isFinite(singleCid) && singleCid > 0)) {
      let mergeRows = resolveMergeCompanyList();
      if (!mergeRows.length && companiesForPicker?.length) {
        mergeRows = companiesForPicker;
      }
      if (!mergeRows.length && groupsAllMode) {
        mergeRows = resolveGroupsAllMergeCompanyList(companies, ledgerGroupIds);
      } else if (!mergeRows.length && groupKey) {
        mergeRows = resolveGroupAllMergeCompanyList(companies, groupKey, groupIds);
      } else if (!mergeRows.length) {
        mergeRows = resolveIndependentAllMergeCompanyList(companies, groupIds);
      }
      let mergeCompanyIds = mergeRows
        .map((c) => parseInt(c.id, 10))
        .filter((id) => Number.isFinite(id) && id > 0);

      if (!mergeCompanyIds.length) {
        if (!companies.length) return;
        const cachedFallback = groupsAllMode
          ? currenciesByGroupRef.current.get("GROUPS:ALL") ??
            readPersistedGroupsAllCurrencyCodes()
          : groupKey
            ? currenciesByGroupRef.current.get(`${groupKey}:ALL`) ??
              readPersistedGroupAllCurrencyCodes(groupKey)
            : null;
        if (cachedFallback?.length) {
          commitCurrencyList(cachedFallback);
          writeDashboardGroupCurrencyCaches(currenciesByGroupRef.current, {
            groupKey,
            groupsAllMode,
            groupAllMode,
            codes: cachedFallback,
          });
          return;
        }
        // Independents with no merge rows: settle empty (do not keep previous MYR pills).
        commitCurrencyList([]);
        return;
      }

      const readCachedGroupAllCurrencyCodes = () =>
        groupsAllMode
          ? currenciesByGroupRef.current.get("GROUPS:ALL") ??
            readPersistedGroupsAllCurrencyCodes()
          : groupKey
            ? currenciesByGroupRef.current.get(`${groupKey}:ALL`) ??
              readPersistedGroupAllCurrencyCodes(groupKey)
            : null;

      const loadGroupAllCurrenciesFromNetwork = async () => {
        if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) {
          return;
        }
        try {
          const orderCompanyId = resolveDashboardCurrencyOrderCompanyId({
            companyId: null,
            selectedGroup: groupKey,
            companies,
            me,
            companiesForPicker,
          });

          const [rawCodes, ordJson] = await Promise.all([
            fetchGroupAllMergeCurrencyCodes(companies, mergeCompanyIds, {
              groupsAllMode,
              selectedGroup,
              groupIds: groupsAllMode ? ledgerGroupIds : groupIds,
              cacheRef: currenciesByCompanyRef.current,
            }),
            orderCompanyId
              ? fetchUserCurrencyOrderHttpDeduped(
                  userCurrencyOrderInflightRef.current,
                  orderCompanyId
                )
              : Promise.resolve(null),
          ]);

          if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

          let codes = [...new Set(rawCodes)];
          // Group tabs may fill from ledger caches; independents:all must not resurrect
          // group / session currency leftovers (phantom MYR).
          if (!codes.length && (groupsAllMode || groupKey)) {
            const cachedUnion = new Set();
            const persistedAll = readPersistedGroupsAllCurrencyCodes();
            if (persistedAll?.length) persistedAll.forEach((c) => cachedUnion.add(c));
            for (const gid of ledgerGroupIds) {
              const g = String(gid).trim().toUpperCase();
              const gc = currenciesByGroupRef.current.get(g);
              if (gc?.length) gc.forEach((c) => cachedUnion.add(c));
            }
            const groupsAllCached = currenciesByGroupRef.current.get("GROUPS:ALL");
            if (groupsAllCached?.length) groupsAllCached.forEach((c) => cachedUnion.add(c));
            codes = [...cachedUnion];
          }
          if (ordJson) {
            codes = applyResolvedCurrencyOrder(
              codes,
              orderCompanyId,
              ordJson?.data?.order,
              currencyDisplayOrderByCompanyRef,
              userCurrencyDisplayOrderRef,
            );
          } else {
            codes = applyDashboardCurrencyDisplayOrder(
              codes,
              orderCompanyId,
              currencyDisplayOrderByCompanyRef,
              userCurrencyDisplayOrderRef,
            );
          }
          if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

          if (!userCurrencyDisplayOrderRef.current?.length) {
            persistDashboardCurrencyDisplayOrder(currencyDisplayOrderByCompanyRef, orderCompanyId, codes);
          }
          writeDashboardGroupCurrencyCaches(currenciesByGroupRef.current, {
            groupKey,
            groupsAllMode,
            groupAllMode,
            codes,
          });

          // Always settle (incl. []) so independents:all does not keep a phantom MYR pill
          // from Currency Setting after single-company scope had empty account currencies.
          commitCurrencyList(codes);
          if (codes.length > 1) {
            // On a cold load, loadDashboard() may already have run and computed
            // needsMultiCurrencyEarnings=false because this currency list wasn't
            // ready yet — that skips the Currency card's fetch entirely for that
            // pass, with no other trigger left to start it. Re-check now that the
            // list is in. Deferred so `currencies` state has actually re-rendered
            // before upgradeActiveScopeEarnings reads it.
            deferActiveScopeEarningsUpgrade(200);
          }
        } catch {
          /* Keep previous currency pills on transient errors. */
        }
      };

      const cachedGroupAllCodes = readCachedGroupAllCurrencyCodes();
      if (cachedGroupAllCodes?.length > 1) {
        commitCurrencyList(cachedGroupAllCodes);
        deferGroupAllCurrencyNetworkRefresh(loadGroupAllCurrenciesFromNetwork);
      } else {
        await loadGroupAllCurrenciesFromNetwork();
      }
      return;
    }

    let companyIds = [];
    let groupLedgerOnly = false;
    if (groupsAllMode) {
      if (singleCid) {
        companyIds = [singleCid];
      } else if (groupAllMode) {
        companyIds = filterCompaniesForDashboardApiAccess(
          me,
          resolveGroupsAllMergeCompanyList(companies, ledgerGroupIds),
          companies,
          null
        )
          .map((c) => parseInt(c.id, 10))
          .filter((id) => Number.isFinite(id));
      }
    } else if (mergedSubsetIds && mergedSubsetIds.length > 1) {
      companyIds = mergedSubsetIds.filter((id) => Number.isFinite(id));
    } else if (singleCid) {
      companyIds = [singleCid];
    } else if (groupKey && !singleCid) {
      if (!canUseGroupOnlyMode(me, groupKey, companies)) {
        const preferredId =
          me?.company_id != null ? parseInt(me.company_id, 10) : Number.NaN;
        const pick = pickDefaultSubsidiaryForGroup(companies, groupKey, {
          me,
          preferredCompanyId: Number.isFinite(preferredId) ? preferredId : null,
        });
        const pickId = pick?.id != null ? parseInt(pick.id, 10) : Number.NaN;
        if (Number.isFinite(pickId) && pickId > 0) {
          const cached = currenciesByCompanyRef.current.get(pickId);
          if (cached?.length) {
            applyCurrencyCodes(cached, pickId);
            return;
          }
          const subQ = buildSubsidiaryCompanyCurrencyQuery(pickId, groupKey);
          if (subQ) {
            try {
              const packed = await fetchCurrencyListHttpDeduped(
                currencyListInflightRef.current,
                "api/transactions/get_scope_account_currencies_api.php",
                subQ
              );
              const curRes = packed?.res;
              const curJson = packed?.json;
              if (
                gen === currencyLoadGenRef.current &&
                scopeCurrencyKeyRef.current === scopeKey &&
                curRes?.ok &&
                curJson?.success &&
                Array.isArray(curJson.data)
              ) {
                const rowCodes = curJson.data
                  .map((r) => String(r.code).toUpperCase())
                  .filter(Boolean);
                if (rowCodes.length) {
                  applyCurrencyCodes(rowCodes, pickId);
                  return;
                }
              }
            } catch {
              /* fall through — keep previous pills */
            }
          }
        }
        return;
      }
      groupOnlyCurrencyScope = true;
      const anchor = pickGroupAnchorCompany(companies, groupKey);
      const anchorId = anchor?.id != null ? parseInt(anchor.id, 10) : null;
      if (anchorId) {
        companyIds = [anchorId];
      } else {
        groupLedgerOnly = true;
      }
    }

    const groupPlusCompanyCurrency =
      Boolean(effectiveGroupKey) && singleCid != null && !groupOnlyCurrencyScope && !subsidiaryDashboardScope;

    if (!companyIds.length && !groupLedgerOnly && !groupOnlyCurrencyScope) {
      commitCurrencyList([]);
      return;
    }

    try {
      let codes = [];
      if (useGroupAccCurrency) {
        const q = new URLSearchParams();
        if (subsidiaryDashboardScope && singleCid) {
          q.set("company_id", String(singleCid));
          appendDashboardSubsidiaryScopeParams(q, effectiveGroupKey);
        } else if (groupLedgerOnly && groupKey && canUseGroupOnlyMode(me, groupKey, companies)) {
          q.set("group_id", groupKey);
          q.set("view_group", groupKey);
        } else if (groupLedgerOnly && groupKey) {
          return;
        } else {
          if (singleCid) q.set("company_id", String(singleCid));
          else if (companyIds.length && !groupOnlyCurrencyScope) {
            q.set("company_ids", companyIds.join(","));
          }
          if (groupKey) {
            q.set("view_group", groupKey);
            q.set("group_id", groupKey);
          }
          if (groupOnlyCurrencyScope && canUseGroupOnlyMode(me, groupKey, companies)) {
            q.set("group_aggregate", "1");
          }
          if (groupPlusCompanyCurrency) q.set("subsidiary_accounts_only", "1");
        }
        const orderCompanyId = resolveDashboardCurrencyOrderCompanyId({
          companyId: singleCid,
          selectedGroup: groupKey,
          companies,
          me,
          companiesForPicker,
        });

        const [curPacked, ordJson] = await Promise.all([
          fetchCurrencyListHttpDeduped(
            currencyListInflightRef.current,
            "api/transactions/get_scope_account_currencies_api.php",
            q.toString()
          ),
          orderCompanyId
            ? fetchUserCurrencyOrderHttpDeduped(
                userCurrencyOrderInflightRef.current,
                orderCompanyId
              )
            : Promise.resolve(null),
        ]);
        const curRes = curPacked?.res;
        const curJson = curPacked?.json;
        if (curRes?.ok && curJson?.success && Array.isArray(curJson.data)) {
          codes = curJson.data.map((r) => String(r.code).toUpperCase());
        }
        if (subsidiaryDashboardScope && singleCid) {
          const row = companies.find((c) => parseInt(c.id, 10) === singleCid);
          const settingCodes = await fetchCompanyCurrencySettingCodes(
            singleCid,
            row,
            effectiveGroupKey,
            groupIds
          );
          if (settingCodes.length) {
            codes = [...new Set([...codes, ...settingCodes])];
          }
        }
        if (!codes.length && singleCid) {
          const cached = currenciesByCompanyRef.current.get(singleCid);
          if (cached?.length) codes = [...cached];
        } else if (!codes.length && groupKey && !subsidiaryDashboardScope) {
          const cached =
            (groupAllMode
              ? currenciesByGroupRef.current.get(`${groupKey}:ALL`)
              : null) ??
            currenciesByGroupRef.current.get(groupKey);
          if (cached?.length) codes = [...cached];
        }
        if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

        if (ordJson) {
          codes = applyResolvedCurrencyOrder(
            codes,
            orderCompanyId,
            ordJson?.data?.order,
            currencyDisplayOrderByCompanyRef,
            userCurrencyDisplayOrderRef,
          );
        } else {
          codes = applyDashboardCurrencyDisplayOrder(
            codes,
            orderCompanyId,
            currencyDisplayOrderByCompanyRef,
            userCurrencyDisplayOrderRef,
          );
        }
        if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;
        commitCurrencyList(codes);
        return;
      }

      const orderCompanyId = resolveDashboardCurrencyOrderCompanyId({
        companyId: singleCid,
        selectedGroup: groupKey,
        companies,
        me,
        companiesForPicker,
      });
      const ordJson = orderCompanyId
        ? await fetchUserCurrencyOrderHttpDeduped(
            userCurrencyOrderInflightRef.current,
            orderCompanyId
          )
        : null;

      if (!useGroupAccCurrency) {
        const currencyResults = await Promise.all(
          companyIds.map(async (cid) => {
            const row = companies.find((c) => parseInt(c.id, 10) === cid);
            const vg = groupsAllMode
              ? resolveViewGroupForCompany(row, selectedGroup)
              : groupKey;
            const q = new URLSearchParams({ company_id: String(cid) });
            if (vg) q.set("view_group", vg);
            const packed = await fetchCurrencyListHttpDeduped(
              currencyListInflightRef.current,
              "api/transactions/get_company_currencies_api.php",
              q.toString()
            );
            const curRes = packed?.res;
            const curJson = packed?.json;
            if (!curRes?.ok || !curJson?.success || !Array.isArray(curJson.data)) return [];
            return curJson.data.map((r) => String(r.code).toUpperCase());
          })
        );
        codes = [...new Set(currencyResults.flat())];
      }
      if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

      codes = [...new Set(codes)];
      if (ordJson) {
        codes = applyResolvedCurrencyOrder(
          codes,
          orderCompanyId,
          ordJson?.data?.order,
          currencyDisplayOrderByCompanyRef,
          userCurrencyDisplayOrderRef,
        );
      } else {
        codes = applyDashboardCurrencyDisplayOrder(
          codes,
          orderCompanyId,
          currencyDisplayOrderByCompanyRef,
          userCurrencyDisplayOrderRef,
        );
      }
      if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

      if (!codes.length) {
        if (singleCid) {
          const fallback = currenciesByCompanyRef.current.get(singleCid);
          if (fallback?.length) applyCurrencyCodes(fallback, singleCid);
        } else if (groupKey) {
          const fallback =
            (groupAllMode
              ? currenciesByGroupRef.current.get(`${groupKey}:ALL`)
              : null) ??
            currenciesByGroupRef.current.get(groupKey);
          if (fallback?.length) applyCurrencyCodes(fallback, null);
        }
        return;
      }

      if (singleCid) {
        applyCurrencyCodes(codes, singleCid);
      } else if (groupKey) {
        applyCurrencyCodes(codes, null);
        writeDashboardGroupCurrencyCaches(currenciesByGroupRef.current, {
          groupKey,
          groupsAllMode,
          groupAllMode,
          codes,
        });
      } else if (groupsAllMode) {
        applyCurrencyCodes(codes, null);
        currenciesByGroupRef.current.set("GROUPS:ALL", codes);
      }
    } catch {
      /* Keep previous currency pills on transient errors. */
    }
    } finally {
      if (
        gen === currencyLoadGenRef.current &&
        currencyLoadInFlightScopeRef.current === scopeKey
      ) {
        currencyLoadInFlightScopeRef.current = "";
      }
    }
  }, [
    companyId,
    subsidiaryDashboardScope,
    usesGroupLedgerDashboard,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    groupIds,
    ledgerGroupIds,
    companies,
    mergedSubsetIds,
    buildScopeCurrencyKey,
    applyCurrencyCodes,
    primeCurrenciesFromCache,
    orderCurrencyCodes,
    resolveMergeCompanyList,
    me,
    companiesForPicker,
    // deferActiveScopeEarningsUpgrade intentionally omitted: it's declared further
    // down in this hook, so listing it here throws a TDZ error at render time
    // ("Cannot access before initialization"). It's still called inside the async
    // body below (safe — that only runs after the whole hook has finished
    // executing for this render) and its own identity is stable (useCallback([])),
    // so omitting it from this array doesn't cause a stale-closure bug either.
  ]);

  loadCurrenciesRef.current = loadCurrencies;

  const scheduleLoadCurrencies = useCallback(
    (immediate = false) => {
      if (loadCurrenciesCoalesceTimerRef.current) {
        window.clearTimeout(loadCurrenciesCoalesceTimerRef.current);
        loadCurrenciesCoalesceTimerRef.current = null;
      }
      if (immediate) {
        void loadCurrencies();
        return;
      }
      loadCurrenciesCoalesceTimerRef.current = window.setTimeout(() => {
        loadCurrenciesCoalesceTimerRef.current = null;
        void loadCurrencies();
      }, LOAD_CURRENCIES_COALESCE_MS);
    },
    [loadCurrencies]
  );
  const scheduleLoadCurrenciesRef = useRef(scheduleLoadCurrencies);
  scheduleLoadCurrenciesRef.current = scheduleLoadCurrencies;

  useLayoutEffect(() => {
    if (!sessionReady || !meRef.current || !gcBootstrapReady || !companies.length) return;
    scheduleLoadCurrenciesRef.current();
  }, [
    buildScopeCurrencyKey,
    groupIds.length,
    companiesSig,
    sessionReady,
    gcBootstrapReady,
    groupsAllMode,
    groupAllMode,
    companyId,
    me?.user_id,
    me?.id,
  ]);

  useEffect(() => {
    if (!gcBootstrapReady || !sessionReady || !meRef.current) return;
    if (!groupsAllMode || !groupAllMode || companyId != null) return;
    primeCurrenciesFromCache({
      companyId: null,
      selectedGroup: null,
      groupsAllMode: true,
      groupAllMode: true,
    });
    scheduleLoadCurrenciesRef.current();
  }, [
    gcBootstrapReady,
    sessionReady,
    groupsAllMode,
    groupAllMode,
    companyId,
    primeCurrenciesFromCache,
  ]);

  /** Dashboard KPI can load before currency pills settle — retry after merge data is ready. */
  useEffect(() => {
    if (!gcBootstrapReady || !sessionReady || !meRef.current) return;
    if (companyId != null) {
      if (!subsidiaryDashboardScope || currencyCode || currencies.length < 1) return;
      const scopeKey = buildDashboardCurrencyScopeKey({ companyId, selectedGroup });
      const nextCode = resolveActiveCurrencyForScope({
        codes: currencies,
        scopeKey,
        isCompanyOnlyScope: false,
        isGroupOnlyScope: false,
        prev: currencyCodeRef.current,
      });
      if (nextCode && nextCode !== currencyCodeRef.current) {
        setCurrencyCode(nextCode);
      }
      return;
    }
    if (usesGroupLedgerDashboard) {
      if (currencyCode || currencies.length < 1) return;
      const scopeKey = buildDashboardCurrencyScopeKey({ companyId: null, selectedGroup });
      const nextCode = resolveActiveCurrencyForScope({
        codes: currencies,
        scopeKey,
        isCompanyOnlyScope: false,
        isGroupOnlyScope: true,
        prev: currencyCodeRef.current,
      });
      if (nextCode && nextCode !== currencyCodeRef.current) {
        setCurrencyCode(nextCode);
      }
      return;
    }
    if (!groupAllMode && !(groupsAllMode && !groupAllMode)) return;
    // Settled with ≥1 currency (incl. MYR-only) — do not retry on dashboardData churn.
    if (currencies.length >= 1) return;
    const scopeKey = buildScopeCurrencyKey();
    if (
      currencyScopeLoadedRef.current.key === scopeKey &&
      currencyScopeLoadedRef.current.count >= 1
    ) {
      return;
    }
    if (currencyLoadInFlightScopeRef.current === scopeKey) return;
    primeCurrenciesFromCache({
      companyId: null,
      selectedGroup: groupsAllMode ? null : selectedGroup,
      groupsAllMode,
      groupAllMode,
    });
    // Coalesced — never immediate; dashboardData ticks must not storm order API.
    scheduleLoadCurrenciesRef.current?.();
  }, [
    gcBootstrapReady,
    sessionReady,
    dashboardData,
    groupAllMode,
    groupsAllMode,
    companyId,
    selectedGroup,
    companiesSig,
    currencies.length,
    currencies,
    currencyCode,
    subsidiaryDashboardScope,
    usesGroupLedgerDashboard,
    me?.user_id,
    primeCurrenciesFromCache,
    resolveActiveCurrencyForScope,
    buildScopeCurrencyKey,
  ]);

  useEffect(() => {
    currencyPrefetchFailedRef.current.clear();
    currencyPrefetchDeniedCompanyRef.current.clear();
    currencyPrefetchDeniedGroupRef.current.clear();
    dashboardPrefetchFailedRef.current.clear();
  }, [companiesSig]);

  const shouldPrefetchCompanyScope = useCallback(
    (cid, viewGroup) => {
      const id = parseInt(cid, 10);
      if (!Number.isFinite(id) || id <= 0) return false;
      if (currencyPrefetchDeniedCompanyRef.current.has(id)) return false;
      return canPrefetchCompanyScope(meRef.current, id, companies, viewGroup);
    },
    [companies]
  );

  const fetchScopeCurrenciesDeduped = useCallback(async (queryString) => {
    if (!queryString) return null;
    if (currencyPrefetchFailedRef.current.has(queryString)) return null;
    const params = new URLSearchParams(queryString);
    const deniedId = Number(params.get("company_id"));
    const isSubsidiaryQuery = params.get("subsidiary_accounts_only") === "1";
    const groupLedgerQuery = scopeCurrencyQueryUsesGroupLedger(queryString);
    const viewGroup = String(params.get("view_group") || params.get("group_id") || "")
      .trim()
      .toUpperCase();
    if (
      groupLedgerQuery &&
      viewGroup &&
      currencyPrefetchDeniedGroupRef.current.has(viewGroup)
    ) {
      return null;
    }
    if (
      isSubsidiaryQuery &&
      Number.isFinite(deniedId) &&
      deniedId > 0 &&
      currencyPrefetchDeniedCompanyRef.current.has(deniedId)
    ) {
      return null;
    }
    return fetchBootstrapDeduped(currencyPrefetchInflightRef.current, queryString, async () => {
      const res = await fetch(
        buildApiUrl(`api/transactions/get_scope_account_currencies_api.php?${queryString}`),
        { credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok || !json.success || !Array.isArray(json.data)) {
        const msg = String(json?.message || json?.error || "");
        const denied = !res.ok || msg.includes("无权访问");
        if (denied) {
          currencyPrefetchFailedRef.current.add(queryString);
          if (groupLedgerQuery && viewGroup) {
            currencyPrefetchDeniedGroupRef.current.add(viewGroup);
          } else if (isSubsidiaryQuery && Number.isFinite(deniedId) && deniedId > 0) {
            currencyPrefetchDeniedCompanyRef.current.add(deniedId);
          }
        }
        return null;
      }
      return json.data.map((r) => String(r.code).toUpperCase()).filter(Boolean);
    });
  }, []);

  const buildCompanyCurrencyQuery = useCallback(
    (cid, viewGroup) => {
      const id = parseInt(cid, 10);
      if (!Number.isFinite(id) || id <= 0) return null;
      if (!shouldPrefetchCompanyScope(id, viewGroup)) return null;
      const row = companies.find((c) => parseInt(c.id, 10) === id);
      if (!row || isVirtualGroupLinkCompanyRow(row)) return null;
      const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
      if (vg && companyRowIsGroupEntity(row, vg)) return null;
      const q = new URLSearchParams({ company_id: String(id) });
      if (vg) {
        q.set("view_group", vg);
        q.set("group_id", vg);
        q.set("subsidiary_accounts_only", "1");
      } else if (row && !companyRowIsIndependent(row, groupIds)) {
        return null;
      }
      return q.toString();
    },
    [companies, groupIds, shouldPrefetchCompanyScope]
  );

  /** Warm currencies for the active group/company first (fast path for first paint). */
  useEffect(() => {
    if (!gcBootstrapReady || !companies.length) return undefined;
    let cancelled = false;

    const warmActive = async () => {
      const activeGroup = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
      const activeId = companyId != null ? parseInt(companyId, 10) : Number.NaN;

      if (
        isGroupsAllLedgerCurrencyScope({
          groupsAllMode,
          groupAllMode,
          companyId,
          me,
        })
      ) {
        // Ledger groups only (AP yes / IG no) — never warm IG under Group All.
        for (const gid of ledgerGroupIds) {
          if (cancelled) return;
          const g = String(gid).trim().toUpperCase();
          if (!g || currenciesByGroupRef.current.has(g)) continue;
          if (!mayWarmGroupLedgerCurrencies(me, g, companies)) continue;
          const q = buildGroupOnlyScopeCurrencyQuery(companies, g);
          if (!q.get("company_id") && !q.get("group_id") && !q.get("view_group")) continue;
          const codes = await fetchScopeCurrenciesDeduped(q.toString());
          if (!cancelled && codes?.length) {
            const orderCompanyId = resolveDashboardCurrencyOrderCompanyId({
              companyId: null,
              selectedGroup: g,
              companies,
              me,
              companiesForPicker: null,
            });
            const ordered = applyDashboardCurrencyDisplayOrder(
              codes,
              orderCompanyId,
              currencyDisplayOrderByCompanyRef,
              userCurrencyDisplayOrderRef,
            );
            currenciesByGroupRef.current.set(g, ordered);
          }
        }
        if (!cancelled) {
          primeCurrenciesFromCache({
            companyId: null,
            selectedGroup: null,
            groupsAllMode: true,
            groupAllMode: companyLoginCanUseGroupsAllLedger(me) ? false : groupAllMode,
          });
        }
        return;
      }

      if (
        groupsAllMode &&
        groupAllMode &&
        !(Number.isFinite(activeId) && activeId > 0)
      ) {
        const mergeRows = filterCompaniesForDashboardApiAccess(
          me,
          resolveGroupsAllMergeCompanyList(companies, ledgerGroupIds),
          companies,
          null
        );
        const mergeIds = mergeRows
          .map((c) => parseInt(c.id, 10))
          .filter((id) => Number.isFinite(id) && id > 0);
        if (mergeIds.length) {
          const codes = await fetchGroupAllMergeCurrencyCodes(companies, mergeIds, {
            groupsAllMode: true,
            selectedGroup: null,
            groupIds: ledgerGroupIds,
            cacheRef: currenciesByCompanyRef.current,
          });
          if (!cancelled && codes.length) {
            writeDashboardGroupCurrencyCaches(currenciesByGroupRef.current, {
              groupKey: null,
              groupsAllMode: true,
              groupAllMode: true,
              codes,
            });
            primeCurrenciesFromCache({
              companyId: null,
              selectedGroup: null,
              groupsAllMode: true,
              groupAllMode: true,
            });
            scheduleLoadCurrenciesRef.current?.();
          }
        }
        return;
      }

      const mayWarmGroupLedger =
        activeGroup &&
        !currenciesByGroupRef.current.has(activeGroup) &&
        mayWarmGroupLedgerCurrencies(me, activeGroup, companies) &&
        !(Number.isFinite(activeId) && activeId > 0);
      if (mayWarmGroupLedger) {
        const q = buildGroupOnlyScopeCurrencyQuery(companies, activeGroup);
        if (q.get("company_id") || q.get("group_id") || q.get("view_group")) {
          const codes = await fetchScopeCurrenciesDeduped(q.toString());
          if (!cancelled && codes?.length) {
            const orderCompanyId = resolveDashboardCurrencyOrderCompanyId({
              companyId: null,
              selectedGroup: activeGroup,
              companies,
              me,
              companiesForPicker: null,
            });
            const ordered = applyDashboardCurrencyDisplayOrder(
              codes,
              orderCompanyId,
              currencyDisplayOrderByCompanyRef,
              userCurrencyDisplayOrderRef,
            );
            currenciesByGroupRef.current.set(activeGroup, ordered);
            if (!groupsAllMode) {
              primeCurrenciesFromCache({ companyId: null, selectedGroup: activeGroup, groupsAllMode: false });
            }
          }
        }
      }

      if (Number.isFinite(activeId) && activeId > 0 && !currenciesByCompanyRef.current.has(activeId)) {
        const row = companies.find((c) => parseInt(c.id, 10) === activeId);
        const vg = groupsAllMode ? null : activeGroup;
        if (row && shouldPrefetchCompanyScope(activeId, vg)) {
          // Independent company: warm from accounts only (match single-company loadCurrencies).
          const codes =
            vg || groupsAllMode
              ? await fetchCompanyCurrencySettingCodes(activeId, row, vg, groupIds)
              : await fetchCompanyAccountCurrencyCodes(activeId);
          if (!cancelled && codes?.length) {
            const savedOrder = resolvePreferredCurrencyDisplayOrder(activeId, {
              displayOrderByCompanyRef: currencyDisplayOrderByCompanyRef,
              sessionOrderRef: userCurrencyDisplayOrderRef,
            }) ?? resolveSavedCurrencyOrder(activeId, null);
            const ordered = mergeCurrencyCodesWithSavedOrder(codes, savedOrder);
            currenciesByCompanyRef.current.set(activeId, ordered);
          }
        }
      }

      // Same-group siblings: hydrate currency lists so 95→AG prefetch can pack full pie in one `full`.
      if (!cancelled && !groupsAllMode && activeGroup && Number.isFinite(activeId) && activeId > 0) {
        for (const row of companiesForCompanyPicker(companies, activeGroup, groupIds)) {
          if (cancelled) return;
          if (isVirtualGroupLinkCompanyRow(row)) continue;
          if (companyRowIsGroupEntity(row, activeGroup)) continue;
          const rid = parseInt(row.id, 10);
          if (!Number.isFinite(rid) || rid <= 0 || rid === activeId) continue;
          if (currenciesByCompanyRef.current.has(rid)) continue;
          if (!shouldPrefetchCompanyScope(rid, activeGroup)) continue;
          const codes = await fetchCompanyCurrencySettingCodes(rid, row, activeGroup, groupIds);
          if (!cancelled && codes?.length) {
            const savedOrder = resolvePreferredCurrencyDisplayOrder(rid, {
              displayOrderByCompanyRef: currencyDisplayOrderByCompanyRef,
              sessionOrderRef: userCurrencyDisplayOrderRef,
            }) ?? resolveSavedCurrencyOrder(rid, null);
            const ordered = mergeCurrencyCodesWithSavedOrder(codes, savedOrder);
            currenciesByCompanyRef.current.set(rid, ordered);
          }
        }
      }
    };

    void warmActive();
    return () => {
      cancelled = true;
    };
  }, [
    gcBootstrapReady,
    companiesSig,
    companyId,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    groupIds,
    ledgerGroupIds,
    companies,
    me,
    fetchScopeCurrenciesDeduped,
    buildCompanyCurrencyQuery,
    primeCurrenciesFromCache,
  ]);

  /** Background: warm other groups/companies after active scope settles. */
  useEffect(() => {
    const independentRows = independentCompaniesForPicker(companies, groupIds);
    if (!gcBootstrapReady || !companies.length || (!groupIds.length && !independentRows.length)) {
      return undefined;
    }
    let cancelled = false;
    const activeGroup = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
    const activeId = companyId != null ? parseInt(companyId, 10) : Number.NaN;

    const prefetchGroupOnlyCurrencies = async (gid) => {
      const g = String(gid).trim().toUpperCase();
      if (!g || g === activeGroup || currenciesByGroupRef.current.has(g)) return;
      if (!mayWarmGroupLedgerCurrencies(meRef.current, g, companies)) return;
      const q = buildGroupOnlyScopeCurrencyQuery(companies, g);
      if (!q.get("company_id") && !q.get("group_id") && !q.get("view_group")) return;
      const codes = await fetchScopeCurrenciesDeduped(q.toString());
      if (!cancelled && codes?.length) {
        const orderCompanyId = resolveDashboardCurrencyOrderCompanyId({
          companyId: null,
          selectedGroup: g,
          companies,
          me,
          companiesForPicker: null,
        });
        const ordered = applyDashboardCurrencyDisplayOrder(
          codes,
          orderCompanyId,
          currencyDisplayOrderByCompanyRef,
          userCurrencyDisplayOrderRef,
        );
        currenciesByGroupRef.current.set(g, ordered);
      }
    };

    const prefetchCompanyCurrencies = async (cid, viewGroup) => {
      const id = parseInt(cid, 10);
      if (!Number.isFinite(id) || id <= 0 || id === activeId || currenciesByCompanyRef.current.has(id)) {
        return;
      }
      if (!shouldPrefetchCompanyScope(id, viewGroup)) return;
      const row = companies.find((c) => parseInt(c.id, 10) === id);
      if (!row || isVirtualGroupLinkCompanyRow(row)) return;
      const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
      if (vg && companyRowIsGroupEntity(row, vg)) return;
      // Independent companies: account-linked codes only (same as dashboard single-company scope).
      const codes = vg
        ? await fetchCompanyCurrencySettingCodes(id, row, vg || null, groupIds)
        : await fetchCompanyAccountCurrencyCodes(id);
      if (!cancelled && codes?.length) {
        const savedOrder = resolvePreferredCurrencyDisplayOrder(id, {
          displayOrderByCompanyRef: currencyDisplayOrderByCompanyRef,
          sessionOrderRef: userCurrencyDisplayOrderRef,
        }) ?? resolveSavedCurrencyOrder(id, null);
        const ordered = mergeCurrencyCodesWithSavedOrder(codes, savedOrder);
        currenciesByCompanyRef.current.set(id, ordered);
      }
    };

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      // Group All: only ledger groups (avoid IG get_company_currencies fan-out).
      // Single-group: active pill siblings + other ledger-accessible groups.
      const warmGroupIds = groupsAllMode
        ? ledgerGroupIds
        : groupIds.filter((gid) => {
            const g = String(gid).trim().toUpperCase();
            if (!g) return false;
            if (g === activeGroup) return true;
            return mayWarmGroupLedgerCurrencies(meRef.current, gid, companies);
          });
      const tasks = [];
      for (const gid of warmGroupIds) {
        const g = String(gid).trim().toUpperCase();
        if (!g) continue;
        // Other groups: also warm group-ledger currency union.
        if (g !== activeGroup && mayWarmGroupLedgerCurrencies(meRef.current, g, companies)) {
          tasks.push(() => prefetchGroupOnlyCurrencies(gid));
        }
        // Include active group — sibling company currency lists enable atomic-ready dashboard warm.
        // Under Group All, only ledger-group subsidiaries (not IG when AP-only ledger).
        for (const row of companiesForCompanyPicker(companies, gid, groupIds)) {
          if (!isSubsidiaryCompanyRow(row, groupIds)) continue;
          if (row?.id) tasks.push(() => prefetchCompanyCurrencies(row.id, gid));
        }
      }
      // Independent companies: skip while Group All (ledger aggregate scope).
      if (!groupsAllMode) {
        for (const row of independentRows) {
          const rid = parseInt(row?.id, 10);
          if (!Number.isFinite(rid) || rid <= 0 || rid === activeId) continue;
          tasks.push(() => prefetchCompanyCurrencies(row.id, null));
        }
      }
      let idx = 0;
      const drain = () => {
        if (cancelled) return;
        const batch = tasks.slice(idx, idx + 2);
        idx += batch.length;
        if (!batch.length) return;
        void Promise.allSettled(batch.map((fn) => fn())).then(() => {
          if (idx < tasks.length && !cancelled) window.setTimeout(drain, 120);
        });
      };
      drain();
    }, 3500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    gcBootstrapReady,
    companiesSig,
    groupIds,
    ledgerGroupIds,
    groupsAllMode,
    companyId,
    selectedGroup,
    companies,
    fetchScopeCurrenciesDeduped,
    buildCompanyCurrencyQuery,
  ]);

  useEffect(() => {
    if (!canShowAllCurrencies && showAllCurrencies) {
      setShowAllCurrencies(false);
      setMultiCurrencyKpi(null);
      setMultiCurrencyKpiPrev(null);
    }
  }, [canShowAllCurrencies, showAllCurrencies]);

  useEffect(() => {
    currencyCodeRef.current = currencyCode;
  }, [currencyCode]);

  useEffect(() => {
    dashboardDataRef.current = dashboardData;
  }, [dashboardData]);

  useEffect(() => {
    dateFromRef.current = dateFrom;
    dateToRef.current = dateTo;
  }, [dateFrom, dateTo]);

  const fetchDashboardPayload = useCallback(
    async (
      cid,
      rangeFrom,
      rangeTo,
      currencyOverride,
      viewGroupOverride,
      useActiveScopeAbort = true,
      { earningsOnly = false, currencies = null } = {}
    ) => {
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        company_id: String(cid),
      });
      const multi = Array.isArray(currencies) && currencies.length > 1;
      if (multi) {
        // One request returns every requested currency's earnings for this company
        // (server aggregates in-process ≈200ms) — replaces N single-currency
        // round-trips (each ~0.25-2s over HTTPS) for the Group/Company All pie.
        q.append(
          "currencies",
          sortCurrencyCodesForBootstrap([...new Set(currencies)]).join(",")
        );
      } else {
        const cur = currencyOverride ?? currencyCodeRef.current;
        if (cur) q.append("currency", cur);
      }
      if (earningsOnly) {
        q.append("earnings_only", "1");
        // Multi-currency packs must not rely on kpi_only alone; single-currency
        // light packs still skip chart GROUP BY via kpi_only.
        if (!multi) q.append("kpi_only", "1");
      }
      const viewGroup =
        viewGroupOverride ??
        (selectedGroup ? String(selectedGroup).trim().toUpperCase() : null);
      const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
      const subsidiaryOnly =
        Boolean(viewGroup) &&
        (!(row && companyRowIsGroupEntity(row, viewGroup)) ||
          !canAccessGroupLedgerForGroup(meRef.current, viewGroup, companies));
      appendDashboardGroupTabParams(q, viewGroup, { subsidiaryOnly });
      const cacheKey = q.toString();
      const cachedPayload = getDashboardPayloadCache(cacheKey);
      if (cachedPayload != null) {
        return cachedPayload;
      }
      const { res, json } = await fetchDashboardApiHttpDeduped(
        dashboardApiInflightRef.current,
        cacheKey,
        dashboardFetchInit(
          useActiveScopeAbort ? dashboardFetchAbortRef.current?.signal : undefined
        )
      );
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || json.error || i18n.dashboardApiError);
      }
      let data = json.data;
      if (viewGroup) {
        const gf = String(viewGroup).toUpperCase();
        const row = companies.find((c) => {
          if (parseInt(c.id, 10) !== parseInt(cid, 10)) return false;
          const nativeG = c.group_id ? String(c.group_id).toUpperCase() : "";
          const linkG = c.link_source_group
            ? String(c.link_source_group).trim().toUpperCase()
            : "";
          return nativeG === gf || linkG === gf;
        });
        const pct = row && row.link_percentage !== undefined && row.link_percentage !== null
          ? parseFloat(row.link_percentage)
          : NaN;
        const linkMultiplier = Number.isFinite(pct) && pct >= 0 ? pct / 100 : 1;
        const useHistoricalOwnership = isDashboardHistoricalOwnershipMonth(rangeTo);
        const apiHasGroupEquity = parseFloat(json.data?.group_equity_percentage) > 0;
        if (linkMultiplier !== 1 && !useHistoricalOwnership && !apiHasGroupEquity) {
          data = { ...json.data, _link_multiplier: linkMultiplier };
        }
      }
      setDashboardPayloadCache(cacheKey, data);
      return data;
    },
    [selectedGroup, companies, i18n]
  );

  const applyDashboardPayloadAdjustments = useCallback(
    (data, cid, viewGroupOverride, rangeTo = dateToRef.current) => {
      if (!data || cid == null) return data;
      const viewGroup =
        viewGroupOverride ??
        (selectedGroup ? String(selectedGroup).trim().toUpperCase() : null);
      if (!viewGroup) return data;
      const gf = String(viewGroup).toUpperCase();
      const row = companies.find((c) => {
        if (parseInt(c.id, 10) !== parseInt(cid, 10)) return false;
        const nativeG = c.group_id ? String(c.group_id).toUpperCase() : "";
        const linkG = c.link_source_group ? String(c.link_source_group).trim().toUpperCase() : "";
        return nativeG === gf || linkG === gf;
      });
      const pct =
        row && row.link_percentage !== undefined && row.link_percentage !== null
          ? parseFloat(row.link_percentage)
          : NaN;
      const linkMultiplier = Number.isFinite(pct) && pct >= 0 ? pct / 100 : 1;
      const useHistoricalOwnership = isDashboardHistoricalOwnershipMonth(rangeTo);
      const apiHasGroupEquity = parseFloat(data?.group_equity_percentage) > 0;
      if (linkMultiplier !== 1 && !useHistoricalOwnership && !apiHasGroupEquity) {
        return { ...data, _link_multiplier: linkMultiplier };
      }
      return data;
    },
    [selectedGroup, companies]
  );

  const resolveMemberDashboardSnapshot = useCallback(
    (cid, viewGroup, cur, from, to) => {
      const memberKey = resolveDashboardScopeKey({
        companyId: cid,
        selectedGroup: viewGroup,
        groupsAllMode: false,
        groupAllMode: false,
        mergedSubsetIds: null,
        currencyCode: cur,
        dateFrom: from,
        dateTo: to,
        showAllCurrencies: false,
      });
      const cached = getDashboardCache(memberKey);
      if (cached?.current && dashboardPayloadRangeMatches(cached.current, from, to)) {
        return {
          current: applyDashboardPayloadAdjustments(cached.current, cid, viewGroup),
          previous: cached.previous
            ? applyDashboardPayloadAdjustments(cached.previous, cid, viewGroup)
            : null,
          earnings: cached.earnings ?? null,
        };
      }
      const q = new URLSearchParams({
        date_from: from,
        date_to: to,
        company_id: String(cid),
      });
      if (cur) q.append("currency", cur);
      if (viewGroup) {
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
        const subsidiaryOnly = row && !companyRowIsGroupEntity(row, viewGroup);
        appendDashboardGroupTabParams(q, viewGroup, { subsidiaryOnly });
      }
      const payload = getDashboardPayloadCache(q.toString());
      if (!payload || !dashboardPayloadRangeMatches(payload, from, to)) return null;
      return {
        current: applyDashboardPayloadAdjustments(payload, cid, viewGroup),
        previous: null,
        earnings: null,
      };
    },
    [resolveDashboardScopeKey, applyDashboardPayloadAdjustments, companies]
  );

  const tryBuildGroupAllDashboardFromCompanyCaches = useCallback(
    (overrides = {}) => {
      const gaMode = overrides.groupAllMode ?? groupAllMode;
      if (!gaMode) return null;
      const selGroup =
        overrides.selectedGroup !== undefined ? overrides.selectedGroup : selectedGroup;
      const gAll = overrides.groupsAllMode !== undefined ? overrides.groupsAllMode : groupsAllMode;
      const cur = overrides.currencyCode ?? currencyCode;
      const from = overrides.dateFrom ?? dateFrom;
      const to = overrides.dateTo ?? dateTo;
      const codes = overrides.codes ?? currenciesRef.current;

      const enabledGids =
        gAll && earningsEnabledGroupIdsRef.current.length
          ? earningsEnabledGroupIdsRef.current
          : [];
      const mergeCompanyRows = gAll
        ? enabledGids.length
          ? enabledGids.flatMap((g) =>
              resolveGroupAllMergeCompanyList(companies, g, ledgerGroupIds)
            )
          : resolveGroupsAllMergeCompanyList(companies, ledgerGroupIds)
        : selGroup
          ? resolveGroupAllMergeCompanyList(companies, selGroup, groupIds)
          : resolveIndependentAllMergeCompanyList(companies, groupIds);

      const mergeRows = filterCompaniesForDashboardApiAccess(
        meRef.current,
        mergeCompanyRows,
        companies,
        gAll ? null : selGroup
      );
      if (!mergeRows.length) return null;

      const snapshots = [];
      for (const row of mergeRows) {
        const cid = parseInt(row.id, 10);
        if (!Number.isFinite(cid) || cid <= 0) return null;
        const vg = resolveViewGroupForCompany(row, gAll ? selGroup : selGroup);
        const snap = resolveMemberDashboardSnapshot(cid, vg, cur, from, to);
        if (!snap?.current) return null;
        snapshots.push({ ...snap, company: row, viewGroup: vg });
      }

      const mergedCurrent = mergeGroupData(
        snapshots.map((s) => s.current),
        { startDate: from, endDate: to }
      );
      const byCompanyCurrent = buildCompanyNetProfitRowsFromPairs(
        snapshots.map((s) => ({ company: s.company, data: s.current, viewGroup: s.viewGroup })),
        selGroup
      );
      if (byCompanyCurrent.length) {
        mergedCurrent.subsidiary_earnings_by_company = byCompanyCurrent;
      }
      const allPrev = snapshots.every((s) => s.previous);
      const mergedPrevious = allPrev
        ? mergeGroupData(
            snapshots.map((s) => s.previous),
            { startDate: from, endDate: to }
          )
        : null;

      const earningsLists = snapshots.map((s) => s.earnings).filter((e) => Array.isArray(e) && e.length);
      const mergedEarnings =
        earningsLists.length === snapshots.length && earningsLists.length > 0
          ? mergeEarningsByCurrency(earningsLists, codes?.length > 1 ? codes : null)
          : null;

      return {
        current: mergedCurrent,
        previous: mergedPrevious,
        earnings: mergedEarnings,
      };
    },
    [
      groupAllMode,
      selectedGroup,
      groupsAllMode,
      currencyCode,
      dateFrom,
      dateTo,
      companies,
      groupIds,
      ledgerGroupIds,
      resolveMemberDashboardSnapshot,
      buildCompanyNetProfitRowsFromPairs,
    ]
  );

  const applyDashboardCacheEntryToUi = useCallback(
    (key, cached, { codes = currencies } = {}) => {
      if (!key || !cached?.current) return false;
      const multiCodes = Array.isArray(codes) && codes.length > 1 ? codes : null;
      // Never paint KPI/trend without settled chart series.
      if (dashboardPayloadNeedsChartDaily(cached.current)) return false;
      // Scope swap: wait for complete pie so KPI/chart/pie land together.
      const requirePie = dashboardRequiresPieAtomicPaint(displayScopeKeyRef.current, key);
      if (multiCodes && requirePie) {
        const readyEarnings =
          getCompleteCachedEarnings(cached, multiCodes) ||
          (cacheEntryHasFullEarnings(cached, multiCodes) ? cached.earnings : null);
        if (!readyEarnings) return false;
      }

      setDashboardData(cached.current);
      dashboardDataRef.current = cached.current;
      setDashboardDataPrev(cached.previous ?? null);
      setDisplayScopeKey(key);
      setLoading(false);
      if (cached.multiCurrencyKpi) setMultiCurrencyKpi(cached.multiCurrencyKpi);
      else setMultiCurrencyKpi(null);
      if (cached.multiCurrencyKpiPrev) setMultiCurrencyKpiPrev(cached.multiCurrencyKpiPrev);
      else setMultiCurrencyKpiPrev(null);
      if (multiCodes) {
        const readyEarnings =
          getCompleteCachedEarnings(cached, multiCodes) ||
          (cacheEntryHasFullEarnings(cached, multiCodes) ? cached.earnings : null) ||
          (Array.isArray(cached.earnings) ? cached.earnings : null);
        const sharedEarnings = resolveScopeDashboardEarnings(multiCodes, key);
        const rows = readyEarnings || sharedEarnings;
        if (rows?.length) {
          setEarningsByCurrency(rows);
          setEarningsByCurrencyPrev([]);
          setEarningsByCurrencyLoading(false);
        } else {
          setEarningsByCurrencyLoading(true);
        }
      } else {
        setEarningsByCurrency([]);
        setEarningsByCurrencyPrev([]);
        setEarningsByCurrencyLoading(false);
      }
      return true;
    },
    [
      currencies,
      resolveScopeDashboardEarnings,
      getCompleteCachedEarnings,
      cacheEntryHasFullEarnings,
    ]
  );

  const applyPrefetchCacheToActiveScope = useCallback(
    (scopeKey, cacheEntry, codes) => {
      if (scopeKey !== resolveDashboardScopeKey()) return;
      const painted = displayScopeKeyRef.current;
      // Scope swap in flight: never patch pie alone — only full atomic paint when pack is ready.
      if (painted && painted !== scopeKey) {
        applyDashboardCacheEntryToUi(scopeKey, cacheEntry, {
          codes: codes || currenciesRef.current,
        });
        return;
      }
      if (!dashboardDataRef.current) {
        applyDashboardCacheEntryToUi(scopeKey, cacheEntry, {
          codes: codes || currenciesRef.current,
        });
        return;
      }
      const codesForPie = codes || currenciesRef.current;
      if (
        cacheEntry.earnings?.length > 1 &&
        dashboardEarningsRowsComplete(cacheEntry.earnings, codesForPie)
      ) {
        setEarningsByCurrency(cacheEntry.earnings);
        setEarningsByCurrencyPrev([]);
        setEarningsByCurrencyLoading(false);
      }
    },
    [resolveDashboardScopeKey, applyDashboardCacheEntryToUi]
  );

  const resolveScopePayloadHydration = useCallback(
    (overrides = {}) => {
      const cid =
        overrides.companyId !== undefined ? overrides.companyId : companyId;
      const selGroup =
        overrides.selectedGroup !== undefined ? overrides.selectedGroup : selectedGroup;
      const cur = overrides.currencyCode ?? currencyCode;
      const from = overrides.dateFrom ?? dateFrom;
      const to = overrides.dateTo ?? dateTo;

      if (cid != null) {
        const snap = resolveMemberDashboardSnapshot(
          parseInt(cid, 10),
          selGroup ? String(selGroup).trim().toUpperCase() : null,
          cur,
          from,
          to
        );
        if (snap?.current) {
          return {
            current: snap.current,
            previous: snap.previous ?? undefined,
            earnings: snap.earnings ?? undefined,
          };
        }
      }

      const gAll = overrides.groupsAllMode ?? groupsAllMode;
      const gaMode = overrides.groupAllMode ?? groupAllMode;
      const usesLedger = (() => {
        if (gAll && !gaMode) return false;
        if (gaMode) return false;
        if (!selGroup) return false;
        if (cid == null) return canUseGroupOnlyMode(me, selGroup, companies);
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
        return companyRowIsGroupEntity(row, selGroup);
      })();
      if (cid == null && usesLedger && selGroup) {
        const vg = String(selGroup).trim().toUpperCase();
        const q = new URLSearchParams({
          date_from: from,
          date_to: to,
          view_group: vg,
          group_id: vg,
        });
        if (cur) q.append("currency", cur);
        const payload = getDashboardPayloadCache(q.toString());
        if (payload) {
          return { current: payload, previous: undefined, earnings: undefined };
        }
      }
      return null;
    },
    [
      companyId,
      selectedGroup,
      currencyCode,
      dateFrom,
      dateTo,
      groupsAllMode,
      groupAllMode,
      companies,
      resolveMemberDashboardSnapshot,
    ]
  );

  const primeDashboardFromCache = useCallback(
    (overrides = {}) => {
      const key = resolveDashboardScopeKey(overrides);
      if (!key) {
        setDisplayScopeKey("");
        setDashboardData(null);
        setDashboardDataPrev(null);
        setLoading(true);
        return false;
      }

      let cached = getDashboardCache(key);
      if (
        !cached?.current &&
        (overrides.groupAllMode ?? groupAllMode) &&
        (!displayScopeKeyRef.current || cacheKeysShareDateRange(displayScopeKeyRef.current, key))
      ) {
        const synthesized = tryBuildGroupAllDashboardFromCompanyCaches(overrides);
        if (synthesized?.current) {
          const from = overrides.dateFrom ?? dateFrom;
          const to = overrides.dateTo ?? dateTo;
          cached = {
            current: stampDashboardPayloadRange(synthesized.current, from, to),
            previous: synthesized.previous
              ? stampDashboardPayloadRange(synthesized.previous, from, to)
              : undefined,
            earnings:
              synthesized.earnings?.length > 1 &&
              synthesized.earnings.every((r) => r.earnings != null)
                ? synthesized.earnings
                : undefined,
          };
          setDashboardCache(key, cached);
        }
      }

      if (!cached?.current) {
        const hydrated = resolveScopePayloadHydration(overrides);
        if (hydrated?.current) {
          cached = hydrated;
          setDashboardCache(key, cached);
        }
      }

      if (!cached?.current) {
        const cid =
          overrides.companyId !== undefined ? overrides.companyId : companyId;
        const selGroup =
          overrides.selectedGroup !== undefined ? overrides.selectedGroup : selectedGroup;
        const cur = overrides.currencyCode ?? currencyCode;
        const from = overrides.dateFrom ?? dateFrom;
        const to = overrides.dateTo ?? dateTo;
        if (cid != null) {
          const snap = resolveMemberDashboardSnapshot(
            parseInt(cid, 10),
            selGroup ? String(selGroup).trim().toUpperCase() : null,
            cur,
            from,
            to
          );
          if (snap?.current) {
            cached = {
              current: snap.current,
              previous: snap.previous ?? undefined,
              earnings: Array.isArray(snap.earnings) ? snap.earnings : undefined,
            };
            setDashboardCache(key, cached);
          }
        }
      }

      if (!cached?.current) {
        const gaMode = overrides.groupAllMode ?? groupAllMode;
        const nextCur = overrides.currencyCode ?? currencyCode;
        const currencySwap =
          overrides.currencyCode != null &&
          String(nextCur).trim().toUpperCase() !==
            String(currencyCode || "").trim().toUpperCase();
        const targetCompanyId =
          overrides.companyId !== undefined ? overrides.companyId : companyId;
        const scopeSwap =
          targetCompanyId != null &&
          parseInt(targetCompanyId, 10) !== parseInt(companyId ?? -1, 10);
        if (
          dashboardDataRef.current &&
          ((gaMode && currencySwap) ||
            (scopeSwap && !gaMode && !(overrides.groupAllMode ?? groupAllMode)))
        ) {
          setLoading(true);
          return false;
        }
        setLoading(true);
        return false;
      }
      // Incomplete cache (KPI without chart / pie) must not paint — keep prior UI until loadDashboard finishes.
      const applied = applyDashboardCacheEntryToUi(key, cached);
      if (!applied) {
        setLoading(true);
        return false;
      }
      return true;
    },
    [
      resolveDashboardScopeKey,
      groupAllMode,
      companyId,
      selectedGroup,
      currencyCode,
      dateFrom,
      dateTo,
      tryBuildGroupAllDashboardFromCompanyCaches,
      resolveScopePayloadHydration,
      resolveMemberDashboardSnapshot,
      applyDashboardCacheEntryToUi,
    ]
  );

  const seedDashboardPayloadCache = useCallback(
    (rangeFrom, rangeTo, currencyOverride, data, viewGroupOverride) => {
      if (!data) return;
      const cur = currencyOverride ?? currencyCodeRef.current;
      if (companyId != null) {
        const q = new URLSearchParams({
          date_from: rangeFrom,
          date_to: rangeTo,
          company_id: String(companyId),
        });
        if (cur) q.append("currency", cur);
        const viewGroup =
          viewGroupOverride ??
          (selectedGroup ? String(selectedGroup).trim().toUpperCase() : null);
        appendDashboardGroupTabParams(q, viewGroup, { subsidiaryOnly: subsidiaryDashboardScope });
        setDashboardPayloadCache(q.toString(), stampDashboardPayloadRange(data, rangeFrom, rangeTo));
        return;
      }
      if (usesGroupLedgerDashboard && selectedGroup) {
        const q = new URLSearchParams({
          date_from: rangeFrom,
          date_to: rangeTo,
        });
        appendGroupLedgerDashboardParams(q, selectedGroup);
        if (cur) q.append("currency", cur);
        setDashboardPayloadCache(q.toString(), stampDashboardPayloadRange(data, rangeFrom, rangeTo));
        return;
      }
    },
    [companyId, usesGroupLedgerDashboard, selectedGroup, subsidiaryDashboardScope]
  );

  const earningsRowsFromBootstrapEntries = useCallback(
    (entries, cidOverride = null, groupOverride = undefined) => {
      const cid = cidOverride ?? companyId;
      const grp = groupOverride !== undefined ? groupOverride : selectedGroup;
      return (entries || []).map(({ code, payload }) => {
        if (!payload) {
          return { code, netProfit: 0, earnings: 0 };
        }
        const metrics = computeKpiMetrics(
          applyDashboardPayloadAdjustments(payload, cid, grp),
          grp,
          resolveKpiOwnershipOpts(cid, grp)
        );
        const netProfit = metrics?.netProfit ?? 0;
        const earnings = metrics?.earnings ?? netProfit;
        return { code, netProfit, earnings };
      });
    },
    [applyDashboardPayloadAdjustments, companyId, selectedGroup, resolveKpiOwnershipOpts]
  );

  const seedDashboardPayloadCacheForCompany = useCallback(
    (cid, viewGroup, rangeFrom, rangeTo, currencyOverride, data) => {
      if (!data || cid == null) return;
      const cur = currencyOverride ?? currencyCodeRef.current;
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        company_id: String(cid),
      });
      if (cur) q.append("currency", cur);
      const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
      if (vg) {
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
        const subsidiaryOnly = row && !companyRowIsGroupEntity(row, vg);
        appendDashboardGroupTabParams(q, vg, { subsidiaryOnly });
      }
      setDashboardPayloadCache(q.toString(), stampDashboardPayloadRange(data, rangeFrom, rangeTo));
    },
    [companies]
  );

  const seedDashboardPayloadCacheForGroup = useCallback(
    (groupId, rangeFrom, rangeTo, currencyOverride, data) => {
      if (!data) return;
      const g = String(groupId || "").trim().toUpperCase();
      if (!g) return;
      const cur = currencyOverride ?? currencyCodeRef.current;
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
      });
      appendGroupLedgerDashboardParams(q, g);
      if (cur) q.append("currency", cur);
      setDashboardPayloadCache(q.toString(), stampDashboardPayloadRange(data, rangeFrom, rangeTo));
    },
    []
  );

  const prefetchDashboardCompany = useCallback(
    async (targetRow, viewGroup) => {
      const id = parseInt(targetRow?.id, 10);
      if (!Number.isFinite(id) || id <= 0) return;
      if (!shouldPrefetchCompanyScope(id, viewGroup)) return;
      const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
      const usesLedger = Boolean(vg && companyRowIsGroupEntity(targetRow, vg));
      // Hydrate this company's currency list before `full` so pie lands in one pack (no second earnings).
      if (!usesLedger && !currenciesByCompanyRef.current.has(id)) {
        try {
          const fetched = await fetchCompanyCurrencySettingCodes(
            id,
            targetRow,
            vg || null,
            groupIds
          );
          if (fetched?.length) {
            const savedOrder =
              resolvePreferredCurrencyDisplayOrder(id, {
                displayOrderByCompanyRef: currencyDisplayOrderByCompanyRef,
                sessionOrderRef: userCurrencyDisplayOrderRef,
              }) ?? resolveSavedCurrencyOrder(id, null);
            currenciesByCompanyRef.current.set(
              id,
              mergeCurrencyCodesWithSavedOrder(fetched, savedOrder)
            );
          }
        } catch {
          /* Best-effort — prefetch still runs with whatever codes we know. */
        }
      }
      const cur = currencyCodeRef.current;
      const scopeKey = resolveDashboardScopeKey({
        companyId: id,
        selectedGroup: vg || null,
        groupsAllMode: false,
        groupAllMode: false,
        mergedSubsetIds: null,
        currencyCode: cur,
      });
      const existing = scopeKey ? getDashboardCache(scopeKey) : null;
      const isActiveScope = scopeKey === resolveDashboardScopeKey();
      if (isActiveScope) return;
      const codes = resolvePrefetchBootstrapCodes(id, vg, isActiveScope);
      const cacheReady =
        existing?.current &&
        !dashboardPayloadNeedsChartDaily(existing.current) &&
        cacheEntryHasFullEarnings(existing, codes);
      if (!scopeKey || cacheReady) {
        return;
      }

      const subScope = Boolean(vg && !usesLedger);
      const rangeFrom = dateFromRef.current;
      const rangeTo = dateToRef.current;
      const longRange = shouldAggregateChartByMonth(rangeFrom, rangeTo);

      const buildPrefetchParams = (scope) => {
        const q = new URLSearchParams({
          date_from: rangeFrom,
          date_to: rangeTo,
          bootstrap_scope: scope,
          prefetch: "1",
        });
        if (usesLedger && vg) {
          q.set("view_group", vg);
          q.set("group_id", vg);
        } else {
          q.set("company_id", String(id));
          if (subScope) appendDashboardSubsidiaryScopeParams(q, vg);
          else if (vg) {
            q.set("view_group", vg);
            q.set("group_id", vg);
          }
        }
        if (cur) q.set("currency", cur);
        // Prefetch: primary currency only (bootstrap skips secondary earnings when prefetch=1).
        if (scope === "chart" && longRange) q.set("chart_monthly", "1");
        return q;
      };

      const fetchPrefetchScope = async (scope) => {
        const q = buildPrefetchParams(scope);
        const requestKey = q.toString();
        if (dashboardPrefetchFailedRef.current.has(requestKey)) return null;
        try {
          const { res, json } = await fetchBootstrapHttpDeduped(
            bootstrapInflightRef.current,
            requestKey,
            // Background sibling warm — never contend with the active scope's own
            // fetches for the browser's limited concurrent-connection slots.
            { credentials: "include", priority: "low" }
          );
          if (!res.ok || !json.success || !json.data) {
            if (!res.ok) dashboardPrefetchFailedRef.current.add(requestKey);
            return null;
          }
          return json.data;
        } catch {
          return null;
        }
      };

      try {
        // Prefer one `full` pack so Company All → company clicks hit atomic-ready cache
        // (kpi→chart→earnings fan-out was 3× HTTP and starved UI).
        // Multi-currency pie is filled by live load / earnings scope — not prefetch fan-out.
        const primaryScope =
          longRange || (Array.isArray(codes) && codes.length > 1) ? "full" : "kpi";
        const primaryData = await fetchPrefetchScope(primaryScope);
        if (!primaryData?.current) return;

        let current = applyDashboardPayloadAdjustments(primaryData.current, id, vg || null);
        let previous = primaryData.previous
          ? applyDashboardPayloadAdjustments(primaryData.previous, id, vg || null)
          : existing?.previous ?? null;
        let earningsCurrent = earningsRowsFromBootstrapEntries(
          primaryData.earnings?.current,
          id,
          vg || null
        );

        const fillTasks = [];
        if (dashboardPayloadNeedsChartDaily(current) && primaryScope !== "full" && primaryScope !== "chart") {
          fillTasks.push(
            (async () => {
              const chartData = await fetchPrefetchScope("chart");
              if (chartData?.current?.daily_data) {
                current = markDashboardChartSettled(
                  applyDashboardPayloadAdjustments(
                    { ...current, daily_data: chartData.current.daily_data },
                    id,
                    vg || null
                  )
                );
              } else {
                current = markDashboardChartSettled(current);
              }
            })()
          );
        } else {
          current = markDashboardChartSettled(current);
        }
        if (Array.isArray(codes) && codes.length > 1 && !cacheEntryHasFullEarnings({ earnings: earningsCurrent }, codes)) {
          fillTasks.push(
            (async () => {
              const earnData = await fetchPrefetchScope("earnings");
              const rows = earningsRowsFromBootstrapEntries(
                earnData?.earnings?.current,
                id,
                vg || null
              );
              if (rows.length > 1) earningsCurrent = rows;
            })()
          );
        }
        if (fillTasks.length) await Promise.all(fillTasks);

        if (current) {
          seedDashboardPayloadCacheForCompany(id, vg || null, rangeFrom, rangeTo, cur, current);
        }
        if (previous) {
          const prevRange = previousMonthEquivalentRange(rangeFrom, rangeTo);
          seedDashboardPayloadCacheForCompany(
            id,
            vg || null,
            prevRange.from,
            prevRange.to,
            cur,
            previous
          );
        }

        const cacheEntry = {
          current,
          previous,
          earnings: earningsCurrent.length > 1 ? earningsCurrent : undefined,
        };
        setDashboardCache(scopeKey, cacheEntry);
        applyPrefetchCacheToActiveScope(scopeKey, cacheEntry, codes);
      } catch {
        /* Best-effort prefetch. */
      }
    },
    [
      resolveDashboardScopeKey,
      resolvePrefetchBootstrapCodes,
      cacheEntryHasFullEarnings,
      applyDashboardPayloadAdjustments,
      earningsRowsFromBootstrapEntries,
      seedDashboardPayloadCacheForCompany,
      applyPrefetchCacheToActiveScope,
      shouldPrefetchCompanyScope,
      groupIds,
    ]
  );
  prefetchDashboardCompanyRef.current = prefetchDashboardCompany;

  const prefetchActiveScopeCurrency = useCallback(
    async (targetCurrency) => {
      const code = String(targetCurrency || "").trim().toUpperCase();
      if (!code || code === currencyCodeRef.current) return;

      const scopeKey = resolveDashboardScopeKey({
        currencyCode: code,
        showAllCurrencies: false,
      });
      if (!scopeKey || getDashboardCache(scopeKey)?.current) return;

      const rangeFrom = dateFromRef.current;
      const rangeTo = dateToRef.current;
      const codes = currenciesRef.current;

      /**
       * Company All: warm sibling currencies via the same group_all full pack used by live load.
       * Without this, every currency click waits on a cold ~3s full bootstrap (atomic paint held).
       * Guard dates — stale-range warms from a prior 本月 load must not race 今年 first paint.
       */
      if (
        groupAllMode &&
        selectedGroup &&
        !groupsAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1)
      ) {
        const fetchGroupAll = fetchGroupAllMergedDashboardRef.current;
        if (typeof fetchGroupAll !== "function") return;
        const failKey = `group_all|${selectedGroup}|${rangeFrom}|${rangeTo}|${code}`;
        if (dashboardPrefetchFailedRef.current.has(failKey)) return;
        if (
          rangeFrom !== dateFromRef.current ||
          rangeTo !== dateToRef.current
        ) {
          return;
        }
        try {
          let merged = await fetchGroupAll(rangeFrom, rangeTo, code, {
            groupKey: selectedGroup,
            useActiveScopeAbort: false,
          });
          if (!merged) {
            dashboardPrefetchFailedRef.current.add(failKey);
            return;
          }
          if (
            rangeFrom !== dateFromRef.current ||
            rangeTo !== dateToRef.current
          ) {
            return;
          }
          const enrich = enrichGroupAllMergedDashboardRef.current;
          if (
            typeof enrich === "function" &&
            canAccessGroupLedgerForGroup(meRef.current, selectedGroup, companies)
          ) {
            merged = await enrich(
              merged,
              rangeFrom,
              rangeTo,
              code,
              selectedGroup,
              false
            );
          }
          if (
            rangeFrom !== dateFromRef.current ||
            rangeTo !== dateToRef.current
          ) {
            return;
          }
          if (resolveDashboardScopeKey({ currencyCode: code, showAllCurrencies: false }) !== scopeKey) {
            return;
          }
          let bootEarnings = merged?._group_all_earnings_by_currency;
          let current = merged;
          if (current && current._group_all_earnings_by_currency) {
            const { _group_all_earnings_by_currency: _drop, ...rest } = current;
            current = rest;
          }
          current = markDashboardChartSettled(
            stampDashboardPayloadRange(current, rangeFrom, rangeTo)
          );
          const earningsReady =
            Array.isArray(bootEarnings) &&
            bootEarnings.length > 1 &&
            dashboardEarningsRowsComplete(bootEarnings, codes);
          setDashboardCache(scopeKey, {
            current,
            earnings: earningsReady ? bootEarnings : undefined,
          });
          if (earningsReady) {
            mirrorDashboardEarningsAcrossCurrencies(
              bootEarnings,
              codes,
              resolveDashboardScopeKey
            );
          }
        } catch {
          dashboardPrefetchFailedRef.current.add(failKey);
        }
        return;
      }

      const canUseDashboardBootstrap =
        !groupAllMode &&
        !(groupsAllMode && !groupAllMode) &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
        (companyId != null || groupAggregateMode);
      if (!canUseDashboardBootstrap) return;

      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        bootstrap_scope: "kpi",
        prefetch: "1",
        currency: code,
      });
      if (companyId != null) {
        q.set("company_id", String(companyId));
        appendDashboardGroupTabParams(q, dashboardViewGroup, { subsidiaryOnly: subsidiaryDashboardScope });
      } else if (usesGroupLedgerDashboard && selectedGroup) {
        appendGroupLedgerDashboardParams(q, selectedGroup);
      } else {
        return;
      }
      // Prefetch KPI for the target currency only — do not fan-out `currencies=`
      // (live load / earnings scope still request the full pie pack).
      const requestKey = q.toString();
      if (dashboardPrefetchFailedRef.current.has(requestKey)) return;

      try {
        const { res, json } = await fetchBootstrapHttpDeduped(
          bootstrapInflightRef.current,
          requestKey,
          // Background sibling-currency warm — never contend with the active
          // scope's own fetches for the browser's limited connection slots.
          { credentials: "include", priority: "low" }
        );
        if (!res.ok || !json.success || !json.data?.current) {
          if (!res.ok) dashboardPrefetchFailedRef.current.add(requestKey);
          return;
        }

        const current = applyDashboardPayloadAdjustments(
          json.data.current,
          companyId,
          dashboardViewGroup
        );
        const previous = json.data.previous
          ? applyDashboardPayloadAdjustments(json.data.previous, companyId, dashboardViewGroup)
          : null;
        const earningsCurrent = earningsRowsFromBootstrapEntries(
          json.data.earnings?.current,
          companyId,
          dashboardViewGroup
        );

        if (companyId != null) {
          seedDashboardPayloadCacheForCompany(
            companyId,
            dashboardViewGroup,
            rangeFrom,
            rangeTo,
            code,
            current
          );
        } else if (selectedGroup) {
          seedDashboardPayloadCacheForGroup(selectedGroup, rangeFrom, rangeTo, code, current);
        }

        setDashboardCache(scopeKey, {
          current,
          previous,
          earnings: earningsCurrent.length > 1 ? earningsCurrent : undefined,
        });
        if (earningsCurrent.length > 1) {
          mirrorDashboardEarningsAcrossCurrencies(
            earningsCurrent,
            currenciesRef.current,
            resolveDashboardScopeKey
          );
        }
      } catch {
        /* Best-effort prefetch. */
      }
    },
    [
      resolveDashboardScopeKey,
      companyId,
      selectedGroup,
      groupAllMode,
      groupsAllMode,
      mergedSubsetIds,
      groupAggregateMode,
      usesGroupLedgerDashboard,
      subsidiaryDashboardScope,
      applyDashboardPayloadAdjustments,
      earningsRowsFromBootstrapEntries,
      seedDashboardPayloadCacheForCompany,
      seedDashboardPayloadCacheForGroup,
      dashboardViewGroup,
      companies,
    ]
  );

  const prefetchDashboardGroupLedger = useCallback(
    async (groupId) => {
      const g = String(groupId || "").trim().toUpperCase();
      if (!g) return;
      const cur = currencyCodeRef.current;
      const scopeKey = resolveDashboardScopeKey({
        companyId: null,
        selectedGroup: g,
        groupsAllMode: false,
        groupAllMode: false,
        mergedSubsetIds: null,
        currencyCode: cur,
      });
      const existing = scopeKey ? getDashboardCache(scopeKey) : null;
      const isActiveScope = scopeKey === resolveDashboardScopeKey();
      if (isActiveScope) return;
      const codes =
        currenciesByGroupRef.current.get(g) ??
        (isActiveScope && currenciesRef.current.length > 1 ? currenciesRef.current : null);
      if (
        !scopeKey ||
        (existing?.current && cacheEntryHasFullEarnings(existing, codes))
      ) {
        return;
      }

      const rangeFrom = dateFromRef.current;
      const rangeTo = dateToRef.current;
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        bootstrap_scope: "kpi",
        prefetch: "1",
        view_group: g,
        group_id: g,
      });
      if (cur) q.set("currency", cur);
      if (codes?.length > 1) q.set("currencies", sortCurrencyCodesForBootstrap(codes).join(","));
      const requestKey = q.toString();
      if (dashboardPrefetchFailedRef.current.has(requestKey)) return;

      try {
        const { res, json } = await fetchBootstrapHttpDeduped(
          bootstrapInflightRef.current,
          requestKey,
          // Background sibling-group warm — never contend with the active
          // scope's own fetches for the browser's limited connection slots.
          { credentials: "include", priority: "low" }
        );
        if (!res.ok || !json.success || !json.data?.current) {
          if (!res.ok) dashboardPrefetchFailedRef.current.add(requestKey);
          return;
        }

        const current = applyDashboardPayloadAdjustments(json.data.current, null, g);
        const previous = json.data.previous
          ? applyDashboardPayloadAdjustments(json.data.previous, null, g)
          : null;
        const earningsCurrent = earningsRowsFromBootstrapEntries(
          json.data.earnings?.current,
          null,
          g
        );

        if (current) {
          seedDashboardPayloadCacheForGroup(g, rangeFrom, rangeTo, cur, current);
        }
        if (previous) {
          const prevRange = previousMonthEquivalentRange(rangeFrom, rangeTo);
          seedDashboardPayloadCacheForGroup(g, prevRange.from, prevRange.to, cur, previous);
        }

        const cacheEntry = {
          current,
          previous,
          earnings: earningsCurrent.length > 1 ? earningsCurrent : undefined,
        };
        setDashboardCache(scopeKey, cacheEntry);
        applyPrefetchCacheToActiveScope(scopeKey, cacheEntry, codes);
      } catch {
        /* Best-effort prefetch. */
      }
    },
    [
      resolveDashboardScopeKey,
      cacheEntryHasFullEarnings,
      applyDashboardPayloadAdjustments,
      earningsRowsFromBootstrapEntries,
      seedDashboardPayloadCacheForGroup,
      applyPrefetchCacheToActiveScope,
    ]
  );

  const loadDashboardViaBootstrap = useCallback(
    async ({ scope = "full", currencyCodesOverride = null, currencyOverride = null } = {}) => {
      const q = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        bootstrap_scope: scope,
      });
      if (companyId != null) {
        q.set("company_id", String(companyId));
        appendDashboardGroupTabParams(q, dashboardViewGroup, { subsidiaryOnly: subsidiaryDashboardScope });
      } else if (usesGroupLedgerDashboard && selectedGroup) {
        appendGroupLedgerDashboardParams(q, selectedGroup);
      } else {
        throw new Error(i18n.failedToLoadDashboard);
      }
      const effectiveCurrency =
        currencyOverride ??
        (currencyCodeRef.current ||
          resolveProvisionalDashboardCurrency({
            currencyCode: currencyCodeRef.current,
            companyId,
            currenciesRef,
            currenciesByCompanyRef,
          }));
      if (effectiveCurrency) q.set("currency", effectiveCurrency);

      const codesForBootstrap = currencyOverride
        ? null
        : (currencyCodesOverride ??
          (subsidiaryDashboardScope && companyId != null
            ? currenciesByCompanyRef.current.get(parseInt(companyId, 10)) ?? currenciesRef.current
            : selectedGroup && currenciesRef.current.length > 0 && !subsidiaryDashboardScope
              ? currenciesRef.current
              : companyId != null
                ? currenciesByCompanyRef.current.get(parseInt(companyId, 10))
                : null) ??
          (currenciesRef.current.length > 1 ? currenciesRef.current : null));
      if (Array.isArray(codesForBootstrap) && codesForBootstrap.length > 1) {
        q.set("currencies", sortCurrencyCodesForBootstrap(codesForBootstrap).join(","));
      }
      if (
        (scope === "chart" || scope === "full") &&
        shouldAggregateChartByMonth(dateFrom, dateTo)
      ) {
        q.set("chart_monthly", "1");
      }

      const requestKey = q.toString();

      const { res, json } = await fetchBootstrapHttpDeduped(
        bootstrapInflightRef.current,
        requestKey,
        { credentials: "include" }
      );
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || json.error || i18n.dashboardApiError);
      }
      if (scope === "previous") {
        if (!json.data.previous) {
          throw new Error(json.message || json.error || i18n.dashboardApiError);
        }
      } else if (scope === "earnings") {
        const earningsRows = json.data.earnings?.current;
        if (!Array.isArray(earningsRows) || earningsRows.length <= 1) {
          throw new Error(json.message || json.error || i18n.dashboardApiError);
        }
      } else if ((scope === "full" || scope === "kpi" || scope === "chart") && !json.data.current) {
        throw new Error(json.message || json.error || i18n.dashboardApiError);
      }

      const current =
        scope === "previous"
          ? null
          : json.data.current != null
            ? applyDashboardPayloadAdjustments(json.data.current, companyId, dashboardViewGroup)
            : null;
      const previous = json.data.previous
        ? applyDashboardPayloadAdjustments(json.data.previous, companyId, dashboardViewGroup)
        : null;

      if (current) {
        seedDashboardPayloadCache(dateFrom, dateTo, currencyCode, current);
      }
      if (previous) {
        const prevRange = previousMonthEquivalentRange(dateFrom, dateTo);
        seedDashboardPayloadCache(prevRange.from, prevRange.to, currencyCode, previous);
      }

      const earningsCurrent =
        scope === "previous" ? [] : earningsRowsFromBootstrapEntries(json.data.earnings?.current);
      const earningsPrevious = earningsRowsFromBootstrapEntries(json.data.earnings?.previous);

      return { current, previous, earningsCurrent, earningsPrevious };
    },
    [
      dateFrom,
      dateTo,
      usesGroupLedgerDashboard,
      selectedGroup,
      dashboardViewGroup,
      companyId,
      subsidiaryDashboardScope,
      currencyCode,
      applyDashboardPayloadAdjustments,
      seedDashboardPayloadCache,
      earningsRowsFromBootstrapEntries,
      i18n.failedToLoadDashboard,
      i18n.dashboardApiError,
    ]
  );

  /** MoM compare baseline — deferred so the first bootstrap only waits on current period. */
  const loadDashboardPreviousPeriod = useCallback(
    async (targetScopeKey) => {
      const cacheKey = targetScopeKey ?? dashboardScopeKey;
      if (!cacheKey || cacheKey !== resolveDashboardScopeKey()) return;

      const cached = getDashboardCache(cacheKey);
      if (cached?.previous) {
        setDashboardDataPrev(cached.previous);
        return;
      }
      if (previousPeriodInFlightRef.current === cacheKey) return;

      const canUseBootstrap =
        !(showAllCurrencies && canShowAllCurrencies) &&
        !(groupsAllMode && !groupAllMode) &&
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
        (companyId != null || groupAggregateMode);
      if (!canUseBootstrap) return;

      const scopeNeedsCurrency = dashboardScopeNeedsCurrency({
        companyId,
        usesGroupLedgerDashboard,
        groupAllMode,
        groupsAllMode,
        mergedSubsetIds,
      });
      if (scopeNeedsCurrency && !currencyCode) return;

      const gen = ++previousPeriodFetchGenRef.current;
      previousPeriodInFlightRef.current = cacheKey;
      try {
        const boot = await loadDashboardViaBootstrap({ scope: "previous" });
        if (gen !== previousPeriodFetchGenRef.current) return;
        if (resolveDashboardScopeKey() !== cacheKey || !boot.previous) return;
        setDashboardDataPrev(boot.previous);
        patchDashboardCache(cacheKey, { previous: boot.previous });
      } catch {
        /* Background MoM compare — non-blocking. */
      } finally {
        if (previousPeriodInFlightRef.current === cacheKey) {
          previousPeriodInFlightRef.current = "";
        }
      }
    },
    [
      dashboardScopeKey,
      resolveDashboardScopeKey,
      companyId,
      groupAggregateMode,
      showAllCurrencies,
      canShowAllCurrencies,
      groupsAllMode,
      groupAllMode,
      mergedSubsetIds,
      usesGroupLedgerDashboard,
      currencyCode,
      loadDashboardViaBootstrap,
    ]
  );

  /** Trend chart daily series — deferred so KPI bootstrap can skip GROUP BY daily aggregation. */
  const loadDashboardChartDaily = useCallback(
    async (targetScopeKey) => {
      const cacheKey = targetScopeKey ?? dashboardScopeKey;
      if (!cacheKey || cacheKey !== resolveDashboardScopeKey()) return;
      if (chartDailyInFlightRef.current === cacheKey) return;

      const cachedEntry = getDashboardCache(cacheKey);
      const current = cachedEntry?.current ?? dashboardDataRef.current;
      if (!current || !dashboardPayloadNeedsChartDaily(current)) return;

      const canUseBootstrap =
        !(showAllCurrencies && canShowAllCurrencies) &&
        !(groupsAllMode && !groupAllMode) &&
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
        (companyId != null || groupAggregateMode);
      if (!canUseBootstrap || !current) return;

      const gen = ++chartDailyFetchGenRef.current;
      chartDailyInFlightRef.current = cacheKey;
      try {
        const boot = await loadDashboardViaBootstrap({ scope: "chart" });
        if (gen !== chartDailyFetchGenRef.current) return;
        if (resolveDashboardScopeKey() !== cacheKey) return;
        const latestCurrent = getDashboardCache(cacheKey)?.current ?? current;
        const withDaily = boot.current?.daily_data
          ? { ...latestCurrent, daily_data: boot.current.daily_data }
          : latestCurrent;
        const merged = markDashboardChartSettled(
          applyDashboardPayloadAdjustments(withDaily, companyId, selectedGroup)
        );
        setDashboardData(merged);
        dashboardDataRef.current = merged;
        patchDashboardCache(cacheKey, { current: merged });
      } catch {
        if (gen !== chartDailyFetchGenRef.current) return;
        if (resolveDashboardScopeKey() !== cacheKey) return;
        const latestCurrent = getDashboardCache(cacheKey)?.current ?? current;
        const settled = markDashboardChartSettled(latestCurrent);
        setDashboardData(settled);
        dashboardDataRef.current = settled;
        patchDashboardCache(cacheKey, { current: settled });
      } finally {
        if (chartDailyInFlightRef.current === cacheKey) {
          chartDailyInFlightRef.current = "";
        }
      }
    },
    [
      dashboardScopeKey,
      resolveDashboardScopeKey,
      companyId,
      groupAggregateMode,
      showAllCurrencies,
      canShowAllCurrencies,
      groupsAllMode,
      groupAllMode,
      mergedSubsetIds,
      applyDashboardPayloadAdjustments,
      selectedGroup,
      loadDashboardViaBootstrap,
    ]
  );

  const fetchGroupDashboardPayload = useCallback(
    async (
      rangeFrom,
      rangeTo,
      currencyOverride,
      groupIdOverride = null,
      useActiveScopeAbort = true,
      { earningsOnly = false } = {}
    ) => {
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
      });
      const cur = currencyOverride ?? currencyCodeRef.current;
      if (cur) q.append("currency", cur);
      if (earningsOnly) {
        q.append("kpi_only", "1");
        q.append("earnings_only", "1");
      }
      const vg =
        groupIdOverride != null
          ? String(groupIdOverride).trim().toUpperCase()
          : selectedGroup
            ? String(selectedGroup).trim().toUpperCase()
            : "";
      if (!vg) {
        throw new Error(i18n.failedToLoadDashboard);
      }
      if (!canAccessGroupLedgerForGroup(meRef.current, vg, companies)) {
        throw new Error(i18n.failedToLoadDashboard);
      }
      appendGroupLedgerDashboardParams(q, vg);
      const cacheKey = q.toString();
      const cachedPayload = getDashboardPayloadCache(cacheKey);
      if (cachedPayload != null) {
        return cachedPayload;
      }
      const { res, json } = await fetchDashboardApiHttpDeduped(
        dashboardApiInflightRef.current,
        cacheKey,
        dashboardFetchInit(
          useActiveScopeAbort ? dashboardFetchAbortRef.current?.signal : undefined
        )
      );
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || json.error || i18n.dashboardApiError);
      }
      setDashboardPayloadCache(cacheKey, json.data);
      return json.data;
    },
    [selectedGroup, companies, i18n]
  );

  const fetchMergedCompanyDashboards = useCallback(
    async (
      companyList,
      rangeFrom,
      rangeTo,
      currencyOverride,
      viewGroupFallback = null,
      useActiveScopeAbort = true,
      { earningsOnly = false, currencies = null } = {}
    ) => {
      const accessible = filterCompaniesForDashboardApiAccess(
        meRef.current,
        companyList,
        companies,
        viewGroupFallback ?? selectedGroup
      );
      if (!accessible.length) {
        throw new Error(i18n.failedToLoadDashboard);
      }

      const viewGroupHint = String(viewGroupFallback ?? selectedGroup ?? "")
        .trim()
        .toUpperCase();
      const cur = currencyOverride ?? currencyCodeRef.current;
      const ids = accessible
        .map((c) => parseInt(c.id, 10))
        .filter((id) => Number.isFinite(id) && id > 0);

      /**
       * One HTTP: server runs per-company packs in-process; FE still owns mergeGroupData.
       * For 2+ companies prefer FE-parallel packs — PHP group_all foreach is serial
       * (wall ≈ Σ companies) and was the main Company All first-paint stall.
       * earnings-only pie fills already used FE-parallel for the same reason.
       */
      const tryGroupAllBootstrap = async () => {
        if (!ids.length || ids.length > 40) return null;
        if (ids.length >= 2) {
          return null;
        }
        // Heterogeneous view_group (Groups All) — keep parallel per-company fetches.
        const sameViewGroup = accessible.every((c) => {
          const vg = resolveViewGroupForCompany(c, viewGroupFallback ?? selectedGroup);
          return String(vg || "").trim().toUpperCase() === viewGroupHint;
        });
        if (!sameViewGroup || !viewGroupHint) return null;

        const q = new URLSearchParams({
          date_from: rangeFrom,
          date_to: rangeTo,
          group_all: "1",
          company_ids: [...ids].sort((a, b) => a - b).join(","),
          view_group: viewGroupHint,
          bootstrap_scope: earningsOnly ? "earnings" : "full",
        });
        if (cur) q.set("currency", cur);
        // Never pass currencies= on group_all: PHP would serially capture every
        // secondary currency for every company in one HTTP (5×9 ≈ 45 captures).
        // Multi-currency pie is filled by FE-parallel single-currency packs instead.
        const codes = currenciesRef.current;
        if (!earningsOnly && shouldAggregateChartByMonth(rangeFrom, rangeTo)) {
          q.set("chart_monthly", "1");
        }

        const { res, json } = await fetchBootstrapHttpDeduped(
          bootstrapInflightRef.current,
          q.toString(),
          { credentials: "include" }
        );
        if (!res.ok || !json?.success || !json?.data?.group_all || !Array.isArray(json.data.companies)) {
          return null;
        }

        const byId = new Map(
          json.data.companies.map((row) => [parseInt(row.company_id, 10), row])
        );
        const pairs = [];
        for (const c of accessible) {
          const cid = parseInt(c.id, 10);
          const pack = byId.get(cid);
          const data = earningsOnly
            ? pack?.current ?? pack?.earnings?.current?.[0]?.payload ?? null
            : pack?.current;
          if (!data) continue;
          const viewGroup = resolveViewGroupForCompany(c, viewGroupFallback ?? selectedGroup);
          seedDashboardPayloadCacheForCompany(cid, viewGroup, rangeFrom, rangeTo, cur, data);
          if (!earningsOnly && pack?.previous) {
            const prevRange = previousMonthEquivalentRange(rangeFrom, rangeTo);
            seedDashboardPayloadCacheForCompany(
              cid,
              viewGroup,
              prevRange.from,
              prevRange.to,
              cur,
              pack.previous
            );
          }
          pairs.push({ company: c, data, viewGroup });
        }
        if (!pairs.length) return null;

        const merged = mergeGroupData(
          pairs.map((p) => p.data),
          { startDate: rangeFrom, endDate: rangeTo }
        );
        const byCompany = buildCompanyNetProfitRowsFromPairs(
          pairs,
          viewGroupFallback ?? selectedGroup
        );
        if (byCompany.length) {
          merged.subsidiary_earnings_by_company = byCompany;
        }
        if (!earningsOnly && codes?.length > 1) {
          const lists = [];
          for (const c of accessible) {
            const pack = byId.get(parseInt(c.id, 10));
            if (!pack?.earnings?.current?.length) continue;
            const rows = earningsRowsFromBootstrapEntries(
              pack.earnings.current,
              parseInt(c.id, 10),
              resolveViewGroupForCompany(c, viewGroupFallback ?? selectedGroup)
            );
            if (rows.length) lists.push(rows);
          }
          if (lists.length) {
            merged._group_all_earnings_by_currency = mergeEarningsByCurrency(lists, codes);
          }
        }
        return merged;
      };

      try {
        const bootMerged = await tryGroupAllBootstrap();
        if (bootMerged) return bootMerged;
      } catch {
        /* fall back to parallel dashboard_api */
      }

      const settled = await runTasksInBatches(
        accessible,
        MERGE_DASHBOARD_PARALLEL_BATCH,
        async (c) => {
          const cid = parseInt(c.id, 10);
          const viewGroup = resolveViewGroupForCompany(c, viewGroupFallback ?? selectedGroup);
          try {
            const data = await fetchDashboardPayload(
              cid,
              rangeFrom,
              rangeTo,
              currencyOverride,
              viewGroup,
              useActiveScopeAbort,
              { earningsOnly, currencies }
            );
            return { status: "fulfilled", value: { company: c, data, viewGroup } };
          } catch (reason) {
            return { status: "rejected", reason };
          }
        }
      );
      const pairs = settled
        .filter((entry) => entry.status === "fulfilled" && entry.value?.data)
        .map((entry) => entry.value);
      const results = pairs.map((pair) => pair.data);
      if (!results.length) {
        const rejected = settled.find(
          (entry) => entry.status === "rejected" && !isBenignFetchError(entry.reason)
        );
        if (rejected) {
          throw rejected.reason ?? new Error(i18n.failedToLoadDashboard);
        }
        const abortedOnly = settled.find((entry) => entry.status === "rejected");
        if (abortedOnly) {
          throw abortedOnly.reason ?? new DOMException("Aborted", "AbortError");
        }
        throw new Error(i18n.failedToLoadDashboard);
      }
      const merged = mergeGroupData(results, { startDate: rangeFrom, endDate: rangeTo });
      const byCompany = buildCompanyNetProfitRowsFromPairs(
        pairs,
        viewGroupFallback ?? selectedGroup
      );
      if (byCompany.length) {
        merged.subsidiary_earnings_by_company = byCompany;
      }

      // Multi-currency mode: each company returns { currencies: { CODE: fullPayload } }.
      // Merge per currency with the same ownership/subsidiary rules as single-currency
      // Company All (do not raw-sum profit/expenses — that drops ownership %).
      if (Array.isArray(currencies) && currencies.length > 1) {
        const acc = {};
        const codeList = sortCurrencyCodesForBootstrap(currencies);
        for (const code of codeList) {
          const codeUpper = String(code || "").trim().toUpperCase();
          const codePairs = [];
          for (const pair of pairs) {
            const perCur = pair.data?.currencies;
            if (!perCur || typeof perCur !== "object") continue;
            const entry =
              perCur[code] ??
              perCur[codeUpper] ??
              perCur[String(code).trim()];
            if (!entry || typeof entry !== "object") continue;
            const data =
              entry.period_total != null ||
              entry.daily_data != null ||
              entry.has_ownership_setup !== undefined ||
              (entry.profit != null && typeof entry.profit === "object")
                ? entry
                : {
                    period_total: {
                      profit: entry.profit ?? entry.netProfit ?? "0",
                      expenses: entry.expenses ?? "0",
                    },
                    profit: entry.profit ?? entry.netProfit ?? "0",
                    expenses: entry.expenses ?? "0",
                  };
            codePairs.push({
              company: pair.company,
              data,
              viewGroup: pair.viewGroup,
            });
            const cid = parseInt(pair.company?.id, 10);
            if (Number.isFinite(cid) && cid > 0) {
              seedDashboardPayloadCacheForCompany(
                cid,
                pair.viewGroup,
                rangeFrom,
                rangeTo,
                codeUpper,
                data
              );
            }
          }
          if (!codePairs.length) continue;
          const mergedCode = mergeGroupData(
            codePairs.map((p) => p.data),
            { startDate: rangeFrom, endDate: rangeTo }
          );
          const byCompanyCode = buildCompanyNetProfitRowsFromPairs(
            codePairs,
            viewGroupFallback ?? selectedGroup
          );
          if (byCompanyCode.length) {
            mergedCode.subsidiary_earnings_by_company = byCompanyCode;
          }
          acc[codeUpper] = mergedCode;
        }
        merged.currencies = acc;
      }
      return merged;
    },
    [
      fetchDashboardPayload,
      selectedGroup,
      companies,
      i18n.failedToLoadDashboard,
      seedDashboardPayloadCacheForCompany,
      earningsRowsFromBootstrapEntries,
    ]
  );

  const fetchGroupAllMergedDashboard = useCallback(
    async (
      rangeFrom,
      rangeTo,
      currencyOverride,
      {
        groupKey = null,
        groupsAllMerge = false,
        useActiveScopeAbort = true,
        earningsOnly = false,
        earningsGroupsOnly = false,
        currencies = null,
      } = {}
    ) => {
      let companyList;
      if (groupsAllMerge) {
        const enabled = earningsGroupsOnly
          ? earningsEnabledGroupIdsRef.current.filter((g) => String(g || "").trim())
          : [];
        if (enabled.length) {
          companyList = enabled.flatMap((g) =>
            resolveGroupAllMergeCompanyList(companies, g, ledgerGroupIds)
          );
        } else {
          companyList = resolveGroupsAllMergeCompanyList(companies, ledgerGroupIds);
        }
      } else {
        companyList = resolveGroupAllMergeCompanyList(companies, groupKey ?? selectedGroup, groupIds);
      }
      return fetchMergedCompanyDashboards(
        companyList,
        rangeFrom,
        rangeTo,
        currencyOverride,
        groupKey ?? selectedGroup,
        useActiveScopeAbort,
        { earningsOnly, currencies }
      );
    },
    [companies, groupIds, ledgerGroupIds, selectedGroup, fetchMergedCompanyDashboards]
  );
  fetchGroupAllMergedDashboardRef.current = fetchGroupAllMergedDashboard;

  const enrichGroupAllMergedDashboard = useCallback(
    async (merged, rangeFrom, rangeTo, currencyOverride, groupKey, useActiveScopeAbort = true) => {
      if (!merged || !groupKey) return merged;
      try {
        const ledger = await fetchGroupDashboardPayload(
          rangeFrom,
          rangeTo,
          currencyOverride,
          groupKey,
          useActiveScopeAbort,
          { earningsOnly: true }
        );
        return attachGroupAggregateEarningsFields(merged, ledger);
      } catch {
        // Company login may not have group-ledger permission; keep merged subsidiary payload usable.
        return merged;
      }
    },
    [fetchGroupDashboardPayload]
  );
  enrichGroupAllMergedDashboardRef.current = enrichGroupAllMergedDashboard;

  const loadMergedDashboard = useCallback(
    async (rangeFrom, rangeTo, currencyOverride, { useActiveScopeAbort, earningsOnly = false, currencies = null } = {}) => {
      const mergeAbort =
        useActiveScopeAbort !== undefined ? useActiveScopeAbort : !groupAllMode;
      const earningsOpts = earningsOnly
        ? { earningsOnly: true, ...(currencies ? { currencies } : {}) }
        : {};
      if (companyId != null) {
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(companyId, 10));
        const viewGroup =
          dashboardViewGroup ?? resolveViewGroupForCompany(row, selectedGroup);
        return fetchDashboardPayload(
          companyId,
          rangeFrom,
          rangeTo,
          currencyOverride,
          viewGroup,
          mergeAbort,
          earningsOpts
        );
      }
      if (usesGroupLedgerDashboard && selectedGroup) {
        return fetchGroupDashboardPayload(
          rangeFrom,
          rangeTo,
          currencyOverride,
          null,
          mergeAbort,
          earningsOpts
        );
      }

      if (groupAllMode) {
        if (groupsAllMode) {
          return fetchGroupAllMergedDashboard(rangeFrom, rangeTo, currencyOverride, {
            groupsAllMerge: true,
            useActiveScopeAbort: mergeAbort,
            earningsOnly,
            earningsGroupsOnly: false,
            currencies,
          });
        }
        if (selectedGroup) {
          // Must forward earningsOnly — otherwise pie/secondary currencies hit
          // bootstrap_scope=full (chart) per company instead of light earnings packs.
          // Do not await group-ledger enrich on the critical path — paint subsidiary
          // merge first; loadDashboard schedules enrich after atomic paint.
          return fetchGroupAllMergedDashboard(rangeFrom, rangeTo, currencyOverride, {
            groupKey: selectedGroup,
            useActiveScopeAbort: mergeAbort,
            earningsOnly,
            currencies,
          });
        }
        // Independent company All (no Group tab): merge ungrouped picker companies.
        const independentRows = resolveMergeCompanyList();
        if (independentRows.length) {
          return fetchMergedCompanyDashboards(
            independentRows,
            rangeFrom,
            rangeTo,
            currencyOverride,
            null,
            mergeAbort,
            earningsOpts
          );
        }
      }

      if (
        isGroupsAllLedgerDataScope({
          groupsAllMode,
          groupAllMode,
          companyId,
          me,
        })
      ) {
        const gids = filterGroupIdsForLedgerAccess(me, groupIds, companies);
        if (!gids.length) {
          throw new Error(i18n.failedToLoadDashboard);
        }
        const settled = await Promise.allSettled(
          gids.map((gid) =>
            fetchGroupDashboardPayload(rangeFrom, rangeTo, currencyOverride, gid, mergeAbort, earningsOpts)
          )
        );
        const results = settled
          .filter((entry) => entry.status === "fulfilled")
          .map((entry) => entry.value);
        if (!results.length) {
          const rejected = settled.find((entry) => entry.status === "rejected");
          throw rejected?.reason ?? new Error(i18n.failedToLoadDashboard);
        }
        earningsEnabledGroupIdsRef.current = gids
          .map((gid, idx) => ({ gid, payload: settled[idx]?.status === "fulfilled" ? settled[idx].value : null }))
          .filter(({ payload }) => payload && viewerHasEarningsConfig(payload))
          .map(({ gid }) => String(gid).trim().toUpperCase());
        const earningsResults = results.filter((row) => viewerHasEarningsConfig(row));
        const merged = finalizeMergedGroupLedgerDashboard(
          mergeGroupData(results, { startDate: rangeFrom, endDate: rangeTo }),
          earningsResults
        );
        merged._earnings_enabled_group_ids = gids
          .map((gid, idx) => ({
            gid,
            payload: settled[idx]?.status === "fulfilled" ? settled[idx].value : null,
          }))
          .filter(({ payload }) => payload && viewerHasEarningsConfig(payload))
          .map(({ gid }) => String(gid || "").trim().toUpperCase())
          .filter(Boolean);
        const byCompany = mergeCompanyBreakdownRowLists(
          results.map((r) => normalizeSubsidiaryEarningsByCompany(r?.subsidiary_earnings_by_company))
        );
        if (byCompany.length) {
          merged.subsidiary_earnings_by_company = byCompany;
        }
        return merged;
      }

      if (mergedSubsetIds && mergedSubsetIds.length > 1) {
        const rows = mergedSubsetIds
          .map((cid) => companies.find((x) => parseInt(x.id, 10) === parseInt(cid, 10)))
          .filter(Boolean);
        return fetchMergedCompanyDashboards(rows, rangeFrom, rangeTo, currencyOverride);
      }
      throw new Error(i18n.failedToLoadDashboard);
    },
    [
      companyId,
      usesGroupLedgerDashboard,
      groupAllMode,
      groupsAllMode,
      groupIds,
      selectedGroup,
      dashboardViewGroup,
      mergedSubsetIds,
      companies,
      fetchGroupDashboardPayload,
      fetchGroupAllMergedDashboard,
      fetchMergedCompanyDashboards,
      resolveMergeCompanyList,
      i18n.failedToLoadDashboard,
      me,
    ]
  );

  const computeEarningsFromPayload = useCallback(
    (payload, grp = selectedGroup) => {
      if (!payload) return 0;
      const merged = mergeDashboardOwnershipFields(payload, dashboardDataRef.current);
      return (
        computeKpiMetrics(
          applyDashboardPayloadAdjustments(merged, companyId, grp),
          grp,
          resolveKpiOwnershipOpts(companyId, grp)
        )?.earnings ?? 0
      );
    },
    [applyDashboardPayloadAdjustments, companyId, selectedGroup, resolveKpiOwnershipOpts]
  );

  const computeCurrencyMetricsFromPayload = useCallback(
    (payload, grp = selectedGroup) => {
      if (!payload) return { netProfit: null, earnings: null };
      const merged = mergeDashboardOwnershipFields(payload, dashboardDataRef.current);
      const metrics = computeKpiMetrics(
        applyDashboardPayloadAdjustments(merged, companyId, grp),
        grp,
        resolveKpiOwnershipOpts(companyId, grp)
      );
      if (!metrics) return { netProfit: null, earnings: null };
      return {
        netProfit: metrics.netProfit,
        earnings: metrics.earnings,
      };
    },
    [applyDashboardPayloadAdjustments, companyId, selectedGroup, resolveKpiOwnershipOpts]
  );

  const buildCurrencyRowFromPayload = useCallback(
    (code, payload, grp = selectedGroup) => {
      const { netProfit, earnings } = computeCurrencyMetricsFromPayload(payload, grp);
      return { code, netProfit, earnings };
    },
    [computeCurrencyMetricsFromPayload]
  );

  const buildSeededEarningsRows = useCallback((codes, primaryCode, primaryNetProfit, primaryEarnings) => {
    const primaryUpper = String(primaryCode || "").toUpperCase();
    return codes.map((code) => {
      const isPrimary = String(code).toUpperCase() === primaryUpper;
      return {
        code,
        netProfit: isPrimary && primaryNetProfit != null ? primaryNetProfit : null,
        earnings: isPrimary && primaryEarnings != null ? primaryEarnings : null,
      };
    });
  }, []);

  /** Soft defer — does not burn EARNINGS_INCOMPLETE_RETRY_MAX (in-flight waits). */
  const deferActiveScopeEarningsUpgrade = useCallback((delayMs = 200) => {
    if (earningsRetryTimerRef.current) {
      window.clearTimeout(earningsRetryTimerRef.current);
    }
    earningsRetryTimerRef.current = window.setTimeout(() => {
      earningsRetryTimerRef.current = null;
      const codes = currenciesRef.current;
      if (codes.length <= 1 || !dashboardDataRef.current) return;
      if (dashboardEarningsRowsComplete(earningsByCurrencyRef.current, codes)) return;
      upgradeActiveScopeEarningsRef.current?.();
    }, delayMs);
  }, []);

  const scheduleIncompleteEarningsRetry = useCallback((delayMs = 150) => {
    if (earningsIncompleteRetryRef.current >= EARNINGS_INCOMPLETE_RETRY_MAX) {
      // Stop hiding the Currency card after giving up on gap-fill.
      setEarningsByCurrencyLoading(false);
      return;
    }
    earningsIncompleteRetryRef.current += 1;
    deferActiveScopeEarningsUpgrade(delayMs);
  }, [deferActiveScopeEarningsUpgrade]);

  const fetchSingleCurrencyEarnings = useCallback(
    async (code, gen, { retries = 1 } = {}) => {
      const maxRetries = groupAllMode ? 0 : retries;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        if (gen !== earningsFetchGenRef.current) return null;
        try {
          const payload = await loadMergedDashboard(
            dateFromRef.current,
            dateToRef.current,
            code,
            { earningsOnly: true, useActiveScopeAbort: false }
          );
          if (gen !== earningsFetchGenRef.current) return null;
          return buildCurrencyRowFromPayload(code, payload);
        } catch {
          if (attempt < maxRetries) {
            await new Promise((resolve) => window.setTimeout(resolve, 280));
          }
        }
      }
      return { code, netProfit: null, earnings: null };
    },
    [groupAllMode, loadMergedDashboard, buildCurrencyRowFromPayload]
  );

  /**
   * Multi-currency earnings for one company in a single HTTP request
   * (server aggregates all requested currencies in-process).
   * Returns rows in the same shape as fetchSingleCurrencyEarnings's result.
   */
  const fetchMultiCurrencyEarningsRows = useCallback(
    async (codes, gen) => {
      const list = sortCurrencyCodesForBootstrap(Array.isArray(codes) ? codes : []);
      if (list.length <= 1) return null;
      if (gen !== earningsFetchGenRef.current) return null;
      try {
        const payload = await loadMergedDashboard(
          dateFromRef.current,
          dateToRef.current,
          null,
          { earningsOnly: true, useActiveScopeAbort: false, currencies: list }
        );
        if (gen !== earningsFetchGenRef.current) return null;
        // Company All: currencies map holds per-code merged payloads (ownership-safe).
        // Single company: map holds each currency's capture payload.
        const map = payload?.currencies ?? payload?.data?.currencies;
        if (!map || typeof map !== "object") return null;
        const rows = [];
        for (const code of list) {
          const codeUpper = String(code || "").trim().toUpperCase();
          const entry = map[code] ?? map[codeUpper];
          if (!entry || typeof entry !== "object") {
            rows.push({ code, netProfit: null, earnings: null });
            continue;
          }
          if (
            entry.period_total != null ||
            entry.daily_data != null ||
            entry.subsidiary_earnings_by_company != null ||
            entry.has_ownership_setup !== undefined
          ) {
            rows.push(buildCurrencyRowFromPayload(code, entry));
            continue;
          }
          const profit = parseFloat(entry.profit ?? entry.netProfit ?? "0");
          const expenses = parseFloat(entry.expenses ?? "0");
          const net = Number.isFinite(profit - expenses) ? profit - expenses : null;
          rows.push({
            code,
            netProfit: net,
            earnings: Number.isFinite(profit) ? profit : null,
          });
        }
        return rows;
      } catch {
        return null;
      }
    },
    [loadMergedDashboard, buildCurrencyRowFromPayload]
  );

  const fetchGroupAllEarningsRowsForRange = useCallback(
    async (rangeFrom, rangeTo, gen, codes) => {
      const list = Array.isArray(codes) ? codes : currenciesRef.current;
      if (!list.length) return [];

      const codesSig = [...list]
        .map((c) => String(c || "").trim().toUpperCase())
        .filter(Boolean)
        .sort()
        .join(",");
      const jobKey = [
        rangeFrom,
        rangeTo,
        codesSig,
        groupAllMode ? "ga" : "x",
        String(selectedGroup || "").trim().toUpperCase(),
        groupsAllMode ? "gall" : "",
      ].join("|");

      const existing = groupAllEarningsInflightRef.current.get(jobKey);
      if (existing) {
        const shared = await existing;
        if (gen !== earningsFetchGenRef.current) return [];
        return Array.isArray(shared) ? shared : [];
      }

      const jobPromise = (async () => {
        const primary = currencyCodeRef.current;
        const primaryUpper = String(primary || "").trim().toUpperCase();
        const reuseMainPayload =
          rangeFrom === dateFromRef.current &&
          rangeTo === dateToRef.current &&
          dashboardDataRef.current != null;

        const resolveCodeEarnings = async (code) => {
          if (gen !== earningsFetchGenRef.current) return null;
          const codeUpper = String(code).trim().toUpperCase();

          if (reuseMainPayload && codeUpper === primaryUpper) {
            return buildCurrencyRowFromPayload(code, dashboardDataRef.current);
          }

          const cached = tryBuildGroupAllDashboardFromCompanyCaches({
            currencyCode: code,
            dateFrom: rangeFrom,
            dateTo: rangeTo,
            codes: list,
          });
          if (cached?.earnings?.length) {
            const hit = cached.earnings.find(
              (row) => String(row?.code || "").trim().toUpperCase() === codeUpper
            );
            if (hit?.earnings != null || hit?.netProfit != null) {
              return {
                code,
                netProfit: hit.netProfit ?? hit.earnings,
                earnings: hit.earnings ?? hit.netProfit,
              };
            }
          }
          if (cached?.current) {
            return buildCurrencyRowFromPayload(code, cached.current);
          }

          const fetched = await fetchSingleCurrencyEarnings(code, gen, { retries: 0 });
          return fetched ?? { code, netProfit: null, earnings: null };
        };

        const primaryCode =
          list.find((code) => String(code).trim().toUpperCase() === primaryUpper) ?? list[0];
        const otherCodes = list.filter(
          (code) =>
            String(code).trim().toUpperCase() !== String(primaryCode).trim().toUpperCase()
        );

        const rows = [];
        const primaryRow = await resolveCodeEarnings(primaryCode);
        if (primaryRow) rows.push(primaryRow);

        // Paint helper: keep the row set at the full currency list length at all
        // times — settled currencies carry their real figures, not-yet-settled ones
        // hold `{code, null, null}` placeholders. Replacing with only the settled
        // subset made the pie/list row count jump as batches landed.
        const paintProgressive = () => {
          const settledByCode = new Map(
            rows.map((row) => [String(row?.code || "").trim().toUpperCase(), row])
          );
          const progressive = list.map((code) => {
            const hit = settledByCode.get(String(code).trim().toUpperCase());
            return hit || { code, netProfit: null, earnings: null };
          });
          setEarningsByCurrency(progressive);
        };

        // One multi-currency request covers all remaining currencies at once
        // (server aggregates in-process ≈200ms) — the old path issued one HTTPS
        // round-trip per currency (each ~0.25-2s), the Group/Company All cold-start
        // pie stall. Falls back to per-currency fetches if the server lacks the
        // multi-currency endpoint.
        let multiRows = null;
        if (otherCodes.length > 0) {
          multiRows = await fetchMultiCurrencyEarningsRows([primaryCode, ...otherCodes], gen);
          if (multiRows && Array.isArray(multiRows)) {
            rows.length = 0;
            rows.push(...multiRows);
            paintProgressive();
          }
        }

        if (!multiRows && otherCodes.length) {
          const batchSize = groupAllMode
            ? EARNINGS_KPI_PARALLEL_BATCH_GROUP_ALL
            : EARNINGS_KPI_PARALLEL_BATCH;
          // Progressive pie: paint each settled batch as it lands instead of waiting
          // for every currency's company pack — under Group/Company All each currency
          // costs a full company fan-out, so holding the whole pie hostage to the
          // slowest one made the Currency card the last thing to appear.
          for (let i = 0; i < otherCodes.length; i += batchSize) {
            if (gen !== earningsFetchGenRef.current) return [];
            const batch = otherCodes.slice(i, i + batchSize);
            const settled = await Promise.all(batch.map((code) => resolveCodeEarnings(code)));
            if (gen !== earningsFetchGenRef.current) return [];
            for (const row of settled) {
              if (row) rows.push(row);
            }
            paintProgressive();
          }
        }

        if (gen !== earningsFetchGenRef.current) return [];
        return rows;
      })();

      groupAllEarningsInflightRef.current.set(jobKey, jobPromise);
      try {
        const rows = await jobPromise;
        if (gen !== earningsFetchGenRef.current) return [];
        return Array.isArray(rows) ? rows : [];
      } finally {
        if (groupAllEarningsInflightRef.current.get(jobKey) === jobPromise) {
          groupAllEarningsInflightRef.current.delete(jobKey);
        }
      }
    },
    [
      groupAllMode,
      groupsAllMode,
      selectedGroup,
      tryBuildGroupAllDashboardFromCompanyCaches,
      buildCurrencyRowFromPayload,
      fetchSingleCurrencyEarnings,
      fetchMultiCurrencyEarningsRows,
    ]
  );

  const loadEarningsProgressive = useCallback(
    async (gen, { cacheKey } = {}) => {
      const codes = currenciesRef.current;
      if (codes.length <= 1) return [];

      const primary = currencyCodeRef.current;
      const primaryPayload = dashboardDataRef.current;
      const primaryMetrics =
        primaryPayload != null ? computeCurrencyMetricsFromPayload(primaryPayload) : null;
      const primaryNetProfit = primaryMetrics?.netProfit ?? null;
      const primaryEarnings = primaryMetrics?.earnings ?? null;

      setEarningsByCurrency((prev) => {
        if (dashboardEarningsRowsComplete(prev, codes, primary, primaryEarnings)) return prev;
        return buildSeededEarningsRows(codes, primary, primaryNetProfit, primaryEarnings);
      });
      setEarningsByCurrencyLoading(true);

      const others = codes.filter(
        (code) => String(code).toUpperCase() !== String(primary || "").toUpperCase()
      );

      try {
        let settled = null;
        const multiRows = await fetchMultiCurrencyEarningsRows([primary, ...others], gen);
        if (multiRows && Array.isArray(multiRows)) {
          settled = multiRows;
        } else {
          settled = await runTasksInBatches(
            others,
            EARNINGS_KPI_PARALLEL_BATCH,
            (code) => fetchSingleCurrencyEarnings(code, gen)
          );
        }

        if (gen !== earningsFetchGenRef.current) {
          scheduleIncompleteEarningsRetry(120);
          return [];
        }

        const rows = buildSeededEarningsRows(codes, primary, primaryNetProfit, primaryEarnings).map(
          (row) => {
            if (row.netProfit != null && row.earnings != null) return row;
            const hit = (settled || []).find(
              (entry) =>
                entry &&
                String(entry.code).toUpperCase() === String(row.code).toUpperCase()
            );
            return hit
              ? {
                  code: row.code,
                  netProfit: hit.netProfit ?? row.netProfit,
                  earnings: hit.earnings ?? row.earnings,
                }
              : row;
          }
        );

        const sanitizedRows = sanitizeDuplicateNonPrimaryEarnings(
          rows,
          primary,
          primaryEarnings
        );

        setEarningsByCurrency(sanitizedRows);

        const scopeKey = cacheKey ?? dashboardScopeKey;
        if (
          scopeKey &&
          dashboardEarningsRowsComplete(sanitizedRows, codes, primary, primaryEarnings)
        ) {
          earningsIncompleteRetryRef.current = 0;
          patchDashboardCache(scopeKey, { earnings: sanitizedRows });
          mirrorDashboardEarningsAcrossCurrencies(
            sanitizedRows,
            codes,
            resolveDashboardScopeKey,
            primary,
            primaryEarnings
          );
        } else if (
          !dashboardEarningsRowsComplete(sanitizedRows, codes, primary, primaryEarnings)
        ) {
          scheduleIncompleteEarningsRetry(180);
        }

        return sanitizedRows;
      } finally {
        if (gen === earningsFetchGenRef.current) {
          setEarningsByCurrencyLoading(false);
        }
      }
    },
    [
      computeCurrencyMetricsFromPayload,
      buildSeededEarningsRows,
      fetchSingleCurrencyEarnings,
      fetchMultiCurrencyEarningsRows,
      dashboardScopeKey,
      resolveDashboardScopeKey,
      scheduleIncompleteEarningsRetry,
    ]
  );

  /**
   * Secondary-currency earnings for atomic first paint.
   * Prefers one `currencies=` pack (Company All: C HTTP; single: 1 HTTP); falls back
   * to per-currency only when the multi-currency endpoint is unavailable.
   */
  const fetchEarningsOthersSettled = useCallback(
    (dashboardGen, codes, primaryCode, scopeKeyForGuard = "") => {
      const list = sortCurrencyCodesForBootstrap(Array.isArray(codes) ? codes : []);
      const primary = String(primaryCode || "").trim().toUpperCase();
      const others = list.filter((code) => String(code || "").trim().toUpperCase() !== primary);
      if (others.length === 0) return Promise.resolve([]);

      const guardKey = scopeKeyForGuard || dashboardFetchInFlightScopeRef.current || "parallel";
      earningsParallelInFlightRef.current = guardKey;

      const rowsFromMultiMap = (map) => {
        if (!map || typeof map !== "object") return null;
        const rows = [];
        for (const code of others) {
          const codeUpper = String(code || "").trim().toUpperCase();
          const entry = map[code] ?? map[codeUpper];
          if (!entry || typeof entry !== "object") {
            rows.push({ code, netProfit: null, earnings: null });
            continue;
          }
          if (
            entry.period_total != null ||
            entry.daily_data != null ||
            entry.subsidiary_earnings_by_company != null ||
            entry.has_ownership_setup !== undefined
          ) {
            rows.push(buildCurrencyRowFromPayload(code, entry));
            continue;
          }
          const profit = parseFloat(entry.profit ?? entry.netProfit ?? "0");
          const expenses = parseFloat(entry.expenses ?? "0");
          const net = Number.isFinite(profit - expenses) ? profit - expenses : null;
          rows.push({
            code,
            netProfit: net,
            earnings: Number.isFinite(profit) ? profit : null,
          });
        }
        return rows;
      };

      return (async () => {
        // Prefer one currencies= pack (Company All: C HTTP; single: 1 HTTP) instead of
        // C×(M−1) / (M−1) per-currency fan-out.
        try {
          if (dashboardGen !== dashboardFetchGenRef.current) return [];
          const payload = await loadMergedDashboard(
            dateFromRef.current,
            dateToRef.current,
            null,
            { earningsOnly: true, useActiveScopeAbort: false, currencies: list }
          );
          if (dashboardGen !== dashboardFetchGenRef.current) return [];
          const multiRows = rowsFromMultiMap(payload?.currencies ?? payload?.data?.currencies);
          if (multiRows && multiRows.some((row) => row?.earnings != null || row?.netProfit != null)) {
            return multiRows;
          }
        } catch {
          /* fall back to per-currency */
        }

        return runTasksInBatches(
          others,
          groupAllMode ? EARNINGS_KPI_PARALLEL_BATCH_GROUP_ALL : EARNINGS_KPI_PARALLEL_BATCH,
          async (code) => {
            if (dashboardGen !== dashboardFetchGenRef.current) return null;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              try {
                const payload = await loadMergedDashboard(
                  dateFromRef.current,
                  dateToRef.current,
                  code,
                  { earningsOnly: true, useActiveScopeAbort: false }
                );
                if (dashboardGen !== dashboardFetchGenRef.current) return null;
                return buildCurrencyRowFromPayload(code, payload);
              } catch {
                if (dashboardGen !== dashboardFetchGenRef.current) return null;
              }
            }
            return { code, netProfit: null, earnings: null };
          }
        );
      })().finally(() => {
        if (earningsParallelInFlightRef.current === guardKey) {
          earningsParallelInFlightRef.current = "";
        }
      });
    },
    [groupAllMode, buildCurrencyRowFromPayload, loadMergedDashboard]
  );

  const loadEarningsParallelForAtomicPaint = useCallback(
    async (
      dashboardGen,
      codes,
      primaryCode,
      primaryPayload,
      scopeKeyForGuard = "",
      othersSettledPromise = null
    ) => {
      const list = sortCurrencyCodesForBootstrap(
        Array.isArray(codes) ? codes : []
      );
      if (list.length <= 1) return [];

      const primary = String(primaryCode || "").trim().toUpperCase();
      const primaryMetrics =
        primaryPayload != null ? computeCurrencyMetricsFromPayload(primaryPayload) : null;
      const primaryNetProfit = primaryMetrics?.netProfit ?? null;
      const primaryEarnings = primaryMetrics?.earnings ?? null;

      const settled = await (
        othersSettledPromise ||
        fetchEarningsOthersSettled(dashboardGen, codes, primaryCode, scopeKeyForGuard)
      );

      if (dashboardGen !== dashboardFetchGenRef.current) return [];

      const rows = buildSeededEarningsRows(
        list,
        primary,
        primaryNetProfit,
        primaryEarnings
      ).map((row) => {
        if (
          String(row.code || "").trim().toUpperCase() === primary &&
          primaryNetProfit != null
        ) {
          return row;
        }
        const hit = (settled || []).find(
          (entry) =>
            entry &&
            String(entry.code || "").toUpperCase() === String(row.code || "").toUpperCase()
        );
        return hit
          ? {
              code: row.code,
              netProfit: hit.netProfit ?? row.netProfit,
              earnings: hit.earnings ?? row.earnings,
            }
          : row;
      });

      return sanitizeDuplicateNonPrimaryEarnings(rows, primary, primaryEarnings);
    },
    [
      computeCurrencyMetricsFromPayload,
      buildSeededEarningsRows,
      fetchEarningsOthersSettled,
    ]
  );

  const prefetchDashboardGroupAll = useCallback(
    async (groupKey, { groupsAllMerge = false } = {}) => {
      const g = String(groupKey || "").trim().toUpperCase();
      if (!g && !groupsAllMerge) return;
      const cur = currencyCodeRef.current;
      const rangeFrom = dateFromRef.current;
      const rangeTo = dateToRef.current;
      const scopeKey = resolveDashboardScopeKey({
        companyId: null,
        selectedGroup: groupsAllMerge ? null : g,
        groupsAllMode: groupsAllMerge,
        groupAllMode: true,
        mergedSubsetIds: null,
        currencyCode: cur,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
      });
      if (!scopeKey || getDashboardCache(scopeKey)?.current) return;

      const synthesized = tryBuildGroupAllDashboardFromCompanyCaches({
        selectedGroup: groupsAllMerge ? null : g,
        groupsAllMode: groupsAllMerge,
        groupAllMode: true,
        currencyCode: cur,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
      });
      if (synthesized?.current) {
        setDashboardCache(scopeKey, {
          current: synthesized.current,
          previous: synthesized.previous ?? undefined,
          earnings:
            synthesized.earnings?.length > 1 &&
            synthesized.earnings.every((row) => row.earnings != null)
              ? synthesized.earnings
              : undefined,
        });
        return;
      }

      // Skip N-way merge prefetch — Company All paints from live load or synthesize only.
      return;
    },
    [
      resolveDashboardScopeKey,
      tryBuildGroupAllDashboardFromCompanyCaches,
    ]
  );
  prefetchDashboardGroupAllRef.current = prefetchDashboardGroupAll;

  const fetchEarningsRowsForRange = useCallback(
    async (rangeFrom, rangeTo, gen) => {
      const activeFrom = dateFromRef.current;
      const activeTo = dateToRef.current;
      const activeCurrency = currencyCodeRef.current;
      const reuseMainPayload =
        rangeFrom === activeFrom &&
        rangeTo === activeTo &&
        dashboardDataRef.current != null;

      const settled = await Promise.all(
        currencies.map(async (code) => {
          if (gen !== earningsFetchGenRef.current) return null;
          if (reuseMainPayload && code === activeCurrency) {
            return buildCurrencyRowFromPayload(code, dashboardDataRef.current);
          }
          return fetchSingleCurrencyEarnings(code, gen);
        })
      );

      if (gen !== earningsFetchGenRef.current) return [];

      return settled.filter(Boolean);
    },
    [currencies, buildCurrencyRowFromPayload, fetchSingleCurrencyEarnings]
  );

  const loadEarningsByCurrency = useCallback(async () => {
    const canLoadEarnings =
      (companyId != null || groupAggregateMode || groupAllMode) && currencies.length > 1;
    if (!canLoadEarnings) {
      setEarningsByCurrency([]);
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }

    const cacheKey = dashboardScopeKey;
    if (!cacheKey) return;
    if (earningsLoadInFlightRef.current === cacheKey) return;
    const curSig =
      currencies.length > 1 ? [...currencies].sort().join(",") : String(currencies.length);
    const upgradeKey = `${cacheKey}|${curSig}`;
    if (earningsScopeUpgradeRef.current.scopeKey === upgradeKey) {
      if (earningsScopeUpgradeRef.current.attempts >= EARNINGS_INCOMPLETE_RETRY_MAX) return;
      earningsScopeUpgradeRef.current.attempts += 1;
    } else {
      earningsScopeUpgradeRef.current = { scopeKey: upgradeKey, attempts: 1 };
    }
    earningsLoadInFlightRef.current = cacheKey;
    let gen;
    try {
    const cached = getDashboardCache(cacheKey);
    const sharedEarnings = resolveScopeDashboardEarnings(currencies);
    if (sharedEarnings?.length === currencies.length) {
      setEarningsByCurrency(sharedEarnings);
      setEarningsByCurrencyLoading(false);
      return;
    }

    const canUseDashboardBootstrap =
      !(showAllCurrencies && canShowAllCurrencies) &&
      !(groupsAllMode && !groupAllMode) &&
      !groupAllMode &&
      !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
      (companyId != null || groupAggregateMode);

    gen = ++earningsFetchGenRef.current;
    if (!dashboardDataRef.current) {
      setEarningsByCurrency(currencies.map((code) => ({ code, earnings: null })));
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(true);
    }

    if (canUseDashboardBootstrap && dashboardDataRef.current) {
      try {
        const rows = await loadEarningsProgressive(gen, { cacheKey });
        if (gen !== earningsFetchGenRef.current) {
          deferActiveScopeEarningsUpgrade(200);
          return;
        }
        if (dashboardEarningsRowsComplete(rows, currencies)) return;
      } catch {
        if (gen !== earningsFetchGenRef.current) {
          deferActiveScopeEarningsUpgrade(200);
          return;
        }
        /* fall back to bootstrap batch */
      }
    }

    setEarningsByCurrencyLoading(true);

    if (canUseDashboardBootstrap) {
      if (dashboardBootstrapInFlightRef.current === cacheKey) {
        deferActiveScopeEarningsUpgrade(200);
        return;
      }
      try {
        // Prefer FE-parallel currency captures over one serial PHP currencies= fan-out.
        const rows = await loadEarningsParallelForAtomicPaint(
          dashboardFetchGenRef.current,
          currencies,
          currencyCodeRef.current,
          dashboardDataRef.current
        );
        if (gen !== earningsFetchGenRef.current) {
          deferActiveScopeEarningsUpgrade(200);
          return;
        }
        if (Array.isArray(rows) && rows.length > 1) {
          setEarningsByCurrency(rows);
          mirrorDashboardEarningsAcrossCurrencies(
            rows,
            currencies,
            resolveDashboardScopeKey
          );
        }
        setEarningsByCurrencyLoading(false);
        return;
      } catch {
        if (gen !== earningsFetchGenRef.current) {
          deferActiveScopeEarningsUpgrade(200);
          return;
        }
        /* fall back to legacy per-currency fetch */
      }
    }

    const fetchCurrentRows = groupAllMode
      ? () => fetchGroupAllEarningsRowsForRange(dateFrom, dateTo, gen, currencies)
      : () => fetchEarningsRowsForRange(dateFrom, dateTo, gen);
    const currentRows = await fetchCurrentRows();
    if (gen !== earningsFetchGenRef.current) {
      deferActiveScopeEarningsUpgrade(200);
      return;
    }

    setEarningsByCurrency(currentRows);
    setEarningsByCurrencyLoading(false);
    if (cacheKey && currentRows.length) {
      mirrorDashboardEarningsAcrossCurrencies(
        currentRows,
        currencies,
        resolveDashboardScopeKey
      );
    }

    if (!groupAllMode) {
      const prevRange = previousMonthEquivalentRange(dateFrom, dateTo);
      void fetchEarningsRowsForRange(prevRange.from, prevRange.to, gen)
        .then((prevRows) => {
          if (gen !== earningsFetchGenRef.current) return;
          setEarningsByCurrencyPrev(prevRows);
        })
        .catch(() => {
          if (gen !== earningsFetchGenRef.current) return;
          setEarningsByCurrencyPrev([]);
        });
    }
    } finally {
      if (earningsLoadInFlightRef.current === cacheKey) {
        earningsLoadInFlightRef.current = "";
      }
      // Safety net for the bail-outs above — none of them reset the loading flag
      // themselves, so make sure it never stays stuck true once this attempt (if
      // still current) is done, one way or another.
      if (gen != null && gen === earningsFetchGenRef.current) {
        setEarningsByCurrencyLoading(false);
      }
    }
  }, [
    companyId,
    groupAggregateMode,
    currencies,
    dateFrom,
    dateTo,
    fetchEarningsRowsForRange,
    fetchGroupAllEarningsRowsForRange,
    loadDashboardViaBootstrap,
    loadEarningsProgressive,
    loadEarningsParallelForAtomicPaint,
    dashboardScopeKey,
    resolveDashboardScopeKey,
    resolveScopeDashboardEarnings,
    showAllCurrencies,
    canShowAllCurrencies,
    groupsAllMode,
    groupAllMode,
    mergedSubsetIds,
    deferActiveScopeEarningsUpgrade,
  ]);

  /** Invalidate in-flight per-currency earnings when scope/date changes (not on currency list hydrate). */
  useEffect(() => {
    earningsFetchGenRef.current += 1;
    earningsIncompleteRetryRef.current = 0;
    earningsEnabledGroupIdsRef.current = [];
    earningsScopeUpgradeRef.current = { scopeKey: "", attempts: 0 };
    dashboardFetchFailedScopeRef.current = "";
    dashboardStaleRetryRef.current = { scopeKey: "", attempts: 0 };
    // Earnings rows are keyed by currency CODE, not by scope. Switching to a new
    // date range while the currency set stays the same (the common case — the
    // currency list follows the Group, not the date) left the previous scope's
    // rows sitting in state. Every "is this complete?" check downstream — the
    // thing that decides whether a fresh fetch is even needed — only checks
    // whether each code has a non-null value, not whether that value belongs to
    // the current scope, so it was reading those leftover rows as "already done"
    // and skipping the fetch entirely. Clear them here, immediately, so nothing
    // can be mistaken for current-scope data.
    const codes = currenciesRef.current;
    setEarningsByCurrency(
      codes.length > 1 ? codes.map((code) => ({ code, earnings: null, netProfit: null })) : []
    );
    setEarningsByCurrencyPrev([]);
  }, [dateFrom, dateTo, companyId, selectedGroup, dashboardScopeKey]);

  /** Sync earnings rows when currency list or cache updates — do not abort parallel fetches on hydrate. */
  useEffect(() => {
    // While selected scope is ahead of painted scope, freeze pie/earnings so KPI+chart+pie
    // never show a mixed company (pill/pie first, numbers later).
    if (displayScopeKey && dashboardScopeKey && displayScopeKey !== dashboardScopeKey) {
      prevEarningsCurrenciesSigRef.current = currenciesScopeSig;
      return;
    }

    if (
      prevEarningsCurrenciesSigRef.current !== "" &&
      prevEarningsCurrenciesSigRef.current !== currenciesScopeSig &&
      currenciesScopeSig
    ) {
      earningsFetchGenRef.current += 1;
      // Only clear sibling *display-currency* keys. Never wipe dashboardScopeKey —
      // company switches often change the currency set (AG 6 vs 95 9) and clearing
      // the active scope forced a full earnings refetch on every switch (~0.7–1s).
      clearEarningsFromScopeKeys(listCurrencyScopeKeys(currencies));
    }
    prevEarningsCurrenciesSigRef.current = currenciesScopeSig;

    if (currencies.length <= 1) {
      setEarningsByCurrency([]);
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }
    const primary = currencyCodeRef.current;
    const primaryMetrics = dashboardDataRef.current
      ? computeCurrencyMetricsFromPayload(dashboardDataRef.current)
      : { netProfit: null, earnings: null };
    const primaryNetProfit = primaryMetrics.netProfit;
    const primaryEarnings = primaryMetrics.earnings;
    const scopeEarnings = resolveScopeDashboardEarnings(
      currencies,
      dashboardScopeKey,
      primary,
      primaryEarnings
    );
    if (
      scopeEarnings &&
      dashboardEarningsRowsComplete(scopeEarnings, currencies, primary, primaryEarnings)
    ) {
      setEarningsByCurrency(
        normalizeEarningsRowsForDisplay(
          scopeEarnings,
          primary,
          primaryNetProfit,
          primaryEarnings
        )
      );
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }
    const cached = dashboardScopeKey ? getDashboardCache(dashboardScopeKey) : null;
    const readyEarnings = getCompleteCachedEarnings(
      cached,
      currencies,
      primary,
      primaryEarnings
    );
    if (readyEarnings) {
      setEarningsByCurrency(
        normalizeEarningsRowsForDisplay(
          readyEarnings,
          primary,
          primaryNetProfit,
          primaryEarnings
        )
      );
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }
    if (dashboardDataRef.current) {
      let keepVisible = false;
      setEarningsByCurrency((prev) => {
        if (dashboardEarningsRowsComplete(prev, currencies, primary, primaryEarnings)) {
          keepVisible = true;
          return prev;
        }
        // Keep a partial date-filter paint visible — reseeding would flash the card away.
        if (
          Array.isArray(prev) &&
          prev.some((row) => row?.earnings != null || row?.netProfit != null)
        ) {
          keepVisible = true;
          return prev;
        }
        return buildSeededEarningsRows(currencies, primary, primaryNetProfit, primaryEarnings);
      });
      setEarningsByCurrencyLoading(!keepVisible);
      deferActiveScopeEarningsUpgrade(120);
      return;
    }
    setEarningsByCurrency(currencies.map((code) => ({ code, netProfit: null, earnings: null })));
    setEarningsByCurrencyPrev([]);
    setEarningsByCurrencyLoading(true);
    deferActiveScopeEarningsUpgrade(120);
  }, [
    currenciesScopeSig,
    currencies.length,
    companyId,
    selectedGroup,
    dashboardScopeKey,
    displayScopeKey,
    resolveScopeDashboardEarnings,
    getCompleteCachedEarnings,
    computeCurrencyMetricsFromPayload,
    buildSeededEarningsRows,
    listCurrencyScopeKeys,
    deferActiveScopeEarningsUpgrade,
  ]);

  useEffect(() => {
    const rateBase =
      showAllCurrencies && canShowAllCurrencies ? conversionBaseCurrency : currencyCode;
    // Frankfurter quotes depend on base + quote set + date — not company.
    // Including companyId re-fetched on every pill switch and toggled loading,
    // which collapsed the pie to base-only and jumped the hero total.
    const rateScopeKey = [
      rateBase ?? "",
      [...currencies].sort().join(","),
      dateTo ?? "",
    ].join("|");

    if (!rateBase || currencies.length <= 1) {
      setExchangeRates({
        rates: { [rateBase]: 1 },
        date: null,
        unsupported: [],
        scopeKey: rateScopeKey,
      });
      setExchangeRatesError("");
      setExchangeRatesLoading(false);
      return undefined;
    }

    let cancelled = false;
    const gen = ++exchangeRatesFetchGenRef.current;
    const rateDate = resolveFrankfurterDate(dateTo);
    const cached = peekFrankfurterRatesCache(rateBase, currencies, rateDate);
    const cachedPartial =
      cached && frankfurterRatesPartiallyUsable(rateBase, currencies, cached.rates);
    const cachedComplete =
      cachedPartial && isFrankfurterRatesPayloadComplete(rateBase, currencies, cached);

    if (cachedPartial) {
      setExchangeRates({
        rates: cached.rates,
        date: cached.date,
        unsupported: frankfurterMissingQuotes(rateBase, currencies, cached.rates),
        scopeKey: rateScopeKey,
      });
      setExchangeRatesError("");
      // Keep conversion on while background-filling missing quotes.
      setExchangeRatesLoading(!cachedComplete);
    } else if (displayScopeKeyRef.current) {
      /**
       * Currency swap still painting previous scope: do not blank rates.
       * Wiping here made pie % / hero jump before KPI atomic paint landed.
       * Only mark loading when current rates cannot serve the new quote set.
       */
      const stillUsable = frankfurterRatesPartiallyUsable(
        rateBase,
        currencies,
        exchangeRatesRef.current?.rates || {}
      );
      if (stillUsable) {
        setExchangeRates((prev) => ({ ...prev, scopeKey: rateScopeKey }));
      }
      setExchangeRatesLoading(!stillUsable);
      setExchangeRatesError("");
    } else {
      setExchangeRates({ rates: { [rateBase]: 1 }, date: null, unsupported: [], scopeKey: "" });
      setExchangeRatesLoading(true);
      setExchangeRatesError("");
    }

    (async () => {
      try {
        const { rates, date, unsupported } = await fetchFrankfurterRates(
          rateBase,
          currencies,
          rateDate
        );
        if (cancelled || gen !== exchangeRatesFetchGenRef.current) return;

        const partialUsable = frankfurterRatesPartiallyUsable(rateBase, currencies, rates);
        if (!partialUsable && cachedPartial) {
          return;
        }

        const ratesToUse = partialUsable ? rates : cachedPartial ? cached.rates : rates;
        setExchangeRates({
          rates: ratesToUse,
          date: partialUsable ? date : cachedPartial ? cached.date : date,
          unsupported: partialUsable
            ? unsupported ?? frankfurterMissingQuotes(rateBase, currencies, ratesToUse)
            : frankfurterMissingQuotes(rateBase, currencies, ratesToUse),
          scopeKey: rateScopeKey,
        });
        setExchangeRatesError(partialUsable || cachedPartial ? "" : "failed");
      } catch {
        if (cancelled || gen !== exchangeRatesFetchGenRef.current) return;
        if (cachedPartial) return;
        setExchangeRates({
          rates: { [rateBase]: 1 },
          date: null,
          unsupported: frankfurterMissingQuotes(rateBase, currencies, { [rateBase]: 1 }),
          scopeKey: rateScopeKey,
        });
        setExchangeRatesError("failed");
      } finally {
        if (!cancelled && gen === exchangeRatesFetchGenRef.current) {
          setExchangeRatesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currencyCode,
    currencies,
    dateTo,
    showAllCurrencies,
    canShowAllCurrencies,
    conversionBaseCurrency,
  ]);

  const loadAllCurrenciesDashboard = useCallback(
    async (rangeFrom, rangeTo) => {
      const base = conversionBaseCurrency;
      const rateDate = resolveFrankfurterDate(rangeTo);
      let rates = peekFrankfurterRatesCacheOrDerived(base, currencies, rateDate)?.rates;
      if (!rates || !Object.keys(rates).length) {
        const fx = await fetchFrankfurterRates(base, currencies, rateDate);
        rates = fx.rates;
      }

      const perCurrency = await Promise.all(
        currencies.map(async (code) => {
          const data = await loadMergedDashboard(rangeFrom, rangeTo, code);
          const metrics = computeKpiMetrics(data, selectedGroup, resolveKpiOwnershipOpts());
          return { code, data, metrics };
        })
      );

      const aggregated = sumConvertedKpiMetrics(
        perCurrency.map(({ code, metrics }) => ({ code, ...metrics })),
        base,
        rates
      );
      const baseEntry =
        perCurrency.find((row) => row.code === base) ?? perCurrency[0] ?? null;
      return { data: baseEntry?.data ?? null, metrics: aggregated };
    },
    [conversionBaseCurrency, currencies, loadMergedDashboard, selectedGroup, resolveKpiOwnershipOpts]
  );

  const upgradeActiveScopeEarnings = useCallback(async () => {
    const cacheKey = dashboardScopeKey;
    if (!cacheKey || currencies.length <= 1) return;
    // Group All: dashboardDataRef may not be ready yet but fetchGroupAllEarningsRowsForRange
    // uses per-company cache + fetchSingleCurrencyEarnings as fallback, not dashboardDataRef.
    if (!dashboardDataRef.current && !groupAllMode) return;

    const codes = currenciesRef.current;
    const primary = currencyCodeRef.current;
    const primaryMetrics = computeCurrencyMetricsFromPayload(dashboardDataRef.current);
    const primaryNetProfit = primaryMetrics.netProfit;
    const primaryEarnings = primaryMetrics.earnings;
    const cached = getDashboardCache(cacheKey);
    const readyEarnings = getCompleteCachedEarnings(
      cached,
      codes,
      primary,
      primaryEarnings
    );
    if (readyEarnings) {
      setEarningsByCurrency(
        normalizeEarningsRowsForDisplay(
          readyEarnings,
          primary,
          primaryNetProfit,
          primaryEarnings
        )
      );
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }

    const shared = resolveScopeDashboardEarnings(
      codes,
      cacheKey,
      primary,
      primaryEarnings
    );
    if (shared && dashboardEarningsRowsComplete(shared, codes, primary, primaryEarnings)) {
      setEarningsByCurrency(
        normalizeEarningsRowsForDisplay(shared, primary, primaryNetProfit, primaryEarnings)
      );
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }

    const canUseBootstrap =
      !(showAllCurrencies && canShowAllCurrencies) &&
      !(groupsAllMode && !groupAllMode) &&
      !groupAllMode &&
      !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
      (companyId != null || groupAggregateMode);

    if (!canUseBootstrap) {
      // Non-groupAllMode without bootstrap: bail — earnings need dashboardDataRef.
      if (!groupAllMode) return;
      // Group/Company All: proceed even without dashboardDataRef — per-company cache
      // + fetchSingleCurrencyEarnings fallback don't need it.
      // Company All: prefer company-cache synthesize; cold miss → FE-parallel earnings packs.
      const synthesized = tryBuildGroupAllDashboardFromCompanyCaches({ codes });
      if (
        synthesized?.earnings?.length &&
        dashboardEarningsRowsComplete(
          synthesized.earnings,
          codes,
          primary,
          primaryEarnings
        )
      ) {
        const normalized = normalizeEarningsRowsForDisplay(
          synthesized.earnings,
          primary,
          primaryNetProfit,
          primaryEarnings
        );
        setEarningsByCurrency(normalized);
        setEarningsByCurrencyPrev([]);
        setEarningsByCurrencyLoading(false);
        patchDashboardCache(cacheKey, { earnings: normalized });
        mirrorDashboardEarningsAcrossCurrencies(
          normalized,
          codes,
          resolveDashboardScopeKey,
          primary,
          primaryEarnings
        );
        return;
      }
      // Join in-flight atomic pie job — do not start a second company×currency storm.
      if (
        earningsParallelInFlightRef.current === cacheKey ||
        dashboardFetchInFlightScopeRef.current === cacheKey
      ) {
        deferActiveScopeEarningsUpgrade(200);
        return;
      }
      const existingRows = Array.isArray(earningsByCurrencyRef.current)
        ? earningsByCurrencyRef.current
        : [];
      const hasPartialPaint = existingRows.some(
        (row) => row?.earnings != null || row?.netProfit != null
      );
      if (!hasPartialPaint) {
        setEarningsByCurrency(
          buildSeededEarningsRows(codes, primary, primaryNetProfit, primaryEarnings)
        );
        // Reveal the Currency card immediately with the primary currency's real figures
        // (secondary rows paint "—"), then update as the company×currency packs land —
        // the old behaviour held the card at loading until EVERY currency resolved,
        // which made the pie feel like the slowest part of Group/Company All.
        setEarningsByCurrencyLoading(false);
      } else {
        // Keep partial Currency card visible while gap-fill runs (date-filter path).
        setEarningsByCurrencyLoading(false);
      }
      earningsParallelInFlightRef.current = cacheKey;
      const earnGen = ++earningsFetchGenRef.current;
      try {
        const rows = await fetchGroupAllEarningsRowsForRange(
          dateFromRef.current,
          dateToRef.current,
          earnGen,
          codes
        );
        if (earnGen !== earningsFetchGenRef.current) {
          // A newer attempt superseded this one — don't paint its (possibly stale)
          // result, but still leave a follow-up check scheduled in case that newer
          // attempt doesn't end up settling things either.
          deferActiveScopeEarningsUpgrade(200);
          return;
        }
        if (resolveDashboardScopeKey() !== cacheKey) {
          // Scope moved on while this was in flight — re-check under whatever the
          // live scope is now, rather than silently dropping this attempt.
          deferActiveScopeEarningsUpgrade(200);
          return;
        }
        if (
          Array.isArray(rows) &&
          rows.length > 1 &&
          dashboardEarningsRowsComplete(rows, codes, primary, primaryEarnings)
        ) {
          const normalized = normalizeEarningsRowsForDisplay(
            rows,
            primary,
            primaryNetProfit,
            primaryEarnings
          );
          setEarningsByCurrency(normalized);
          setEarningsByCurrencyPrev([]);
          patchDashboardCache(cacheKey, { earnings: normalized });
          mirrorDashboardEarningsAcrossCurrencies(
            normalized,
            codes,
            resolveDashboardScopeKey,
            primary,
            primaryEarnings
          );
        } else if (Array.isArray(rows) && rows.length > 1) {
          const normalized = normalizeEarningsRowsForDisplay(
            rows,
            primary,
            primaryNetProfit,
            primaryEarnings
          );
          setEarningsByCurrency(normalized);
          setEarningsByCurrencyPrev([]);
          patchDashboardCache(cacheKey, { earnings: normalized });
          scheduleIncompleteEarningsRetry(400);
        }
      } catch {
        if (earnGen === earningsFetchGenRef.current) {
          scheduleIncompleteEarningsRetry(400);
        }
      } finally {
        if (earningsParallelInFlightRef.current === cacheKey) {
          earningsParallelInFlightRef.current = "";
        }
        if (earnGen === earningsFetchGenRef.current) {
          setEarningsByCurrencyLoading(false);
        }
      }
      return;
    }
    // Atomic first paint already fans out light earnings — do not start a second
    // pack while the same scope fetch/parallel job is still running. Defer (do not
    // drop) so seeded MYR + "…" secondaries get filled after in-flight clears.
    if (dashboardBootstrapInFlightRef.current === cacheKey) {
      deferActiveScopeEarningsUpgrade(200);
      return;
    }
    if (dashboardFetchInFlightScopeRef.current === cacheKey) {
      deferActiveScopeEarningsUpgrade(200);
      return;
    }
    if (earningsParallelInFlightRef.current === cacheKey) {
      deferActiveScopeEarningsUpgrade(200);
      return;
    }

    const gen = ++earningsFetchGenRef.current;

    // Gap-fill retry (e.g. one currency came back null on the first pass): if the card
    // is already showing a usable partial paint, don't hide it again while this retry
    // runs in the background — that snap-hide + later bloom-back-in is exactly the
    // "flickers again after it's already fully shown" bug. Only show loading when there
    // is nothing displayable yet. Mirrors the same guard already used in the group_all
    // branch above (`hasPartialPaint`).
    const existingEarningsRows = Array.isArray(earningsByCurrencyRef.current)
      ? earningsByCurrencyRef.current
      : [];
    const hasPartialEarningsPaint = existingEarningsRows.some(
      (row) => row?.earnings != null || row?.netProfit != null
    );

    try {
      if (!hasPartialEarningsPaint) {
        setEarningsByCurrencyLoading(true);
      }
      // FE-parallel kpi/earnings — never bootstrap_scope=earnings&currencies=… (PHP serial).
      const parallelRows = await loadEarningsParallelForAtomicPaint(
        dashboardFetchGenRef.current,
        codes,
        primary,
        dashboardDataRef.current,
        cacheKey
      );
      if (gen !== earningsFetchGenRef.current) return;
      if (Array.isArray(parallelRows) && parallelRows.length > 1) {
        const normalized = normalizeEarningsRowsForDisplay(
          parallelRows,
          primary,
          primaryNetProfit,
          primaryEarnings
        );
        setEarningsByCurrency(normalized);
        setEarningsByCurrencyPrev([]);
        patchDashboardCache(cacheKey, { earnings: normalized });
        mirrorDashboardEarningsAcrossCurrencies(
          normalized,
          codes,
          resolveDashboardScopeKey,
          primary,
          primaryEarnings
        );
        if (dashboardEarningsRowsComplete(normalized, codes, primary, primaryEarnings)) {
          return;
        }
      }

      const rows = await loadEarningsProgressive(gen, { cacheKey });
      if (gen !== earningsFetchGenRef.current) return;
      if (dashboardEarningsRowsComplete(rows, codes)) return;
      scheduleIncompleteEarningsRetry(400);
    } catch {
      if (gen !== earningsFetchGenRef.current) return;
      scheduleIncompleteEarningsRetry(400);
    } finally {
      if (gen === earningsFetchGenRef.current) {
        setEarningsByCurrencyLoading(false);
      }
    }
  }, [
    dashboardScopeKey,
    currencies.length,
    companyId,
    groupAggregateMode,
    showAllCurrencies,
    canShowAllCurrencies,
    groupsAllMode,
    groupAllMode,
    mergedSubsetIds,
    getCompleteCachedEarnings,
    resolveScopeDashboardEarnings,
    loadEarningsParallelForAtomicPaint,
    loadEarningsProgressive,
    resolveDashboardScopeKey,
    scheduleIncompleteEarningsRetry,
    deferActiveScopeEarningsUpgrade,
    computeCurrencyMetricsFromPayload,
    tryBuildGroupAllDashboardFromCompanyCaches,
    buildSeededEarningsRows,
    fetchGroupAllEarningsRowsForRange,
    dateFrom,
    dateTo,
  ]);
  upgradeActiveScopeEarningsRef.current = upgradeActiveScopeEarnings;

  useEffect(() => {
    if (currencies.length <= 1 || !dashboardData) return;
    if (companyId != null && !groupAllMode) return;
    if (!groupAllMode && !(groupsAllMode && !groupAllMode)) return;
    const codes = currenciesRef.current;
    if (dashboardEarningsRowsComplete(earningsByCurrencyRef.current, codes)) return;
    if (earningsByCurrencyLoading) return;
    if (earningsParallelInFlightRef.current) return;
    if (dashboardFetchInFlightScopeRef.current) return;
    void upgradeActiveScopeEarningsRef.current?.();
  }, [
    currencies.length,
    currenciesScopeSig,
    dashboardData,
    groupAllMode,
    groupsAllMode,
    companyId,
    earningsByCurrencyLoading,
  ]);

  const ensureDeferredDashboardLoads = useCallback(
    (cacheKey, cached, multiCurrencyCodes) => {
      if (!cacheKey || cacheKey !== resolveDashboardScopeKey() || !cached?.current) return;

      if (!cached.previous) {
        void loadDashboardPreviousPeriod(cacheKey);
      }
      if (dashboardPayloadNeedsChartDaily(cached.current)) {
        scheduleChartDailyLoad(
          cacheKey,
          resolveDashboardScopeKey,
          loadDashboardChartDaily,
          dateFromRef.current,
          dateToRef.current
        );
      }

      const needsMultiCurrencyEarnings =
        Array.isArray(multiCurrencyCodes) && multiCurrencyCodes.length > 1;
      if (
        needsMultiCurrencyEarnings &&
        !cacheEntryHasFullEarnings(cached, multiCurrencyCodes)
      ) {
        void upgradeActiveScopeEarnings();
      }
    },
    [
      resolveDashboardScopeKey,
      loadDashboardPreviousPeriod,
      loadDashboardChartDaily,
      cacheEntryHasFullEarnings,
      upgradeActiveScopeEarnings,
    ]
  );
  ensureDeferredDashboardLoadsRef.current = ensureDeferredDashboardLoads;

  const loadDashboard = useCallback(async () => {
    if (!dashboardScopeKey) {
      setLoading(false);
      setDashboardData(null);
      setDashboardDataPrev(null);
      setDisplayScopeKey("");
      setMultiCurrencyKpi(null);
      setMultiCurrencyKpiPrev(null);
      return;
    }
    const cacheKey = dashboardScopeKey;
    const structuralKey = dashboardStructuralScopeKey;
    if (dashboardStaleRetryRef.current.scopeKey !== cacheKey) {
      dashboardStaleRetryRef.current = { scopeKey: cacheKey, attempts: 0 };
    }
    const gen = ++dashboardFetchGenRef.current;
    if (dashboardFetchStructuralScopeRef.current !== structuralKey) {
      dashboardFetchAbortRef.current?.abort();
      ++previousPeriodFetchGenRef.current;
      previousPeriodInFlightRef.current = "";
      ++chartDailyFetchGenRef.current;
      chartDailyInFlightRef.current = "";
      dashboardFetchInFlightScopeRef.current = "";
      dashboardBootstrapInFlightRef.current = "";
      dashboardFetchStructuralScopeRef.current = structuralKey;
      dashboardFetchScopeRef.current = cacheKey;
      dashboardFetchAbortRef.current = new AbortController();
    } else if (dashboardFetchScopeRef.current !== cacheKey) {
      const scopeSliceOnlyChange =
        dashboardFetchStructuralScopeRef.current === structuralKey;
      if (!scopeSliceOnlyChange) {
        dashboardFetchAbortRef.current?.abort();
        dashboardFetchAbortRef.current = new AbortController();
      }
      dashboardFetchScopeRef.current = cacheKey;
    } else if (
      !dashboardFetchAbortRef.current ||
      dashboardFetchAbortRef.current.signal.aborted
    ) {
      dashboardFetchAbortRef.current = new AbortController();
    }
    let cached = getDashboardCache(cacheKey);
    if (!cached?.current) {
      const hydrated = resolveScopePayloadHydration();
      if (hydrated?.current) {
        cached = hydrated;
        setDashboardCache(cacheKey, cached);
      }
    }
    const allCurrenciesActive = showAllCurrencies && canShowAllCurrencies;
    const codesForEarnings = resolveCodesForEarningsBootstrap();
    const multiCurrencyCodes =
      (Array.isArray(codesForEarnings) && codesForEarnings.length > 1
        ? codesForEarnings
        : null) ?? (currenciesRef.current.length > 1 ? currenciesRef.current : null);
    const needsMultiCurrencyEarnings =
      Array.isArray(multiCurrencyCodes) && multiCurrencyCodes.length > 1;
    setLoadError("");

    const requirePieEarly = dashboardRequiresPieAtomicPaint(
      displayScopeKeyRef.current,
      cacheKey
    );
    const paintEmptyDashboardScope = () => {
      const empty = buildEmptyDashboardPayload(dateFrom, dateTo);
      setMultiCurrencyKpi(null);
      setMultiCurrencyKpiPrev(null);
      setDashboardData(empty);
      dashboardDataRef.current = empty;
      setDashboardDataPrev(null);
      setDisplayScopeKey(cacheKey);
      setEarningsByCurrency([]);
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      setDashboardCache(cacheKey, { current: empty, previous: null });
      setLoading(false);
    };
    // Company switch: wait until currency list is known before atomic paint.
    // Empty [] in the map means "confirmed no currencies" — paint zeros, do not spin forever.
    if (
      requirePieEarly &&
      !groupAllMode &&
      companyId != null &&
      !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
      !allCurrenciesActive
    ) {
      const currencyState = companyCurrencyCacheState(currenciesByCompanyRef.current, companyId);
      if (currencyState === "pending") {
        setLoading(true);
        return;
      }
      if (currencyState === "empty") {
        paintEmptyDashboardScope();
        return;
      }
      const cachedCodes = currenciesByCompanyRef.current.get(parseInt(companyId, 10));
      if (
        Array.isArray(cachedCodes) &&
        cachedCodes.length > 1 &&
        !(Array.isArray(codesForEarnings) && codesForEarnings.length > 1)
      ) {
        setLoading(true);
        return;
      }
    }

    /** Paint cache when chart (+ on scope swap, pie) are ready — freeze prior UI until then. */
    const materializeCachedDashboard = async (entry) => {
      if (!entry?.current) return false;
      let currentCached = entry.current;
      let previousCached = entry.previous ?? null;
      let earningsCached = getCompleteCachedEarnings(entry, multiCurrencyCodes);
      const requirePie = dashboardRequiresPieAtomicPaint(
        displayScopeKeyRef.current,
        cacheKey
      );

      if (dashboardPayloadNeedsChartDaily(currentCached)) {
        try {
          const chartBoot = await loadDashboardViaBootstrap({
            scope: "chart",
            currencyCodesOverride: [],
          });
          if (gen !== dashboardFetchGenRef.current) return false;
          const withDaily = chartBoot?.current?.daily_data
            ? { ...currentCached, daily_data: chartBoot.current.daily_data }
            : currentCached;
          currentCached = markDashboardChartSettled(
            applyDashboardPayloadAdjustments(withDaily, companyId, selectedGroup)
          );
        } catch {
          currentCached = markDashboardChartSettled(currentCached);
        }
      } else {
        currentCached = markDashboardChartSettled(currentCached);
      }

      if (needsMultiCurrencyEarnings && !earningsCached) {
        try {
          const rows = await loadEarningsParallelForAtomicPaint(
            gen,
            multiCurrencyCodes,
            currencyCodeRef.current,
            currentCached,
            cacheKey
          );
          if (gen !== dashboardFetchGenRef.current) return false;
          if (dashboardEarningsRowsComplete(rows, multiCurrencyCodes)) {
            earningsCached = rows;
          } else if (requirePie) {
            // Cache hit must stay atomic (incl. Company All) — avoid painting empty/zero
            // KPI from incomplete cache before live merge lands.
            setLoading(true);
            return false;
          }
        } catch {
          if (requirePie) {
            setLoading(true);
            return false;
          }
          void upgradeActiveScopeEarnings();
        }
      }

      if (!previousCached && !allCurrenciesActive) {
        // MoM is optional — never block atomic KPI/trend/pie on previous-period fetch.
        void loadDashboardViaBootstrap({ scope: "previous" })
          .then((prevBoot) => {
            if (gen !== dashboardFetchGenRef.current) return;
            if (!prevBoot?.previous) return;
            setDashboardDataPrev(prevBoot.previous);
            patchDashboardCache(cacheKey, { previous: prevBoot.previous });
          })
          .catch(() => {});
      }

      setDashboardData(currentCached);
      dashboardDataRef.current = currentCached;
      setDashboardDataPrev(previousCached);
      setDisplayScopeKey(cacheKey);
      if (earningsCached) {
        setEarningsByCurrency(earningsCached);
        setEarningsByCurrencyPrev([]);
        setEarningsByCurrencyLoading(false);
      } else if (needsMultiCurrencyEarnings) {
        const primary = currencyCodeRef.current;
        const metrics = computeCurrencyMetricsFromPayload(currentCached);
        setEarningsByCurrency(
          buildSeededEarningsRows(
            multiCurrencyCodes,
            primary,
            metrics.netProfit,
            metrics.earnings
          )
        );
        setEarningsByCurrencyLoading(true);
        deferActiveScopeEarningsUpgrade(120);
      } else {
        setEarningsByCurrencyLoading(false);
      }
      if (entry.multiCurrencyKpi) setMultiCurrencyKpi(entry.multiCurrencyKpi);
      if (entry.multiCurrencyKpiPrev) setMultiCurrencyKpiPrev(entry.multiCurrencyKpiPrev);
      if (!allCurrenciesActive) {
        setMultiCurrencyKpi(null);
        setMultiCurrencyKpiPrev(null);
      }
      patchDashboardCache(cacheKey, {
        current: currentCached,
        previous: previousCached,
        earnings: earningsCached || undefined,
      });
      setLoading(false);
      return true;
    };

    const dateScopeChanged =
      Boolean(displayScopeKeyRef.current) &&
      !cacheKeysShareDateRange(displayScopeKeyRef.current, cacheKey);

    if (
      cached?.current &&
      !(groupAllMode && dateScopeChanged) &&
      dashboardPayloadRangeMatches(cached.current, dateFrom, dateTo)
    ) {
      if (await materializeCachedDashboard(cached)) return;
      // Incomplete multi-currency pie — fall through to network bootstrap.
    }

    // Seed session cache only — do not paint partial KPI/chart (keeps previous company until ready).
    // On date-range change while Company All is active, skip synthesize — force group_all network pack.
    if (groupAllMode && !dateScopeChanged) {
      const synthesized = tryBuildGroupAllDashboardFromCompanyCaches();
      if (synthesized?.current) {
        const cacheEntry = {
          current: stampDashboardPayloadRange(synthesized.current, dateFrom, dateTo),
          previous: synthesized.previous
            ? stampDashboardPayloadRange(synthesized.previous, dateFrom, dateTo)
            : undefined,
          earnings:
            synthesized.earnings?.length > 1 &&
            synthesized.earnings.every((row) => row.earnings != null)
              ? synthesized.earnings
              : undefined,
        };
        setDashboardCache(cacheKey, cacheEntry);
      }
    }

    const scopeEarningsReady =
      !needsMultiCurrencyEarnings ||
      resolveScopeDashboardEarnings(codesForEarnings || currenciesRef.current, cacheKey)?.length ===
        codesForEarnings?.length;
    if (
      !allCurrenciesActive &&
      !groupAllMode &&
      !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
      scopeEarningsReady
    ) {
      if (companyId != null) {
        const provisionalCur = resolveProvisionalDashboardCurrency({
          currencyCode,
          companyId,
          currenciesRef,
          currenciesByCompanyRef,
        });
        const q = new URLSearchParams({
          date_from: dateFrom,
          date_to: dateTo,
          company_id: String(companyId),
        });
        if (provisionalCur) q.append("currency", provisionalCur);
        appendDashboardGroupTabParams(q, dashboardViewGroup, {
          subsidiaryOnly: subsidiaryDashboardScope,
        });
        const payload = getDashboardPayloadCache(q.toString());
        if (payload && dashboardPayloadRangeMatches(payload, dateFrom, dateTo)) {
          const adjusted = applyDashboardPayloadAdjustments(payload, companyId, selectedGroup);
          setDashboardCache(cacheKey, {
            current: stampDashboardPayloadRange(adjusted, dateFrom, dateTo),
            previous: getDashboardCache(cacheKey)?.previous,
          });
        }
      } else if (usesGroupLedgerDashboard && selectedGroup) {
        const q = new URLSearchParams({
          date_from: dateFrom,
          date_to: dateTo,
        });
        appendGroupLedgerDashboardParams(q, selectedGroup);
        if (currencyCode) q.append("currency", currencyCode);
        const payload = getDashboardPayloadCache(q.toString());
        if (payload && dashboardPayloadRangeMatches(payload, dateFrom, dateTo)) {
          setDashboardCache(cacheKey, {
            current: stampDashboardPayloadRange(payload, dateFrom, dateTo),
            previous: getDashboardCache(cacheKey)?.previous,
          });
        }
      }
    }

    if (!dashboardDataRef.current) {
      setLoading(true);
      setDashboardData(null);
      setDashboardDataPrev(null);
      setDisplayScopeKey("");
      setMultiCurrencyKpi(null);
      setMultiCurrencyKpiPrev(null);
    } else {
      setLoading(true);
    }

    const warmedGroupAll = groupAllMode ? getDashboardCache(cacheKey) : null;
    const latestCached = getDashboardCache(cacheKey);
    if (
      latestCached?.current &&
      !(groupAllMode && dateScopeChanged) &&
      dashboardPayloadRangeMatches(latestCached.current, dateFrom, dateTo)
    ) {
      if (await materializeCachedDashboard(latestCached)) return;
    }

    const needsDashboardFetch =
      !getDashboardCache(cacheKey)?.current ||
      (groupAllMode &&
        dateScopeChanged &&
        !dashboardPayloadRangeMatches(getDashboardCache(cacheKey)?.current, dateFrom, dateTo));
    const scopeNeedsCurrency = dashboardScopeNeedsCurrency({
      companyId,
      usesGroupLedgerDashboard,
      groupAllMode,
      groupsAllMode,
      mergedSubsetIds,
    });
    const provisionalCurrency = resolveProvisionalDashboardCurrency({
      currencyCode,
      companyId,
      currenciesRef,
      currenciesByCompanyRef,
    });
    if (needsDashboardFetch && scopeNeedsCurrency && !provisionalCurrency) {
      const currencyState = companyCurrencyCacheState(currenciesByCompanyRef.current, companyId);
      if (currencyState === "empty") {
        paintEmptyDashboardScope();
        return;
      }
      setLoading(true);
      return;
    }

    try {
      dashboardFetchInFlightScopeRef.current = cacheKey;
      let current;
      let currentKpi = null;
      const canUseDashboardBootstrap =
        !allCurrenciesActive &&
        !(groupsAllMode && !groupAllMode) &&
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
        (companyId != null || groupAggregateMode);

      if (canUseDashboardBootstrap) {
        try {
          // Atomic paint: kpi + chart + parallel multi-currency earnings (+ FX) before swap.
          const longRange = shouldAggregateChartByMonth(dateFrom, dateTo);
          const requirePie = dashboardRequiresPieAtomicPaint(
            displayScopeKeyRef.current,
            cacheKey
          );
          const primaryBootstrapScope = longRange ? "full" : "kpi";
          // Short ranges: fire chart alongside KPI instead of after it settles — same
          // start time as the primary request, not a deferred follow-up. Long ranges
          // already get chart bundled into "full" so there's nothing extra to start.
          const chartBootPromise =
            primaryBootstrapScope === "kpi"
              ? loadDashboardViaBootstrap({ scope: "chart", currencyCodesOverride: [] }).catch(
                  () => null
                )
              : null;
          const bootPromise = loadDashboardViaBootstrap({
            scope: primaryBootstrapScope,
            currencyOverride: provisionalCurrency || undefined,
            // Empty array: keep primary KPI/chart on one currency. Pie uses a separate
            // dashboard_api `currencies=` pack (in-process ~200ms) — not bootstrap's
            // serial secondary loop and not M−1 HTTPS round-trips.
            currencyCodesOverride: [],
          });

          // Currency card: one multi-currency pack (staggered so KPI/chart claim the
          // connection first). Falls back to per-currency only if that pack fails.
          //
          // Claim the in-flight guard NOW, not only once the timer fires — otherwise
          // `paintBootstrap()`'s seed branch below (`void upgradeActiveScopeEarnings()`,
          // which runs synchronously, no delay) checks the guard before this timer has
          // set it, doesn't see anything in flight, and starts its own duplicate fetch.
          // Both eventually resolve and paint — the second one lands after the card is
          // already showing, snap-hides it back to loading, then blooms in again a beat
          // later, which is the currency-card "flicker after it's already up" bug.
          if (needsMultiCurrencyEarnings) {
            earningsParallelInFlightRef.current = cacheKey;
          }
          const othersSettledPromise = needsMultiCurrencyEarnings
            ? new Promise((resolve) => {
                window.setTimeout(() => {
                  resolve(
                    fetchEarningsOthersSettled(
                      gen,
                      codesForEarnings || currenciesRef.current,
                      currencyCodeRef.current || provisionalCurrency,
                      cacheKey
                    )
                  );
                }, EARNINGS_OTHERS_STAGGER_MS);
              })
            : null;

          const boot = await bootPromise;
          if (gen !== dashboardFetchGenRef.current) return;

          let currentPayload = boot.current;
          let previousPayload = boot.previous ?? null;
          let earningsCurrent = Array.isArray(boot?.earningsCurrent) ? boot.earningsCurrent : null;
          let earningsPrevious = Array.isArray(boot?.earningsPrevious) ? boot.earningsPrevious : null;

          if (currentPayload) {
            currentPayload = applyDashboardPayloadAdjustments(
              currentPayload,
              companyId,
              selectedGroup
            );
            // `full` already includes chart series (possibly empty) — settle so zero-data
            // companies do not wait forever on a deferred chart bootstrap.
            if (
              longRange ||
              primaryBootstrapScope === "full" ||
              !dashboardPayloadNeedsChartDaily(currentPayload)
            ) {
              currentPayload = markDashboardChartSettled(currentPayload);
            }
          }

          const paintBootstrap = () => {
            if (!currentPayload || dashboardPayloadNeedsChartDaily(currentPayload)) return false;
            const pieCodes = codesForEarnings || currenciesRef.current;
            // KPI/chart paint the instant their own data is ready — never wait on the
            // Currency card's multi-currency earnings breakdown. When earnings aren't
            // ready yet, this falls into the "seed placeholder rows, resolve in the
            // background" branch below instead of blocking the whole paint.
            current = currentPayload;
            setMultiCurrencyKpi(null);
            setMultiCurrencyKpiPrev(null);
            setDashboardData(current);
            dashboardDataRef.current = current;
            setDashboardDataPrev(previousPayload);
            setDisplayScopeKey(cacheKey);

            const cacheEntry = {
              current,
              previous: previousPayload,
              multiCurrencyKpi: null,
              multiCurrencyKpiPrev: null,
            };

            if (Array.isArray(earningsCurrent) && earningsCurrent.length > 1) {
              setEarningsByCurrency(earningsCurrent);
              setEarningsByCurrencyPrev(earningsPrevious ?? []);
              setEarningsByCurrencyLoading(false);
              cacheEntry.earnings = earningsCurrent;
              mirrorDashboardEarningsAcrossCurrencies(
                earningsCurrent,
                pieCodes,
                resolveDashboardScopeKey
              );
            } else if (needsMultiCurrencyEarnings) {
              // Same-scope refresh may paint KPI/chart with seeded pie; upgrade fills after.
              const primary = currencyCodeRef.current;
              const metrics = computeCurrencyMetricsFromPayload(current);
              setEarningsByCurrency(
                buildSeededEarningsRows(pieCodes, primary, metrics.netProfit, metrics.earnings)
              );
              setEarningsByCurrencyLoading(true);
              void upgradeActiveScopeEarnings();
            } else {
              setEarningsByCurrencyLoading(false);
            }

            setDashboardCache(cacheKey, cacheEntry);
            setLoading(false);
            return true;
          };

          // Paint as early as possible — KPI/chart no longer wait on pie/earnings, so this
          // succeeds on a scope swap too whenever chart data already came bundled (`full`).
          paintBootstrap();

          const panelTasks = [];

          // MoM previous is optional — never block KPI/trend/pie on it.
          const fillPrevious = async () => {
            try {
              const prevBoot = await loadDashboardViaBootstrap({ scope: "previous" });
              if (gen !== dashboardFetchGenRef.current) return;
              if (!prevBoot?.previous) return;
              previousPayload = prevBoot.previous;
              setDashboardDataPrev(previousPayload);
              patchDashboardCache(cacheKey, { previous: previousPayload });
            } catch {
              /* MoM optional */
            }
          };
          if (!previousPayload) {
            if (requirePie) {
              void fillPrevious();
            } else {
              panelTasks.push(fillPrevious);
            }
          }

          if (dashboardPayloadNeedsChartDaily(currentPayload) && chartBootPromise) {
            panelTasks.push(
              (async () => {
                try {
                  const chartBoot = await chartBootPromise;
                  if (gen !== dashboardFetchGenRef.current) return;
                  const withDaily = chartBoot?.current?.daily_data
                    ? { ...currentPayload, daily_data: chartBoot.current.daily_data }
                    : currentPayload;
                  currentPayload = markDashboardChartSettled(
                    applyDashboardPayloadAdjustments(withDaily, companyId, selectedGroup)
                  );
                  paintBootstrap();
                } catch {
                  currentPayload = markDashboardChartSettled(currentPayload);
                  paintBootstrap();
                }
              })()
            );
          }

          if (
            needsMultiCurrencyEarnings &&
            !(Array.isArray(earningsCurrent) && earningsCurrent.length > 1)
          ) {
            panelTasks.push(
              (async () => {
                try {
                  const rows = await loadEarningsParallelForAtomicPaint(
                    gen,
                    codesForEarnings || currenciesRef.current,
                    currencyCodeRef.current || provisionalCurrency,
                    currentPayload,
                    cacheKey,
                    othersSettledPromise
                  );
                  if (gen !== dashboardFetchGenRef.current) return;
                  if (Array.isArray(rows) && rows.length > 1) {
                    earningsCurrent = rows;
                    if (!requirePie) {
                      setEarningsByCurrency(rows);
                      setEarningsByCurrencyLoading(false);
                      patchDashboardCache(cacheKey, { earnings: rows });
                      mirrorDashboardEarningsAcrossCurrencies(
                        rows,
                        codesForEarnings || currenciesRef.current,
                        resolveDashboardScopeKey
                      );
                    }
                  }
                } catch {
                  /* Pie fills later if needed */
                }
              })()
            );
          }

          // Warm FX off the critical path — never block KPI/chart/pie paint on rates
          // (USDT/crypto base used to 422/502 and stall atomic paint).
          if (needsMultiCurrencyEarnings) {
            void (async () => {
              try {
                const rateBase = String(
                  currencyCodeRef.current || provisionalCurrency || ""
                ).trim().toUpperCase();
                const pieCodes = codesForEarnings || currenciesRef.current;
                if (!rateBase || !Array.isArray(pieCodes) || pieCodes.length <= 1) return;
                const rateDate = resolveFrankfurterDate(dateTo);
                const cachedFx = peekFrankfurterRatesCache(rateBase, pieCodes, rateDate);
                if (
                  cachedFx &&
                  isFrankfurterRatesPayloadComplete(rateBase, pieCodes, cachedFx)
                ) {
                  return;
                }
                await fetchFrankfurterRates(rateBase, pieCodes, rateDate);
              } catch {
                /* FX optional — pie can show native until rates arrive */
              }
            })();
          }

          if (panelTasks.length) {
            await Promise.all(panelTasks);
            if (gen !== dashboardFetchGenRef.current) return;
          }

          // Recompute readiness after fills (earningsCurrent may have updated).
          let painted = paintBootstrap();
          // Empty ledger: chart series may still look "unsettled" — force settle once.
          if (!painted && currentPayload && dashboardPayloadNeedsChartDaily(currentPayload)) {
            currentPayload = markDashboardChartSettled(currentPayload);
            painted = paintBootstrap();
          }
          if (requirePie && !painted) {
            // paintBootstrap() only fails here if chart data itself still isn't settled
            // (pie/earnings no longer gate this) — keep the previous company UI until it is.
            // Single-currency first paint with a payload: exit skeleton (zeros OK).
            if (!dashboardDataRef.current && currentPayload && !needsMultiCurrencyEarnings) {
              currentPayload = markDashboardChartSettled(currentPayload);
              if (paintBootstrap()) return;
              paintEmptyDashboardScope();
              return;
            }
            setLoading(true);
            // Pie/earnings still incomplete after the parallel fan-out (e.g. one of several
            // currency fetches failed) — always schedule a follow-up check here. Otherwise
            // this dead-ends with nothing left watching to retry it.
            deferActiveScopeEarningsUpgrade(200);
            return;
          }
          return;
        } catch {
          /* Fall back to legacy per-endpoint loading. */
        } finally {
          if (dashboardBootstrapInFlightRef.current === cacheKey) {
            dashboardBootstrapInFlightRef.current = "";
          }
        }
      }

      if (allCurrenciesActive) {
        const currentBundle = await loadAllCurrenciesDashboard(dateFrom, dateTo);
        if (gen !== dashboardFetchGenRef.current) return;
        current = currentBundle.data;
        currentKpi = currentBundle.metrics;
        setMultiCurrencyKpi(currentKpi);
        setDashboardData(current);
        setDisplayScopeKey(cacheKey);
        setLoading(false);
        patchDashboardCache(cacheKey, {
          current,
          multiCurrencyKpi: currentKpi,
          multiCurrencyKpiPrev: cached?.multiCurrencyKpiPrev ?? null,
        });

        const prevRange = previousMonthEquivalentRange(dateFrom, dateTo);
        void loadAllCurrenciesDashboard(prevRange.from, prevRange.to)
          .then((prevBundle) => {
            if (gen !== dashboardFetchGenRef.current) return;
            setDashboardDataPrev(prevBundle.data);
            setMultiCurrencyKpiPrev(prevBundle.metrics);
            patchDashboardCache(cacheKey, {
              current,
              previous: prevBundle.data,
              multiCurrencyKpi: currentKpi,
              multiCurrencyKpiPrev: prevBundle.metrics,
            });
          })
          .catch(() => {
            if (gen !== dashboardFetchGenRef.current) return;
            setDashboardDataPrev(null);
            setMultiCurrencyKpiPrev(null);
          });
        return;
      } else {
        setMultiCurrencyKpi(null);
        setMultiCurrencyKpiPrev(null);
        const cachedGroupAll = groupAllMode ? getDashboardCache(cacheKey)?.current : null;
        const preloadedGroupAll =
          cachedGroupAll &&
          !dateScopeChanged &&
          dashboardPayloadRangeMatches(cachedGroupAll, dateFrom, dateTo)
            ? cachedGroupAll
            : null;
        if (preloadedGroupAll) {
          current = preloadedGroupAll;
        } else {
          current = await loadMergedDashboard(dateFrom, dateTo, currencyCode);
          if (current) {
            current = stampDashboardPayloadRange(current, dateFrom, dateTo);
          }
        }
        if (gen !== dashboardFetchGenRef.current) return;

        const codesForPie = codesForEarnings || currenciesRef.current;
        let bootEarnings = current?._group_all_earnings_by_currency;
        // Prefer cache synthesize for pie when available.
        if (
          needsMultiCurrencyEarnings &&
          !(
            Array.isArray(bootEarnings) &&
            bootEarnings.length > 1 &&
            dashboardEarningsRowsComplete(bootEarnings, codesForPie)
          )
        ) {
          const synthesized = tryBuildGroupAllDashboardFromCompanyCaches();
          if (
            synthesized?.earnings?.length > 1 &&
            dashboardEarningsRowsComplete(synthesized.earnings, codesForPie)
          ) {
            bootEarnings = synthesized.earnings;
          }
        }
        let pieReady =
          !needsMultiCurrencyEarnings ||
          (Array.isArray(bootEarnings) &&
            bootEarnings.length > 1 &&
            dashboardEarningsRowsComplete(bootEarnings, codesForPie));

        // Paint KPI/chart the instant their own payload is ready — never wait on the
        // Currency card's pie/earnings breakdown (that used to hold up the whole page's
        // skeleton: "never swap KPI/chart ahead of complete pie"). The Currency card
        // resolves on its own below and reveals as one atomic unit whenever it lands.
        setDashboardData(current);
        dashboardDataRef.current = current;
        setDisplayScopeKey(cacheKey);
        setLoading(false);

        const cachePatch = {
          current,
          previous: warmedGroupAll?.previous ?? cached?.previous ?? null,
        };

        const applyEarningsPaint = (rows) => {
          setEarningsByCurrency(rows);
          setEarningsByCurrencyPrev([]);
          setEarningsByCurrencyLoading(false);
          mirrorDashboardEarningsAcrossCurrencies(rows, codesForPie, resolveDashboardScopeKey);
          const earningsCachePatch = { earnings: rows };
          // Drop ephemeral merge hint before caching the KPI payload.
          if (current && current._group_all_earnings_by_currency) {
            const { _group_all_earnings_by_currency: _drop, ...rest } = current;
            current = stampDashboardPayloadRange(rest, dateFrom, dateTo);
            earningsCachePatch.current = current;
            setDashboardData(current);
            dashboardDataRef.current = current;
          }
          patchDashboardCache(cacheKey, earningsCachePatch);
        };

        if (groupAllMode && needsMultiCurrencyEarnings) {
          if (pieReady && Array.isArray(bootEarnings)) {
            // Already have complete pie data (cache/synthesis) — paint together, now.
            applyEarningsPaint(bootEarnings);
            cachePatch.current = current;
          } else {
            // Currency card lags behind — resolve it independently so it never blocks
            // the KPI/chart paint above. Seed primary so the reveal gate can pass once
            // loading clears even if secondaries stay null after date-range fan-out.
            const seedMetrics = computeCurrencyMetricsFromPayload(current);
            setEarningsByCurrency(
              buildSeededEarningsRows(
                codesForPie,
                currencyCode,
                seedMetrics.netProfit,
                seedMetrics.earnings
              )
            );
            setEarningsByCurrencyLoading(true);
            const earningsGen = gen;
            (async () => {
              let painted = false;
              try {
                const rows = await loadEarningsParallelForAtomicPaint(
                  earningsGen,
                  codesForPie,
                  currencyCode,
                  current,
                  cacheKey
                );
                if (
                  earningsGen === dashboardFetchGenRef.current &&
                  Array.isArray(rows) &&
                  rows.length > 1
                ) {
                  // Paint complete OR partial — waiting only for a full board left the
                  // card opacity-0 after date filters when any secondary currency lagged.
                  applyEarningsPaint(rows);
                  painted = true;
                  if (!dashboardEarningsRowsComplete(rows, codesForPie)) {
                    deferActiveScopeEarningsUpgrade(200);
                  }
                }
              } catch {
                /* pie remains incomplete — retry below rather than leave loading stuck */
              }
              if (!painted) {
                // Always reschedule, even if this attempt was superseded by a newer
                // scope fetch — otherwise earningsByCurrencyLoading is left stuck true
                // forever with nothing left watching to retry it. upgradeActiveScopeEarnings
                // re-reads live state at call time, so it safely no-ops if a newer attempt
                // already resolved things.
                deferActiveScopeEarningsUpgrade(200);
              }
            })();
          }
        }

        // Group-ledger ownership enrich after paint (was on critical path before).
        if (
          groupAllMode &&
          selectedGroup &&
          canAccessGroupLedgerForGroup(meRef.current, selectedGroup, companies)
        ) {
          const enrichBase = current;
          const enrichScopeKey = cacheKey;
          // Prefetch-style abort=false — active-scope abort can silently skip ledger enrich.
          void enrichGroupAllMergedDashboard(
            enrichBase,
            dateFrom,
            dateTo,
            currencyCode,
            selectedGroup,
            false
          ).then((enriched) => {
            if (gen !== dashboardFetchGenRef.current) return;
            if (resolveDashboardScopeKey() !== enrichScopeKey) return;
            if (!enriched || enriched === enrichBase) return;
            const stamped = stampDashboardPayloadRange(enriched, dateFrom, dateTo);
            setDashboardData(stamped);
            dashboardDataRef.current = stamped;
            patchDashboardCache(enrichScopeKey, { current: stamped });
          });
        }

        if (cachePatch.previous) {
          setDashboardDataPrev(cachePatch.previous);
        } else if (groupAllMode) {
          const prevRange = previousMonthEquivalentRange(dateFrom, dateTo);
          const prevSynth = tryBuildGroupAllDashboardFromCompanyCaches({
            dateFrom: prevRange.from,
            dateTo: prevRange.to,
          });
          if (prevSynth?.current) {
            cachePatch.previous = prevSynth.current;
            setDashboardDataPrev(prevSynth.current);
          } else {
            setDashboardDataPrev(null);
          }
          // Do not N-merge previous period — MoM is optional and was the All storm.
        } else {
          const prevRange = previousMonthEquivalentRange(dateFrom, dateTo);
          void loadMergedDashboard(prevRange.from, prevRange.to, currencyCode)
            .then((previous) => {
              if (gen !== dashboardFetchGenRef.current) return;
              setDashboardDataPrev(previous);
              patchDashboardCache(cacheKey, { ...cachePatch, previous });
            })
            .catch(() => {
              if (gen !== dashboardFetchGenRef.current) return;
              setDashboardDataPrev(null);
            });
        }

        patchDashboardCache(cacheKey, cachePatch);
        return;
      }
    } catch (e) {
      if (gen !== dashboardFetchGenRef.current) return;
      if (isBenignFetchError(e)) {
        if (dashboardDataRef.current) setLoading(false);
        return;
      }
      dashboardFetchFailedScopeRef.current = cacheKey;
      setLoadError(e.message || i18n.failedToLoadDashboard);
      setDisplayScopeKey(cacheKey);
      if (!cached?.current) {
        setDashboardData(null);
        setDashboardDataPrev(null);
        setMultiCurrencyKpi(null);
        setMultiCurrencyKpiPrev(null);
      }
    } finally {
      if (dashboardFetchInFlightScopeRef.current === cacheKey) {
        dashboardFetchInFlightScopeRef.current = "";
      }
      if (gen === dashboardFetchGenRef.current) {
        setLoading(false);
        if (dashboardDataRef.current) {
          dashboardFetchFailedScopeRef.current = "";
          dashboardStaleRetryRef.current = { scopeKey: cacheKey, attempts: 0 };
          // Fetch guard cleared — resume any pie fill that bounced off in-flight.
          const codes = currenciesRef.current;
          if (
            codes.length > 1 &&
            !dashboardEarningsRowsComplete(earningsByCurrencyRef.current, codes)
          ) {
            deferActiveScopeEarningsUpgrade(80);
          }
        }
      } else if (
        !dashboardDataRef.current &&
        resolveDashboardScopeKey() === cacheKey &&
        dashboardFetchFailedScopeRef.current !== cacheKey
      ) {
        if (dashboardStaleRetryRef.current.scopeKey !== cacheKey) {
          dashboardStaleRetryRef.current = { scopeKey: cacheKey, attempts: 0 };
        }
        if (dashboardStaleRetryRef.current.attempts >= DASHBOARD_STALE_RETRY_MAX) return;
        dashboardStaleRetryRef.current.attempts += 1;
        window.setTimeout(() => {
          if (
            resolveDashboardScopeKey() !== cacheKey ||
            dashboardDataRef.current ||
            dashboardFetchInFlightScopeRef.current ||
            dashboardFetchFailedScopeRef.current === cacheKey
          ) {
            return;
          }
          void loadDashboard();
        }, 100);
      }
    }
  }, [
    dateFrom,
    dateTo,
    currencyCode,
    loadMergedDashboard,
    loadAllCurrenciesDashboard,
    loadDashboardViaBootstrap,
    applyDashboardPayloadAdjustments,
    subsidiaryDashboardScope,
    usesGroupLedgerDashboard,
    selectedGroup,
    i18n,
    dashboardScopeKey,
    dashboardStructuralScopeKey,
    showAllCurrencies,
    canShowAllCurrencies,
    groupsAllMode,
    groupAllMode,
    mergedSubsetIds,
    groupAggregateMode,
    companyId,
    resolveScopeDashboardEarnings,
    resolveCodesForEarningsBootstrap,
    resolveScopePayloadHydration,
    cacheEntryHasFullEarnings,
    getCompleteCachedEarnings,
    tryBuildGroupAllDashboardFromCompanyCaches,
    fetchGroupAllMergedDashboard,
    loadDashboardPreviousPeriod,
    loadDashboardChartDaily,
    ensureDeferredDashboardLoads,
    upgradeActiveScopeEarnings,
    deferActiveScopeEarningsUpgrade,
    loadEarningsParallelForAtomicPaint,
    fetchEarningsOthersSettled,
    buildSeededEarningsRows,
    computeCurrencyMetricsFromPayload,
    enrichGroupAllMergedDashboard,
    resolveDashboardScopeKey,
  ]);
  loadDashboardRef.current = loadDashboard;

  useRealtimeDomain(REALTIME_DOMAINS.LEDGER, () => {
    void loadDashboard();
  }, { enabled: gcBootstrapReady });

  const loadDashboardTriggerKey = useMemo(
    () =>
      [
        dashboardScopeKey,
        dateFrom,
        dateTo,
        companyId,
        selectedGroup,
        groupsAllMode ? "1" : "0",
        groupAllMode ? "1" : "0",
        mergedSubsetIds?.join(",") ?? "",
        showAllCurrencies && canShowAllCurrencies ? "1" : "0",
      ].join("|"),
    [
      dashboardScopeKey,
      dateFrom,
      dateTo,
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      mergedSubsetIds,
      showAllCurrencies,
      canShowAllCurrencies,
    ]
  );

  useEffect(() => {
    if (!gcBootstrapReady) return undefined;
    const prevStructural = loadDashboardStructuralKeyRef.current;
    const structuralChanged = prevStructural !== dashboardStructuralScopeKey;
    loadDashboardStructuralKeyRef.current = dashboardStructuralScopeKey;
    loadDashboardTriggerKeyRef.current = loadDashboardTriggerKey;
    const debounceMs = structuralChanged ? 0 : LOAD_DASHBOARD_DEBOUNCE_MS;
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [gcBootstrapReady, loadDashboardTriggerKey, dashboardStructuralScopeKey, loadDashboard]);

  const primeDashboardFromCacheRef = useRef(primeDashboardFromCache);
  primeDashboardFromCacheRef.current = primeDashboardFromCache;

  /** Hydrate from session cache as early as possible (incl. when returning from other routes). */
  useLayoutEffect(() => {
    if (!sessionReady || !me) return undefined;
    const persisted = readPersistedDashboardGcFilter();
    primeCurrenciesFromCache({
      companyId: persisted.groupOnly || persisted.groupAllMode ? null : persisted.companyId,
      selectedGroup: persisted.groupsAllMode ? null : persisted.selectedGroup,
      groupsAllMode: persisted.groupsAllMode,
      groupAllMode: persisted.groupAllMode,
    });
    primeDashboardFromCacheRef.current({
      companyId: persisted.groupOnly || persisted.groupAllMode ? null : persisted.companyId,
      selectedGroup: persisted.groupsAllMode ? null : persisted.selectedGroup,
      groupsAllMode: persisted.groupsAllMode,
      groupAllMode: persisted.groupAllMode,
      mergedSubsetIds: null,
    });
    return undefined;
  }, [sessionReady, me?.user_id, me?.id, primeCurrenciesFromCache]);

  /** On scope change after bootstrap, hydrate from cache before network. */
  useEffect(() => {
    if (!gcBootstrapReady || !dashboardScopeKey) return undefined;
    if (displayScopeKey === dashboardScopeKey && dashboardData) return undefined;
    primeDashboardFromCache();
    return undefined;
  }, [
    gcBootstrapReady,
    dashboardScopeKey,
    displayScopeKey,
    dashboardData,
    primeDashboardFromCache,
  ]);

  /** Warm active group companies so CX/RS/VG switches hit cache (not while Company All is painted). */
  useEffect(() => {
    if (
      !gcBootstrapReady ||
      !companies.length ||
      !dateFrom ||
      !dateTo ||
      groupsAllMode ||
      groupAllMode
    ) {
      return undefined;
    }
    const activeGroup = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
    if (!activeGroup) return undefined;

    let cancelled = false;
    let waitRounds = 0;
    const interactionGen = scopeInteractionGenRef.current;
    const runGroupWarm = () => {
      if (cancelled || interactionGen !== scopeInteractionGenRef.current) return;
      if (!dateFrom || !dateTo) return;
      // Wait until active scope has atomically painted (and pie is not still loading).
      const paintedReady =
        dashboardDataRef.current &&
        displayScopeKeyRef.current &&
        displayScopeKeyRef.current === dashboardScopeKey &&
        !dashboardFetchInFlightScopeRef.current &&
        !earningsByCurrencyLoading;
      if (!paintedReady) {
        waitRounds += 1;
        if (waitRounds >= PREFETCH_WAIT_MAX_ROUNDS) return;
        window.setTimeout(runGroupWarm, 700);
        return;
      }
      const rows = companiesForCompanyPicker(companies, activeGroup, groupIds);
      const tasks = [];
      for (const row of rows) {
        if (isVirtualGroupLinkCompanyRow(row)) continue;
        if (companyRowIsGroupEntity(row, activeGroup)) continue;
        const rid = parseInt(row.id, 10);
        if (!Number.isFinite(rid) || rid <= 0) continue;
        if (!shouldPrefetchCompanyScope(rid, activeGroup)) continue;
        tasks.push(() => prefetchDashboardCompanyRef.current?.(row, activeGroup));
      }
      tasks.push(() => prefetchDashboardGroupAllRef.current?.(activeGroup));
      let idx = 0;
      const drain = () => {
        if (cancelled || interactionGen !== scopeInteractionGenRef.current) return;
        const batch = tasks.slice(idx, idx + 2);
        idx += batch.length;
        if (!batch.length) return;
        void Promise.allSettled(batch.map((fn) => fn())).then(() => {
          if (idx < tasks.length && !cancelled) {
            window.setTimeout(drain, 160);
          }
        });
      };
      drain();
    };
    // Start after first paint — never contend with active-company earnings fan-out.
    const timer = window.setTimeout(runGroupWarm, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    gcBootstrapReady,
    companiesSig,
    dateFrom,
    dateTo,
    selectedGroup,
    groupAllMode,
    groupsAllMode,
    groupIds,
    companies,
    companyId,
    dashboardScopeKey,
    earningsByCurrencyLoading,
    shouldPrefetchCompanyScope,
  ]);

  /**
   * Company All: low-priority warm of picker companies at the current currency so
   * IG→95 / CX clicks hit atomic-ready cache (after sibling-currency warm starts).
   */
  useEffect(() => {
    if (
      !gcBootstrapReady ||
      !groupAllMode ||
      groupsAllMode ||
      !selectedGroup ||
      !companies.length ||
      !dateFrom ||
      !dateTo ||
      !currencyCode
    ) {
      return undefined;
    }
    const activeGroup = String(selectedGroup).trim().toUpperCase();
    let cancelled = false;
    let waitRounds = 0;
    const interactionGen = scopeInteractionGenRef.current;
    const warmCurrency = String(currencyCode).trim().toUpperCase();

    const run = () => {
      if (cancelled || interactionGen !== scopeInteractionGenRef.current) return;
      if (String(currencyCodeRef.current || "").trim().toUpperCase() !== warmCurrency) return;
      // Only warm siblings after Company All has fully painted (KPI+chart+pie).
      const pieCodes = currenciesRef.current;
      const pieComplete =
        !Array.isArray(pieCodes) ||
        pieCodes.length <= 1 ||
        dashboardEarningsRowsComplete(earningsByCurrencyRef.current, pieCodes);
      const paintedReady =
        dashboardDataRef.current &&
        displayScopeKeyRef.current &&
        displayScopeKeyRef.current === dashboardScopeKey &&
        !dashboardBootstrapInFlightRef.current &&
        !dashboardFetchInFlightScopeRef.current &&
        !earningsParallelInFlightRef.current &&
        !earningsByCurrencyLoading &&
        pieComplete;
      if (!paintedReady) {
        waitRounds += 1;
        if (waitRounds >= PREFETCH_WAIT_MAX_ROUNDS) return;
        window.setTimeout(run, 800);
        return;
      }
      const rows = companiesForCompanyPicker(companies, activeGroup, groupIds);
      const tasks = [];
      for (const row of rows) {
        if (isVirtualGroupLinkCompanyRow(row)) continue;
        if (companyRowIsGroupEntity(row, activeGroup)) continue;
        const rid = parseInt(row.id, 10);
        if (!Number.isFinite(rid) || rid <= 0) continue;
        if (!shouldPrefetchCompanyScope(rid, activeGroup)) continue;
        tasks.push(() => prefetchDashboardCompanyRef.current?.(row, activeGroup));
      }
      let idx = 0;
      const drain = () => {
        if (cancelled || interactionGen !== scopeInteractionGenRef.current) return;
        if (String(currencyCodeRef.current || "").trim().toUpperCase() !== warmCurrency) return;
        const batch = tasks.slice(idx, idx + 1);
        idx += batch.length;
        if (!batch.length) return;
        void Promise.allSettled(batch.map((fn) => fn())).then(() => {
          if (idx < tasks.length && !cancelled) {
            window.setTimeout(drain, 400);
          }
        });
      };
      drain();
    };

    const warmDelay = shouldAggregateChartByMonth(dateFrom, dateTo)
      ? COMPANY_ALL_COMPANY_WARM_DELAY_LONG_RANGE_MS
      : COMPANY_ALL_COMPANY_WARM_DELAY_MS;
    const timer = window.setTimeout(run, warmDelay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    gcBootstrapReady,
    groupAllMode,
    groupsAllMode,
    selectedGroup,
    companiesSig,
    dateFrom,
    dateTo,
    currencyCode,
    groupIds,
    companies,
    dashboardScopeKey,
    earningsByCurrencyLoading,
    shouldPrefetchCompanyScope,
  ]);

  /** Warm dashboard cache for sibling groups/companies so first AP↔IG / company switches feel instant. */
  useEffect(() => {
    if (!gcBootstrapReady || !companies.length || !dateFrom || !dateTo || groupAllMode) {
      return undefined;
    }
    let cancelled = false;
    let waitRounds = 0;
    const interactionGen = scopeInteractionGenRef.current;
    const activeGroup = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
    const activeId = companyId != null ? parseInt(companyId, 10) : Number.NaN;
    const activeGroupOnly =
      !(Number.isFinite(activeId) && activeId > 0) && activeGroup && !groupsAllMode;

    const run = () => {
      if (cancelled || interactionGen !== scopeInteractionGenRef.current) return;
      if (
        !dashboardDataRef.current ||
        dashboardBootstrapInFlightRef.current ||
        dashboardFetchInFlightScopeRef.current ||
        // This is the broadest warm pass (every sibling group + company) — also wait
        // out the active scope's own per-currency earnings fan-out, not just its main
        // bootstrap call, so it never races the currency breakdown card for connections.
        earningsByCurrencyLoading ||
        earningsParallelInFlightRef.current
      ) {
        waitRounds += 1;
        if (waitRounds >= PREFETCH_WAIT_MAX_ROUNDS) return;
        window.setTimeout(run, 600);
        return;
      }
      const independentRows = independentCompaniesForPicker(companies, groupIds);
      const tasks = [];
      // Group All: only ledger groups. Else: all visible groups (IG company browse still prefetches).
      const warmGroupIds = groupsAllMode ? ledgerGroupIds : groupIds;

      for (const gid of warmGroupIds) {
        const g = String(gid).trim().toUpperCase();
        if (!g) continue;
        if (canUseGroupOnlyMode(meRef.current, g, companies)) {
          if (!(activeGroupOnly && g === activeGroup)) {
            tasks.push(() => prefetchDashboardGroupLedger(g));
          }
        }
        if (g !== activeGroup) {
          for (const row of companiesForCompanyPicker(companies, gid, groupIds)) {
            if (isVirtualGroupLinkCompanyRow(row)) continue;
            if (companyRowIsGroupEntity(row, g)) continue;
            const rid = parseInt(row.id, 10);
            if (!Number.isFinite(rid) || rid <= 0) continue;
            if (!shouldPrefetchCompanyScope(rid, g)) continue;
            tasks.push(() => prefetchDashboardCompany(row, g));
          }
        }
      }
      if (!groupsAllMode) {
        for (const row of independentRows) {
          const rid = parseInt(row.id, 10);
          if (!Number.isFinite(rid) || rid <= 0 || rid === activeId) continue;
          if (!shouldPrefetchCompanyScope(rid, null)) continue;
          tasks.push(() => prefetchDashboardCompany(row, null));
        }
      }

      const drain = () => {
        if (cancelled || interactionGen !== scopeInteractionGenRef.current) return;
        // One at a time — this pass already covers every sibling group/company, so
        // keep its footprint on shared PHP-FPM/DB capacity as small as possible.
        const batch = tasks.splice(0, 1);
        if (!batch.length) return;
        void Promise.allSettled(batch.map((fn) => fn())).then(() => {
          if (tasks.length && !cancelled) {
            window.setTimeout(drain, 150);
          }
        });
      };
      drain();
    };

    const timer = window.setTimeout(run, CROSS_GROUP_COMPANY_WARM_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    gcBootstrapReady,
    companiesSig,
    dateFrom,
    dateTo,
    companyId,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    groupIds,
    ledgerGroupIds,
    earningsByCurrencyLoading,
    prefetchDashboardCompany,
    prefetchDashboardGroupLedger,
    shouldPrefetchCompanyScope,
  ]);

  /** One-time per login: warm accessible companies at current currency so later switches are instant. */
  useEffect(() => {
    if (
      !gcBootstrapReady ||
      !companies.length ||
      !dateFrom ||
      !dateTo ||
      groupAllMode ||
      isDashboardSessionWarmDone()
    ) {
      return undefined;
    }
    let cancelled = false;
    let waitRounds = 0;
    const runWarm = () => {
      if (cancelled || isDashboardSessionWarmDone()) return;
      if (
        dashboardBootstrapInFlightRef.current ||
        dashboardFetchInFlightScopeRef.current ||
        !dashboardDataRef.current
      ) {
        waitRounds += 1;
        if (waitRounds >= PREFETCH_WAIT_MAX_ROUNDS) return;
        window.setTimeout(runWarm, 800);
        return;
      }
      markDashboardSessionWarmDone();
      const seen = new Set();
      const tasks = [];
      const pushRow = (row, viewGroup) => {
        const rid = parseInt(row?.id, 10);
        if (!Number.isFinite(rid) || rid <= 0 || seen.has(rid)) return;
        if (!shouldPrefetchCompanyScope(rid, viewGroup)) return;
        seen.add(rid);
        tasks.push(() => prefetchDashboardCompany(row, viewGroup));
      };
      for (const gid of groupIds) {
        const g = String(gid).trim().toUpperCase();
        if (!g) continue;
        for (const row of companiesForCompanyPicker(companies, gid, groupIds)) {
          if (isVirtualGroupLinkCompanyRow(row)) continue;
          if (companyRowIsGroupEntity(row, g)) continue;
          pushRow(row, g);
        }
      }
      for (const row of independentCompaniesForPicker(companies, groupIds)) {
        pushRow(row, null);
      }
      let idx = 0;
      const drain = () => {
        if (cancelled) return;
        const batch = tasks.slice(idx, idx + 3);
        idx += batch.length;
        if (!batch.length) return;
        void Promise.allSettled(batch.map((fn) => fn())).then(() => {
          if (idx < tasks.length && !cancelled) {
            window.setTimeout(drain, 120);
          }
        });
      };
      drain();
    };
    const timer = window.setTimeout(runWarm, SESSION_DASHBOARD_WARM_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    gcBootstrapReady,
    companiesSig,
    dateFrom,
    dateTo,
    groupAllMode,
    groupIds,
    companies,
    prefetchDashboardCompany,
    shouldPrefetchCompanyScope,
  ]);

  useEffect(() => {
    if (loading || !dashboardData || currencies.length <= 1) return undefined;
    if (displayScopeKey && dashboardScopeKey && displayScopeKey !== dashboardScopeKey) {
      return undefined;
    }
    const scopeEarnings = resolveScopeDashboardEarnings(currencies);
    if (scopeEarnings?.length === currencies.length) {
      const earningsRows = Array.isArray(earningsByCurrencyRef.current)
        ? earningsByCurrencyRef.current
        : [];
      if (
        earningsRows.length !== currencies.length ||
        earningsRows.some((row) => row.earnings == null)
      ) {
        setEarningsByCurrency(scopeEarnings);
        setEarningsByCurrencyLoading(false);
      }
      return undefined;
    }
    const cached = dashboardScopeKey ? getDashboardCache(dashboardScopeKey) : null;
    const readyEarnings = getCompleteCachedEarnings(cached, currencies);
    if (readyEarnings) {
      setEarningsByCurrency(readyEarnings);
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return undefined;
    }
    const earningsRows = Array.isArray(earningsByCurrencyRef.current)
      ? earningsByCurrencyRef.current
      : [];
    const allReady =
      earningsRows.length === currencies.length &&
      earningsRows.every((row) => row.earnings != null);
    if (allReady) return undefined;
    if (dashboardBootstrapInFlightRef.current === dashboardScopeKey) return undefined;
    if (earningsLoadInFlightRef.current === dashboardScopeKey) return undefined;
    const upgradeKey = `${dashboardScopeKey}|${currenciesScopeSig || currencies.length}`;
    if (
      earningsScopeUpgradeRef.current.scopeKey === upgradeKey &&
      earningsScopeUpgradeRef.current.attempts >= EARNINGS_INCOMPLETE_RETRY_MAX
    ) {
      // Retries exhausted — never leave the Currency card hidden behind loading.
      setEarningsByCurrencyLoading(false);
      return undefined;
    }

    const canUseBootstrap =
      !(showAllCurrencies && canShowAllCurrencies) &&
      !(groupsAllMode && !groupAllMode) &&
      !groupAllMode &&
      !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
      (companyId != null || groupAggregateMode);
    if (canUseBootstrap) {
      void upgradeActiveScopeEarnings();
      return undefined;
    }
    void loadEarningsByCurrency();
    return undefined;
  }, [
    loading,
    dashboardData,
    currenciesScopeSig,
    currencies.length,
    loadEarningsByCurrency,
    upgradeActiveScopeEarnings,
    dashboardScopeKey,
    displayScopeKey,
    getCompleteCachedEarnings,
    resolveScopeDashboardEarnings,
    showAllCurrencies,
    canShowAllCurrencies,
    groupsAllMode,
    groupAllMode,
    mergedSubsetIds,
    companyId,
    groupAggregateMode,
  ]);

  useEffect(() => {
    if (currencies.length <= 1 || !dateTo) return undefined;
    const base = currencyCode || currencies[0];
    warmFrankfurterRatesForCurrencies(currencies, resolveFrankfurterDate(dateTo), base);
    if (conversionBaseCurrency && conversionBaseCurrency !== base) {
      warmFrankfurterRatesForCurrencies(
        currencies,
        resolveFrankfurterDate(dateTo),
        conversionBaseCurrency
      );
    }
  }, [currencies, dateTo, currencyCode, conversionBaseCurrency]);

  useEffect(() => {
    if (!gcBootstrapReady || currencies.length <= 1 || !dashboardScopeKey) return undefined;
    let cancelled = false;
    let waitRounds = 0;
    const interactionGen = scopeInteractionGenRef.current;

    const run = () => {
      if (cancelled || interactionGen !== scopeInteractionGenRef.current) return;
      if (
        !dashboardDataRef.current ||
        dashboardBootstrapInFlightRef.current ||
        dashboardFetchInFlightScopeRef.current
      ) {
        waitRounds += 1;
        if (waitRounds >= PREFETCH_WAIT_MAX_ROUNDS) return;
        window.setTimeout(run, 600);
        return;
      }
      const codes = currenciesRef.current;
      // Active scope already has a complete multi-currency pie — skip sibling KPI warm storms.
      const activeKey = resolveDashboardScopeKey();
      if (
        activeKey &&
        cacheEntryHasFullEarnings(getDashboardCache(activeKey), codes)
      ) {
        return;
      }
      let idx = 0;
      const parallel = groupAllMode ? 1 : 2;
      const gapMs = groupAllMode ? 400 : 150;
      const drain = () => {
        if (cancelled || interactionGen !== scopeInteractionGenRef.current) return;
        const batch = [];
        while (batch.length < parallel && idx < codes.length) {
          const code = codes[idx++];
          if (code !== currencyCodeRef.current) {
            batch.push(code);
          }
        }
        if (!batch.length) return;
        void Promise.allSettled(batch.map((code) => prefetchActiveScopeCurrency(code))).then(
          () => {
            if (idx < codes.length && !cancelled) {
              window.setTimeout(drain, gapMs);
            }
          }
        );
      };
      drain();
    };

    const longRange = shouldAggregateChartByMonth(dateFrom, dateTo);
    const prefetchDelayMs = groupAllMode
      ? longRange
        ? CURRENCY_PREFETCH_DELAY_GROUP_ALL_LONG_RANGE_MS
        : CURRENCY_PREFETCH_DELAY_GROUP_ALL_MS
      : longRange
        ? CURRENCY_PREFETCH_DELAY_LONG_RANGE_MS
        : CURRENCY_PREFETCH_DELAY_MS;
    const timer = window.setTimeout(run, prefetchDelayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    gcBootstrapReady,
    currencies,
    dashboardScopeKey,
    dateFrom,
    dateTo,
    companyId,
    selectedGroup,
    groupAllMode,
    prefetchActiveScopeCurrency,
    resolveDashboardScopeKey,
    cacheEntryHasFullEarnings,
  ]);

  const kpiCompareLabel = i18n.thanLastMonth;

  /** True while live selection moved but painted KPI/chart/pie still show the previous scope. */
  const scopeDataPending =
    Boolean(dashboardScopeKey) && displayScopeKey !== dashboardScopeKey;

  /**
   * Freeze summary inputs + FX to the painted scope during pending.
   * Live currency reload of Frankfurter rates must not recompute pie/hero ahead of KPI.
   */
  const paintedSummaryRef = useRef({
    currencies: [],
    earningsByCurrency: [],
    currencyCode: "",
    dateFrom: "",
    dateTo: "",
    selectedGroup: null,
    companyId: null,
    exchangeRates: { rates: {}, date: null, unsupported: [], scopeKey: "" },
    exchangeRatesLoading: false,
    exchangeRatesError: "",
  });
  if (!scopeDataPending) {
    paintedSummaryRef.current = {
      currencies,
      earningsByCurrency,
      currencyCode: currencyCode || "",
      dateFrom: dateFrom || "",
      dateTo: dateTo || "",
      selectedGroup,
      companyId,
      exchangeRates,
      exchangeRatesLoading,
      exchangeRatesError,
    };
  }
  const summaryCurrencies = scopeDataPending
    ? paintedSummaryRef.current.currencies
    : currencies;
  const summaryEarningsByCurrency = scopeDataPending
    ? paintedSummaryRef.current.earningsByCurrency
    : earningsByCurrency;
  const summaryCurrencyCode = scopeDataPending
    ? paintedSummaryRef.current.currencyCode || ""
    : currencyCode;
  const summaryDateFrom = scopeDataPending
    ? paintedSummaryRef.current.dateFrom || dateFrom
    : dateFrom;
  const summaryDateTo = scopeDataPending
    ? paintedSummaryRef.current.dateTo || dateTo
    : dateTo;
  const summarySelectedGroup = scopeDataPending
    ? paintedSummaryRef.current.selectedGroup
    : selectedGroup;
  const summaryCompanyId = scopeDataPending
    ? paintedSummaryRef.current.companyId
    : companyId;
  const summaryExchangeRates = scopeDataPending
    ? paintedSummaryRef.current.exchangeRates
    : exchangeRates;
  const summaryExchangeRatesLoading = scopeDataPending
    ? false
    : exchangeRatesLoading;
  const summaryExchangeRatesError = scopeDataPending
    ? paintedSummaryRef.current.exchangeRatesError
    : exchangeRatesError;

  const kpi = useMemo(() => {
    const empty = {
      profit: 0,
      expenses: 0,
      earnings: 0,
      netProfit: 0,
      showEarnings: false,
      comparisons: null,
    };
    const useAggregated = showAllCurrencies && canShowAllCurrencies && multiCurrencyKpi;
    const ownershipCurrent = computeKpiMetrics(
      dashboardData,
      summarySelectedGroup,
      resolveKpiOwnershipOpts(summaryCompanyId, summarySelectedGroup)
    );
    const ownershipPrevious = computeKpiMetrics(
      dashboardDataPrev,
      summarySelectedGroup,
      resolveKpiOwnershipOpts(summaryCompanyId, summarySelectedGroup)
    );
    let current = useAggregated
      ? multiCurrencyKpi
      : ownershipCurrent;
    if (!current) return empty;
    if (ownershipCurrent) {
      current = {
        ...current,
        profit: ownershipCurrent.profit,
        netProfit: ownershipCurrent.netProfit,
        earnings: ownershipCurrent.earnings,
        kpiCardEarnings: ownershipCurrent.kpiCardEarnings,
        showEarnings: ownershipCurrent.showEarnings,
      };
    }
    let previous = useAggregated ? multiCurrencyKpiPrev : ownershipPrevious;
    if (previous && ownershipPrevious) {
      previous = {
        ...previous,
        earnings: ownershipPrevious.earnings,
        kpiCardEarnings: ownershipPrevious.kpiCardEarnings,
      };
    }
    const comparisons = previous
      ? {
          profit: buildKpiCompare(current.profit, previous.profit),
          expenses: buildKpiCompare(current.expenses, previous.expenses),
          netProfit: buildKpiCompare(current.netProfit, previous.netProfit),
          earnings: buildKpiCompare(
            current.kpiCardEarnings ?? current.earnings,
            previous.kpiCardEarnings ?? previous.earnings
          ),
        }
      : null;
    return { ...current, comparisons };
  }, [
    dashboardData,
    dashboardDataPrev,
    summarySelectedGroup,
    summaryCompanyId,
    groupAllMode,
    groupsAllGroupLevel,
    usesGroupLedgerDashboard,
    showAllCurrencies,
    canShowAllCurrencies,
    multiCurrencyKpi,
    multiCurrencyKpiPrev,
    resolveKpiOwnershipOpts,
  ]);

  const chartAggregateByMonth = useMemo(
    () => shouldAggregateChartByMonth(summaryDateFrom, summaryDateTo),
    [summaryDateFrom, summaryDateTo]
  );

  const chartRows = useMemo(() => {
    if (!dashboardData) return [];
    const rows = buildChartRows(
      dashboardData,
      summaryDateFrom,
      summaryDateTo,
      i18n.locale,
      summarySelectedGroup,
      resolveKpiOwnershipOpts(summaryCompanyId, summarySelectedGroup)
    );
    if (rows.length > 0) return rows;
    return buildSkeletonChartRows(summaryDateFrom, summaryDateTo, i18n.locale);
  }, [
    dashboardData,
    summaryDateFrom,
    summaryDateTo,
    i18n.locale,
    summarySelectedGroup,
    summaryCompanyId,
    resolveKpiOwnershipOpts,
  ]);

  const chartMonthSpanCount = useMemo(
    () => chartMonthSpan(summaryDateFrom, summaryDateTo),
    [summaryDateFrom, summaryDateTo]
  );

  const chartXAxisLayout = useMemo(() => {
    const n = chartRows.length;
    const compact = !chartAggregateByMonth && n > 14;
    const marginBottom = compact ? 22 : 20;
    const tickSkip = chartAggregateByMonth
      ? { interval: 0, minTickGap: 0 }
      : resolveDailyChartXAxisTicks(n, chartMonthSpanCount);
    return {
      ...tickSkip,
      tick: makeDashboardChartXTick(compact),
      height: marginBottom,
      marginBottom,
    };
  }, [chartRows.length, chartAggregateByMonth, chartMonthSpanCount]);

  const displayCurrencyCode =
    showAllCurrencies && canShowAllCurrencies ? conversionBaseCurrency : currencyCode;

  const kpiFooter = useMemo(() => {
    /* Freeze caption to painted scope — live currency would update before KPI values. */
    const paintedCurrency = summaryCurrencyCode || currencyCode;
    const cur =
      showAllCurrencies && canShowAllCurrencies
        ? `${i18n.all} · ${conversionBaseCurrency || "—"}`
        : paintedCurrency || "—";
    const from = parseYmd(summaryDateFrom || dateFrom);
    const to = parseYmd(summaryDateTo || dateTo);
    if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
      return `${cur} · ${formatDmyDash(to)}`;
    }
    const left = formatDmyDash(from);
    const right = formatDmyDash(to);
    return `${cur} · ${left} – ${right}`;
  }, [
    summaryCurrencyCode,
    currencyCode,
    conversionBaseCurrency,
    showAllCurrencies,
    canShowAllCurrencies,
    i18n.all,
    summaryDateFrom,
    summaryDateTo,
    dateFrom,
    dateTo,
  ]);

  const chartDateRangeText = useMemo(
    () => formatChartDateRangeText(summaryDateFrom, summaryDateTo, i18n.to),
    [summaryDateFrom, summaryDateTo, i18n.to]
  );

  const chartSeries = useMemo(() => {
    const series = [
      { idx: 0, label: i18n.profit, color: DASHBOARD_PROFIT_COLOR, dataKey: "profit", fill: "url(#gProfit)" },
      { idx: 1, label: i18n.expenses, color: "#ef4444", dataKey: "expenses", fill: "url(#gExp)" },
      { idx: 2, label: i18n.netProfitChart, color: "#10b981", dataKey: "netProfit", fill: "url(#gNet)" },
    ];
    if (kpi.showEarnings) {
      series.push({
        idx: 3,
        label: i18n.earnings,
        color: "#f59e0b",
        dataKey: "earnings",
        fill: "url(#gEarn)",
      });
    }
    return series;
  }, [i18n, kpi.showEarnings]);

  const earningsCurrencyRows = useMemo(() => {
    const earningsRows = Array.isArray(summaryEarningsByCurrency)
      ? summaryEarningsByCurrency
      : [];
    const primaryNetProfit = kpi?.netProfit ?? null;
    const primaryEarnings = kpi?.showEarnings ? kpi.earnings : primaryNetProfit;
    const seededRows =
      earningsRows.length > 0
        ? earningsRows
        : summaryCurrencies.map((code) => {
            const isPrimary =
              String(code).toUpperCase() === String(summaryCurrencyCode || "").toUpperCase();
            return {
              code,
              netProfit: isPrimary && primaryNetProfit != null ? primaryNetProfit : null,
              earnings: isPrimary && primaryEarnings != null ? primaryEarnings : null,
            };
          });
    const baseRows = normalizeEarningsRowsForDisplay(
      seededRows,
      summaryCurrencyCode,
      primaryNetProfit,
      primaryEarnings
    );

    const base = String(summaryCurrencyCode || "").toUpperCase();
    const rates = summaryExchangeRates.rates || {};
    const canConvert =
      summaryCurrencies.length > 1 &&
      !summaryExchangeRatesLoading &&
      frankfurterRatesPartiallyUsable(base, summaryCurrencies, rates);

    return summaryCurrencies.map((code) => {
      const codeUpper = String(code).toUpperCase();
      const existing =
        baseRows.find((row) => String(row.code).toUpperCase() === codeUpper) ?? { code };
      let netProfit = existing.netProfit ?? existing.earnings;
      let earnings = existing.earnings ?? existing.netProfit;
      if (codeUpper === String(summaryCurrencyCode || "").toUpperCase()) {
        if (netProfit == null && primaryNetProfit != null) netProfit = primaryNetProfit;
        if (earnings == null && primaryEarnings != null) earnings = primaryEarnings;
      }
      const netProfitConverted =
        canConvert && netProfit != null
          ? convertToBaseAmount(netProfit, code, base, rates)
          : null;
      const earningsConverted =
        canConvert && earnings != null
          ? convertToBaseAmount(earnings, code, base, rates)
          : null;
      return {
        ...existing,
        code,
        netProfit,
        earnings,
        netProfitConverted,
        earningsConverted,
      };
    });
  }, [
    summaryEarningsByCurrency,
    summaryCurrencies,
    summaryCurrencyCode,
    kpi.showEarnings,
    kpi.earnings,
    kpi.netProfit,
    summaryExchangeRates.rates,
    summaryExchangeRatesError,
    summaryExchangeRatesLoading,
  ]);

  const allCurrencyEarningsReady = useMemo(
    () =>
      summaryCurrencies.length <= 1 ||
      (earningsCurrencyRows.length === summaryCurrencies.length &&
        earningsCurrencyRows.every(
          (row) =>
            row.netProfit != null && (!kpi.showEarnings || row.earnings != null)
        )),
    [summaryCurrencies.length, earningsCurrencyRows, kpi.showEarnings]
  );

  const useConvertedEarnings = useMemo(
    () =>
      summaryCurrencies.length > 1 &&
      frankfurterRatesPartiallyUsable(
        summaryCurrencyCode || displayCurrencyCode,
        summaryCurrencies,
        summaryExchangeRates.rates || {}
      ),
    [
      summaryCurrencies.length,
      summaryCurrencyCode,
      displayCurrencyCode,
      summaryExchangeRates.rates,
    ]
  );

  const panelCurrencyRows = useMemo(
    () => {
      if (earningsPanelView === "netProfitFor") {
        const companyRows = normalizeSubsidiaryEarningsByCompany(
          dashboardData?.subsidiary_earnings_by_company
        );
        return companyRows.map((row) => ({
          code: row.company_id,
          group: row.group_id,
          netProfit: row.net_profit,
          earnings: row.net_profit,
          netProfitConverted: null,
          earningsConverted: null,
        }));
      }
      return mapPanelCurrencyRows(earningsCurrencyRows, earningsPanelView, {
        useConverted: useConvertedEarnings,
      });
    },
    [earningsCurrencyRows, earningsPanelView, useConvertedEarnings, dashboardData]
  );

  const convertedPanelTotal = useMemo(() => {
    if (earningsPanelView === "netProfitFor") return null;
    if (!useConvertedEarnings) return null;
    const rows = earningsCurrencyRows.map((row) => ({
      code: row.code,
      earnings: earningsPanelView === "earning" ? row.earnings : row.netProfit,
    }));
    const base = summaryCurrencyCode || displayCurrencyCode;
    return sumConvertedEarnings(rows, base, summaryExchangeRates.rates).total;
  }, [
    useConvertedEarnings,
    earningsCurrencyRows,
    earningsPanelView,
    summaryCurrencyCode,
    displayCurrencyCode,
    summaryExchangeRates.rates,
  ]);

  const earningsCurrencyRowsPrev = useMemo(() => {
    if (!earningsByCurrencyPrev.length) return [];
    const base = String(summaryCurrencyCode || currencyCode || "").toUpperCase();
    const rates = summaryExchangeRates.rates || {};
    const canConvert =
      summaryCurrencies.length > 1 &&
      !summaryExchangeRatesLoading &&
      frankfurterRatesPartiallyUsable(base, summaryCurrencies, rates);

    return earningsByCurrencyPrev.map((row) => ({
      ...row,
      netProfitConverted:
        canConvert && row.netProfit != null
          ? convertToBaseAmount(row.netProfit, row.code, base, rates)
          : null,
      earningsConverted:
        canConvert && row.earnings != null
          ? convertToBaseAmount(row.earnings, row.code, base, rates)
          : null,
    }));
  }, [
    earningsByCurrencyPrev,
    summaryCurrencyCode,
    currencyCode,
    summaryCurrencies.length,
    summaryExchangeRates.rates,
    summaryExchangeRatesError,
    summaryExchangeRatesLoading,
  ]);

  const convertedEarningsTotalPrev = useMemo(() => {
    if (!useConvertedEarnings || !earningsCurrencyRowsPrev.length) return null;
    const base = summaryCurrencyCode || currencyCode;
    return sumConvertedEarnings(earningsCurrencyRowsPrev, base, summaryExchangeRates.rates).total;
  }, [
    useConvertedEarnings,
    earningsCurrencyRowsPrev,
    summaryCurrencyCode,
    currencyCode,
    summaryExchangeRates.rates,
  ]);

  const showNetProfitForTab = useMemo(
    () =>
      Boolean(groupOnlyDashboard) &&
      normalizeSubsidiaryEarningsByCompany(dashboardData?.subsidiary_earnings_by_company).length > 0,
    [groupOnlyDashboard, dashboardData]
  );

  const showEarningPanelTab = kpi.showEarnings;
  /** Show tab strip only when there is an alternate view to switch to. */
  const showSummaryPanelTabs = useMemo(
    () => showEarningPanelTab || showNetProfitForTab,
    [showEarningPanelTab, showNetProfitForTab]
  );

  /** Multi-currency breakdown uses Rate column; group+company tabs use same layout as IG+95. */
  const earningsBreakdownShowsRate = useMemo(
    () =>
      (currencies.length > 1 || showSummaryPanelTabs) &&
      earningsPanelView !== "netProfitFor",
    [currencies.length, showSummaryPanelTabs, earningsPanelView]
  );

  const summaryPanelLabel =
    earningsPanelView === "earning"
      ? i18n.earnings
      : earningsPanelView === "netProfitFor"
        ? i18n.netProfitCompanyCaption
        : i18n.netProfit;

  /** Pie panel hero total — matches KPI card unless All-currencies aggregate mode. */
  const summaryEarningsValue = useMemo(() => {
    if (earningsPanelView === "netProfitFor") {
      return panelCurrencyRows.reduce((sum, row) => sum + (parseFloat(row.netProfit) || 0), 0);
    }
    const earningTab = earningsPanelView === "earning";
    // Use painted summary currency count — live `currencies` can shrink mid company-switch
    // and briefly fall through to native KPI while the converted total is still frozen.
    if (summaryCurrencies.length > 1 && useConvertedEarnings && convertedPanelTotal != null) {
      return convertedPanelTotal;
    }
    if (showAllCurrencies && canShowAllCurrencies && multiCurrencyKpi) {
      return earningTab ? multiCurrencyKpi.earnings : multiCurrencyKpi.netProfit;
    }
    if (
      showAllCurrencies &&
      canShowAllCurrencies &&
      summaryCurrencies.length > 1 &&
      useConvertedEarnings &&
      convertedPanelTotal != null
    ) {
      return convertedPanelTotal;
    }
    return earningTab ? kpi.earnings : kpi.netProfit;
  }, [
    earningsPanelView,
    showAllCurrencies,
    canShowAllCurrencies,
    multiCurrencyKpi,
    summaryCurrencies.length,
    useConvertedEarnings,
    convertedPanelTotal,
    kpi.netProfit,
    kpi.earnings,
    panelCurrencyRows,
  ]);

  const summaryConversionNote = useMemo(() => {
    if (!earningsBreakdownShowsRate) return "";
    return i18n.earningsIncludesConversion;
  }, [earningsBreakdownShowsRate, i18n.earningsIncludesConversion]);

  useEffect(() => {
    if (!showEarningPanelTab && earningsPanelView === "earning") {
      setEarningsPanelView("currency");
    }
    if (!showNetProfitForTab && earningsPanelView === "netProfitFor") {
      setEarningsPanelView("currency");
    }
  }, [showEarningPanelTab, showNetProfitForTab, earningsPanelView]);

  /**
   * Pie remount key — currency/date only (not company).
   * Company id here remounted the donut on every pill switch → empty-ring flash.
   * Live currency here remounts the pie before KPI cards swap (broken atomic paint).
   */
  const exchangeRateScopeKey = useMemo(
    () =>
      [
        summaryCurrencyCode || displayCurrencyCode || "",
        [...(summaryCurrencies.length ? summaryCurrencies : currencies)].sort().join(","),
        summaryDateTo || dateTo || "",
      ].join("|"),
    [
      summaryCurrencyCode,
      displayCurrencyCode,
      summaryCurrencies,
      currencies,
      summaryDateTo,
      dateTo,
    ]
  );

  /**
   * Painted-scope mirrors for summary/KPI atomic paint.
   * Filter pills use live selection (TransactionDashboardPage) so clicks feel instant;
   * earnings summary still consumes these frozen values until the pack lands.
   */
  const displayCompanyId = useMemo(
    () => parsePaintedCompanyIdFromScopeKey(displayScopeKey, companyId),
    [displayScopeKey, companyId]
  );
  const displayGroupAllMode = useMemo(() => {
    if (!displayScopeKey || !scopeDataPending) return groupAllMode;
    const parts = String(displayScopeKey).split("|");
    const raw = parts[0] || "";
    if (raw.startsWith("groupAll:") || raw === "groups:all" || raw === "independents:all") {
      return true;
    }
    return parts[5] === "1";
  }, [displayScopeKey, scopeDataPending, groupAllMode]);
  const displaySelectedGroup = useMemo(() => {
    if (!displayScopeKey || !scopeDataPending) return selectedGroup;
    const parts = String(displayScopeKey).split("|");
    const g = parts[4] || "";
    return g || null;
  }, [displayScopeKey, scopeDataPending, selectedGroup]);
  const displayGroupsAllMode = useMemo(() => {
    if (!displayScopeKey || !scopeDataPending) return groupsAllMode;
    return String(displayScopeKey).split("|")[0] === "groups:all";
  }, [displayScopeKey, scopeDataPending, groupsAllMode]);
  const displayEffectiveDateRangeText = useMemo(() => {
    if (!scopeDataPending || !displayScopeKey) return null;
    const dates = parseDashboardCacheKeyDates(displayScopeKey);
    if (!dates) return null;
    const left = ymdToDmy(dates.from);
    const right = ymdToDmy(dates.to);
    if (!left || !right) return null;
    return `${left} - ${right}`;
  }, [scopeDataPending, displayScopeKey]);
  const displayCurrencies =
    summaryCurrencies?.length > 0 ? summaryCurrencies : currencies;
  /* Never fall through to live currency while pending — that updates pie center/hero early. */
  const displayFilterCurrencyCode = scopeDataPending
    ? summaryCurrencyCode || ""
    : displayCurrencyCode;
  const chartDataStable = useMemo(
    () =>
      !scopeDataPending &&
      Boolean(dashboardData) &&
      !dashboardPayloadNeedsChartDaily(dashboardData),
    [scopeDataPending, dashboardData]
  );
  // Do not blank pie/KPI while the next scope loads — keep previous panels until atomic swap.
  const summaryScopeLoading = loading && !dashboardData;
  const summaryEarningsLoading =
    summaryScopeLoading ||
    (!scopeDataPending &&
      summaryCurrencies.length > 1 &&
      (earningsByCurrencyLoading ||
        !allCurrencyEarningsReady ||
        (!useConvertedEarnings && summaryExchangeRatesLoading) ||
        (showAllCurrencies &&
          canShowAllCurrencies &&
          useConvertedEarnings &&
          convertedPanelTotal == null)));
  // FX background refresh must not mark the panel unstable when quotes are already usable.
  const earningsPanelStable =
    summaryCurrencies.length <= 1 ||
    scopeDataPending ||
    (allCurrencyEarningsReady &&
      !earningsByCurrencyLoading &&
      (useConvertedEarnings || !summaryExchangeRatesLoading));
  /**
   * True when KPI + chart (+ multi-currency earnings) are ready for the active scope.
   * Used for compare badges / panel stability — do not blank the layout while waiting.
   */
  const dashboardViewReady = useMemo(() => {
    if (!dashboardScopeKey || scopeDataPending || loading) return false;
    if (!dashboardData || dashboardPayloadNeedsChartDaily(dashboardData)) return false;
    if (currencies.length > 1 && !earningsPanelStable) return false;
    return true;
  }, [
    dashboardScopeKey,
    scopeDataPending,
    loading,
    dashboardData,
    currencies.length,
    earningsPanelStable,
  ]);
  /** Keep previous paint visible while the next full view loads (no empty hole). */
  const kpiLoading = Boolean(dashboardData) ? false : loading || !dashboardViewReady;

  useLayoutEffect(() => {
    if (
      typeof sessionStorage === "undefined" ||
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) !== "1"
    ) {
      return;
    }
    if (selectedGroup == null) return;
    const persisted = readPersistedDashboardGcFilter();
    if (persisted.selectedGroup) {
      sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
      return;
    }
    setSelectedGroup(null);
  }, [selectedGroup, groupFilterOptOutTick]);

  const handlePickGroup = useCallback(
    (gid) => {
      scopeInteractionGenRef.current += 1;
      companySwitchGenRef.current += 1;
      setLoadError("");
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      if (g === selectedGroup && !groupsAllMode) {
        const target = resolveCompanyWhenClosingGroup(companies, companyId, groupIds);

        if (target?.id) {
          const id = parseInt(target.id, 10);
          setGroupsAllMode(false);
          setGroupAllMode(false);
          setMergedSubsetIds(null);
          setSelectedGroup(null);
          applyCompanySelection(id);
          persistDashboardGroupsAllMode(false);
          clearDashboardGroupFilterKeepCompany(id, { companyRow: target });
          setGroupFilterOptOutTick((n) => n + 1);
          primeCurrenciesFromCache({
            companyId: id,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            clearOnMiss: true,
          });
          primeDashboardFromCache({
            companyId: id,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            mergedSubsetIds: null,
          });
          void syncCompanySession(id, null);
        } else {
          setGroupsAllMode(false);
          setGroupAllMode(false);
          setMergedSubsetIds(null);
          setSelectedGroup(null);
          setCompanyId(null);
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
            sessionStorage.removeItem("dashboard_group_filter");
          }
          setGroupFilterOptOutTick((n) => n + 1);
          persistDashboardGroupOnlyMode(false);
          persistDashboardGroupsAllMode(false);
          persistDashboardSelectedCompany(null);
          persistDashboardFilterState(null, null, { allowGroupOnly: false, groupsAllMode: false });
          primeCurrenciesFromCache({
            companyId: null,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            clearOnMiss: true,
          });
          primeDashboardFromCache({
            companyId: null,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            mergedSubsetIds: null,
          });
          notifyDashboardGroupFilterChanged(null, null);
        }
        return;
      }

      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
      }
      setGroupFilterOptOutTick((n) => n + 1);
      persistDashboardGroupsAllMode(false);

      if (canUseGroupOnlyMode(me, g, companies)) {
        setGroupsAllMode(false);
        setSelectedGroup(g);
        persistDashboardGroupFilter(g);
        resetAnchorSessionRef();
        clearCompanySelection(g);
        primeCurrenciesFromCache({
          companyId: null,
          selectedGroup: g,
          groupsAllMode: false,
          clearOnMiss: true,
        });
        primeDashboardFromCache({
          companyId: null,
          selectedGroup: g,
          groupsAllMode: false,
          groupAllMode: false,
          mergedSubsetIds: null,
        });
        return;
      }

      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, { me, preferredCompanyId: null });
      if (!pick?.id) {
        resetAnchorSessionRef();
        clearCompanySelection(g);
        primeCurrenciesFromCache({
          companyId: null,
          selectedGroup: g,
          groupsAllMode: false,
          clearOnMiss: true,
        });
        primeDashboardFromCache({
          companyId: null,
          selectedGroup: g,
          groupsAllMode: false,
          groupAllMode: false,
          mergedSubsetIds: null,
        });
        return;
      }

      const id = parseInt(pick.id, 10);
      setGroupsAllMode(false);
      persistDashboardFilterState(g, id, { allowGroupOnly: false, groupsAllMode: false });
      notifyDashboardGroupFilterChanged(
        g,
        id,
        buildDashboardSidebarNotifyOptions(pick, g, { ignoreGroupOnly: true }),
      );
      setGroupAllMode(false);
      setMergedSubsetIds(null);
      setSelectedGroup(g);
      persistDashboardGroupFilter(g);
      resetCurrencyForCompanySwitch(id, g);
      applyCompanySelection(id);
      primeCurrenciesFromCache({
        companyId: id,
        selectedGroup: g,
        groupsAllMode: false,
        groupAllMode: false,
        clearOnMiss: true,
      });
      primeDashboardFromCache({
        companyId: id,
        selectedGroup: g,
        groupsAllMode: false,
        groupAllMode: false,
        mergedSubsetIds: null,
      });
      void syncCompanySession(id, g);
    },
    [
      selectedGroup,
      groupsAllMode,
      companyId,
      me,
      companies,
      groupIds,
      applyCompanySelection,
      syncCompanySession,
      primeCurrenciesFromCache,
      primeDashboardFromCache,
      resetAnchorSessionRef,
      resetCurrencyForCompanySwitch,
    ]
  );

  const handlePickCompany = useCallback(
    (c) => {
      setLoadError("");
      const id = parseInt(c.id, 10);
      // Prefer coalesced/display group_id (partner remap e.g. native JJ → KK).
      // Native-only here jumps Group pill off the viewer's group and empties sibling companies.
      const displayGid = normalizeCompanyGroupId(c);
      const nativeGid = normalizeNativeCompanyGroupId(c);
      const sel =
        selectedGroup && !groupsAllMode ? String(selectedGroup).trim().toUpperCase() : "";
      let gid = displayGid || nativeGid || null;
      if (gid) gid = String(gid).trim().toUpperCase();
      // Stay on the Group pill the user is already viewing when this company is shown under it.
      if (sel && (displayGid === sel || gid === sel)) {
        gid = sel;
      }
      const isActive =
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
        companyId != null &&
        parseInt(companyId, 10) === id &&
        (groupsAllMode || !gid || gid === selectedGroup);
      if (isActive) {
        if (groupsAllMode) {
          const groupsAllLedgerLogin = companyLoginCanUseGroupsAllLedger(me);
          scopeInteractionGenRef.current += 1;
          persistDashboardGroupsAllMode(true);
          persistDashboardGroupOnlyMode(false);
          persistDashboardGroupAllMode(!groupsAllLedgerLogin);
          persistDashboardSelectedCompany(null);
          setCompanyId(null);
          setGroupAllMode(!groupsAllLedgerLogin);
          setMergedSubsetIds(null);
          notifyDashboardGroupFilterChanged(
            null,
            null,
            buildDashboardSidebarNotifyOptions(null, readGroupsAllSidebarGroup()),
          );
          primeCurrenciesFromCache({
            companyId: null,
            selectedGroup: null,
            groupsAllMode: true,
            groupAllMode: !groupsAllLedgerLogin,
            clearOnMiss: true,
          });
          primeDashboardFromCache({
            companyId: null,
            selectedGroup: null,
            groupsAllMode: true,
            groupAllMode: !groupsAllLedgerLogin,
            mergedSubsetIds: null,
          });
          return;
        }
        if (!canUseGroupOnlyMode(me, selectedGroup, companies)) return;
        const g = selectedGroup;
        clearCompanySelection(g);
        primeCurrenciesFromCache({
          companyId: null,
          selectedGroup: g,
          groupsAllMode: false,
          groupAllMode: false,
          clearOnMiss: true,
        });
        primeDashboardFromCache({
          companyId: null,
          selectedGroup: g,
          groupsAllMode: false,
          groupAllMode: false,
          mergedSubsetIds: null,
        });
        return;
      }

      const switchGen = ++companySwitchGenRef.current;
      scopeInteractionGenRef.current += 1;
      const prefetchInteractionGen = scopeInteractionGenRef.current;
      const prevId = companyId;
      const persistGroup = groupsAllMode ? null : gid;
      if (!groupsAllMode) {
        if (gid) {
          setSelectedGroup(gid);
          sessionStorage.setItem("dashboard_group_filter", gid);
        } else {
          setSelectedGroup(null);
          sessionStorage.removeItem("dashboard_group_filter");
        }
      }
      persistDashboardFilterState(persistGroup, id, {
        allowGroupOnly: false,
        groupsAllMode: groupsAllMode,
      });
      notifyDashboardGroupFilterChanged(
        persistGroup,
        id,
        buildDashboardSidebarNotifyOptions(c, persistGroup, { ignoreGroupOnly: true }),
      );
      resetCurrencyForCompanySwitch(id, groupsAllMode ? null : gid);
      dashboardFetchInFlightScopeRef.current = "";
      dashboardBootstrapInFlightRef.current = "";
      applyCompanySelection(id);
      primeCurrenciesFromCache({
        companyId: id,
        selectedGroup: groupsAllMode ? null : gid,
        groupsAllMode,
        groupAllMode: false,
        clearOnMiss: true,
      });
      primeDashboardFromCache({
        companyId: id,
        selectedGroup: groupsAllMode ? null : gid,
        groupsAllMode,
        groupAllMode: false,
        mergedSubsetIds: null,
      });
      
      const sessionViewGroup = groupsAllMode ? null : (gid || null);
      window.setTimeout(() => {
        if (switchGen !== companySwitchGenRef.current) return;
        void syncCompanySession(id, sessionViewGroup, switchGen).then((ok) => {
          if (switchGen !== companySwitchGenRef.current) return;
          if (!ok && prevId != null) {
            const prevCo = companies.find((x) => parseInt(x.id, 10) === parseInt(prevId, 10));
            if (!groupsAllMode && prevCo?.group_id) {
              setSelectedGroup(String(prevCo.group_id).toUpperCase());
              sessionStorage.setItem("dashboard_group_filter", String(prevCo.group_id).toUpperCase());
              persistDashboardGroupsAllMode(false);
            }
            applyCompanySelection(prevId);
          }
        });
      }, COMPANY_SESSION_DEFER_MS);
    },
    [
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      mergedSubsetIds,
      companies,
      groupIds,
      applyCompanySelection,
      syncCompanySession,
      clearCompanySelection,
      primeCurrenciesFromCache,
      primeDashboardFromCache,
      prefetchDashboardCompany,
      prefetchDashboardGroupAll,
      shouldPrefetchCompanyScope,
      me,
      resetCurrencyForCompanySwitch,
    ]
  );

  const handlePickAllInGroup = useCallback(() => {
    let list = resolveMergeCompanyList();
    // Defense in depth: when picker shows multiple companies, never no-op All.
    if (!list.length && companiesForPicker?.length > 1) {
      list = companiesForPicker;
    }
    const groupForPersist = groupsAllMode ? null : selectedGroup;
    const sidebarGroup = groupsAllMode ? readGroupsAllSidebarGroup() : groupForPersist;

    if (groupAllMode && companyId == null) {
      // Company login without group-ledger access: keep Company All on.
      if (
        isCompanyLogin(me) &&
        !isGroupLogin(me) &&
        !canUseGroupOnlyMode(me, groupForPersist, companies)
      ) {
        return;
      }

      // Group / privileged company login: fully close Company All (no subsidiary auto-pick).
      scopeInteractionGenRef.current += 1;
      setLoadError("");
      persistDashboardGroupAllMode(false);
      persistDashboardFilterState(groupForPersist, null, {
        allowGroupOnly: canUseGroupOnlyMode(me, groupForPersist, companies),
        groupsAllMode,
      });
      setGroupAllMode(false);
      setMergedSubsetIds(null);
      setCompanyId(null);
      primeCurrenciesFromCache({
        companyId: null,
        selectedGroup: groupForPersist,
        groupsAllMode,
        groupAllMode: false,
        clearOnMiss: true,
      });
      primeDashboardFromCache({
        companyId: null,
        selectedGroup: groupForPersist,
        groupsAllMode,
        groupAllMode: false,
        mergedSubsetIds: null,
      });
      notifyDashboardGroupFilterChanged(
        groupForPersist,
        null,
        buildDashboardSidebarNotifyOptions(null, sidebarGroup),
      );
      return;
    }

    if (!list.length) return;
    scopeInteractionGenRef.current += 1;
    setLoadError("");
    persistDashboardFilterState(groupForPersist, null, {
      allowGroupOnly: false,
      companyAllMode: true,
      groupsAllMode,
    });
    setGroupAllMode(true);
    setMergedSubsetIds(null);
    setCompanyId(null);
    primeCurrenciesFromCache({
      companyId: null,
      selectedGroup: groupForPersist,
      groupsAllMode,
      groupAllMode: true,
    });
    primeDashboardFromCache({
      companyId: null,
      selectedGroup: groupForPersist,
      groupsAllMode,
      groupAllMode: true,
      mergedSubsetIds: null,
    });
    notifyDashboardGroupFilterChanged(
      groupForPersist,
      null,
      buildDashboardSidebarNotifyOptions(null, sidebarGroup),
    );
    if (groupForPersist) {
      const interactionGen = scopeInteractionGenRef.current;
      window.setTimeout(() => {
        if (interactionGen !== scopeInteractionGenRef.current) return;
        void prefetchDashboardGroupAll(groupForPersist);
      }, COMPANY_SWITCH_PREFETCH_DELAY_MS);
    }
  }, [
    groupAllMode,
    companyId,
    resolveMergeCompanyList,
    companiesForPicker,
    groupsAllMode,
    selectedGroup,
    companies,
    me,
    primeCurrenciesFromCache,
    primeDashboardFromCache,
    prefetchDashboardGroupAll,
  ]);

  const handlePickAllGroups = useCallback(() => {
    const companyGroupsAllLedger = companyLoginCanUseGroupsAllLedger(me);
    const companyLoginGroupsAll =
      isCompanyLogin(me) && !isGroupLogin(me) && !companyGroupsAllLedger;
    const preserveCompanyId = (() => {
      if (!companyLoginGroupsAll) return null;
      const fromState = companyId != null ? parseInt(companyId, 10) : Number.NaN;
      if (Number.isFinite(fromState) && fromState > 0) return fromState;
      const fromMe = me?.company_id != null ? parseInt(me.company_id, 10) : Number.NaN;
      if (Number.isFinite(fromMe) && fromMe > 0) return fromMe;
      const picker = allGroupedCompaniesForPicker(companies, ledgerGroupIds);
      const first = picker[0]?.id != null ? parseInt(picker[0].id, 10) : Number.NaN;
      return Number.isFinite(first) && first > 0 ? first : null;
    })();
    const useCompanyAllAggregate = companyLoginGroupsAll && !preserveCompanyId;
    const groupLoginAllGroupsAggregate =
      isGroupLogin(me) && !companyGroupsAllLedger && !useCompanyAllAggregate;
    if (
      groupsAllMode &&
      companyId == null &&
      !groupAllMode &&
      !companyGroupsAllLedger &&
      !(companyLoginGroupsAll && preserveCompanyId) &&
      !useCompanyAllAggregate
    ) {
      return;
    }
    scopeInteractionGenRef.current += 1;
    setLoadError("");
    const sidebarAnchorGroup = resolveGroupsAllSidebarAnchorGroup(
      groupsAllMode ? readGroupsAllSidebarGroup() : selectedGroup,
    );
    if (sidebarAnchorGroup) persistGroupsAllSidebarGroup(sidebarAnchorGroup);
    persistDashboardGroupsAllMode(true);
    persistDashboardGroupOnlyMode(false);
    const nextGroupAllMode = companyGroupsAllLedger
      ? false
      : useCompanyAllAggregate || groupLoginAllGroupsAggregate;
    persistDashboardGroupAllMode(nextGroupAllMode);
    if (companyGroupsAllLedger) {
      persistDashboardSelectedCompany(null);
    } else if (preserveCompanyId && !useCompanyAllAggregate) {
      persistDashboardFilterState(null, preserveCompanyId, {
        allowGroupOnly: false,
        groupsAllMode: true,
      });
    } else {
      persistDashboardSelectedCompany(null);
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("dashboard_group_filter");
    }
    const nextCompanyId = companyGroupsAllLedger
      ? null
      : companyLoginGroupsAll && !useCompanyAllAggregate
        ? preserveCompanyId
        : null;
    const notifyRow =
      nextCompanyId != null
        ? companies.find((c) => parseInt(c.id, 10) === parseInt(nextCompanyId, 10))
        : null;
    setGroupsAllMode(true);
    setGroupAllMode(nextGroupAllMode);
    setMergedSubsetIds(null);
    setSelectedGroup(null);
    setCompanyId(nextCompanyId);
    notifyDashboardGroupFilterChanged(
      null,
      nextCompanyId,
      buildDashboardSidebarNotifyOptions(
        notifyRow,
        sidebarAnchorGroup,
        { ignoreGroupOnly: true },
      ),
    );
    primeCurrenciesFromCache({
      companyId: nextCompanyId,
      selectedGroup: null,
      groupsAllMode: true,
      groupAllMode: nextGroupAllMode,
    });
    primeDashboardFromCache({
      companyId: nextCompanyId,
      selectedGroup: null,
      groupsAllMode: true,
      groupAllMode: nextGroupAllMode,
      mergedSubsetIds: null,
    });
    if (
      nextCompanyId != null &&
      Number(nextCompanyId) !== Number(companyId)
    ) {
      void syncCompanySession(nextCompanyId, null);
    }
  }, [
    groupsAllMode,
    companyId,
    groupAllMode,
    selectedGroup,
    companies,
    groupIds,
    ledgerGroupIds,
    me,
    primeCurrenciesFromCache,
    primeDashboardFromCache,
    syncCompanySession,
  ]);

  const autoPickCompanySigRef = useRef("");

  useLayoutEffect(() => {
    if (!gcBootstrapReady) return;
    if (!me || companyId != null || groupAllMode) return;
    if (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
    ) {
      return;
    }
    if (
      companyLoginRequiresSubsidiaryWithGroup(me) &&
      !selectedGroup &&
      !groupsAllMode &&
      !resolveCompanyLoginGroupedSubsidiary(me, companies, groupIds)
    ) {
      return;
    }
    // Intentional group-only (company pill cleared): never re-pick C168 from stale PHP session.
    if (isDashboardGroupOnlyMode() && readDashboardSelectedCompanyId() == null) {
      return;
    }
    if (groupsAllMode) {
      return;
    }
    if (
      isDashboardGroupOnlyMode() &&
      canUseGroupOnlyMode(me, selectedGroup, companies)
    ) {
      return;
    }

    persistDashboardGroupOnlyMode(false);

    let id = me?.company_id ? parseInt(me.company_id, 10) : Number.NaN;
    let bootGroup = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;

    if (selectedGroup && companies.length) {
      const pick = pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
        me,
        preferredCompanyId: Number.isFinite(id) ? id : null,
      });
      if (pick?.id) {
        id = parseInt(pick.id, 10);
        bootGroup = selectedGroup;
      }
    } else if (Number.isFinite(id)) {
      const row = companies.find((c) => parseInt(c.id, 10) === id);
      const g = row && !companyRowIsIndependent(row, groupIds) ? normalizeCompanyGroupId(row) : null;
      if (g) {
        bootGroup = g;
        setSelectedGroup(g);
        persistDashboardGroupFilter(g);
      }
    }

    if (!Number.isFinite(id) || id <= 0) return;

    const pickSig = `${bootGroup || ""}|${id}`;
    if (autoPickCompanySigRef.current === pickSig) return;
    autoPickCompanySigRef.current = pickSig;

    setGroupAllMode(false);
    persistDashboardFilterState(bootGroup, id, { allowGroupOnly: false });
    applyCompanySelection(id);
    primeCurrenciesFromCache({
      companyId: id,
      selectedGroup: bootGroup,
      groupsAllMode: false,
      groupAllMode: false,
      clearOnMiss: true,
    });
    primeDashboardFromCache({
      companyId: id,
      selectedGroup: bootGroup,
      groupsAllMode: false,
      groupAllMode: false,
      mergedSubsetIds: null,
    });
    notifyDashboardGroupFilterChanged(bootGroup, id);
    const bootRow = companies.find((co) => parseInt(co.id, 10) === id);
    void syncCompanySession(id, bootGroup);
  }, [
    gcBootstrapReady,
    companiesSig,
    me?.user_id,
    me?.id,
    selectedGroup,
    companyId,
    groupsAllMode,
    groupAllMode,
    groupIds,
    companies,
    applyCompanySelection,
    primeCurrenciesFromCache,
    primeDashboardFromCache,
    prefetchDashboardCompany,
    syncCompanySession,
  ]);

  const toggleChartSeries = useCallback((idx) => {
    setChartVisible((v) => {
      const n = [...v];
      n[idx] = !n[idx];
      return n;
    });
  }, []);

  const closeCompanyAccessModal = useCallback(() => {
    setCompanyAccessModal({ open: false, message: "" });
  }, []);

  const handleToggleAllCurrencies = useCallback(() => {
    if (!currencies.length) return;
    setShowAllCurrencies((prev) => !prev);
  }, [currencies.length]);

  const resolveCurrencyOrderCompanyId = useCallback(() => {
    return resolveDashboardCurrencyOrderCompanyId({
      companyId,
      selectedGroup,
      companies,
      me,
      companiesForPicker,
    });
  }, [companyId, selectedGroup, companies, me, companiesForPicker]);

  const applyCrossPageCurrency = useCallback(
    (code) => {
      scopeInteractionGenRef.current += 1;
      setShowAllCurrencies(false);
      primeDashboardFromCache({ currencyCode: code });
      setCurrencyCode(code);
    },
    [primeDashboardFromCache]
  );

  const { persistSelection: persistCrossPageCurrency } = useCrossPageCurrencySync({
    enabled: currencies.length > 0,
    companyId,
    selectedGroup,
    availableCodes: currencies,
    currentCode: currencyCode,
    onApplyCode: applyCrossPageCurrency,
  });

  const handleCurrencyChange = useCallback(
    (code) => {
      if (skipNextCurrencyClickRef.current) {
        skipNextCurrencyClickRef.current = false;
        return;
      }
      // Cancel background company/group warms so they do not race the currency load.
      scopeInteractionGenRef.current += 1;
      setShowAllCurrencies(false);
      primeDashboardFromCache({
        currencyCode: code,
        companyId: groupAllMode ? null : companyId,
        selectedGroup,
        groupsAllMode,
        groupAllMode,
      });
      setCurrencyCode(code);
      persistCrossPageCurrency(code);
    },
    [
      persistCrossPageCurrency,
      primeDashboardFromCache,
      groupAllMode,
      companyId,
      selectedGroup,
      groupsAllMode,
    ],
  );

  const handleCurrencyDropOn = useCallback(
    async (e, targetCode) => {
      e.preventDefault();
      const dragged = e.dataTransfer?.getData("text/plain");
      if (!dragged || !targetCode || dragged === targetCode) return;
      const list = [...currencies];
      const fromI = list.indexOf(dragged);
      const toI = list.indexOf(targetCode);
      if (fromI < 0 || toI < 0 || fromI === toI) return;
      skipNextCurrencyClickRef.current = true;
      const next = [...list];
      const [moved] = next.splice(fromI, 1);
      next.splice(toI, 0, moved);
      setCurrencies(next);
      userCurrencyDisplayOrderRef.current = next;
      persistUserCurrencyDisplayOrder(next);
      const orderCompanyId = resolveCurrencyOrderCompanyId();
      if (orderCompanyId != null) {
        persistCurrencyDisplayOrder(orderCompanyId, next);
        persistDashboardCurrencyDisplayOrder(currencyDisplayOrderByCompanyRef, orderCompanyId, next);
        if (Number.isFinite(parseInt(companyId, 10)) && parseInt(companyId, 10) === orderCompanyId) {
          currenciesByCompanyRef.current.set(orderCompanyId, next);
        }
      }
      writeDashboardGroupCurrencyCaches(currenciesByGroupRef.current, {
        groupKey: selectedGroup ? String(selectedGroup).trim().toUpperCase() : null,
        groupsAllMode,
        groupAllMode,
        codes: next,
      });
      try {
        const json = await saveUserCurrencyOrder(next, { companyId: orderCompanyId ?? undefined });
        if (json?.success && orderCompanyId != null) {
          persistCurrencyDisplayOrder(orderCompanyId, next);
        }
      } catch {
        /* localStorage already updated on drag */
      }
    },
    [
      currencies,
      resolveCurrencyOrderCompanyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      companyId,
    ]
  );

  return {
    me,
    loadError,
    companyAccessModal,
    closeCompanyAccessModal,
    gcBootstrapReady,
    companiesForPicker,
    groupIds,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    displayGroupAllMode,
    displaySelectedGroup,
    displayGroupsAllMode,
    displayEffectiveDateRangeText,
    mergedSubsetIds,
    companyId,
    displayCompanyId,
    displayCurrencies,
    displayFilterCurrencyCode,
    currencies,
    currencyCode: displayCurrencyCode,
    showAllCurrencies,
    canShowAllCurrencies,
    handleToggleAllCurrencies,
    handleCurrencyChange,
    handleCurrencyDropOn,
    loading: kpiLoading,
    dashboardViewReady,
    scopeDataPending,
    dashboardData,
    kpi,
    kpiCompareLabel,
    kpiFooter,
    chartRows,
    chartSeries,
    chartVisible,
    toggleChartSeries,
    chartDateRangeText,
    chartXAxisLayout,
    chartDataStable,
    dashboardScopeKey,
    displayScopeKey,
    earningsCurrencyRows,
    panelCurrencyRows,
    useConvertedEarnings,
    earningsBreakdownShowsRate,
    summaryPanelLabel,
    summaryEarningsValue,
    summaryConversionNote,
    summaryEarningsLoading,
    earningsPanelStable,
    earningsByCurrencyLoading,
    exchangeRates: summaryExchangeRates,
    exchangeRatesError: summaryExchangeRatesError,
    exchangeRatesLoading: summaryExchangeRatesLoading,
    exchangeRateScopeKey,
    convertedPanelTotal,
    showSummaryPanelTabs,
    showEarningPanelTab,
    showNetProfitForTab,
    earningsPanelView,
    setEarningsPanelView,
    handlePickGroup,
    handlePickAllGroups,
    handlePickCompany,
    handlePickAllInGroup,
  };
}
