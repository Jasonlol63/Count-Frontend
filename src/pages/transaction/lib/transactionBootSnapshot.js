import {
  dedupeOwnerCompaniesByCode,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  persistDashboardGroupOnlyMode,
  pickDefaultSubsidiaryForGroup,
  readPersistedDashboardGcFilter,
  resolveGcFilterBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import { isPartnershipAuditReadOnlyLocked } from "../../../utils/audit/partnershipAuditReadOnly.js";
import { buildTransactionCompanyStripRows } from "./transactionCompanyStrip.js";

/** Build filter snapshot for Transaction boot (sync cache path or async API path). */
export function buildTransactionBootSnapshot(u, rows, { queryCompany = null } = {}) {
  if (!u || !Array.isArray(rows) || rows.length === 0) return null;

  const persisted = readPersistedDashboardGcFilter();
  const bootGc = resolveGcFilterBootCompanyId({
    urlCompanyId: queryCompany,
    sessionCompanyId: u.company_id,
    defaultRowId: rows[0]?.id,
  });
  let effective = bootGc.companyId;
  const snapRows = dedupeOwnerCompaniesByCode(rows, effective ?? u.company_id);

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
    (bootGc.groupOnly || effective == null) && allowBootGroupOnly && !groupFilterOptOut;
  if (!bootGroupOnly && effective == null && selGroup && !groupFilterOptOut) {
    const pick = pickDefaultSubsidiaryForGroup(snapRows, selGroup, {
      me: u,
      preferredCompanyId: u?.company_id ?? null,
    });
    if (pick?.id) {
      effective = Number(pick.id);
    }
  }

  const bootSnap = {
    companyId: bootGroupOnly ? null : effective,
    groupOnlyLedger: bootGroupOnly,
    selectedGroup: selGroup,
    groupFilterOptOut: groupFilterOptOut,
    displayCompanyRow: bootGroupOnly ? null : current,
    groupsAllMode: false,
    groupAllMode: false,
    snapCompanies: snapRows,
    snapCompaniesAll: rows,
    snapGroupIds: sortedUniqueGroupIds(snapRows),
    viewerRole: String(u.role || "").toLowerCase(),
    mutationsBlocked: isPartnershipAuditReadOnlyLocked(u),
  };
  bootSnap.companyStripRows = buildTransactionCompanyStripRows(bootSnap, {
    selectedGroup: selGroup,
    companyId: effective,
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
  if (!prevSnap || !Array.isArray(rows) || rows.length === 0) return prevSnap;
  const sig = ownerCompaniesSig(rows);
  if (prevSnap._ownerCompaniesSig === sig) return prevSnap;
  const effective = prevSnap.companyId ?? u?.company_id ?? rows[0]?.id ?? null;
  const snapRows = dedupeOwnerCompaniesByCode(rows, effective ?? u?.company_id);
  const next = {
    ...prevSnap,
    snapCompanies: snapRows,
    snapCompaniesAll: rows,
    snapGroupIds: sortedUniqueGroupIds(snapRows),
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
