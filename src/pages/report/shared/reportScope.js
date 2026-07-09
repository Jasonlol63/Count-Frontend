import {
  companiesGroupEntityList,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
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
}) {
  const tx = resolveTransactionScope({
    snapCompanies: companies ?? [],
    snapCompaniesAll: companies ?? [],
    selectedGroup,
    companyId,
    groupsAllMode,
    groupAllMode,
    snapGroupIds: sortedUniqueGroupIds(companies ?? []),
  });
  return mapTransactionScopeToReportScope(tx);
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
