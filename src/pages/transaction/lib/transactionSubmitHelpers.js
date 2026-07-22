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

/** RATE Middle-Man 手续费 remark：charge {第一币种} {用户输入} Service Fees */
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
  return `charge ${currency} ${inputStr} Service Fees`;
}

/**
 * RATE submit payload aligned with `js/transaction.js` submitAction + `api/transactions/submit_api.php` expectations.
 * `toGrossStr` = gross converted amount (half-up 2dp string), same role as legacy `dataset.grossAmount` / getRateCurrencyToGrossAmount.
 */
export function buildRatePayload({
  toId,
  fromId,
  fromAmt,
  toGrossStr,
  rateDate,
  txRemark,
  rateCurrencyFrom,
  rateCurrencyTo,
  parsedRateNormalizedStr,
  rateMiddlemanRate,
  rateMiddlemanAmount,
  rateMiddlemanAccount,
  rateExchangeRateRaw,
  rateFromAccount,
  rateToAccount,
  rateTransferToAccount,
  rateTransferFromAccount,
  rateMiddlemanInputAmount,
}) {
  const transferToId = rateTransferToAccount?.id ? String(rateTransferToAccount.id) : "";
  const transferFromId = rateTransferFromAccount?.id ? String(rateTransferFromAccount.id) : "";
  const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";

  const fromDec = MoneyDecimal.toDecimal(cleanAmt(fromAmt) || "0", 0);
  const grossDec = MoneyDecimal.toDecimal(cleanAmt(toGrossStr) || "0", 0);

  let middleDec;
  try {
    middleDec = MoneyDecimal.toDecimal(cleanAmt(rateMiddlemanAmount) || "0", 0);
  } catch {
    middleDec = MoneyDecimal.toDecimal("0", 0);
  }
  if (middleDec.isZero()) middleDec = MoneyDecimal.toDecimal("0", 0);

  let inputAmtDec = MoneyDecimal.toDecimal("0", 0);
  try {
    const inputStr = cleanAmt(rateMiddlemanInputAmount);
    if (inputStr) {
      inputAmtDec = MoneyDecimal.toDecimal(inputStr, 0);
    }
  } catch {
    // ignore
  }

  let rateDec = MoneyDecimal.toDecimal("0", 0);
  try {
    if (parsedRateNormalizedStr) {
      rateDec = MoneyDecimal.toDecimal(parsedRateNormalizedStr, 0);
    }
  } catch {
    // ignore
  }

  const fromCode = rateFromAccount?.account_id || "";
  const toCode = rateToAccount?.account_id || "";
  const fromDesc = `Transaction to ${toCode} (Rate: ${rateExchangeRateRaw})`;
  const toDesc = `Transaction from ${fromCode} (Rate: ${rateExchangeRateRaw})`;

  const transferFromCode = rateTransferFromAccount?.account_id || "";
  const transferToCode = rateTransferToAccount?.account_id || "";
  const transferFromDesc = `Transaction to ${transferToCode} (Rate: ${rateExchangeRateRaw})`;
  const transferToDesc = `Transaction from ${transferFromCode} (Rate: ${rateExchangeRateRaw})`;

  const middleDesc =
    middleId && !middleDec.isZero()
      ? `Rate charge (x${rateMiddlemanRate}) from ${rateCurrencyFrom} ${MoneyDecimal.formatFixed(fromDec.toString(), 2)}`
      : "";

  const serviceFeeRemark = buildRateServiceFeeRemark(rateCurrencyFrom, rateMiddlemanInputAmount);
  const sms = serviceFeeRemark || txRemark;

  const payload = {
    transaction_type: "RATE",
    account_id: toId,
    from_account_id: fromId,
    amount: formatRateAmount(fromDec.toString()),
    transaction_date: rateDate,
    description: "",
    sms,
    currency: rateCurrencyFrom,

    rate_from_account_id: fromId,
    rate_from_currency: rateCurrencyFrom,
    rate_from_amount: formatRateAmount(fromDec.toString()),
    rate_from_description: fromDesc,

    rate_to_account_id: toId,
    rate_to_currency: rateCurrencyTo,
    rate_to_amount: formatRateAmount(grossDec.toString()),
    rate_to_description: toDesc,

    rate_currency_from: rateCurrencyFrom,
    rate_currency_from_amount: formatRateAmount(fromDec.toString()),
    rate_currency_to: rateCurrencyTo,
    rate_currency_to_amount: formatRateAmount(grossDec.toString()),
    rate_exchange_rate: String(parsedRateNormalizedStr ?? ""),

    rate_middleman_rate: rateMiddlemanRate,
    rate_middleman_amount: rateMiddlemanAmount ? formatRateAmount(middleDec.toString()) : "",
    rate_middleman_account: middleId,
    rate_middleman_input_amount: rateMiddlemanInputAmount ? cleanAmt(rateMiddlemanInputAmount) : "",

    rate_transfer_amount: "",
    rate_account_from_amount: "",
    rate_account_to_amount: "",
  };

  if (transferToId && transferFromId) {
    const transferGross = grossDec;
    let transferToSide = transferGross;
    let transferFromSide = transferGross;
    if (middleId && !middleDec.isZero()) {
      let finalFeeForPayload = middleDec;
      if (inputAmtDec.gt(0) && rateDec.gt(0)) {
        const convertedInputAmtDec = inputAmtDec.times(rateDec);
        finalFeeForPayload = middleDec.minus(convertedInputAmtDec);
      }
      transferFromSide = transferGross.minus(finalFeeForPayload);
    }

    payload.rate_transfer_from_account_id = transferToId;
    payload.rate_transfer_from_currency = rateCurrencyTo;
    payload.rate_transfer_from_amount = formatRateAmount(transferToSide.toString());
    payload.rate_transfer_from_description = transferFromDesc;

    payload.rate_transfer_to_account_id = transferFromId;
    payload.rate_transfer_to_currency = rateCurrencyTo;
    payload.rate_transfer_to_amount = formatRateAmount(transferFromSide.toString());
    payload.rate_transfer_to_description = transferToDesc;

    payload.rate_transfer_from_account = transferToId;
    payload.rate_transfer_to_account = transferFromId;

    if (middleId && !middleDec.isZero()) {
      payload.rate_middleman_account_id = middleId;
      payload.rate_middleman_currency = rateCurrencyTo;
      payload.rate_middleman_amount = formatRateAmount(middleDec.toString());
      payload.rate_middleman_description = middleDesc;
    }
  }

  return { payload, middleId };
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
 * CONTRA/PAYMENT/CLAIM/CLEAR/RECEIVE: To −amount, From +amount.
 * ADJUSTMENT: To += signed amount.
 * WIN/LOSE: amounts go to win_loss (To/From signs per period search).
 */
export function buildOptimisticSubmitDeltas({
  txType,
  amount,
  toAccountId,
  fromAccountId,
} = {}) {
  const type = String(txType || "").toUpperCase().trim();
  if (!type || type === "RATE") return [];

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

  if (type === "WIN" || type === "LOSE") {
    const absAmt = MoneyDecimal.abs(amtStr).toString();
    // Period search: To WIN −amount / LOSE +amount; From WIN +amount / LOSE −amount.
    if (type === "WIN") {
      push(toId, { winLossDelta: MoneyDecimal.sub("0", absAmt).toString() });
      push(fromId, { winLossDelta: absAmt });
    } else {
      push(toId, { winLossDelta: absAmt });
      push(fromId, { winLossDelta: MoneyDecimal.sub("0", absAmt).toString() });
    }
    return deltas;
  }

  if (["CONTRA", "PAYMENT", "CLAIM", "CLEAR", "RECEIVE"].includes(type)) {
    push(toId, { crDrDelta: MoneyDecimal.sub("0", amtStr).toString() });
    push(fromId, { crDrDelta: amtStr });
  }

  return deltas;
}
