/**
 * Process (Games) — Spring Boot `/api/process/process-list`.
 * Copied from Count-frontend/src/pages/processlist/processListApi.js +
 * processListHelpers.js (desktop) — read-only subset only. Mobile has no Games Process
 * List management page of its own; this only backs the process dropdowns/filters used by
 * other modules (Payment Maintenance filter, Reports, the Admin permission picker).
 *
 * Body is a bare JSON number (the tenant id), not `{tenantId: ...}` — that's the actual
 * Spring contract for this one endpoint, confirmed against desktop's processListApi.js.
 */
import { buildApiUrl } from "../utils/apiUrl.js";

export function resolveProcessListTenantId(tenantId) {
  const tid = tenantId != null ? Number(tenantId) : Number.NaN;
  return Number.isFinite(tid) && tid > 0 ? tid : null;
}

function isApiSuccess(json) {
  return json?.success === true || json?.status === "success";
}

async function fetchProcessListRows(tenantId, signal) {
  const tid = resolveProcessListTenantId(tenantId);
  if (!tid) throw new Error("tenantIdRequired");
  const res = await fetch(buildApiUrl("api/process/process-list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tid),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "failedToLoadProcesses");
  }
  return Array.isArray(json.data) ? json.data : [];
}

/** Spring ProcessDTO row → mobile's old `processlist_api.php` row shape (snake_case). */
function normalizeProcessListItem(dto) {
  if (!dto || typeof dto !== "object") return null;
  const process = dto.process || {};
  const descriptions = Array.isArray(dto.processDescriptions) ? dto.processDescriptions : [];
  return {
    id: dto.id ?? process.id,
    process_name: String(process.code || ""),
    process_id: String(process.code || ""),
    description: descriptions.map((d) => d?.name).filter(Boolean).join(", "),
    description_name: descriptions.map((d) => d?.name).filter(Boolean).join(", "),
    category: String(process.category || "").trim().toUpperCase(),
    status: String(process.status || "").trim().toLowerCase() || "active",
  };
}

/** GAME-category rows only — matches the old Games Process List scope. */
export async function fetchProcessListByTenantId(tenantId, signal) {
  const rows = await fetchProcessListRows(tenantId, signal);
  return rows
    .filter((dto) => String(dto?.process?.category || "").trim().toUpperCase() === "GAME")
    .map(normalizeProcessListItem)
    .filter(Boolean);
}

/** Every category (Games + Bank) — for permission pickers that need the full set. */
export async function fetchAllProcessListByTenantId(tenantId, signal) {
  const rows = await fetchProcessListRows(tenantId, signal);
  return rows.map(normalizeProcessListItem).filter(Boolean);
}

/** BANK-category rows only (SALARY/COMMISSION/BONUS/PROFIT payroll processes). */
export async function fetchBankProcessListByTenantId(tenantId, signal) {
  const rows = await fetchProcessListRows(tenantId, signal);
  return rows
    .filter((dto) => String(dto?.process?.category || "").trim().toUpperCase() === "BANK")
    .map(normalizeProcessListItem)
    .filter(Boolean);
}
