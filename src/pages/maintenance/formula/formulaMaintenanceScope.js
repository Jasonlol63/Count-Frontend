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
  customerReportScopeIsReady as formulaMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as formulaMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as formulaMaintenanceScopeCacheKey,
};

/**
 * Enrich scope with payroll-channel flags (C168 / bank-only, e.g. OK2).
 * `resolveCustomerReportScope` (shared with the Games-only Customer Report page) never sets
 * `c168Channel`/`companyPayrollChannel` — this page's own `fetchProcesses`/`formulaMaintenanceUsesGroupProcesses`/
 * `resolveFormulaMaintenanceActivePermission` all branch on those two flags, so without this wrapper they were
 * always `undefined` and Bank-only companies could never reach the hardcoded SALARY/BONUS/PROFIT/COMMISSION list.
 * Mirrors `transactionMaintenanceScope.js`'s `resolveTransactionMaintenanceScope`.
 */
export function resolveFormulaMaintenanceScope(args) {
  const base = resolveCustomerReportScope(args);
  if (!base) return base;
  const cid = args?.companyId != null ? Number(args.companyId) : Number.NaN;
  const row =
    Number.isFinite(cid) && cid > 0
      ? (args?.companies ?? []).find((c) => Number(c.id) === cid)
      : null;
  const c168Channel = Boolean(row && isC168CompanyRow(row));
  const companyPayrollChannel = Boolean(row && (c168Channel || isBankOnlyCompanyRow(row)));
  return { ...base, c168Channel, companyPayrollChannel };
}

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
