/**
 * Auto Renew — Spring Boot `/api/auto-renew/*`.
 * Copied from Count-frontend/src/pages/autorenew/autoRenewLogic.js +
 * src/utils/autoRenew/autoRenewPendingSync.js (desktop).
 *
 * Behavior change vs. the old PHP endpoint (not just a path rename — see
 * Count-frontend/docs/autorenew.md): `approve` no longer takes
 * `from_account_id`/`to_account_id` (manual charge-account picking is gone). It now takes
 * a `charge_on_approve` boolean (default true) — off skips the Domain Fee charge and just
 * extends the tenant's expiration date. `delete` no longer needs `transaction_id`/
 * `entity_type`, just `request_id`.
 */
import { buildApiUrl } from "../utils/apiUrl.js";

export const AUTO_RENEW_PERIODS = [
  { value: "7days", labelKey: "period7days" },
  { value: "1month", labelKey: "period1month" },
  { value: "3months", labelKey: "period3months" },
  { value: "6months", labelKey: "period6months" },
  { value: "1year", labelKey: "period1year" },
];

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

/** { requestId, period, chargeOnApprove = true } — see file header for the behavior change. */
export async function approveAutoRenew({ requestId, period, chargeOnApprove = true }) {
  return postJson("api/auto-renew/approve", {
    request_id: requestId,
    period,
    charge_on_approve: chargeOnApprove,
  });
}

export async function rejectAutoRenew({ requestId }) {
  return postJson("api/auto-renew/reject", { request_id: requestId });
}

export async function deleteAutoRenew({ requestId }) {
  return postJson("api/auto-renew/delete", { request_id: requestId });
}

/** Read-only badge count (used for the bottom-nav pill) — non-throwing, returns null on failure. */
export async function fetchAutoRenewPendingCount({ signal } = {}) {
  const res = await fetch(buildApiUrl("api/auto-renew/list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pending_count" }),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) return null;
  return Number(json.data?.pending_count) || 0;
}
