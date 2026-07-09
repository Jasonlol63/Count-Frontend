import { pathnameToPageKey, spaPath } from "./pageRoutes.js";

const prefetchedModules = new Set();
const prefetchedData = new Set();

const EAGER_PAGE_KEYS = new Set([
  "login",
  "reset-password",
  "owner-secondary-password",
  "user-secondary-password",
]);

function prefetchModule(key, loader) {
  if (prefetchedModules.has(key)) return;
  prefetchedModules.add(key);
  void loader().catch(() => {
    prefetchedModules.delete(key);
  });
}

/** Warm remaining lazy routes in parallel right after session boot. */
export function prefetchAuthenticatedRoutes() {
  const pageKeys = [
    "dashboard",
    "domain",
    "ownership",
    "process-list",
    "bank-process-list",
    "datacapture",
    "datacapturesummary",
    "transaction",
    "customer-report",
    "domain-report",
    "capture-maintenance",
    "transaction-maintenance",
    "formula-maintenance",
    "bankprocess-maintenance",
    "payment-maintenance",
    "useraccess",
    "deleted-log",
  ];
  pageKeys.forEach((pageKey) => prefetchRouteModule(spaPath(pageKey)));
}

/** Prefetch route JS chunk on sidebar hover / pointer down. */
export function prefetchRouteModule(pathname) {
  const pageKey = pathnameToPageKey(String(pathname || "").split("?")[0]);
  if (!pageKey || EAGER_PAGE_KEYS.has(pageKey)) return;
  switch (pageKey) {
    case "dashboard":
      prefetchModule(pageKey, () => import("../../pages/dashboard/TransactionDashboardPage.jsx"));
      break;
    case "domain":
      prefetchModule(pageKey, () => import("../../pages/domain/DomainPage.jsx"));
      break;
    case "ownership":
      prefetchModule(pageKey, () => import("../../pages/ownership/OwnershipPage.jsx"));
      break;
    case "bank-process-list":
      prefetchModule(pageKey, () => import("../../pages/bankprocesslist/BankProcessListPage.jsx"));
      break;
    case "process-list":
    case "games-process-list":
      prefetchModule(pageKey, () => import("../../pages/processlist/ProcessListPage.jsx"));
      break;
    case "datacapture":
      prefetchModule(pageKey, () => import("../../pages/datacapture/DataCapturePage.jsx"));
      break;
    case "datacapturesummary":
      prefetchModule(pageKey, () => import("../../pages/datacapturesummary/DataCaptureSummaryPage.jsx"));
      break;
    case "transaction":
      prefetchModule(pageKey, () => import("../../pages/transaction/TransactionPaymentPage.jsx"));
      break;
    case "customer-report":
      prefetchModule(pageKey, () => import("../../pages/report/customer/CustomerReportPage.jsx"));
      break;
    case "domain-report":
      prefetchModule(pageKey, () => import("../../pages/report/domain/DomainReportPage.jsx"));
      break;
    case "capture-maintenance":
      prefetchModule(pageKey, () => import("../../pages/maintenance/capture/CaptureMaintenancePage.jsx"));
      break;
    case "transaction-maintenance":
      prefetchModule(pageKey, () => import("../../pages/maintenance/transaction/TransactionMaintenancePage.jsx"));
      break;
    case "formula-maintenance":
      prefetchModule(pageKey, () => import("../../pages/maintenance/formula/FormulaMaintenancePage.jsx"));
      break;
    case "bankprocess-maintenance":
      prefetchModule(pageKey, () => import("../../pages/maintenance/bankprocess/BankprocessMaintenancePage.jsx"));
      break;
    case "payment-maintenance":
      prefetchModule(pageKey, () => import("../../pages/maintenance/payment/PaymentMaintenancePage.jsx"));
      break;
    case "useraccess":
      prefetchModule(pageKey, () => import("../../pages/useraccess/UserAccessPage.jsx"));
      break;
    case "deleted-log":
      prefetchModule(pageKey, () => import("../../pages/deletedlog/DeletedLogPage.jsx"));
      break;
    default:
      break;
  }
}

/** Warm ownership company list API so first paint is faster after navigation. */
export function prefetchOwnershipCompanies() {
  const key = "ownership:companies";
  if (prefetchedData.has(key)) return;
  prefetchedData.add(key);
  import("../../pages/ownership/ownershipRoutePrefetch.js")
    .then(({ prefetchOwnershipCompanies: prefetch }) => prefetch())
    .catch(() => {
      prefetchedData.delete(key);
    });
}

/** Warm auto-renew list API so first paint is faster after navigation. */
export function prefetchAutoRenewList() {
  const key = "auto-renew:pending";
  if (prefetchedData.has(key)) return;
  prefetchedData.add(key);
  import("../../pages/autorenew/autoRenewRoutePrefetch.js")
    .then(({ prefetchAutoRenewApprovals }) => prefetchAutoRenewApprovals("pending"))
    .catch(() => {
      prefetchedData.delete(key);
    });
}
