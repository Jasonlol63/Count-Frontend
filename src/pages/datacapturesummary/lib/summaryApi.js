import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { appendDataCaptureScopeParams } from "../../datacapture/lib/dataCaptureApi.js";

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

/** Default load: currencies + accounts for Edit Formula / Add Account */
export async function fetchSummaryFormCatalog(captureScope) {
  const url = withCaptureScope(buildApiUrl("api/datacapture_summary/summary_api.php"), captureScope);
  const response = await fetch(url, { credentials: "include" });
  const json = await parseJsonResponse(response);
  if (!json.success) {
    throw new Error(json.message || "Failed to load summary form data");
  }
  return {
    currencies: Array.isArray(json.currencies) ? json.currencies : [],
    accounts: Array.isArray(json.accounts) ? json.accounts : [],
  };
}

/** GET ?action=get_summary_state */
export async function fetchSummaryServerState({ captureScope, processId, processCode, signal }) {
  const params = new URLSearchParams({ action: "get_summary_state" });
  if (processId != null && processId !== "") params.set("process_id", String(processId));
  if (processCode != null && processCode !== "") params.set("process_code", String(processCode));
  appendDataCaptureScopeParams(params, captureScope);
  const url = buildApiUrl(`api/datacapture_summary/summary_api.php?${params.toString()}`);
  const response = await fetch(url, { credentials: "include", signal });
  const json = await response.json();
  if (json?.success === true && json.data && typeof json.data === "object") {
    return json.data;
  }
  return null;
}

/** POST ?action=submit — returns parsed JSON or throws with { status, message, isSizeError }. */
export async function submitSummaryPayload(captureScope, payload) {
  const url = withCaptureScope(
    buildApiUrl("api/datacapture_summary/summary_api.php?action=submit"),
    captureScope,
  );
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
export async function fetchSummaryAccountList(captureScope) {
  const json = await fetchSummaryFormCatalog(captureScope);
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
    withCompany(buildApiUrl("api/datacapture_summary/summary_api.php"), companyId),
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

/** POST ?action=delete_template — remove saved formula template (legacy deleteSelectedRows). */
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
    withCompany(buildApiUrl("api/datacapture_summary/summary_api.php?action=delete_template"), companyId),
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
