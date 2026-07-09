import { buildApiUrl } from "../../utils/core/apiUrl.js";
import {
  companyRowIsGroupEntity,
  fetchOwnerCompaniesAll,
  getCachedOwnerCompanies,
  readDashboardSelectedCurrency,
  readPersistedDashboardGcFilter,
} from "../../utils/company/sharedCompanyFilter.js";
import {
  bindDashboardSessionCache,
  buildDashboardCacheKey,
  getDashboardCache,
  setDashboardCache,
  setDashboardPayloadCache,
} from "../../utils/dashboard/dashboardCache.js";
import { DASHBOARD_BOOTSTRAP_API } from "./lib/dashboardConstants.js";
import { defaultDashboardDateRange } from "./lib/dashboardDateUtils.js";

const warmInflight = new Map();
const bootstrapInflight = new Map();

function warmKey(me) {
  return [
    me?.user_id ?? me?.id ?? "",
    me?.login_scope ?? "",
    me?.login_identifier ?? "",
  ].join("|");
}

function normalizeBootstrapDedupeKey(queryString) {
  const params = new URLSearchParams(queryString);
  params.delete("prefetch");
  return params.toString();
}

async function fetchBootstrapDeduped(requestKey) {
  const dedupeKey = normalizeBootstrapDedupeKey(requestKey);
  if (bootstrapInflight.has(dedupeKey)) return bootstrapInflight.get(dedupeKey);
  const promise = (async () => {
    const res = await fetch(buildApiUrl(`${DASHBOARD_BOOTSTRAP_API}?${requestKey}`), {
      credentials: "include",
    });
    const json = await res.json();
    return { res, json };
  })().finally(() => {
    bootstrapInflight.delete(dedupeKey);
  });
  bootstrapInflight.set(dedupeKey, promise);
  return promise;
}

function appendGroupTabParams(q, viewGroup, { subsidiaryOnly = false } = {}) {
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (!vg) {
    if (subsidiaryOnly) q.set("subsidiary_accounts_only", "1");
    return;
  }
  q.set("view_group", vg);
  q.set("group_id", vg);
  if (subsidiaryOnly) q.set("subsidiary_accounts_only", "1");
}

/**
 * Sidebar idle / layout warm — prefetch dashboard bootstrap for persisted scope.
 * @param {{ me?: object|null }} options
 */
export function warmDashboardRouteCache({ me = null } = {}) {
  if (!me?.user_id && !me?.id) return null;
  const perms = Array.isArray(me.permissions) ? me.permissions : [];
  const hasFull = perms.length === 0;
  if (!hasFull && !perms.includes("home")) return null;

  const key = warmKey(me);
  if (warmInflight.has(key)) return warmInflight.get(key);

  const promise = (async () => {
    bindDashboardSessionCache(key);

    let rows = getCachedOwnerCompanies();
    if (!rows?.length) {
      try {
        rows = await fetchOwnerCompaniesAll();
      } catch {
        return;
      }
    }
    if (!rows?.length) return;

    const persisted = readPersistedDashboardGcFilter();
    if (persisted.groupsAllMode || persisted.groupAllMode) return;

    const { dateFrom, dateTo } = defaultDashboardDateRange();
    const companyId =
      persisted.groupOnly || persisted.companyId == null
        ? null
        : Number(persisted.companyId);
    const selectedGroup = persisted.selectedGroup
      ? String(persisted.selectedGroup).trim().toUpperCase()
      : null;

    if (companyId == null && !selectedGroup) return;

    const row =
      companyId != null
        ? rows.find((c) => Number(c.id) === Number(companyId))
        : null;
    const usesLedger = Boolean(selectedGroup && row && companyRowIsGroupEntity(row, selectedGroup));
    const subScope = Boolean(selectedGroup && row && !usesLedger);

    const scopeCompanyKey =
      companyId != null
        ? subScope
          ? `sub:${companyId}`
          : companyId
        : selectedGroup
          ? `group:${selectedGroup}`
          : null;
    if (!scopeCompanyKey) return;

    const currency =
      readDashboardSelectedCurrency(
        buildDashboardCacheKey({
          companyId: scopeCompanyKey,
          dateFrom,
          dateTo,
          currencyCode: "",
          selectedGroup,
          groupAllMode: false,
        })
      ) || "";

    const cacheKey = buildDashboardCacheKey({
      companyId: scopeCompanyKey,
      dateFrom,
      dateTo,
      currencyCode: currency,
      selectedGroup,
      groupAllMode: false,
    });
    if (getDashboardCache(cacheKey)?.current) return;

    const q = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
      bootstrap_scope: "kpi",
      prefetch: "1",
    });
    if (companyId == null && selectedGroup) {
      const vg = String(selectedGroup).trim().toUpperCase();
      q.set("view_group", vg);
      q.set("group_id", vg);
    } else if (companyId != null) {
      q.set("company_id", String(companyId));
      appendGroupTabParams(q, selectedGroup, { subsidiaryOnly: subScope });
    } else {
      return;
    }
    if (currency) q.set("currency", currency);

    const requestKey = q.toString();
    const { res, json } = await fetchBootstrapDeduped(requestKey);
    if (!res.ok || !json.success || !json.data?.current) return;

    const current = json.data.current;
    const payloadKey = normalizeBootstrapDedupeKey(requestKey);
    setDashboardPayloadCache(payloadKey, current);

    setDashboardCache(cacheKey, {
      current,
      previous: json.data.previous ?? undefined,
    });
  })().finally(() => {
    if (warmInflight.get(key) === promise) warmInflight.delete(key);
  });

  warmInflight.set(key, promise);
  return promise;
}
