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

/**
 * Dev / verification only: set to an ISO date (e.g. `"2026-08-01"`) to simulate
 * Accounting Due as-of that day. `null` = use server today.  
 */
export const ACCOUNTING_DUE_AS_OF_OVERRIDE = null;

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
 * Mutable write fields shared by add / update (Spring BankProcessDTO flat shape).
 * Does not include identity fields: country / bank / cardOwner / cardOwnerType.
 */
function buildBankProcessMutableWriteFields({ form, accounts = [] }) {
  const rawFreq = bankProcessFrequencyNormalized(form?.day_start_frequency);
  const isOnce = rawFreq === "once";
  const isWeek = rawFreq === "week";
  const isDay = rawFreq === "day";
  const isFirstOfMonth = rawFreq === "1st_of_every_month";
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
    dayStart: dayStart || null,
    dayEnd,
    dayEndMonthlyCapEnabled: isFirstOfMonth && !!form?.day_end_monthly_cap_enabled,
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
 * Map Add Process form → Spring `BankProcessDTO` flat write body.
 */
export function buildAddBankProcessRequest({
  form,
  tenantId,
  countryId,
  bankOptionId,
  accounts = [],
}) {
  return {
    tenantId: Number(tenantId),
    countryId: Number(countryId),
    bankOptionId: Number(bankOptionId),
    cardOwner: String(form?.name || "").trim(),
    cardOwnerType: String(form?.type || "").trim().toUpperCase(),
    ...buildBankProcessMutableWriteFields({ form, accounts }),
  };
}

/**
 * Map Edit Process form → Spring `BankProcessDTO` update body.
 * Identity fields (country / bank / cardOwner / type) are omitted — backend keeps DB values.
 */
export function buildUpdateBankProcessRequest({ form, tenantId, accounts = [] }) {
  const id = toOptionalInt(form?.id);
  if (!id) {
    throw new Error("Invalid bank process ID");
  }
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  return {
    id,
    tenantId: tid,
    ...buildBankProcessMutableWriteFields({ form, accounts }),
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

/**
 * POST /api/bank-process/accounting-due/inbox
 * Body: `{ tenantId, asOf?, restoreSkipped? }`.
 */
export async function fetchAccountingDueInbox(tenantId, signal, { asOf, restoreSkipped } = {}) {
  const tid = resolveBankProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");

  const body = { tenantId: tid };
  const asOfValue = asOf ?? ACCOUNTING_DUE_AS_OF_OVERRIDE;
  if (asOfValue) {
    body.asOf = String(asOfValue).trim();
  }
  if (restoreSkipped) {
    body.restoreSkipped = true;
  }

  const res = await fetch(buildApiUrl("api/bank-process/accounting-due/inbox"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToLoadAccountingDue");
  }
  return Array.isArray(json.data) ? json.data : [];
}

/**
 * POST /api/bank-process/accounting-due/skip
 * Body: `[{ bankProcessId, postedDate, periodType, billingStart, billingEnd }]`.
 */
export async function skipAccountingDue(items, signal) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No accounting due items selected!");
  }

  const res = await fetch(buildApiUrl("api/bank-process/accounting-due/skip"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "deleteDueFailed");
  }
  return json.data ?? null;
}

/**
 * POST /api/bank-process/update-bank-process
 * Body: flat Spring BankProcessDTO (`id` + `tenantId` + mutable fields + shares[]).
 */
export async function updateBankProcess(request, signal) {
  const res = await fetch(buildApiUrl("api/bank-process/update-bank-process"), {
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

/**
 * POST /api/bank-process/update-status
 * Body: Spring BankProcess `{ id, tenantId, status }`
 * status = ACTIVE | INACTIVE | OFFICIAL | E_INVOICE | BLOCK
 */
export async function updateBankProcessStatus({ id, tenantId, status }, signal) {
  const processId = toOptionalInt(id);
  const tid = resolveBankProcessListTenantId(tenantId);
  const statusName = String(status || "").trim().toUpperCase();
  if (!processId) throw new Error("Invalid bank process ID");
  if (!tid) throw new Error("tenantIdRequired");
  if (!statusName) throw new Error("Status is required!");

  const res = await fetch(buildApiUrl("api/bank-process/update-status"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: processId,
      tenantId: tid,
      status: statusName,
    }),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "statusUpdateFailed");
  }
  return json.data ?? null;
}

/**
 * POST /api/bank-process/delete-bank-process
 * Body: Spring BankProcess `{ id, tenantId }` (single row; UI loops for multi-select).
 * Server requires status INACTIVE.
 */
export async function deleteBankProcess({ id, tenantId }, signal) {
  const processId = toOptionalInt(id);
  const tid = resolveBankProcessListTenantId(tenantId);
  if (!processId) throw new Error("Invalid bank process ID");
  if (!tid) throw new Error("tenantIdRequired");

  const res = await fetch(buildApiUrl("api/bank-process/delete-bank-process"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: processId,
      tenantId: tid,
    }),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "deleteFailed");
  }
  return json.data ?? null;
}

/**
 * POST /api/bank-process/update-remark
 * Body: Spring BankProcess `{ id, tenantId, remark }`
 */
export async function updateBankProcessRemark({ id, tenantId, remark }, signal) {
  const processId = toOptionalInt(id);
  const tid = resolveBankProcessListTenantId(tenantId);
  if (!processId) throw new Error("Invalid bank process ID");
  if (!tid) throw new Error("tenantIdRequired");

  const remarkValue = String(remark ?? "").trim() || null;

  const res = await fetch(buildApiUrl("api/bank-process/update-remark"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: processId,
      tenantId: tid,
      remark: remarkValue,
    }),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "remarkUpdateFailed");
  }
  return remarkValue;
}

/**
 * POST /api/bank-process/resend
 * Body: AccountingDueDTO shape `{ tenantId, bankProcessId, dayStart, dayEnd?, frequency }`.
 * Phase 1 backend: FIRST_OF_EVERY_MONTH (dayStart+dayEnd), MONTHLY (dayStart → +1 month),
 * ONCE/DAY (single day = dayStart), WEEK (dayStart → +6 days).
 */
export function buildResendBankProcessRequest({
  tenantId,
  bankProcessId,
  dayStart,
  dayEnd,
  frequency,
}) {
  const tid = resolveBankProcessListTenantId(tenantId);
  const processId = toOptionalInt(bankProcessId);
  if (!tid) throw new Error("tenantIdRequired");
  if (!processId) throw new Error("Invalid bank process ID");

  const startYmd = String(dayStart || "").trim().slice(0, 10) || null;
  const endYmd = String(dayEnd || "").trim().slice(0, 10) || null;
  const springFq = toSpringBankProcessFrequency(frequency);

  return {
    tenantId: tid,
    bankProcessId: processId,
    dayStart: startYmd,
    dayEnd: endYmd,
    frequency: springFq,
  };
}

/**
 * POST /api/bank-process/resend
 * @returns {Promise<object|null>} Spring AccountingDueDTO make-up row
 */
export async function resendBankProcess(request, signal) {
  const res = await fetch(buildApiUrl("api/bank-process/resend"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "resendFailed");
  }
  return json.data ?? null;
}
