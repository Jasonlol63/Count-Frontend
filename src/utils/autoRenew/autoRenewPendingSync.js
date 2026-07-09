import { buildApiUrl } from "../core/apiUrl.js";

export const AUTO_RENEW_PENDING_CHANGED_EVENT = "eazycount:auto-renew-pending-changed";

export async function fetchAutoRenewPendingCount({ signal } = {}) {
  const res = await fetch(buildApiUrl("api/subscription/auto_renew_api.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pending_count" }),
    signal,
  });
  const json = await res.json();
  if (!json.success) return null;
  return Number(json.data?.pending_count) || 0;
}

export function notifyAutoRenewPendingChanged(pendingCount) {
  window.dispatchEvent(
    new CustomEvent(AUTO_RENEW_PENDING_CHANGED_EVENT, {
      detail: { pendingCount: Number(pendingCount) || 0 },
    }),
  );
}

/** Runs server-side window sync and broadcasts the latest pending total. */
export async function syncAutoRenewPendingCount({ signal } = {}) {
  const count = await fetchAutoRenewPendingCount({ signal });
  if (count == null) return null;
  notifyAutoRenewPendingChanged(count);
  return count;
}
