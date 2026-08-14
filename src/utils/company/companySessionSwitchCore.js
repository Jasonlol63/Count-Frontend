import { buildApiUrl } from "../core/apiUrl.js";
import { notifyCompanySessionUpdated } from "./companySessionEvents.js";

/** POST `update_company_session_api.php` — shared by Admin-aligned optimistic company picks. */
export async function fetchUpdateCompanySession(companyId, { signal } = {}) {
  const nextId = Number(companyId);
  if (!Number.isFinite(nextId) || nextId <= 0) {
    return { ok: false, json: { success: false } };
  }
  try {
    const res = await fetch(
      buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextId}`),
      { credentials: "include", signal },
    );
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return { ok: false, json: { success: false } };
  }
}

/**
 * Background PHP session sync after UI already shows the target company (Account / Admin pattern).
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
