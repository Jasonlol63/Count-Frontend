/**
 * Announcement + Maintenance banner content — Spring Boot `/api/announcement/*`.
 * Copied from Count-frontend/src/pages/announcement/announcementApi.js (desktop).
 *
 * Unlike the old PHP `api/announcements/*` / `api/maintenance/*` endpoints, these are
 * global (no tenant/company scoping at all — confirmed against
 * `Count/backend/.../AnnouncementController.java`), so there is no "switch session to
 * C168 company first" step needed before calling them.
 *
 * The old `api/maintenance/mode_api.php` is gone, not migrated: it recorded *which maintenance
 * announcement is currently active* and Spring never had a counterpart (desktop removed the
 * feature on 2026-09-01). The unrelated IT "kick everyone" switch that replaced it as the IT
 * control on this page lives in `lib/systemMaintenanceModeApi.js`.
 */
import { buildApiUrl } from "../utils/apiUrl.js";

async function postJson(path, body) {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function getJson(path, { signal } = {}) {
  const res = await fetch(buildApiUrl(path), { credentials: "include", signal });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export async function fetchAnnouncements(options) {
  return getJson("api/announcement/listAnnouncement", options);
}

export async function fetchMaintenanceList(options) {
  return getJson("api/announcement/listMaintenance", options);
}

export async function fetchDashboardAnnouncements(options) {
  return getJson("api/announcement/getDashboardAnnouncements", options);
}

export async function createAnnouncement({ title, content }) {
  return postJson("api/announcement/addAnnouncementContent", { title, content });
}

export async function updateAnnouncement({ id, title, content }) {
  return postJson("api/announcement/updateAnnouncement", { id, title, content });
}

export async function deleteAnnouncement(id) {
  return postJson("api/announcement/deleteAnnouncement", { id });
}

export async function createMaintenance({ prefix, content }) {
  return postJson("api/announcement/addMaintenanceContent", { prefix, content });
}

export async function updateMaintenance({ id, prefix, content }) {
  return postJson("api/announcement/updateMaintenance", { id, prefix, content });
}

export async function deleteMaintenance(id) {
  return postJson("api/announcement/deleteMaintenance", { id });
}

/** Spring LocalDateTime (e.g. "2026-09-01T10:15:30") -> readable local display string. */
export function formatAnnouncementTimestamp(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Spring `Announcements`/`Maintenance` row (camelCase) -> mobile UI shape (snake_case). */
export function normalizeAnnouncementItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    ...raw,
    id: raw.id,
    title: raw.title ?? "",
    prefix: raw.prefix ?? "",
    content: raw.content ?? "",
    created_by: raw.createdBy ?? raw.created_by ?? "",
    created_at: formatAnnouncementTimestamp(raw.createdAt ?? raw.created_at),
    updated_at: formatAnnouncementTimestamp(raw.updatedAt ?? raw.updated_at),
  };
}
