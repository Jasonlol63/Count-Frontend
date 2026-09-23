import { getHistory } from "./transactionApi.js";
import {
  memberHistoryClosingBalancesForAllCurrencies,
  normalizeNumber,
} from "./memberHelpers.js";

/**
 * Single account × currency closing balance — same ledger as Payment History / desktop mini grid.
 * Dates are YMD, passed straight through to Spring `/api/transaction/history` (no DMY
 * conversion any more — that was only needed for the old PHP `history_api.php`).
 */
export async function fetchAccountHistoryClosingBalance(
  accountId,
  currency,
  fromYmd,
  toYmd,
  companyId,
  groupId,
  signal,
) {
  const cu = String(currency || "").trim().toUpperCase();
  if (!accountId || !cu || !fromYmd || !toYmd) {
    return normalizeNumber("0");
  }
  const result = await getHistory({
    accountId,
    companyId: companyId || undefined,
    groupId: groupId || undefined,
    dateFrom: fromYmd,
    dateTo: toYmd,
    currency: cu,
    signal,
  });
  if (!result?.success) {
    throw new Error(result?.message || "History request failed");
  }
  const wanted = new Set([cu]);
  const map = memberHistoryClosingBalancesForAllCurrencies(result.data ?? [], wanted);
  return map.get(cu) ?? normalizeNumber("0");
}
