import { fetchDomainFeeSettings, fetchDomainList } from "../domain/domainApi.js";
import {
  ensureCompanyFeeShare,
  groupFromApiRow,
  normalizeFeeShareFromServer,
} from "../domain/domainHelpers.js";

function normalizeCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

/** Spring aggregate company row → CompanySettingsModal company state */
function mapCompanyFromSpring(c) {
  const co = {
    id: c.id ?? null,
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
 * Load Company / Group Settings payload for an auto-renew row (Spring Domain list).
 * @returns {Promise<{ type: 'company'|'group', ownerId: number, tenant: object }|null>}
 */
export async function loadAutoRenewTenantSettings(row) {
  const ownerId = Number(row?.owner_id);
  if (!Number.isFinite(ownerId) || ownerId <= 0) return null;

  const code = normalizeCode(row.company_code);
  if (!code) return null;

  const owners = await fetchDomainList(ownerId);
  const owner =
    (Array.isArray(owners) ? owners : []).find((o) => Number(o.id) === ownerId) ||
    (Array.isArray(owners) && owners.length === 1 ? owners[0] : null);
  if (!owner) return null;

  const isGroup = row?.entity_type === "group";

  if (isGroup) {
    const groups = Array.isArray(owner.groups_full) ? owner.groups_full : [];
    const match = groups.find((g) => normalizeCode(g.group_code) === code);
    if (!match) return null;
    return {
      type: "group",
      ownerId,
      tenant: groupFromApiRow(match),
    };
  }

  const companies = Array.isArray(owner.companies_full) ? owner.companies_full : [];
  const match = companies.find((c) => normalizeCode(c.company_id) === code);
  if (!match) return null;
  return {
    type: "company",
    ownerId,
    tenant: mapCompanyFromSpring(match),
  };
}

/** Domain fee period prices for Share % amount preview (Spring list-fee). */
export async function fetchDomainFeeSettingsForAutoRenew() {
  return fetchDomainFeeSettings();
}
