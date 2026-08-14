import {
  dedupeOwnerCompaniesByCode,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  persistDashboardGroupOnlyMode,
  pickDefaultSubsidiaryForGroup,
  readPersistedDashboardGcFilter,
  resolveGcFilterBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  resolveOwnerDashboardGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
import { canUseGroupOnlyMode, resolveVisibleGroupIds } from "../../../utils/company/loginScope.js";
import { isPartnershipAuditReadOnlyLocked } from "../../../utils/audit/partnershipAuditReadOnly.js";
import { buildTransactionCompanyStripRows } from "./transactionCompanyStrip.js";

/** Group pills: company rows + Domain groups cache + login-scope (empty Group still shows KK). */
function resolveTransactionSnapGroupIds(companies, me) {
  const list = Array.isArray(companies) ? companies : [];
  return resolveVisibleGroupIds(resolveOwnerDashboardGroupIds(list, me), me, list);
}

/** Build filter snapshot for Transaction boot (sync cache path or async API path). */
export function buildTransactionBootSnapshot(u, rows, { queryCompany = null } = {}) {
  if (!u) return null;
  const companyRows = Array.isArray(rows) ? rows : [];
  // Empty Group login: owner companies may be [] — still boot group-only ledger.
  const isEmptyGroupLogin =
    companyRows.length === 0 &&
    canUseGroupOnlyMode(u, resolveInitialSelectedGroupFromSession([], null, u));
  if (companyRows.length === 0 && !isEmptyGroupLogin) return null;

  const persisted = readPersistedDashboardGcFilter();
  const bootGc = resolveGcFilterBootCompanyId({
    urlCompanyId: queryCompany,
    sessionCompanyId: u.company_id,
    defaultRowId: companyRows[0]?.id,
  });
  let effective = bootGc.companyId;
  const snapRows = dedupeOwnerCompaniesByCode(companyRows, effective ?? u.company_id);

  const current =
    effective != null ? snapRows.find((c) => Number(c.id) === Number(effective)) : null;
  const groupFilterOptOut =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
  const selGroup = groupFilterOptOut
    ? null
    : bootGc.selectedGroup ||
      persisted.selectedGroup ||
      resolveInitialSelectedGroupFromSession(snapRows, current, u);

  const allowBootGroupOnly = canUseGroupOnlyMode(u, selGroup);
  let bootGroupOnly =
    (bootGc.groupOnly || effective == null || isEmptyGroupLogin) &&
    allowBootGroupOnly &&
    !groupFilterOptOut;
  if (!bootGroupOnly && effective == null && selGroup && !groupFilterOptOut) {
    const pick = pickDefaultSubsidiaryForGroup(snapRows, selGroup, {
      me: u,
      preferredCompanyId: u?.company_id ?? null,
    });
    if (pick?.id) {
      effective = Number(pick.id);
    }
  }

  const snapGroupIds = resolveTransactionSnapGroupIds(companyRows, u);

  const bootSnap = {
    companyId: bootGroupOnly ? null : effective,
    groupOnlyLedger: bootGroupOnly,
    selectedGroup: selGroup,
    groupFilterOptOut: groupFilterOptOut,
    displayCompanyRow: bootGroupOnly ? null : current,
    groupsAllMode: false,
    groupAllMode: false,
    snapCompanies: snapRows,
    snapCompaniesAll: companyRows,
    snapGroupIds,
    viewerRole: String(u.role || "").toLowerCase(),
    mutationsBlocked: isPartnershipAuditReadOnlyLocked(u),
  };
  bootSnap.companyStripRows = buildTransactionCompanyStripRows(bootSnap, {
    selectedGroup: selGroup,
    companyId: bootGroupOnly ? null : effective,
    groupsAllMode: false,
  });
  return bootSnap;
}

function ownerCompaniesSig(rows) {
  return (rows || [])
    .map((c) => [c.id, c.company_id ?? "", c.group_id ?? ""].join(":"))
    .sort()
    .join("|");
}

export function mergeOwnerCompaniesIntoSnapshot(prevSnap, rows, u) {
  if (!prevSnap || !Array.isArray(rows)) return prevSnap;
  const sig = ownerCompaniesSig(rows);
  if (prevSnap._ownerCompaniesSig === sig) return prevSnap;
  // Keep group-only: do not pin first subsidiary when snapshot has no company.
  const keepGroupOnly = !!prevSnap.groupOnlyLedger && prevSnap.companyId == null;
  const effective = keepGroupOnly
    ? null
    : (prevSnap.companyId ?? u?.company_id ?? (rows[0]?.id != null ? Number(rows[0].id) : null));
  const snapRows = dedupeOwnerCompaniesByCode(rows, effective ?? u?.company_id);
  const next = {
    ...prevSnap,
    companyId: keepGroupOnly ? null : prevSnap.companyId,
    groupOnlyLedger: keepGroupOnly ? true : prevSnap.groupOnlyLedger,
    snapCompanies: snapRows,
    snapCompaniesAll: rows,
    snapGroupIds: resolveTransactionSnapGroupIds(rows, u),
    _ownerCompaniesSig: sig,
  };
  next.companyStripRows = buildTransactionCompanyStripRows(next, {
    selectedGroup: next.selectedGroup,
    companyId: next.companyId,
    groupsAllMode: Boolean(next.groupsAllMode),
  });
  return next;
}

export function applyTransactionBootPersistence(bootSnap) {
  if (!bootSnap) return;
  persistDashboardGroupOnlyMode(!!bootSnap.groupOnlyLedger);
}

export { resolveTransactionSnapGroupIds };
