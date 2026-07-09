import React from "react";
import CompanyCard from "./components/CompanyCard.jsx";
import { countOwnershipSubsidiariesInGroup } from "../shared/ownershipHelpers.js";

export default function CompanyOwnershipTab({ shell, company }) {
  const { t, loadingList, allCompanies, isHistoricalView, readOnlyMode } = shell;
  const {
    groupFilter,
    setGroupFilter,
    allGroupIds,
    companiesData,
    companyStates,
    expandedCompanyId,
    setExpandedCompanyId,
    loadingCompanyId,
    savingCompanyId,
    selectionMode,
    selectedCompanyIds,
    openGroupForCompanyId,
    setOpenGroupForCompanyId,
    dragRef,
    calcTotal,
    fmtPct,
    viewOnlyMode,
    adminLocked,
    toggleCard,
    toggleCompanySelect,
    joinGroup,
    ungroupCompany,
    updateRow,
    addRow,
    removeRow,
    reorderRows,
    linkPartner,
    confirmCompany,
    toggleSelectionMode,
  } = company;

  return (
    <div className="own-tab-panel">
      {allGroupIds.length > 0 ? (
        <div className="own-group-filter-bar">
          <span className="own-gfb-label">{t("group")}</span>
          <div className="own-gfb-buttons">
            {allGroupIds.map((g) => {
              const count = countOwnershipSubsidiariesInGroup(allCompanies, g);
              const active = groupFilter === g;
              return (
                <button
                  key={g}
                  type="button"
                  className={`own-gfb-btn${active ? " active" : ""}`}
                  onClick={() => setGroupFilter((prev) => (prev === g ? null : g))}
                >
                  {g}
                  <span className="own-gfb-count">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="own-gfb-spacer" />
          <button
            type="button"
            className={`own-select-mode-btn${selectionMode ? " active" : ""}`}
            style={{ display: adminLocked ? "none" : "" }}
            onClick={toggleSelectionMode}
          >
            {selectionMode ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                {t("cancel")}
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 17h7M17.5 14v7" />
                </svg>
                {t("select")}
              </>
            )}
          </button>
        </div>
      ) : null}
      <div id="companyCardsContainer">
        {loadingList ? (
          <div className="own-loader-container">
            <div className="own-loader" />
          </div>
        ) : companiesData.length === 0 ? (
          <div className="own-empty-state">{t("noCompaniesFound")}</div>
        ) : (
          companiesData.map((c) => (
            <CompanyCard
              key={c.id}
              comp={c}
              expanded={expandedCompanyId === Number(c.id)}
              loading={loadingCompanyId === Number(c.id)}
              companyState={companyStates[Number(c.id)]}
              allGroupIds={allGroupIds}
              selectionMode={selectionMode}
              isSelected={selectedCompanyIds.has(Number(c.id))}
              groupFilter={groupFilter}
              savingCompanyId={savingCompanyId}
              openGroupPanelId={openGroupForCompanyId}
              dragRef={dragRef}
              onToggle={toggleCard}
              onToggleSelect={toggleCompanySelect}
              onJoinGroup={joinGroup}
              onUngroup={ungroupCompany}
              onSetOpenGroupPanel={setOpenGroupForCompanyId}
              onUpdateRow={updateRow}
              onAddRow={addRow}
              onRemoveRow={removeRow}
              onReorderRows={reorderRows}
              onLinkPartner={linkPartner}
              onConfirm={confirmCompany}
              onCancel={() => setExpandedCompanyId(null)}
              calcTotal={calcTotal}
              readOnlyMode={readOnlyMode}
              isHistoricalView={isHistoricalView}
              fmtPct={fmtPct}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}
