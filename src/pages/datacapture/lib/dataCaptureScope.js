import {
  resolveViewGroupForCompany,
} from "../../../utils/company/sharedCompanyFilter.js";
import { resolveCustomerReportScope } from "../../report/shared/reportScope.js";
import { resolveGroupEntityRowFromSnap } from "../../transaction/lib/transactionScope.js";

/**
 * Data Capture scope: group entity (SALARY/BONUS) vs subsidiary company.
 */
export function resolveDataCaptureScope({
  companies,
  selectedGroup,
  companyId,
  groupOnlyMode = false,
  groupsAllMode = false,
  groupAllMode = false,
}) {
  const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  const uiCompanyId =
    companyId != null && companyId !== "" && Number(companyId) > 0 ? Number(companyId) : null;

  if (groupOnlyMode && groupKey && !groupsAllMode) {
    const entityRow = resolveGroupEntityRowFromSnap(companies, groupKey);
    const entityId = entityRow?.id != null ? Number(entityRow.id) : 0;
    return {
      mode: "group",
      scopeCompanyId: entityId,
      groupId: groupKey,
      viewGroup: groupKey,
      uiCompanyId: null,
      resolveCompanyViaGroupId: entityId <= 0,
    };
  }

  const reportScope = resolveCustomerReportScope({
    companies,
    selectedGroup,
    companyId,
    groupsAllMode,
    groupAllMode,
  });
  if (!reportScope) return null;

  if (reportScope.mode === "aggregate") {
    return {
      mode: "aggregate",
      scopeCompanyId: 0,
      groupId: reportScope.groupId,
      viewGroup: reportScope.viewGroup,
      uiCompanyId: null,
      groupsAllMode: reportScope.groupsAllMode,
      groupAllMode: reportScope.groupAllMode,
      mergeCompanyIds: reportScope.mergeCompanyIds,
    };
  }

  if (uiCompanyId) {
    const row = (companies || []).find((c) => Number(c.id) === uiCompanyId) || null;
    const viewGroup = resolveViewGroupForCompany(row, groupKey || null);
    return {
      mode: "company",
      scopeCompanyId: uiCompanyId,
      groupId: groupKey || null,
      viewGroup: viewGroup || groupKey || null,
      uiCompanyId,
    };
  }

  if (reportScope.mode === "group") {
    return {
      mode: "group",
      scopeCompanyId: reportScope.scopeCompanyId,
      groupId: reportScope.groupId,
      viewGroup: reportScope.viewGroup,
      uiCompanyId: null,
      resolveCompanyViaGroupId: reportScope.resolveCompanyViaGroupId,
    };
  }

  return null;
}

/**
 * Strict group ledger scope for APIs (no subsidiary company_id leakage).
 * Used by Summary submit and boot when groupOnlyCapture is set.
 */
export function normalizeGroupCaptureScope(scope, processMeta = null) {
  if (processMeta?.groupPayrollCapture === true) return scope;
  if (
    processMeta?.groupPayrollUi === true &&
    String(processMeta?.captureScopeMode || "").toLowerCase() === "company"
  ) {
    return scope;
  }
  const isGroup =
    scope?.mode === "group" ||
    processMeta?.groupOnlyCapture === true ||
    processMeta?.captureScopeMode === "group";
  if (!isGroup) return scope;

  const groupKey = String(
    scope?.groupId ||
      scope?.viewGroup ||
      processMeta?.captureSelectedGroup ||
      "",
  )
    .trim()
    .toUpperCase();

  return {
    mode: "group",
    scopeCompanyId: 0,
    uiCompanyId: null,
    groupId: groupKey || scope?.groupId || null,
    viewGroup: groupKey || scope?.viewGroup || null,
    resolveCompanyViaGroupId: true,
  };
}

/** Numeric company id for ledger APIs — null under strict group capture (no subsidiary leakage). */
export function dataCaptureScopeLedgerCompanyId(scope, processMeta = null) {
  const isGroup =
    scope?.mode === "group" ||
    processMeta?.groupOnlyCapture === true ||
    processMeta?.captureScopeMode === "group";
  if (
    isGroup &&
    (scope?.resolveCompanyViaGroupId || Number(scope?.scopeCompanyId ?? 0) <= 0)
  ) {
    return null;
  }
  if (scope?.scopeCompanyId != null && Number(scope.scopeCompanyId) > 0) {
    return Number(scope.scopeCompanyId);
  }
  if (processMeta?.scopeCompanyId != null && Number(processMeta.scopeCompanyId) > 0) {
    return Number(processMeta.scopeCompanyId);
  }
  return null;
}

export function dataCaptureScopeIsReady(scope) {
  if (!scope) return false;
  if (scope.mode === "aggregate") {
    if (scope.mergeCompanyIds?.length) return true;
    return Boolean(scope.groupsAllMode && scope.resolveCompanyViaGroupId);
  }
  if (Number(scope.scopeCompanyId) > 0) return true;
  return Boolean(scope.resolveCompanyViaGroupId && scope.groupId);
}

/** Params for Data Capture / Summary / submitted-process APIs. */
export function dataCaptureScopeApiParams(scope) {
  if (!scope) return {};
  if (scope.mode === "aggregate") {
    const viewGroup = scope.viewGroup || scope.groupId || undefined;
    const groupId = scope.groupId || undefined;
    return {
      companyId: undefined,
      viewGroup,
      groupId,
      groupsAll: scope.groupsAllMode || undefined,
      groupAll: scope.groupAllMode || undefined,
      reportScope: "aggregate",
    };
  }
  const viewGroup = scope.viewGroup || scope.groupId || undefined;
  const groupId = scope.mode === "group" ? scope.groupId : undefined;
  if (
    scope.resolveCompanyViaGroupId ||
    (scope.mode === "group" && Number(scope.scopeCompanyId) <= 0)
  ) {
    return {
      companyId: undefined,
      viewGroup,
      groupId,
      reportScope: "group",
      groupOnly: true,
    };
  }
  if (scope.mode === "group") {
    return {
      companyId:
        Number(scope.scopeCompanyId) > 0 ? scope.scopeCompanyId : undefined,
      viewGroup,
      groupId,
      reportScope: "group",
      groupOnly: true,
    };
  }
  return {
    companyId: scope.scopeCompanyId,
    viewGroup,
    groupId: scope.groupId || undefined,
    reportScope: scope.mode,
  };
}

export function dataCaptureScopeCacheCompanyKey(scope) {
  if (!scope) return null;
  if (scope.mode === "aggregate") {
    if (scope.mergeCompanyIds?.length) {
      return `aggregate:${scope.mergeCompanyIds.join(",")}`;
    }
    return "aggregate:groups";
  }
  if (Number(scope.scopeCompanyId) > 0) {
    return scope.mode === "group"
      ? `group:${scope.groupId || scope.scopeCompanyId}`
      : scope.scopeCompanyId;
  }
  if (scope.groupId) return `group:${scope.groupId}`;
  return null;
}

export function dataCaptureScopeCacheKey(scope) {
  if (!scope) return "";
  const companyKey = dataCaptureScopeCacheCompanyKey(scope) ?? "";
  return `${companyKey}:${scope.viewGroup || ""}:${scope.mode}:${scope.uiCompanyId ?? ""}`;
}

/** Reconstruct scope from saved capture session metadata (Summary restore / storage read). */
export function resolveDataCaptureScopeFromSessionMeta(meta, companies = []) {
  if (!meta || typeof meta !== "object") return null;
  const groupKey = meta.captureSelectedGroup
    ? String(meta.captureSelectedGroup).trim().toUpperCase()
    : "";
  const groupOnly = meta.groupOnlyCapture === true;
  if (groupOnly && groupKey) {
    const savedScopeId =
      meta.scopeCompanyId != null && Number(meta.scopeCompanyId) > 0
        ? Number(meta.scopeCompanyId)
        : 0;
    if (savedScopeId > 0) {
      return {
        mode: "group",
        scopeCompanyId: savedScopeId,
        groupId: groupKey,
        viewGroup: groupKey,
        uiCompanyId: null,
      };
    }
    return resolveDataCaptureScope({
      companies,
      selectedGroup: groupKey,
      companyId: null,
      groupOnlyMode: true,
    });
  }
  const cid =
    meta.scopeCompanyId != null && Number(meta.scopeCompanyId) > 0
      ? Number(meta.scopeCompanyId)
      : meta.companyId != null && Number(meta.companyId) > 0
        ? Number(meta.companyId)
        : null;
  if (cid) {
    return resolveDataCaptureScope({
      companies,
      selectedGroup: groupKey || null,
      companyId: cid,
      groupOnlyMode: false,
    });
  }
  return null;
}
