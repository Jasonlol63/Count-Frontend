import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";

export {
  customerReportScopeIsReady as paymentMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as paymentMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as paymentMaintenanceScopeCacheKey,
  resolveCustomerReportScope as resolvePaymentMaintenanceScope,
};

/** Query params for payment maintenance search / delete APIs. */
export function paymentMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
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
