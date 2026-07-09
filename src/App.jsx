import { Navigate, Route, Routes } from "react-router-dom";
import { lazyWithRetry } from "./utils/routing/lazyWithRetry.js";
import { LEGACY_PATH_TO_PAGE_KEY, PAGE_ROUTE_UUIDS, spaPath } from "./utils/routing/pageRoutes.js";
import LoginPage from "./pages/login/LoginPage.jsx";
import AuthenticatedLayout from "./components/AuthenticatedLayout.jsx";
import SecondaryPasswordPage from "./pages/login/SecondaryPasswordPage.jsx";
import ResetPasswordPage from "./pages/login/ResetPasswordPage.jsx";

const MemberPage = lazyWithRetry(() => import("./pages/member/MemberPage.jsx"));
const UserListPage = lazyWithRetry(() => import("./pages/userlist/UserListPage.jsx"));
const AccountListPage = lazyWithRetry(() => import("./pages/account/AccountListPage.jsx"));
const ProcessListPage = lazyWithRetry(() => import("./pages/processlist/ProcessListPage.jsx"));
const AutoRenewPage = lazyWithRetry(() => import("./pages/autorenew/AutoRenewPage.jsx"));
const AnnouncementPage = lazyWithRetry(() => import("./pages/announcement/AnnouncementPage.jsx"));

const TransactionDashboardPage = lazyWithRetry(() => import("./pages/dashboard/TransactionDashboardPage.jsx"));
const DomainPage = lazyWithRetry(() => import("./pages/domain/DomainPage.jsx"));
const OwnershipPage = lazyWithRetry(() => import("./pages/ownership/OwnershipPage.jsx"));
const BankProcessListPage = lazyWithRetry(() => import("./pages/bankprocesslist/BankProcessListPage.jsx"));
const DataCapturePage = lazyWithRetry(() => import("./pages/datacapture/DataCapturePage.jsx"));
const DataCaptureSummaryPage = lazyWithRetry(() => import("./pages/datacapturesummary/DataCaptureSummaryPage.jsx"));
const TransactionPaymentPage = lazyWithRetry(() => import("./pages/transaction/TransactionPaymentPage.jsx"));
const TransactionPaymentHistoryPage = lazyWithRetry(() => import("./pages/transaction/TransactionPaymentHistoryPage.jsx"));
const CustomerReportPage = lazyWithRetry(() => import("./pages/report/customer/CustomerReportPage.jsx"));
const DomainReportPage = lazyWithRetry(() => import("./pages/report/domain/DomainReportPage.jsx"));
const CaptureMaintenancePage = lazyWithRetry(() => import("./pages/maintenance/capture/CaptureMaintenancePage.jsx"));
const TransactionMaintenancePage = lazyWithRetry(() => import("./pages/maintenance/transaction/TransactionMaintenancePage.jsx"));
const FormulaMaintenancePage = lazyWithRetry(() => import("./pages/maintenance/formula/FormulaMaintenancePage.jsx"));
const BankprocessMaintenancePage = lazyWithRetry(() => import("./pages/maintenance/bankprocess/BankprocessMaintenancePage.jsx"));
const PaymentMaintenancePage = lazyWithRetry(() => import("./pages/maintenance/payment/PaymentMaintenancePage.jsx"));
const UserAccessPage = lazyWithRetry(() => import("./pages/useraccess/UserAccessPage.jsx"));
const DeletedLogPage = lazyWithRetry(() => import("./pages/deletedlog/DeletedLogPage.jsx"));

function OwnerSecondaryPasswordPage() {
  return <SecondaryPasswordPage variant="owner" />;
}

function UserSecondaryPasswordPage() {
  return <SecondaryPasswordPage variant="user" />;
}

const PAGE_COMPONENTS = {
  login: LoginPage,
  member: MemberPage,
  "reset-password": ResetPasswordPage,
  "owner-secondary-password": OwnerSecondaryPasswordPage,
  "user-secondary-password": UserSecondaryPasswordPage,
  dashboard: TransactionDashboardPage,
  domain: DomainPage,
  announcement: AnnouncementPage,
  "account-list": AccountListPage,
  "add-account": AccountListPage,
  "process-list": ProcessListPage,
  "games-process-list": ProcessListPage,
  "bank-process-list": BankProcessListPage,
  userlist: UserListPage,
  ownership: OwnershipPage,
  datacapture: DataCapturePage,
  datacapturesummary: DataCaptureSummaryPage,
  transaction: TransactionPaymentPage,
  "transaction-payment-history": TransactionPaymentHistoryPage,
  "customer-report": CustomerReportPage,
  "domain-report": DomainReportPage,
  "capture-maintenance": CaptureMaintenancePage,
  "transaction-maintenance": TransactionMaintenancePage,
  "formula-maintenance": FormulaMaintenancePage,
  "bankprocess-maintenance": BankprocessMaintenancePage,
  "payment-maintenance": PaymentMaintenancePage,
  useraccess: UserAccessPage,
  "deleted-log": DeletedLogPage,
  "auto-renew": AutoRenewPage,
};

const PUBLIC_PAGE_KEYS = new Set([
  "login",
  "member",
  "reset-password",
  "owner-secondary-password",
  "user-secondary-password",
]);

const LEGACY_PHP_REDIRECTS = {
  "/datacapture.php": "datacapture",
  "/datacapturesummary.php": "datacapturesummary",
  "/transaction.php": "transaction",
  "/customer_report.php": "customer-report",
  "/domain_report.php": "domain-report",
  "/capture_maintenance.php": "capture-maintenance",
  "/transaction_maintenance.php": "transaction-maintenance",
  "/formula_maintenance.php": "formula-maintenance",
  "/bankprocess_maintenance.php": "bankprocess-maintenance",
  "/payment_maintenance.php": "payment-maintenance",
  "/index.php": "login",
  "/dashboard.php": "dashboard",
  "/member.php": "member",
  "/reset-password.php": "reset-password",
  "/domain.php": "domain",
  "/announcement.php": "announcement",
  "/account-list.php": "account-list",
  "/add-account.php": "add-account",
  "/processlist.php": "process-list",
  "/games_process_list.php": "games-process-list",
  "/bank_process_list.php": "bank-process-list",
  "/userlist.php": "userlist",
  "/ownership.php": "ownership",
  "/owner_secondary_password.php": "owner-secondary-password",
  "/api/users/user_secondary_password.php": "user-secondary-password",
  "/useraccess.php": "useraccess",
  "/auto_renew.php": "auto-renew",
  "/auto-renew.php": "auto-renew",
};

function pageElement(pageKey) {
  const Component = PAGE_COMPONENTS[pageKey];
  return Component ? <Component /> : null;
}

export default function App() {
  const uuidEntries = Object.entries(PAGE_ROUTE_UUIDS);

  return (
    <Routes>
      {uuidEntries
        .filter(([pageKey]) => PUBLIC_PAGE_KEYS.has(pageKey))
        .map(([pageKey, uuid]) => (
          <Route key={pageKey} path={`/p/${uuid}`} element={pageElement(pageKey)} />
        ))}

      <Route element={<AuthenticatedLayout />}>
        {uuidEntries
          .filter(([pageKey]) => !PUBLIC_PAGE_KEYS.has(pageKey))
          .map(([pageKey, uuid]) => (
            <Route key={pageKey} path={`/p/${uuid}`} element={pageElement(pageKey)} />
          ))}
      </Route>

      {Object.entries(LEGACY_PATH_TO_PAGE_KEY).map(([legacyPath, pageKey]) => (
        <Route
          key={`legacy-${legacyPath}`}
          path={legacyPath}
          element={<Navigate to={spaPath(pageKey)} replace />}
        />
      ))}

      {Object.entries(LEGACY_PHP_REDIRECTS).map(([legacyPath, pageKey]) => (
        <Route
          key={`legacy-php-${legacyPath}`}
          path={legacyPath}
          element={<Navigate to={spaPath(pageKey)} replace />}
        />
      ))}

      <Route path="/" element={<Navigate to={spaPath("login")} replace />} />
      <Route path="*" element={<Navigate to={spaPath("login")} replace />} />
    </Routes>
  );
}
