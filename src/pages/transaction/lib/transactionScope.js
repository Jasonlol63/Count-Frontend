import {
  companiesNativeInGroupList,
  companyRowIsGroupEntity,
  filterCompaniesWithDisplayId,
  isDashboardGroupOnlyMode,
  isVirtualGroupLinkCompanyRow,
  pickGroupAnchorCompany,
  resolveViewGroupForCompany,
} from "../../../utils/company/sharedCompanyFilter.js";
import { groupIdsForGroupsAllAggregate } from "../../../utils/company/useGcFilterWithAllModes.js";

/**
 * Resolve API scope for Transaction page (group entity vs subsidiary drill-down).
 *
 * @returns {{
 *   mode: "group"|"company"|"aggregate",
 *   scopeCompanyId: number,
 *   viewGroup: string|null,
 *   selectedGroup: string|null,
 *   uiCompanyId: number|null,
 *   resolveCompanyViaGroupId?: boolean,
 *   groupsAllMode?: boolean,
 *   groupAllMode?: boolean,
 *   mergeCompanyIds?: number[],
 * }|null}
 */
export function resolveTransactionScope(filterSnapshot) {
  if (!filterSnapshot) return null;

  const snapCompanies =
    filterSnapshot.snapCompaniesAll || filterSnapshot.snapCompanies || [];
  const groupsAllMode = Boolean(filterSnapshot.groupsAllMode);
  const groupAllMode = Boolean(filterSnapshot.groupAllMode);
  const selectedGroup = filterSnapshot.selectedGroup
    ? String(filterSnapshot.selectedGroup).trim().toUpperCase()
    : null;
  const uiCompanyIdRaw = filterSnapshot.companyId;
  const hasExplicitCompany =
    uiCompanyIdRaw != null && Number(uiCompanyIdRaw) > 0;
  // Explicit company pill always wins — never treat subsidiary drill-down as group ledger
  // (prevents IG group CR/DR leaking into company 95 when dashboard group-only flag is set).
  const groupOnlyLedger = hasExplicitCompany
    ? false
    : Boolean(filterSnapshot.groupOnlyLedger) ||
      (selectedGroup && isDashboardGroupOnlyMode());
  const uiCompanyId = groupOnlyLedger
    ? null
    : hasExplicitCompany
      ? Number(uiCompanyIdRaw)
      : null;

  const mergeCompanyIds = (() => {
    if (uiCompanyId) return [uiCompanyId];
    if (groupAllMode || (groupsAllMode && groupAllMode)) {
      const list = groupsAllMode
        ? filterCompaniesWithDisplayId(snapCompanies).filter((c) => !isVirtualGroupLinkCompanyRow(c))
        : companiesNativeInGroupList(snapCompanies, selectedGroup);
      return list.map((c) => Number(c.id)).filter((id) => Number.isFinite(id) && id > 0);
    }
    if (groupsAllMode && !groupAllMode) {
      return [];
    }
    return [];
  })();

  if ((groupAllMode || groupsAllMode) && !uiCompanyId && mergeCompanyIds.length > 0) {
    return {
      mode: "aggregate",
      scopeCompanyId: 0,
      viewGroup: groupsAllMode ? null : selectedGroup,
      selectedGroup: groupsAllMode ? null : selectedGroup,
      uiCompanyId: null,
      groupsAllMode,
      groupAllMode,
      mergeCompanyIds,
    };
  }

  const entityRow = selectedGroup ? resolveGroupEntityRowFromSnap(snapCompanies, selectedGroup) : null;
  const entityId = entityRow?.id != null ? Number(entityRow.id) : null;

  if (selectedGroup && !uiCompanyId && !groupsAllMode && !groupAllMode) {
    return {
      mode: "group",
      scopeCompanyId: 0,
      viewGroup: selectedGroup,
      selectedGroup,
      uiCompanyId: null,
      groupOnlyLedger: true,
      resolveCompanyViaGroupId: true,
    };
  }

  let mode = "company";
  let scopeCompanyId = uiCompanyId;

  if (selectedGroup && entityId > 0 && uiCompanyId) {
    const uiRow = snapCompanies.find((c) => Number(c.id) === uiCompanyId) || null;
    if (uiCompanyId === entityId || companyRowIsGroupEntity(uiRow, selectedGroup)) {
      mode = "group";
      scopeCompanyId = entityId;
    } else {
      mode = "company";
      scopeCompanyId = uiCompanyId;
    }
  } else if (!scopeCompanyId && uiCompanyId) {
    scopeCompanyId = uiCompanyId;
  }

  // Explicit company pill (95, C168, …) always uses subsidiary scope — never group ledger.
  if (hasExplicitCompany && uiCompanyId > 0) {
    const scopeRow = snapCompanies.find((c) => Number(c.id) === uiCompanyId) || null;
    return {
      mode: "company",
      scopeCompanyId: uiCompanyId,
      viewGroup: resolveViewGroupForCompany(scopeRow, selectedGroup) || selectedGroup || null,
      selectedGroup,
      uiCompanyId,
    };
  }

  if (!scopeCompanyId || scopeCompanyId <= 0) {
    if (groupsAllMode && !groupAllMode) {
      const gids = groupIdsForGroupsAllAggregate(snapCompanies, filterSnapshot.snapGroupIds);
      return {
        mode: "aggregate",
        scopeCompanyId: 0,
        viewGroup: null,
        selectedGroup: null,
        uiCompanyId: null,
        groupsAllMode: true,
        groupAllMode: false,
        mergeCompanyIds: [],
        resolveCompanyViaGroupId: true,
        aggregateGroupIds: gids,
      };
    }
    return null;
  }

  const scopeRow = snapCompanies.find((c) => Number(c.id) === scopeCompanyId) || null;
  const viewGroup = resolveViewGroupForCompany(scopeRow, selectedGroup);

  return {
    mode,
    scopeCompanyId,
    viewGroup: viewGroup || null,
    selectedGroup,
    uiCompanyId,
  };
}

/**
 * Group entity row from owner companies list (matches accountlist resolveGroupEntityCompanyId).
 */
export function resolveGroupEntityRowFromSnap(snapCompanies, groupId) {
  const g = String(groupId || "").trim().toUpperCase();
  if (!g) return null;
  return (snapCompanies || []).find((c) => {
    if (!c) return false;
    const code = String(c.company_id ?? c.companyId ?? "").trim().toUpperCase();
    const gid = String(c.group_id ?? "").trim().toUpperCase();
    return code === g || (code === "" && gid === g);
  });
}

export function transactionScopeIsReady(scope) {
  if (!scope) return false;
  if (scope.mode === "aggregate") {
    if (scope.mergeCompanyIds?.length) return true;
    if (scope.aggregateGroupIds?.length) return true;
    return Boolean(scope.resolveCompanyViaGroupId && scope.groupsAllMode);
  }
  if (scope.scopeCompanyId > 0) return true;
  return Boolean(scope.resolveCompanyViaGroupId && scope.selectedGroup);
}

/** Params for transaction APIs (company_id and/or group_id). */
export function transactionScopeApiParams(scope) {
  if (!scope) return {};
  if (scope.mode === "aggregate") {
    return {
      companyId: undefined,
      viewGroup: scope.viewGroup || undefined,
      groupId: scope.selectedGroup || undefined,
      groupsAll: scope.groupsAllMode || undefined,
      groupAll: scope.groupAllMode || undefined,
    };
  }
  const viewGroup = scope.viewGroup || scope.selectedGroup || undefined;
  // Group ledger (AP only): never send company_id — backend uses scope_type=group.
  if (scope.mode === "group") {
    return {
      companyId: undefined,
      viewGroup,
      groupId: scope.selectedGroup || undefined,
      groupAggregate: true,
    };
  }
  // Subsidiary drill-down: company_id wins; scope currencies API uses subsidiary_accounts_only.
  return {
    companyId: scope.scopeCompanyId > 0 ? scope.scopeCompanyId : scope.uiCompanyId ?? undefined,
    viewGroup,
    groupId: undefined,
    subsidiaryAccountsOnly: true,
  };
}

/** Cache/storage key for company-scoped UI state (supports group-only scope). */
export function transactionScopeCacheCompanyKey(scope) {
  if (!scope) return null;
  if (scope.mode === "aggregate") {
    if (scope.mergeCompanyIds?.length) {
      return `aggregate:${scope.mergeCompanyIds.join(",")}`;
    }
    if (scope.aggregateGroupIds?.length) {
      return `groups:${scope.aggregateGroupIds.join(",")}`;
    }
    return "aggregate:groups";
  }
  if (scope.scopeCompanyId > 0) return scope.scopeCompanyId;
  if (scope.selectedGroup) return `group:${scope.selectedGroup}`;
  return null;
}

/** Stable key for scope transitions (company drill-down vs group-only). */
export function transactionScopeCacheKey(scope) {
  if (!scope) return "";
  const companyKey = transactionScopeCacheCompanyKey(scope) ?? "";
  return `${companyKey}:${scope.viewGroup || ""}:${scope.mode}:${scope.uiCompanyId ?? ""}`;
}

/** company_id for user_currency_order_api (per subsidiary / group anchor). */
export function resolveTransactionCurrencyOrderCompanyId(scope, snapCompanies = []) {
  if (!scope) return null;
  const ui = Number(scope.uiCompanyId);
  if (Number.isFinite(ui) && ui > 0) return ui;
  const scopeCid = Number(scope.scopeCompanyId);
  if (Number.isFinite(scopeCid) && scopeCid > 0) return scopeCid;
  const g = scope.selectedGroup ? String(scope.selectedGroup).trim().toUpperCase() : "";
  if (g && snapCompanies?.length) {
    const anchor = pickGroupAnchorCompany(snapCompanies, g);
    const aid = Number(anchor?.id);
    if (Number.isFinite(aid) && aid > 0) return aid;
  }
  if (scope.mergeCompanyIds?.length) {
    const first = Number(scope.mergeCompanyIds[0]);
    if (Number.isFinite(first) && first > 0) return first;
  }
  return null;
}
