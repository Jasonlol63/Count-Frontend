import { buildApiUrl } from "../../utils/core/apiUrl.js";

async function getJson(path) {
  const res = await fetch(buildApiUrl(path), { credentials: "include" });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function postJson(path) {
  const res = await fetch(buildApiUrl(path), { method: "POST", credentials: "include" });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export async function fetchSystemMaintenanceMode() {
  return getJson("api/it/maintenance-mode");
}

export async function setSystemMaintenanceMode(enabled) {
  return postJson(`api/it/maintenance-mode?enabled=${enabled ? "true" : "false"}`);
}
