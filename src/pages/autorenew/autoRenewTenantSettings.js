import { fetchDomainList, fetchDomainFeeSettings } from "../domain/domainApi.js";
import { ensureCompanyFeeShare } from "../domain/domainHelpers.js";

function normalizeCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function buildCompanyTenant(row) {
  const co = {
    id: row.id,
    company_id: row.company_id,
    expiration_date: row.expiration_date || null,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    group_id: row.group_id ? normalizeCode(row.group_id) : null,
    fee_share_allocations: row.fee_share_allocations,
  };
  ensureCompanyFeeShare(co);
  co.originalExpirationDate = co.expiration_date || null;
  co.selectedPeriod = null;
  co.startDate = todayStr();
  co.isExtending = false;
  return co;
}

function buildGroupTenant(row) {
  const g = {
    id: row.id,
    group_code: row.group_code,
    expiration_date: row.expiration_date || null,
    permissions: [],
    fee_share_allocations: row.fee_share_allocations,
  };
  ensureCompanyFeeShare(g);
  g.originalExpirationDate = g.expiration_date || null;
  g.selectedPeriod = null;
  g.startDate = todayStr();
  g.isExtending = false;
  return g;
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

  const owners = await fetchDomainList(ownerId);
  const owner = owners.find((o) => Number(o.id) === ownerId) || owners[0];
  if (!owner) return null;

  if (isGroup) {
    const groups = Array.isArray(owner.groups_full) ? owner.groups_full : [];
    const match = groups.find((g) => normalizeCode(g.group_code) === code);
    if (!match) return null;
    return {
      type: "group",
      ownerId,
      tenant: buildGroupTenant(match),
    };
  }

  const companies = Array.isArray(owner.companies_full) ? owner.companies_full : [];
  const match = companies.find((c) => normalizeCode(c.company_id) === code);
  if (!match) return null;
  return {
    type: "company",
    ownerId,
    tenant: buildCompanyTenant(match),
  };
}

export async function fetchDomainFeeSettingsForAutoRenew() {
  return fetchDomainFeeSettings();
}
