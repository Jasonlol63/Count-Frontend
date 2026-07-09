import {
  fetchOwnerCompaniesAll,
  getCachedOwnerCompanies,
} from "../../utils/company/sharedCompanyFilter.js";
import { getCategories, getUserCurrencyOrder } from "./lib/transactionApi.js";
import { formatDmy } from "./lib/transactionFormat.js";
import { buildTransactionBootSnapshot } from "./lib/transactionBootSnapshot.js";
import { resolveTransactionScope, resolveTransactionCurrencyOrderCompanyId } from "./lib/transactionScope.js";
import { prefetchTransactionScopeBundle } from "./lib/transactionScopePrefetch.js";

const warmInflight = new Map();

function warmKey(scopeKey) {
  return String(scopeKey || "default");
}

/**
 * Sidebar hover / layout idle — warm metadata + search so /transaction paints with cache.
 * @param {{ me?: object|null }} options
 */
export function warmTransactionRouteCache({ me = null } = {}) {
  if (!me?.user_id) return null;
  const perms = Array.isArray(me.permissions) ? me.permissions : [];
  const hasFull = perms.length === 0;
  if (!hasFull && !perms.includes("payment")) return null;

  const key = warmKey("boot");
  if (warmInflight.has(key)) return warmInflight.get(key);

  const promise = (async () => {
    let rows = getCachedOwnerCompanies();
    if (!rows?.length) {
      try {
        rows = await fetchOwnerCompaniesAll();
      } catch {
        return;
      }
    }
    if (!rows?.length) return;

    const snap = buildTransactionBootSnapshot(me, rows, {
      queryCompany: new URL(window.location.href).searchParams.get("company_id"),
    });
    if (!snap) return;

    const scope = resolveTransactionScope(snap);
    if (!scope) return;
    const todayDmy = formatDmy(new Date());
    const orderCompanyId = resolveTransactionCurrencyOrderCompanyId(
      scope,
      snap.snapCompaniesAll || snap.snapCompanies,
    );

    await Promise.all([
      getCategories().catch(() => null),
      orderCompanyId
        ? getUserCurrencyOrder({ companyId: orderCompanyId }).catch(() => null)
        : Promise.resolve(null),
      prefetchTransactionScopeBundle(null, { nextSnap: snap, todayDmy }),
    ]);
  })().finally(() => {
    if (warmInflight.get(key) === promise) warmInflight.delete(key);
  });

  warmInflight.set(key, promise);
  return promise;
}
