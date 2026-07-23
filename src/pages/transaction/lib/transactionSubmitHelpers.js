import { formatRateAmount } from "./transactionFormat.js";
import MoneyDecimal from "../../../utils/money/moneyDecimal.js";

export function toNumberLike(raw) {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function cleanAmt(raw) {
  return String(raw ?? "")
    .replace(/,/g, "")
    .trim();
}

/** RATE Middle-Man Fee remark: CHARGE {first currency} {fee input before FX} SERVICE FEES. */
export function buildRateServiceFeeRemark(currencyFrom, middlemanInputAmount) {
  const inputStr = cleanAmt(middlemanInputAmount);
  if (!inputStr) return "";
  try {
    const dec = MoneyDecimal.toDecimal(inputStr, 0);
    if (dec.lte(0)) return "";
  } catch {
    return "";
  }
  const currency = String(currencyFrom ?? "").trim().toUpperCase();
  if (!currency) return "";
  let feeDisplay = inputStr;
  try {
    feeDisplay = MoneyDecimal.toDecimal(inputStr, 0).toString();
  } catch {
    // keep raw
  }
  return `CHARGE ${currency} ${feeDisplay} SERVICE FEES`;
}

/**
 * RATE submit payload for Spring `/api/transaction/submit`.
 * Leg1 = first Account row + first currency; Leg2 = second Account row + net after Middle-Man.
 * Middle-Man: account + (rate multiplier and/or fee in first currency); either or both.
 */
export function buildRatePayload({
  toId,
  fromId,
  fromAmt,
  toGrossStr,
  toNetStr,
  rateDate,
  txRemark,
  rateCurrencyFrom,
  rateCurrencyTo,
  parsedRateNormalizedStr,
  rateExchangeRateRaw,
  rateTransferToAccount,
  rateTransferFromAccount,
  rateMiddlemanAccount,
  rateMiddlemanRate,
  rateMiddlemanFeeInput,
}) {
  const transferToId = rateTransferToAccount?.id ? String(rateTransferToAccount.id) : "";
  const transferFromId = rateTransferFromAccount?.id ? String(rateTransferFromAccount.id) : "";

  const fromDec = MoneyDecimal.toDecimal(cleanAmt(fromAmt) || "0", 0);
  const grossDec = MoneyDecimal.toDecimal(cleanAmt(toGrossStr) || "0", 0);
  const netRaw = cleanAmt(toNetStr);
  const netDec = netRaw
    ? MoneyDecimal.toDecimal(netRaw, 0)
    : grossDec;

  const leg1Amount = formatRateAmount(fromDec.toString());
  const leg2Amount = formatRateAmount(netDec.toString());
  const rateExpression = String(rateExchangeRateRaw ?? "").trim();

  const middleId = rateMiddlemanAccount?.id ? Number(rateMiddlemanAccount.id) : 0;
  const middleRateStr = cleanAmt(rateMiddlemanRate);
  const feeInputStr = cleanAmt(rateMiddlemanFeeInput);
  const hasMiddleRate = !!middleRateStr && Number(middleRateStr) > 0;
  const hasFeeInput = !!feeInputStr && Number(feeInputStr) > 0;

  const payload = {
    transaction_type: "RATE",
    transaction_date: rateDate,
    description: "",
    sms: txRemark || "",
    account_id: toId,
    from_account_id: fromId,
    amount: leg1Amount,
    currency: rateCurrencyFrom,
    leg1_to_account_id: toId,
    leg1_from_account_id: fromId,
    leg1_currency: rateCurrencyFrom,
    leg1_amount: leg1Amount,
    leg2_to_account_id: transferToId,
    leg2_from_account_id: transferFromId,
    leg2_currency: rateCurrencyTo,
    leg2_amount: leg2Amount,
    rate_currency_from: rateCurrencyFrom,
    rate_currency_to: rateCurrencyTo,
    rate_from_amount: leg1Amount,
    rate_currency_to_amount: leg2Amount,
    rate_to_amount_gross: formatRateAmount(grossDec.toString()),
    rate_exchange_rate: String(parsedRateNormalizedStr ?? ""),
    rate_expression: rateExpression,
    rate_exchange_rate_raw: rateExpression,
  };

  if (Number.isFinite(middleId) && middleId > 0 && (hasMiddleRate || hasFeeInput)) {
    payload.rate_middleman_account_id = middleId;
    if (hasMiddleRate) {
      payload.rate_middleman_rate = middleRateStr;
    }
    if (hasFeeInput) {
      // Fee in first currency; backend converts with exchangeRate.
      payload.rate_middleman_fee = formatRateAmount(
        MoneyDecimal.toDecimal(feeInputStr, 0).toString(),
      );
      payload.rate_middleman_amount = payload.rate_middleman_fee;
    }
  }

  return { payload };
}

/** Account DB ids involved in a submit — used for post-submit focused list (To + From, RATE legs, etc.). */
export function collectSubmitFocusAccountIds({
  txType,
  toAccountId,
  fromAccountId,
  isAdjustment = false,
  rateToAccountId,
  rateFromAccountId,
  rateTransferToAccountId,
  rateTransferFromAccountId,
  rateMiddlemanAccountId,
} = {}) {
  const ids = new Set();
  const add = (id) => {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  };

  const type = String(txType || "").toUpperCase().trim();
  if (type === "RATE") {
    add(rateToAccountId);
    add(rateFromAccountId);
    add(rateTransferToAccountId);
    add(rateTransferFromAccountId);
    add(rateMiddlemanAccountId);
    return [...ids];
  }

  add(toAccountId);
  if (!isAdjustment) add(fromAccountId);
  return [...ids];
}

/**
 * Cr/Dr (or Win/Loss) deltas for optimistic list update after approved submit.
 * CONTRA/PAYMENT/CLAIM/CLEAR/RECEIVE/RATE: To −amount, From +amount.
 * ADJUSTMENT: To += signed amount.
 * PROFIT: From += amount, To −= amount (Win/Loss).
 * WIN/LOSE: amounts go to win_loss (To/From signs per period search).
 */
export function buildOptimisticSubmitDeltas({
  txType,
  amount,
  toAccountId,
  fromAccountId,
} = {}) {
  const type = String(txType || "").toUpperCase().trim();
  if (!type) return [];

  let amtStr;
  try {
    const cleaned = MoneyDecimal.cleanMoneyInput(amount);
    if (!cleaned) return [];
    amtStr = MoneyDecimal.toDecimal(cleaned).toString();
  } catch {
    return [];
  }

  const toId = Number(toAccountId);
  const fromId = Number(fromAccountId);
  const deltas = [];
  const push = (id, patch) => {
    if (Number.isFinite(id) && id > 0) deltas.push({ accountDbId: id, ...patch });
  };

  if (type === "ADJUSTMENT") {
    push(toId, { winLossDelta: amtStr });
    return deltas;
  }

  if (type === "PROFIT") {
    const absAmt = MoneyDecimal.abs(amtStr).toString();
    push(toId, { winLossDelta: MoneyDecimal.sub("0", absAmt).toString() });
    push(fromId, { winLossDelta: absAmt });
    return deltas;
  }

  if (type === "WIN" || type === "LOSE") {
    const absAmt = MoneyDecimal.abs(amtStr).toString();
    if (type === "WIN") {
      push(toId, { winLossDelta: MoneyDecimal.sub("0", absAmt).toString() });
      push(fromId, { winLossDelta: absAmt });
    } else {
      push(toId, { winLossDelta: absAmt });
      push(fromId, { winLossDelta: MoneyDecimal.sub("0", absAmt).toString() });
    }
    return deltas;
  }

  if (["CONTRA", "PAYMENT", "CLAIM", "CLEAR", "RECEIVE", "RATE"].includes(type)) {
    push(toId, { crDrDelta: MoneyDecimal.sub("0", amtStr).toString() });
    push(fromId, { crDrDelta: amtStr });
  }

  return deltas;
}
