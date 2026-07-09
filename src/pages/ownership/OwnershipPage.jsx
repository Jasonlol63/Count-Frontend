import React from "react";
import "../../../public/css/ownership.css";
import BulkActionBar from "./company/components/BulkActionBar.jsx";
import ConflictModal from "./shared/components/ConflictModal.jsx";
import OwnershipMonthBar from "./shared/components/OwnershipMonthBar.jsx";
import CompanyOwnershipTab from "./company/CompanyOwnershipTab.jsx";
import GroupEarningsTab from "./group/GroupEarningsTab.jsx";
import { useOwnershipPageShell } from "./shared/useOwnershipPageShell.js";
import { useCompanyOwnership } from "./company/useCompanyOwnership.js";
import { useGroupEarnings } from "./group/useGroupEarnings.js";

export default function OwnershipPage() {
  const shell = useOwnershipPageShell();
  const company = useCompanyOwnership(shell);
  const group = useGroupEarnings(shell);

  const {
    t,
    activeTab,
    setActiveTab,
    toast,
    conflict,
    setConflict,
    lang,
    selectedMonth,
    setSelectedMonth,
    isHistoricalView,
    historyBanner,
    readOnlyMode,
  } = shell;

  return (
    <>
      <div className="own-container">
        <div className="own-page-head">
          <div className="page-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "account-ownership"}
              className={`page-tab${activeTab === "account-ownership" ? " active" : ""}`}
              onClick={() => setActiveTab("account-ownership")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {t("accountOwnership")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "group-earnings"}
              className={`page-tab${activeTab === "group-earnings" ? " active" : ""}`}
              onClick={() => setActiveTab("group-earnings")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              {t("groupEarnings")}
            </button>
          </div>

          <OwnershipMonthBar
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            isHistoricalView={isHistoricalView}
            historyBanner={isHistoricalView ? historyBanner : null}
            t={t}
            lang={lang}
          />
        </div>

        <div style={{ display: activeTab === "account-ownership" ? "" : "none" }}>
          <CompanyOwnershipTab shell={shell} company={company} />
        </div>
        <div style={{ display: activeTab === "group-earnings" ? "" : "none" }}>
          <GroupEarningsTab shell={shell} group={group} />
        </div>
      </div>

      <div
        id="ownToast"
        className={`own-toast${toast ? ` own-show ${toast.type === "success" ? "own-success" : "own-error"}` : ""}`}
      >
        <div id="ownToastIcon">
          {toast?.type === "success" ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : toast ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--own-danger-red)" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : null}
        </div>
        <div id="ownToastMessage">{toast?.message}</div>
      </div>

      <ConflictModal
        conflict={conflict}
        onResolve={async (type) => {
          const c = conflict;
          setConflict(null);
          if (c) await company.linkPartner(c.companyId, c.loginId, type);
        }}
        onCancel={() => setConflict(null)}
        t={t}
      />

      {typeof document !== "undefined" && !isHistoricalView && !readOnlyMode && (
        <BulkActionBar
          selectedCount={company.selectedCompanyIds.size}
          groupFilter={company.groupFilter}
          allGroupIds={company.allGroupIds}
          bulkGroupSelect={company.bulkGroupSelect}
          setBulkGroupSelect={company.setBulkGroupSelect}
          onBulkUngroup={company.bulkUngroup}
          onBulkJoin={company.bulkJoin}
          onExitSelectionMode={() => {
            company.setSelectionMode(false);
            company.setSelectedCompanyIds(new Set());
          }}
          t={t}
        />
      )}
    </>
  );
}
