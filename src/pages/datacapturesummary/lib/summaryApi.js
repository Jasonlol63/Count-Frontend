import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  fetchAccountListByTenantId,
  filterAccountListRows,
} from "../../account/accountListApi.js";
import { appendDataCaptureScopeParams } from "../../datacapture/lib/dataCaptureApi.js";
import { resolveDataCaptureEffectiveTenantId } from "../../datacapture/lib/dataCaptureTenant.js";
import { fetchCaptureCurrenciesByTenantId } from "../../datacapture/lib/dataCaptureSpringApi.js";

/** Canonical Summary submit endpoint. Legacy: summary_api.php?action=submit */
const SUMMARY_SUBMIT_API = "api/datacapture_summary/summary_submit_api.php";
/** Templates CRUD. Legacy: summary_api.php?action=save_template|delete_template|templates */
const SUMMARY_TEMPLATES_API = "api/datacapture_summary/summary_templates_api.php";
/** Server row/formula state. Legacy: summary_api.php?action=get_summary_state|save_summary_state */
const SUMMARY_STATE_API = "api/datacapture_summary/summary_state_api.php";
/** Form catalog (currencies + accounts). Legacy: summary_api.php (default load) */
const SUMMARY_CATALOG_API = "api/datacapture_summary/summary_catalog_api.php";

function withCaptureScope(url, captureScope) {
  if (!captureScope) return url;
  const sep = url.includes("?") ? "&" : "?";
  const params = new URLSearchParams();
  appendDataCaptureScopeParams(params, captureScope);
  const qs = params.toString();
  return qs ? `${url}${sep}${qs}` : url;
}

function withCompany(url, companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}company_id=${encodeURIComponent(String(cid))}`;
}

async function parseJsonResponse(response) {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.message || json?.error || `HTTP ${response.status}`);
  }
  return json;
}

/**
 * Currencies + accounts for Edit / Add Formula.
 * Accounts prefer Spring {@code POST /api/account/list}; PHP catalog is fallback only.
 */
export async function fetchSummaryFormCatalog(captureScope, companyId = null) {
  const tenantId = resolveDataCaptureEffectiveTenantId(captureScope, companyId);

  let accounts = [];
  if (tenantId) {
    try {
      const rows = await fetchAccountListByTenantId(tenantId);
      accounts = filterAccountListRows(rows);
    } catch (e) {
      console.warn("Spring account list for formula catalog failed:", e);
    }
  }

  let currencies = [];
  if (tenantId) {
    try {
      currencies = await fetchCaptureCurrenciesByTenantId(tenantId);
    } catch (e) {
      console.warn("Spring currency list for formula catalog failed:", e);
    }
  }

  // Fallback: legacy PHP catalog when Spring returned nothing (e.g. proxy still on old stack).
  if (!accounts.length || !currencies.length) {
    try {
      const url = withCaptureScope(buildApiUrl(SUMMARY_CATALOG_API), captureScope);
      const response = await fetch(url, { credentials: "include" });
      const json = await parseJsonResponse(response);
      if (json?.success) {
        if (!accounts.length && Array.isArray(json.accounts)) {
          accounts = json.accounts;
        }
        if (!currencies.length && Array.isArray(json.currencies)) {
          currencies = json.currencies;
        }
      }
    } catch (e) {
      console.warn("PHP summary catalog fallback failed:", e);
    }
  }

  if (!tenantId && !accounts.length && !currencies.length) {
    throw new Error("tenantId is required to load formula form data");
  }

  return { currencies, accounts };
}

/** GET ?action=get_summary_state */
export async function fetchSummaryServerState({ captureScope, processId, processCode, signal }) {
  const params = new URLSearchParams({ action: "get_summary_state" });
  if (processId != null && processId !== "") params.set("process_id", String(processId));
  if (processCode != null && processCode !== "") params.set("process_code", String(processCode));
  appendDataCaptureScopeParams(params, captureScope);
  const url = buildApiUrl(`${SUMMARY_STATE_API}?${params.toString()}`);
  const response = await fetch(url, { credentials: "include", signal });
  const json = await response.json();
  if (json?.success === true && json.data && typeof json.data === "object") {
    return json.data;
  }
  return null;
}

/** POST ?action=submit — returns parsed JSON or throws with { status, message, isSizeError }. */
export async function submitSummaryPayload(captureScope, payload) {
  const url = withCaptureScope(buildApiUrl(SUMMARY_SUBMIT_API), captureScope);
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    const lowerText = (responseText || "").toLowerCase();
    const isSizeError =
      response.status === 413 ||
      lowerText.includes("post_max_size") ||
      lowerText.includes("payload too large") ||
      lowerText.includes("request entity too large") ||
      lowerText.includes("数据太大") ||
      lowerText.includes("exceeds");
    throw {
      status: response.status,
      message: responseText || `HTTP ${response.status}`,
      isSizeError,
    };
  }

  let json;
  try {
    json = JSON.parse(responseText);
  } catch {
    throw {
      status: response.status,
      message: `Invalid JSON response: ${responseText}`,
      isSizeError: false,
    };
  }

  if (!json.success) {
    const message = json.message || json.error || "Unknown error";
    throw {
      status: response.status,
      message,
      isSizeError: /太大|post_max_size/i.test(message),
    };
  }

  return json;
}

/** GET accounts list (same as legacy fetchSummaryAccountList). */
export async function fetchSummaryAccountList(captureScope, companyId = null) {
  const json = await fetchSummaryFormCatalog(captureScope, companyId);
  return Array.isArray(json.accounts) ? json.accounts : [];
}

/** POST ?action=templates — load maintenance templates for id products. */
export async function fetchSummaryTemplates({
  captureScope,
  companyId,
  idProducts,
  processId,
  captureId = null,
}) {
  const params = new URLSearchParams({ action: "templates" });
  const base = withCaptureScope(
    withCompany(buildApiUrl(SUMMARY_TEMPLATES_API), companyId),
    captureScope,
  );
  const url = base.includes("?") ? `${base}&${params}` : `${base}?${params}`;

  const body = {
    idProducts: [...new Set((idProducts || []).map((v) => String(v || "").trim()).filter(Boolean))],
    processId,
  };
  if (companyId != null && Number(companyId) > 0) {
    body.company_id = Number(companyId);
  }
  if (captureId != null && !Number.isNaN(Number(captureId)) && Number(captureId) > 0) {
    body.captureId = Number(captureId);
  }

  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await parseJsonResponse(response);
  if (!json.success) {
    throw new Error(json.message || json.error || "Failed to load templates");
  }
  return {
    templates: json.templates && typeof json.templates === "object" ? json.templates : {},
    subsByParent:
      json.subsByParent && typeof json.subsByParent === "object" ? json.subsByParent : null,
    diagnostics: json.diagnostics ?? null,
  };
}

/** POST ?action=delete_template — legacy PHP. Summary delete uses deleteFormulasSpring. */
export async function deleteSummaryTemplate({
  captureScope,
  companyId,
  processId,
  templateKey,
  productType = "main",
  templateId = null,
  formulaVariant = null,
}) {
  if (!templateKey) {
    return { success: false, message: "Missing template key" };
  }

  const url = withCaptureScope(
    withCompany(buildApiUrl(`${SUMMARY_TEMPLATES_API}?action=delete_template`), companyId),
    captureScope,
  );

  const body = {
    template_key: templateKey,
    product_type: productType,
  };
  if (companyId != null && Number(companyId) > 0) {
    body.company_id = Number(companyId);
  }
  if (templateId != null && templateId !== "") body.template_id = templateId;
  if (formulaVariant != null && formulaVariant !== "") body.formula_variant = formulaVariant;
  if (processId != null && processId !== "") body.process_id = processId;

  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonResponse(response);
}
