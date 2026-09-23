import { notifyTransactionListInvalidated } from "../transactionPaymentLogic.js";
import { REALTIME_DOMAINS } from "./realtimeEvents.js";

/**
 * Writes outside the ledger's own domain that also change account balances — a maintenance
 * delete, a capture correction, a domain fee charge, etc. Kept as one shared set instead of
 * being re-checked ad hoc per domain, since several unrelated domains (datacapture,
 * maintenance, domain) all gate the same "does this also dirty the ledger" question on it.
 *
 * Every entry must have a backend write path that actually calls
 * `RealtimeEventPublisher.publish(...)` with this source. Verified against the backend's 17
 * publish call sites: these seven are exactly the ledger-touching sources that have a
 * publisher. (`capture_update`, `payment_update`, `transaction_delete`, `domain_fee_update`
 * were removed by desktop for the same reason — an entry with no publisher can never fire.)
 *
 * Copied from Count-frontend/src/lib/realtime/realtimeInvalidationRules.js (desktop).
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

/** Mobile has no route warm-cache layer and no TanStack Query cache, so the only sink is the
 *  ledger invalidation broadcast (see `notifyTransactionListInvalidated`). */
function invalidateLedger(tag) {
  notifyTransactionListInvalidated(tag);
}

/**
 * One entry per domain this bridge reacts to. Adding a domain (or changing what it invalidates)
 * only ever means editing this table — the executor in {@link runRealtimeInvalidationRule} never
 * needs to change.
 *
 * Domains not listed here are intentionally silent: their pages subscribe directly via
 * `useRealtimeDomain` (`ACCOUNTS`, `OWNERSHIP`, `ANNOUNCEMENTS`, `MAINTENANCE` pages, …).
 * `PROCESSES`/`USERS` have no mobile subscriber at all yet.
 *
 * @typedef {object} DomainRule
 * @property {() => void} [sideEffects] - Cache-clearing calls with no query key of their own.
 *   Desktop sets these (route warm caches); mobile has none, so no rule currently uses it. Kept
 *   in the shape so the two tables stay comparable and a future cache layer has a home.
 * @property {true | ((source: string) => boolean)} [ledgerTouching] - `true` if this domain *is*
 *   the ledger; a predicate on `source` if only some writes in this domain also touch it.
 */
const RULES = {
  [REALTIME_DOMAINS.LEDGER]: {
    ledgerTouching: true,
  },

  [REALTIME_DOMAINS.DATACAPTURE]: {
    ledgerTouching: (source) => LEDGER_TOUCHING_SOURCES.has(source),
  },

  [REALTIME_DOMAINS.MAINTENANCE]: {
    // No cache of its own — each maintenance page subscribes directly via useRealtimeDomain.
    // This only covers the ledger side effect.
    ledgerTouching: (source) => LEDGER_TOUCHING_SOURCES.has(source),
  },

  [REALTIME_DOMAINS.DOMAIN]: {
    ledgerTouching: (source) => LEDGER_TOUCHING_SOURCES.has(source) || /fee/.test(source || ""),
  },

  /* Desktop's ACCOUNTS rule carries a ledger belt for `user_account_permissions` /
   * `update_permissions`. Those two sources have no backend publisher (verified by grepping
   * every `publish`/`publishGlobal` call site), so the rule is unreachable there and is
   * deliberately not ported. Add an entry here if a backend write path ever publishes them. */
};

/** Runs the domain's rule (if any) against one realtime event. */
export function runRealtimeInvalidationRule(detail) {
  const domain = String(detail?.domain || "");
  const rule = RULES[domain];
  if (!rule) return;

  rule.sideEffects?.();

  const source = String(detail?.source || "");
  const touchesLedger =
    rule.ledgerTouching === true ||
    (typeof rule.ledgerTouching === "function" && rule.ledgerTouching(source));
  if (touchesLedger) {
    invalidateLedger(`realtime_${source || domain}`);
  }
}
