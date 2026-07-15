import { notifyCompanySessionUpdated } from "./companySessionEvents.js";
import { switchSessionTenant } from "../auth/authApi.js";

/** POST /auth/switch-tenant — shared by optimistic company/tenant picks. */
export async function fetchUpdateCompanySession(companyId, { signal } = {}) {
  const nextId = Number(companyId);
  if (!Number.isFinite(nextId) || nextId <= 0) {
    return { ok: false, json: { success: false } };
  }
  try {
    const { ok, json } = await switchSessionTenant(nextId, { signal });
    return { ok, json };
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return { ok: false, json: { success: false } };
  }
}

/**
 * Background session sync after UI already shows the target tenant.
 * @returns {Promise<boolean>} true when session matches or was updated successfully
 */
export async function syncCompanySessionInBackground({
  companyId,
  sessionCompanyId = null,
  signal,
  layoutSilent = false,
  onFailure,
}) {
  const nextId = Number(companyId);
  if (!Number.isFinite(nextId) || nextId <= 0) return true;

  const sessionId =
    sessionCompanyId != null && sessionCompanyId !== "" ? Number(sessionCompanyId) : null;
  if (sessionId === nextId) return true;

  try {
    const { ok, json } = await fetchUpdateCompanySession(nextId, { signal });
    if (!ok || !json?.success) {
      onFailure?.(json);
      return false;
    }
    if (!layoutSilent) notifyCompanySessionUpdated(json?.data ?? null);
    return true;
  } catch (err) {
    if (err?.name === "AbortError") return false;
    onFailure?.(null);
    return false;
  }
}
