import { onRealtimeInvalidate, REALTIME_DOMAINS } from "../../../lib/realtime/realtimeEvents.js";

/**
 * @deprecated Prefer app-wide AppRealtimeBridge + onRealtimeInvalidate.
 * Kept for callers that still expect a ledger-only unsubscribe helper.
 *
 * @param {object} opts
 * @param {() => void} opts.onLedgerChanged
 * @returns {() => void}
 */
export function subscribeTransactionLedgerRealtime({ onLedgerChanged } = {}) {
  return onRealtimeInvalidate([REALTIME_DOMAINS.LEDGER], () => {
    onLedgerChanged?.();
  });
}
