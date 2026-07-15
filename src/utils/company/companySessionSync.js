import { notifyCompanySessionUpdated } from "./companySessionEvents.js";
import { rememberCompanySessionFlags } from "./companySessionFlagsCache.js";
import { switchSessionTenant } from "../auth/authApi.js";
import {
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  persistDashboardGroupFilter,
  readDashboardSelectedCompanyId,
} from "./sharedCompanyFilter.js";

/** @type {Map<string, Promise<object>>} */
const sessionSyncInflight = new Map();

function sessionSyncKey(companyId, viewGroup) {
  const id = Number(companyId);
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  return `${id}|${vg}`;
}

/** Switch active session tenant via Spring {@code POST /auth/switch-tenant}. */
export async function syncCompanySessionApi(companyId, viewGroup = null, options = {}) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return { success: false };

  const key = sessionSyncKey(id, viewGroup);
  if (options.force) {
    sessionSyncInflight.delete(key);
  } else if (sessionSyncInflight.has(key)) {
    return sessionSyncInflight.get(key);
  }

  const promise = (async () => {
    try {
      const { json } = await switchSessionTenant(id);
      if (json?.success && json?.data) rememberCompanySessionFlags(json.data);
      return json;
    } catch {
      return { success: false };
    } finally {
      if (sessionSyncInflight.get(key) === promise) {
        sessionSyncInflight.delete(key);
      }
    }
  })();

  sessionSyncInflight.set(key, promise);
  return promise;
}

export async function syncCompanySessionAndNotify(companyId) {
  const json = await syncCompanySessionApi(companyId);
  if (json?.success) notifyCompanySessionUpdated(json.data ?? null);
  return json;
}

/** Write sessionStorage group/company keys used by Dashboard and other SPA pages. */
export function persistCrossPageCompanySelection(companyId, options = {}) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const { selectedGroup = null, companyRow = null } = options;
  const gid =
    (selectedGroup ? String(selectedGroup).trim().toUpperCase() : null) ||
    (companyRow?.group_id ? String(companyRow.group_id).trim().toUpperCase() : null) ||
    (companyRow?.parent_tenant_code
      ? String(companyRow.parent_tenant_code).trim().toUpperCase()
      : null);
  if (gid) persistDashboardGroupFilter(gid);
  persistDashboardFilterState(gid, id, { allowGroupOnly: false });
  notifyDashboardGroupFilterChanged(gid, id);
  return gid;
}

/**
 * Keep sessionStorage + Spring session tenant aligned with the active Process/Bank tenant.
 * Safe to call when UI already shows the company but cross-page state is stale.
 */
export async function ensureCrossPageCompanySelection(companyId, options = {}) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const savedId = readDashboardSelectedCompanyId();
  const sessionCompanyId =
    options.sessionCompanyId != null && options.sessionCompanyId !== ""
      ? Number(options.sessionCompanyId)
      : null;
  const needsPersist = savedId !== id;
  const needsSessionSync =
    options.syncPhpSession !== false &&
    options.syncSession !== false &&
    sessionCompanyId != null &&
    Number.isFinite(sessionCompanyId) &&
    sessionCompanyId !== id;

  if (!needsPersist && !needsSessionSync) return true;

  const companyRow =
    options.companyRow ||
    (Array.isArray(options.companies)
      ? options.companies.find((c) => Number(c.id) === id)
      : null);
  const gid = persistCrossPageCompanySelection(id, {
    selectedGroup: options.selectedGroup,
    companyRow,
  });

  if (needsSessionSync) {
    const json = await syncCompanySessionApi(id, gid);
    if (json?.success) notifyCompanySessionUpdated(json.data ?? null);
    return Boolean(json?.success);
  }
  return true;
}
