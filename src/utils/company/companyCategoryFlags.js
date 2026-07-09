import { peekCompanySessionFlags } from "./companySessionFlagsCache.js";

function parseCompanyPermissions(raw) {
  if (Array.isArray(raw)) {
    return raw.map((p) => String(p).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((p) => String(p).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Category flags from owner-companies row permissions (instant sidebar before session sync). */
export function resolveCompanyCategoryFlagsFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const perms = parseCompanyPermissions(row.permissions);
  if (!perms.length) return null;
  const hasGambling = perms.some((p) => p === "Games" || p === "Gambling");
  const hasBank = perms.some((p) => p === "Bank");
  return { hasGambling, hasBank };
}

export function permissionsIncludeGames(permissions) {
  const list = parseCompanyPermissions(permissions);
  return list.some((p) => p === "Games" || p === "Gambling");
}

export function permissionsIncludeBank(permissions) {
  const list = parseCompanyPermissions(permissions);
  return list.some((p) => p === "Bank");
}

/** Row permissions first, then session-sync cache (owner-companies API includes permissions). */
export function resolveCompanyCategoryFlags(companyRow) {
  const fromRow = resolveCompanyCategoryFlagsFromRow(companyRow);
  if (fromRow) return fromRow;
  const id = Number(companyRow?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const cached = peekCompanySessionFlags(id);
  if (!cached) return null;
  return {
    hasGambling: Boolean(cached.has_gambling),
    hasBank: Boolean(cached.has_bank),
  };
}

export function companyMatchesGamesPillScope(companyRow) {
  const flags = resolveCompanyCategoryFlags(companyRow);
  if (!flags) return true;
  return flags.hasGambling;
}

export function companyMatchesBankPillScope(companyRow) {
  const flags = resolveCompanyCategoryFlags(companyRow);
  if (!flags) return false;
  return flags.hasBank;
}

/** Bank-only (e.g. CX): has Bank, no Games/Gambling — same rule as Process bank redirect. */
export function companyMatchesBankOnlyPillScope(companyRow) {
  const flags = resolveCompanyCategoryFlags(companyRow);
  if (!flags) return false;
  return flags.hasBank && !flags.hasGambling;
}

function filterCompaniesByPillCategory(companies, matchesScope, preferredCompanyId = null) {
  if (!Array.isArray(companies)) return [];
  const pref = Number(preferredCompanyId);
  return companies.filter((c) => {
    if (Number.isFinite(pref) && pref > 0 && Number(c.id) === pref) {
      return matchesScope(c);
    }
    return matchesScope(c);
  });
}

/** Games pages (Data Capture, Process List, …): hide bank-only companies such as CX. */
export function filterCompaniesForGamesPills(companies, preferredCompanyId = null) {
  return filterCompaniesByPillCategory(companies, companyMatchesGamesPillScope, preferredCompanyId);
}

/** Has Bank permission (incl. Games+Bank). */
export function filterCompaniesForBankPills(companies, preferredCompanyId = null) {
  return filterCompaniesByPillCategory(companies, companyMatchesBankPillScope, preferredCompanyId);
}

/** Bank-only companies (CX): hide pure Games and Games+Bank hybrids on bank process maintenance. */
export function filterCompaniesForBankOnlyPills(companies, preferredCompanyId = null) {
  return filterCompaniesByPillCategory(companies, companyMatchesBankOnlyPillScope, preferredCompanyId);
}
