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
  if (!middleDec.gt(0)) middleDec = MoneyDecimal.toDecimal("0", 0);

  const fromCode = rateFromAccount?.account_id || "";
  const toCode = rateToAccount?.account_id || "";
  const fromDesc = `Transaction to ${toCode} (Rate: ${rateExchangeRateRaw})`;
  const toDesc = `Transaction from ${fromCode} (Rate: ${rateExchangeRateRaw})`;

  const transferFromCode = rateTransferFromAccount?.account_id || "";
  const transferToCode = rateTransferToAccount?.account_id || "";
  const transferFromDesc = `Transaction to ${transferToCode} (Rate: ${rateExchangeRateRaw})`;
  const transferToDesc = `Transaction from ${transferFromCode} (Rate: ${rateExchangeRateRaw})`;

  const middleDesc =
    middleId && middleDec.gt(0)
      ? `Rate charge (x${rateMiddlemanRate}) from ${rateCurrencyFrom} ${MoneyDecimal.formatFixed(fromDec.toString(), 2)}`
      : "";

  const payload = {
    transaction_type: "RATE",
    account_id: toId,
    from_account_id: fromId,
    amount: formatRateAmount(fromDec.toString()),
    transaction_date: rateDate,
    description: "",
    sms: txRemark,
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

    rate_transfer_amount: "",
    rate_account_from_amount: "",
    rate_account_to_amount: "",
  };

  if (transferToId && transferFromId) {
    const transferGross = grossDec;
    let transferToSide = transferGross;
    let transferFromSide = transferGross;
    if (middleId && middleDec.gt(0)) {
      transferFromSide = transferGross.minus(middleDec);
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

    if (middleId && middleDec.gt(0)) {
      payload.rate_middleman_account_id = middleId;
      payload.rate_middleman_currency = rateCurrencyTo;
      payload.rate_middleman_amount = formatRateAmount(middleDec.toString());
      payload.rate_middleman_description = middleDesc;
    }
  }

  return { payload, middleId };
}
