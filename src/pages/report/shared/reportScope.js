import {
  companiesGroupEntityList,
  resolveOwnerDashboardGroupIds,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
import { resolveVisibleGroupIds } from "../../../utils/company/loginScope.js";
import {
  resolveTransactionScope,
  transactionScopeApiParams,
  transactionScopeCacheCompanyKey,
  transactionScopeIsReady,
} from "../../transaction/lib/transactionScope.js";

/**
 * Group entity row (e.g. AP) — matches transactionScope.resolveGroupEntityRowFromSnap.
 */
export function resolveGroupEntityRowFromSnap(snapCompanies, groupId) {
  const entities = companiesGroupEntityList(snapCompanies, groupId);
  return entities[0] ?? null;
}

function mapTransactionScopeToReportScope(tx) {
  if (!tx) return null;
  return {
    mode: tx.mode,
    scopeCompanyId: tx.scopeCompanyId ?? 0,
    groupId: tx.selectedGroup || null,
    viewGroup: tx.viewGroup || tx.selectedGroup || null,
    uiCompanyId: tx.uiCompanyId ?? null,
    resolveCompanyViaGroupId: tx.resolveCompanyViaGroupId,
    groupsAllMode: tx.groupsAllMode,
    groupAllMode: tx.groupAllMode,
    mergeCompanyIds: tx.mergeCompanyIds,
    aggregateGroupIds: tx.aggregateGroupIds,
  };
}

function mapReportScopeToTransactionScope(scope) {
  if (!scope) return null;
  return {
    mode: scope.mode,
    scopeCompanyId: scope.scopeCompanyId,
    viewGroup: scope.viewGroup,
    selectedGroup: scope.groupId,
    uiCompanyId: scope.uiCompanyId,
    resolveCompanyViaGroupId: scope.resolveCompanyViaGroupId,
    groupsAllMode: scope.groupsAllMode,
    groupAllMode: scope.groupAllMode,
    mergeCompanyIds: scope.mergeCompanyIds,
    aggregateGroupIds: scope.aggregateGroupIds,
  };
}

/** Domain / login groups + company.group_id — same as Transaction snapGroupIds. */
export function resolveReportSnapGroupIds(companies, me = null) {
  const list = Array.isArray(companies) ? companies : [];
  return resolveVisibleGroupIds(resolveOwnerDashboardGroupIds(list, me), me, list);
}

/**
 * Group = group entity company's accounts; Company = selected subsidiary's accounts.
 * Supports groupsAllMode / groupAllMode (All pills — never sent as group_id "ALL").
 */
export function resolveCustomerReportScope({
  companies,
  selectedGroup,
  companyId,
  groupsAllMode = false,
  groupAllMode = false,
  me = null,
}) {
  const list = companies ?? [];
  const tx = resolveTransactionScope({
    snapCompanies: list,
    snapCompaniesAll: list,
    selectedGroup,
    companyId,
    groupsAllMode,
    groupAllMode,
    snapGroupIds: resolveReportSnapGroupIds(list, me),
  });
  const mapped = mapTransactionScopeToReportScope(tx);

  // Pure group scope (no subsidiary drilled into): Transaction's ledger semantics leave
  // scopeCompanyId at 0, but Report/Account/Currency APIs are single-tenant. Resolve to the
  // group's own entity company (company_id === group code) — same tenant Data Capture uses
  // for group payroll (SALARY/COMMISSION/BONUS/PROFIT) — so this scope gets a real tenantId
  // without touching company/aggregate scope resolution at all.
  if (mapped?.mode === "group" && !(Number(mapped.scopeCompanyId) > 0)) {
    const entityRow = resolveGroupEntityRowFromSnap(list, mapped.groupId || selectedGroup);
    const entityId = entityRow?.id != null ? Number(entityRow.id) : 0;
    if (entityId > 0) {
      return { ...mapped, scopeCompanyId: entityId, resolveCompanyViaGroupId: false };
    }
  }

  return mapped;
}

export function customerReportScopeIsReady(scope) {
  return transactionScopeIsReady(mapReportScopeToTransactionScope(scope));
}

/** Params for report / accounts / currencies APIs (aligned with transactionScopeApiParams). */
export function customerReportScopeApiParams(scope) {
  const p = transactionScopeApiParams(mapReportScopeToTransactionScope(scope));
  if (!p || Object.keys(p).length === 0) return {};
  return {
    companyId: p.companyId,
    viewGroup: p.viewGroup,
    groupId: p.groupId,
    groupsAll: p.groupsAll,
    groupAll: p.groupAll,
    groupAggregate: p.groupAggregate,
    subsidiaryAccountsOnly: p.subsidiaryAccountsOnly,
  };
}

export function customerReportScopeCacheCompanyKey(scope) {
  return transactionScopeCacheCompanyKey(mapReportScopeToTransactionScope(scope));
}

export function customerReportScopeCacheKey(scope) {
  if (!scope) return "";
  const companyKey = customerReportScopeCacheCompanyKey(scope) ?? "";
  return `${companyKey}:${scope.viewGroup || ""}:${scope.mode}:${scope.uiCompanyId ?? ""}`;
}
