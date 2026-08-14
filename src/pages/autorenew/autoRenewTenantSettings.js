import { buildApiUrl } from "../../utils/core/apiUrl.js";
import {
  ensureCompanyFeeShare,
  groupFromApiRow,
  normalizeFeeShareFromServer,
} from "../domain/domainHelpers.js";

function normalizeCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

async function postDomainAction(action, payload = {}) {
  const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || "Domain request failed");
  }
  return json.data;
}

function mapCompanyRow(c) {
  const co = {
    company_id: c.company_id,
    expiration_date: c.expiration_date || null,
    permissions: Array.isArray(c.permissions) ? c.permissions : [],
    group_id: c.group_id ? normalizeCode(c.group_id) : null,
    fee_share_allocations: normalizeFeeShareFromServer(c.fee_share_allocations),
    apply_commission_payments_on_domain_save: !!c.apply_commission_payments_on_domain_save,
  };
  ensureCompanyFeeShare(co);
  co.originalExpirationDate = co.expiration_date || null;
  co.selectedPeriod = null;
  co.startDate = new Date().toISOString().split("T")[0];
  co.isExtending = false;
  return co;
}

/**
 * Load Company / Group Settings payload for an auto-renew row.
 * @returns {Promise<{ type: 'company'|'group', ownerId: number, tenant: object }|null>}
 */
export async function loadAutoRenewTenantSettings(row) {
  const ownerId = Number(row?.owner_id);
  if (!Number.isFinite(ownerId) || ownerId <= 0) return null;

  const code = normalizeCode(row.company_code);
  if (!code) return null;

  const isGroup = row?.entity_type === "group";

  if (isGroup) {
    const data = await postDomainAction("get_groups", { owner_id: ownerId });
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    const match = groups.find((g) => normalizeCode(g.group_code) === code);
    if (!match) return null;
    return {
      type: "group",
      ownerId,
      tenant: groupFromApiRow(match),
    };
  }

  const data = await postDomainAction("get_companies", { owner_id: ownerId });
  const companies = Array.isArray(data?.companies) ? data.companies : [];
  const match = companies.find((c) => normalizeCode(c.company_id) === code);
  if (!match) return null;
  return {
    type: "company",
    ownerId,
    tenant: mapCompanyRow(match),
  };
}

export async function fetchDomainFeeSettingsForAutoRenew() {
  const data = await postDomainAction("get_domain_fee_settings");
  return data;
}
