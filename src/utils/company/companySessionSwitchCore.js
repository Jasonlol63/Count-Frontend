import { buildApiUrl } from "../core/apiUrl.js";
import { notifyCompanySessionUpdated } from "./companySessionEvents.js";
import { rememberCompanySessionFlags } from "./companySessionFlagsCache.js";

/**
 * POST Spring `/auth/switch-tenant` — shared by Admin-aligned optimistic company picks.
 * (Was the legacy PHP `api/session/update_company_session_api.php`, which 404s now that the
 * reverse proxy sends every unrewritten `/api/*` path to Spring; `companySessionSync.js`'s
 * `syncCompanySessionApi` already migrated to this endpoint — this mirrors that, but keeps
 * `signal` support for the abort-on-rapid-switch pattern these callers rely on.)
 */
export async function fetchUpdateCompanySession(companyId, { signal } = {}) {
  const nextId = Number(companyId);
  if (!Number.isFinite(nextId) || nextId <= 0) {
    return { ok: false, json: { success: false } };
  }
  try {
    const q = new URLSearchParams({ tenant_id: String(nextId) });
    const res = await fetch(buildApiUrl(`auth/switch-tenant?${q.toString()}`), {
      method: "POST",
      credentials: "include",
      signal,
    });
    const json = await res.json().catch(() => ({}));
    if (json?.success && json?.data) rememberCompanySessionFlags(json.data);
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
