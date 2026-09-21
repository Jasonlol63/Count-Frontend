import { transactionQueryKeys } from "../../pages/transaction/lib/transactionApi.js";
import { notifyTransactionListInvalidated } from "../../pages/transaction/lib/transactionPaymentLogic.js";
import { dataCaptureQueryKeys } from "../../pages/datacapture/lib/dataCaptureApi.js";
import { clearAccountListRouteWarmCache } from "../../pages/account/accountRoutePrefetch.js";
import { clearProcessListRouteWarmCaches } from "../../pages/processlist/processRoutePrefetch.js";
import { clearAllOwnershipCompaniesCache } from "../../pages/ownership/ownershipRoutePrefetch.js";
import { clearOwnerCompaniesCache } from "../../utils/company/sharedCompanyFilter.js";
import { clearAllAutoRenewListCache } from "../../pages/autorenew/autoRenewRoutePrefetch.js";
import { REALTIME_DOMAINS } from "./realtimeEvents.js";

/**
 * Writes outside the ledger's own domain that also change account balances — a maintenance
 * delete, a capture correction, a domain fee charge, etc. Kept as one shared set instead of
 * being re-checked ad hoc per domain, since several unrelated domains (accounts, datacapture,
 * maintenance, domain) all gate the same "does this also dirty the ledger" question on it.
 * <p>
 * Every entry here must have a backend write path that actually calls
 * {@code RealtimeEventPublisher.publish(...)} with this source — an entry with no publisher is
 * dead weight that can never fire. (Sources without one yet — payment_update, transaction_delete,
 * capture_update, domain_fee_update — were removed rather than kept as unreachable placeholders;
 * re-add them once/if a corresponding backend action exists and publishes with that name.)
 */
const LEDGER_TOUCHING_SOURCES = new Set([
  "capture_delete",
  "payment_delete",
  "bankprocess_delete",
  "post_to_transaction",
  "restore",
  "domain_fee_create",
  "summary_submit",
]);

function invalidateLedgerCaches(queryClient, tag) {
  clearAllAutoRenewListCache();
  notifyTransactionListInvalidated(tag);
  void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
  void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInboxRoot() });
}

/**
 * One entry per domain this bridge reacts to. Adding a domain (or changing what it invalidates)
 * only ever means editing this table — the executor in {@link runRealtimeInvalidationRule} never
 * needs to change. Domains not listed here (announcements, app) are intentionally silent: their
 * pages subscribe directly via `useRealtimeDomain`.
 *
 * @typedef {object} DomainRule
 * @property {() => void} [sideEffects] - Cache-clearing calls with no TanStack Query key of their own.
 * @property {() => unknown[][]} [queryKeys] - Exact query keys to invalidate.
 * @property {(query: object) => boolean} [queryPredicate] - Predicate form, for keys that vary by row shape.
 * @property {true | ((source: string) => boolean)} [ledgerTouching] - `true` if this domain *is*
 *   the ledger; a predicate on `source` if only some writes in this domain also touch it.
 */
const RULES = {
  [REALTIME_DOMAINS.LEDGER]: {
    ledgerTouching: true,
  },

  [REALTIME_DOMAINS.ACCOUNTS]: {
    sideEffects: () => clearAccountListRouteWarmCache(),
    queryPredicate: (q) =>
      ["tx-accounts", "tx-company-currencies", "tx-scope-account-currencies"].includes(q.queryKey?.[0]),
    // User Acc whitelist changed — belt if the ledger publish itself was missed.
    ledgerTouching: (source) => source === "user_account_permissions" || source === "update_permissions",
  },

  [REALTIME_DOMAINS.PROCESSES]: {
    sideEffects: () => clearProcessListRouteWarmCaches(),
    queryKeys: () => [dataCaptureQueryKeys.root()],
  },

  [REALTIME_DOMAINS.OWNERSHIP]: {
    sideEffects: () => {
      clearAllOwnershipCompaniesCache();
      clearOwnerCompaniesCache();
    },
  },

  [REALTIME_DOMAINS.DATACAPTURE]: {
    queryKeys: () => [dataCaptureQueryKeys.root()],
    queryPredicate: (q) => q.queryKey?.[0] === "summary",
    ledgerTouching: (source) => LEDGER_TOUCHING_SOURCES.has(source),
  },

  [REALTIME_DOMAINS.USERS]: {
    queryPredicate: (q) => ["users", "user-list", "useraccess"].includes(q.queryKey?.[0]),
  },

  [REALTIME_DOMAINS.MAINTENANCE]: {
    // No query of its own — each maintenance page (Transaction/Payment/Bankprocess/Capture)
    // subscribes directly via useRealtimeDomain. This only covers the ledger side effect.
    ledgerTouching: (source) => LEDGER_TOUCHING_SOURCES.has(source),
  },

  [REALTIME_DOMAINS.DOMAIN]: {
    ledgerTouching: (source) => LEDGER_TOUCHING_SOURCES.has(source) || /fee/.test(source || ""),
  },
};

/** Runs the domain's rule (if any) against one realtime event. */
export function runRealtimeInvalidationRule(queryClient, detail) {
  const domain = String(detail?.domain || "");
  const rule = RULES[domain];
  if (!rule) return;

  rule.sideEffects?.();
  for (const queryKey of rule.queryKeys?.() ?? []) {
    void queryClient.invalidateQueries({ queryKey });
  }
  if (rule.queryPredicate) {
    void queryClient.invalidateQueries({ predicate: rule.queryPredicate });
  }

  const source = String(detail?.source || "");
  const touchesLedger =
    rule.ledgerTouching === true || (typeof rule.ledgerTouching === "function" && rule.ledgerTouching(source));
  if (touchesLedger) {
    invalidateLedgerCaches(queryClient, `realtime_${source || domain}`);
  }
}
