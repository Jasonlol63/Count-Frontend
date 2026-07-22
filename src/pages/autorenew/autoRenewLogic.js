import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { notifyTransactionListInvalidated } from "../transaction/lib/transactionPaymentLogic.js";

export const AUTO_RENEW_PERIODS = [
  { value: "7days", labelKey: "period7days" },
  { value: "1month", labelKey: "period1month" },
  { value: "3months", labelKey: "period3months" },
  { value: "6months", labelKey: "period6months" },
  { value: "1year", labelKey: "period1year" },
];

export const AUTO_RENEW_STATUS_FILTERS = ["pending", "approved", "rejected", "all"];

async function postJson(path, body, { signal } = {}) {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) {
    throw new Error(json.message || "Auto renew request failed");
  }
  return json.data;
}

/** List / counts — legacy PHP path rewritten to Spring `api/auto-renew/list`. */
async function postAutoRenewList(body, { signal } = {}) {
  return postJson("api/subscription/auto_renew_api.php", body, { signal });
}

export async function fetchAutoRenewApprovals(
  status = "pending",
  { dateFrom, dateTo, entityType = "company", signal } = {},
) {
  const body = { action: "list", status, entity_type: entityType === "group" ? "group" : "company" };
  if (dateFrom) body.date_from = dateFrom;
  if (dateTo) body.date_to = dateTo;
  return postAutoRenewList(body, { signal });
}

export async function fetchAutoRenewStatusMap() {
  return postAutoRenewList({ action: "status_map" });
}

export async function saveAutoRenewDraft({ requestId, period, fromAccountId, toAccountId }) {
  return postAutoRenewList({
    action: "save_draft",
    request_id: requestId,
    period: period || null,
    from_account_id: fromAccountId || null,
    to_account_id: toAccountId || null,
  });
}

/** Approve: Domain Fee charge + extend expiration from current date + period. */
export async function approveAutoRenew({ requestId, period }) {
  const data = await postJson("api/auto-renew/approve", {
    request_id: requestId,
    period,
  });
  invalidateTransactionListCache("auto_renew");
  return data;
}

export async function rejectAutoRenew({ requestId }) {
  return postJson("api/auto-renew/reject", {
    request_id: requestId,
  });
}

export async function deleteAutoRenew({ requestId, transactionId, entityType }) {
  return postAutoRenewList({
    action: "delete",
    request_id: requestId,
    transaction_id: transactionId || null,
    entity_type: entityType === "group" ? "group" : "company",
  });
}

export function invalidateTransactionListCache(source = "auto_renew") {
  return notifyTransactionListInvalidated(source);
}
