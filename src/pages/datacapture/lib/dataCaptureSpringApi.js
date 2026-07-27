/** Games Data Capture — Spring Boot `/api/datacapture/*` + shared tenant APIs. */

import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchCurrencyListByTenantId, normalizeCurrencyRow } from "../../../utils/api/currencyApi.js";
import {
  addProcessDescription,
  deleteProcessDescription,
  fetchProcessDescriptionsByTenantId,
} from "../../processlist/processListApi.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import { peekCompanySessionFlags } from "../../../utils/company/companySessionFlagsCache.js";
import { resolveDataCaptureTenantId } from "./dataCaptureTenant.js";

const DEFAULT_CATEGORY_PERMISSIONS = ["Games", "Bank"];

function isApiSuccess(json) {
  return json?.success === true || json?.status === "success";
}

/**
 * POST /api/datacapture/games/form
 * Body: {@link DataCaptureGameDTO} — `{ tenantId, captureDate, id? }`.
 */
export async function postGameCaptureForm({ tenantId, captureDate, processPk = null }, signal) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantId is required");
  }
  if (!captureDate) {
    throw new Error("captureDate is required");
  }

  const body = { tenantId: tid, captureDate: String(captureDate) };
  const pk = processPk != null ? Number(processPk) : Number.NaN;
  if (Number.isFinite(pk) && pk > 0) {
    body.id = pk;
  }

  const res = await fetch(buildApiUrl("api/datacapture/games/form"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "Failed to load capture form");
  }
  return json;
}

/** Spring currency rows for capture form (deduped by code). */
export async function fetchCaptureCurrenciesByTenantId(tenantId, signal) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return [];
  }
  const rows = await fetchCurrencyListByTenantId(tid, signal);
  const byCode = new Map();
  for (const raw of rows) {
    const row = normalizeCurrencyRow(raw);
    const code = String(row.code || "").trim().toUpperCase();
    if (!code || !Number.isFinite(row.id)) continue;
    const existing = byCode.get(code);
    if (!existing || row.id < existing.id) {
      byCode.set(code, { id: String(row.id), code });
    }
  }
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function permissionsFromSessionFlags(flags) {
  if (!flags) return [];
  const perms = [];
  if (flags.has_gambling || flags.has_game) perms.push("Games");
  if (flags.has_bank) perms.push("Bank");
  return perms;
}

/**
 * Tenant capture categories (Games / Bank) from Spring session tenant flags.
 * Uses POST /auth/switch-tenant when flags are not cached.
 */
export async function fetchTenantCategoryPermissions(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { success: false, data: { permissions: DEFAULT_CATEGORY_PERMISSIONS } };
  }

  let flags = peekCompanySessionFlags(tid);
  if (!flags) {
    const json = await syncCompanySessionApi(tid);
    if (json?.success && json.data) {
      flags = {
        has_gambling: Boolean(json.data.has_game ?? json.data.has_gambling),
        has_bank: Boolean(json.data.has_bank),
      };
    }
  }

  const permissions = permissionsFromSessionFlags(flags);
  if (!permissions.length) {
    return { success: true, data: { permissions: DEFAULT_CATEGORY_PERMISSIONS } };
  }
  return { success: true, data: { permissions } };
}

/** POST /api/process/list-description — tenant description catalog. */
export async function fetchCaptureDescriptionCatalog(tenantId, signal) {
  const rows = await fetchProcessDescriptionsByTenantId(tenantId, signal);
  return {
    success: true,
    descriptions: rows.map((d) => ({ id: d.id, name: d.name })),
  };
}

/** POST /api/process/add-description */
export async function postCaptureDescription(tenantId, descriptionName, signal) {
  const created = await addProcessDescription(tenantId, descriptionName, signal);
  return { success: true, data: created };
}

/** POST /api/process/delete-description */
export async function postCaptureDescriptionDelete(tenantId, descriptionId, signal) {
  await deleteProcessDescription(tenantId, descriptionId, signal);
  return { success: true };
}

/**
 * POST /api/datacapture/bank/draft/save
 * Body: { tenantId, processCode, currencyId, tableData } — PROFIT rejected by server.
 */
export async function saveBankCaptureDraft(
  { tenantId, processCode, currencyId, tableData, cells = null },
  signal,
) {
  const tid = Number(tenantId);
  const cid = Number(currencyId);
  const code = String(processCode || "").trim().toUpperCase();
  if (!Number.isFinite(tid) || tid <= 0) throw new Error("tenantId is required");
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("currencyId is required");
  if (!code) throw new Error("processCode is required");

  const body = {
    tenantId: tid,
    processCode: code,
    currencyId: cid,
  };
  if (Array.isArray(cells) && cells.length) {
    body.cells = cells;
  } else {
    body.tableData = tableData ?? null;
  }

  const res = await fetch(buildApiUrl("api/datacapture/bank/draft/save"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    throw new Error(json?.message || "Failed to save bank draft");
  }
  return json.data ?? null;
}

/**
 * POST /api/datacapture/bank/draft/get
 * Body: { tenantId, processCode, currencyId }
 * @returns {{ tableData, processId, processCode, currencyId, cells }|null}
 */
export async function getBankCaptureDraft({ tenantId, processCode, currencyId }, signal) {
  const tid = Number(tenantId);
  const cid = Number(currencyId);
  const code = String(processCode || "").trim().toUpperCase();
  if (!Number.isFinite(tid) || tid <= 0) return null;
  if (!Number.isFinite(cid) || cid <= 0) return null;
  if (!code) return null;

  const res = await fetch(buildApiUrl("api/datacapture/bank/draft/get"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: tid, processCode: code, currencyId: cid }),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !isApiSuccess(json)) {
    return null;
  }
  const data = json.data;
  if (!data?.tableData) return null;
  return {
    tableData: data.tableData,
    processId: data.processId ?? null,
    processCode: data.processCode || code,
    currencyId: data.currencyId ?? cid,
    cells: Array.isArray(data.cells) ? data.cells : [],
  };
}

export function resolveScopeTenantId(scope) {
  return resolveDataCaptureTenantId(scope);
}
