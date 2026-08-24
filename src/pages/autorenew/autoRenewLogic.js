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
  if (!res.ok || !json.success) {
    throw new Error(json.message || "Auto renew request failed");
  }
  return json.data;
}

export async function fetchAutoRenewApprovals(
  status = "pending",
  { dateFrom, dateTo, entityType = "company", signal } = {},
) {
  const body = { status, entity_type: entityType === "group" ? "group" : "company" };
  if (dateFrom) body.date_from = dateFrom;
  if (dateTo) body.date_to = dateTo;
  return postJson("api/auto-renew/list", body, { signal });
}

export async function approveAutoRenew({ requestId, period }) {
  return postJson("api/auto-renew/approve", { request_id: requestId, period });
}

export async function rejectAutoRenew({ requestId }) {
  return postJson("api/auto-renew/reject", { request_id: requestId });
}

export async function deleteAutoRenew({ requestId }) {
  return postJson("api/auto-renew/delete", { request_id: requestId });
}

export function invalidateTransactionListCache(source = "auto_renew") {
  return notifyTransactionListInvalidated(source);
}
