/** Bank Process — Spring Boot `/api/bank-process/*` (tenantId in body). */

import { buildApiUrl } from "../../utils/core/apiUrl.js";
import {
  bankProcessFrequencyNormalized,
  formatBankMoneyFixed2,
  normalizeRows,
  parseProfitSharingToRows,
  resolveBankProcessListTenantId,
} from "./lib/bankProcessHelpers.js";

function isApiSuccess(json) {
  return json?.success === true || json?.status === "success";
}

/** UI frequency → Spring `BankProcess.Frequency` enum name. */
export function toSpringBankProcessFrequency(uiFrequency) {
  const n = bankProcessFrequencyNormalized(uiFrequency);
  if (n === "monthly") return "MONTHLY";
  if (n === "once") return "ONCE";
  if (n === "day") return "DAY";
  if (n === "week") return "WEEK";
  return "FIRST_OF_EVERY_MONTH";
}

function toOptionalInt(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toOptionalMoney(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(formatBankMoneyFixed2(s));
  return Number.isFinite(n) ? n : null;
}

/**
 * Map Add Process form → Spring `BankProcessDTO` flat write body.
 */
export function buildAddBankProcessRequest({
  form,
  tenantId,
  countryId,
  bankOptionId,
  accounts = [],
}) {
  const rawFreq = bankProcessFrequencyNormalized(form?.day_start_frequency);
  const isOnce = rawFreq === "once";
  const isWeek = rawFreq === "week";
  const isDay = rawFreq === "day";
  const omitDayEnd = isOnce || isWeek || isDay;
  const omitContract = isOnce || isWeek || isDay;

  const dayStart = String(form?.day_start || "").trim();
  const dayEnd = omitDayEnd ? null : String(form?.day_end || "").trim() || null;

  const shareRows = parseProfitSharingToRows(form?.profit_sharing, accounts);
  const shares = shareRows
    .map((row) => {
      const accountId = toOptionalInt(row.accountId);
      const amount = toOptionalMoney(row.amount);
      if (!accountId || amount == null) return null;
      return { accountId, amount };
    })
    .filter(Boolean);

  const buy = toOptionalMoney(form?.cost);
  const sell = toOptionalMoney(form?.price);
  let companyPrice = toOptionalMoney(form?.profit);
  if (companyPrice == null && buy != null && sell != null) {
    companyPrice = Number(formatBankMoneyFixed2(String(sell - buy)));
  }

  return {
    tenantId: Number(tenantId),
    countryId: Number(countryId),
    bankOptionId: Number(bankOptionId),
    cardOwner: String(form?.name || "").trim(),
    cardOwnerType: String(form?.type || "").trim().toUpperCase(),
    dayStart: dayStart || null,
    dayEnd,
    frequency: toSpringBankProcessFrequency(rawFreq),
    supplierAccountId: toOptionalInt(form?.card_merchant_id),
    supplierPrice: buy,
    customerAccountId: toOptionalInt(form?.customer_id),
    customerPrice: sell,
    companyAccountId: toOptionalInt(form?.profit_account_id),
    companyPrice,
    contract: omitContract ? null : String(form?.contract || "").trim() || null,
    insurancePrice: isOnce ? null : toOptionalMoney(form?.insurance),
    sop: String(form?.sop || "").trim() || null,
    remark: String(form?.remark || "").trim() || null,
    shares,
  };
}

/**
 * POST /api/bank-process/list
 * Body: JSON number tenant id.
 * @returns {Promise<object[]>} UI list rows (normalized)
 */
export async function fetchBankProcessListByTenantId(tenantId, signal) {
  const tid = resolveBankProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const res = await fetch(buildApiUrl("api/bank-process/list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tid),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToLoadBankProcesses");
  }
  const data = Array.isArray(json.data) ? json.data : [];
  return normalizeRows(data);
}

/**
 * POST /api/bank-process/add-bank-process
 * Body: flat Spring BankProcessDTO write fields (+ optional shares[]).
 */
export async function addBankProcess(request, signal) {
  const res = await fetch(buildApiUrl("api/bank-process/add-bank-process"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "saveFailed");
  }
  return json.data ?? null;
}
