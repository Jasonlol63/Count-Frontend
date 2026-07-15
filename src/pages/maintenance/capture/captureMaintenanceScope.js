import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";
import {
  isBankOnlyCompanyRow,
  isC168CompanyRow,
} from "../../../utils/company/c168CaptureChannel.js";

export {
  customerReportScopeIsReady as captureMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as captureMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as captureMaintenanceScopeCacheKey,
};

/** Enrich scope with payroll-channel flags (C168 / bank-only e.g. CX). */
export function resolveCaptureMaintenanceScope(args) {
  const base = resolveCustomerReportScope(args);
  if (!base) return base;
  const cid = args?.companyId != null ? Number(args.companyId) : Number.NaN;
  const row = Number.isFinite(cid) && cid > 0
    ? (args?.companies ?? []).find((c) => Number(c.id) === cid)
    : null;
  const c168Channel = Boolean(row && isC168CompanyRow(row));
  const companyPayrollChannel = Boolean(row && (c168Channel || isBankOnlyCompanyRow(row)));
  return { ...base, c168Channel, companyPayrollChannel };
}

/** Group entity, C168, or bank-only company payroll: SALARY / BONUS / COMMISSION / PROFIT process list. */
export function captureMaintenanceUsesGroupProcesses(scope) {
  if (!scope) return false;
  if (scope.c168Channel || scope.companyPayrollChannel) return true;
  return scope.mode === "group";
}

/** Query params for capture maintenance search / delete APIs. */
export function captureMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
  // Company payroll channel (C168 / bank-only): company ledger only — never group_only.
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
