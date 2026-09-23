/**
 * IT-only global "kick everyone" maintenance switch — Spring `/api/it/maintenance-mode`.
 *
 * Copied from Count-frontend/src/pages/announcement/systemMaintenanceModeApi.js (desktop).
 *
 * NOT the same thing as the old PHP `api/maintenance/mode_api.php` this replaces: that one
 * recorded *which maintenance announcement is currently active* (returning
 * `maintenance_message_id` / `message_preview` / `updated_by`) and had no Spring counterpart —
 * desktop removed the feature outright on 2026-09-01. This endpoint only carries a boolean that
 * forces every non-IT session offline for a maintenance window; see
 * `Count/docs/it-role-maintenance-mode-and-sidebar-fix.md`.
 *
 * Both calls require the IT operator role server-side (`AccessControlUtils.requireItOperator`),
 * so a non-IT session gets 403 — callers must gate on `isSystemMaintenanceItUser` first.
 */
import { buildApiUrl } from "../utils/apiUrl.js";

async function getJson(path) {
  const res = await fetch(buildApiUrl(path), { credentials: "include", cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function postJson(path) {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

/** GET /api/it/maintenance-mode -> `{ success, data: { enabled } }` */
export async function fetchSystemMaintenanceMode() {
  return getJson("api/it/maintenance-mode");
}

/** POST /api/it/maintenance-mode?enabled= -> `{ success, data: { enabled } }` */
export async function setSystemMaintenanceMode(enabled) {
  return postJson(`api/it/maintenance-mode?enabled=${enabled ? "true" : "false"}`);
}
