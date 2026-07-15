import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";

export {
  customerReportScopeIsReady as formulaMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as formulaMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as formulaMaintenanceScopeCacheKey,
  resolveCustomerReportScope as resolveFormulaMaintenanceScope,
};

/** Group entity or company payroll channel (C168 / bank-only): SALARY / BONUS / COMMISSION / PROFIT. */
export function formulaMaintenanceUsesGroupProcesses(scope) {
  if (!scope) return false;
  if (scope.c168Channel || scope.companyPayrollChannel) return true;
  return scope.mode === "group";
}

/** Query params for formula maintenance list / update / delete APIs. */
export function formulaMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
  if (scope.c168Channel || scope.companyPayrollChannel) {
    const companyId = scope.scopeCompanyId ?? scope.uiCompanyId ?? undefined;
    return {
      companyId,
      viewGroup: scope.viewGroup || scope.groupId || undefined,
      reportScope: "company",
    };
  }
  const base = customerReportScopeApiParams(scope);
  const out = {
    ...base,
    reportScope: scope.mode,
  };
  if (scope.mode === "group") {
    out.groupOnly = true;
    out.groupAggregate = true;
  }
  return out;
}

/** Numeric company id for API body/query; omit when group resolves via group_id only. */
export function formulaMaintenanceEffectiveCompanyId(scope, uiCompanyId = null) {
  const fromScope = Number(scope?.scopeCompanyId);
  if (fromScope > 0) return fromScope;
  const fromUi = Number(uiCompanyId);
  if (fromUi > 0) return fromUi;
  return undefined;
}
