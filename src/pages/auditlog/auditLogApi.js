import { buildApiUrl } from "../../utils/core/apiUrl.js";

async function getJson(path) {
  const res = await fetch(buildApiUrl(path), { credentials: "include" });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

/** filters: { dateFrom, dateTo, tenantCode, module, action, keyword, page, size } */
export async function fetchAuditLogs(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, value);
  });
  const qs = params.toString();
  return getJson(`api/it/audit-log${qs ? `?${qs}` : ""}`);
}

export async function fetchAuditLogSummary(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, value);
  });
  const qs = params.toString();
  return getJson(`api/it/audit-log/summary${qs ? `?${qs}` : ""}`);
}
