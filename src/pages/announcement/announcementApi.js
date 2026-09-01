import { buildApiUrl } from "../../utils/core/apiUrl.js";

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

async function getJson(path) {
  const res = await fetch(buildApiUrl(path), { credentials: "include" });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export async function fetchAnnouncements() {
  return getJson("api/announcement/listAnnouncement");
}

export async function fetchMaintenanceList() {
  return getJson("api/announcement/listMaintenance");
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
