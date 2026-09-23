import { fetchCurrencyListByTenantId } from "./accountApi.js";
import { orderCurrencyCodesForCompany } from "./currencyOrder.js";
import {
  companiesForPicker,
  normalizeGroupId,
  resolveViewGroupForCompany,
} from "./dashboardScope.js";

function normalizeCodes(rows) {
  return [
    ...new Set(
      (rows || [])
        .map((row) => String(row?.code ?? row ?? "")
          .trim()
          .toUpperCase())
        // ISO-like: exactly 3 letters. Drops junk such as "1", "AA", "AAAAAA".
        .filter((code) => /^[A-Z]{3}$/.test(code)),
    ),
  ];
}

/**
 * Currency Setting codes for one tenant — `POST /api/currency/list?tenant_id=`.
 *
 * Replaces the legacy `get_company_currencies_api.php` call (and its second
 * `subsidiary_accounts_only=1` attempt), which Spring has no equivalent for. A GROUP is just
 * another tenant row, so the group-ledger scope passes the group's own tenant id through the very
 * same call — desktop does the same (`useDashboardPage.js` "tenant 表里也是自己一行，跟公司一样
 * 可以直接查 /api/currency/list?tenant_id=").
 *
 * The `viewGroup` parameter is kept so the existing callers don't change, but it is no longer sent:
 * Spring's currency list has no view-group/subsidiary concept.
 */
async function fetchCompanyCurrencySettingCodes(companyId, viewGroup = "", signal) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return [];
  try {
    const rows = await fetchCurrencyListByTenantId(cid, signal);
    return normalizeCodes(rows);
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return [];
  }
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const pool = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return results;
}

function resolveOrderCompanyId(companyId, companies, selectedGroup, groupsAllMode) {
  const cid = Number(companyId);
  if (Number.isFinite(cid) && cid > 0) return cid;
  const rows = companiesForPicker(companies, { selectedGroup, groupsAllMode });
  const first = Number(rows?.[0]?.id);
  return Number.isFinite(first) && first > 0 ? first : null;
}

/**
 * Load currency pills like desktop: company Currency Setting (+ subsidiary scope when Group selected).
 * Company/Group "All" unions codes from visible companies.
 * Group-only uses scope account currencies (group ledger books).
 * Final order matches desktop per-company order (not A–Z).
 */
export async function fetchMobileCurrencyCodes({
  companyId,
  selectedGroup,
  groupAllMode,
  groupsAllMode,
  companies,
  signal,
}) {
  const group = normalizeGroupId(selectedGroup);
  const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
  const groupOnly = Boolean(group && !groupAllMode && !groupsAllMode && !hasCompany);
  let codes = [];
  let orderCompanyId = resolveOrderCompanyId(companyId, companies, selectedGroup, groupsAllMode);

  if (groupOnly) {
    // Union of the member companies' Currency Setting lists. Desktop instead reads the GROUP's own
    // tenant row through the same `/api/currency/list` call; mobile keeps the union so the pills
    // don't change in this pass (both work — see ../../../docs/c168-mobile-springboot-api-audit.md §20).
    // No `get_scope_account_currencies_api.php` fallback any more: that legacy path has no Spring
    // successor and desktop short-circuits it, and the union below already covers the scope.
    try {
      const rows = companiesForPicker(companies, { selectedGroup: group, groupsAllMode: false });
      const ids = rows
        .map((c) => Number(c.id))
        .filter((id) => Number.isFinite(id) && id > 0)
        .slice(0, 20);
      if (ids.length) {
        orderCompanyId = ids[0];
        const parts = await mapPool(ids, 5, async (id) => {
          if (signal?.aborted) return [];
          return fetchCompanyCurrencySettingCodes(id, group, signal);
        });
        codes = [...new Set(parts.flat())];
      }
    } catch (e) {
      if (e?.name === "AbortError") throw e;
    }
  } else if (groupsAllMode || groupAllMode) {
    const rows = companiesForPicker(companies, { selectedGroup, groupsAllMode });
    const ids = rows
      .map((c) => Number(c.id))
      .filter((id) => Number.isFinite(id) && id > 0)
      .slice(0, 30);
    if (!ids.length) return ["MYR"];
    orderCompanyId = ids[0];

    // Cap concurrency so All-mode does not stall bootstrap on weak networks.
    const parts = await mapPool(ids, 6, async (id) => {
      if (signal?.aborted) return [];
      const row = (companies || []).find((c) => Number(c.id) === id);
      const vg = groupsAllMode ? resolveViewGroupForCompany(row, selectedGroup) : group;
      return fetchCompanyCurrencySettingCodes(id, vg, signal);
    });
    codes = [...new Set(parts.flat())];
  } else {
    codes = await fetchCompanyCurrencySettingCodes(companyId, group, signal);
    orderCompanyId = Number(companyId);
  }

  if (!codes.length) return ["MYR"];
  return orderCurrencyCodesForCompany(codes, orderCompanyId, signal);
}
