import ProcessSelect from "../../shared/ProcessSelect.jsx";
import ReportGcFilterPanel from "../../../report/shared/ReportGcFilterPanel.jsx";

export default function FormulaMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
  companyId,
  snapGroupIds,
  visibleCompanies,
  selectedGroup,
  onGroupClick,
  onPickCompany,
  onClearCompany,
  allowClearCompany = true,
  onPickAllGroups,
  onPickAllInGroup,
  groupsAllMode = false,
  groupAllMode = false,
  onClearFilters,
  deleteDisabled,
  confirmDelete,
  setConfirmDelete,
  onDelete,
  m,
}) {
  const showClear = selectedProcess !== null;

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span id="formula-maint-process-legend" className="report-outlined-label">
              {m.process}
            </span>
            <div className="report-outlined-inner custom-select-wrapper formula-process-control">
              <ProcessSelect
                valueMode="id"
                processes={processes}
                selectedValue={selectedProcess}
                onSelect={setSelectedProcess}
                placeholder={m.selectAllProcesses}
                unsetPlaceholder={m.selectProcessPrompt}
                searchPlaceholder={m.searchProcessPlaceholder}
                noResultsText={m.noResultsFound}
                ariaLabelledBy="formula-maint-process-legend"
              />
              {showClear ? (
                <button
                  type="button"
                  id="clear_filters_btn"
                  title={m.clearFiltersTitle}
                  aria-label={m.clearFiltersTitle}
                  className="formula-clear-icon-btn"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClearFilters();
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="maintenance-actions-top">
          <button
            type="button"
            className="maintenance-delete-btn"
            id="deleteBtn"
            onClick={onDelete}
            disabled={deleteDisabled}
          >
            {m.delete}
          </button>
        </div>
      </div>

      <div className="maintenance-filter-row">
        <div className="maintenance-filter-left-full">
          <ReportGcFilterPanel
            layout="dashboard"
            groupIds={snapGroupIds}
            selectedGroup={selectedGroup}
            onPickGroup={(g) => onGroupClick(g)}
            onPickAllGroups={onPickAllGroups}
            onPickAllInGroup={onPickAllInGroup}
            groupsAllMode={groupsAllMode}
            groupAllMode={groupAllMode}
            companyButtons={visibleCompanies}
            companyId={companyId}
            highlightCompanyId={companyId}
            onSwitchCompany={onPickCompany}
            onClearCompany={onClearCompany}
            allowClearCompany={allowClearCompany}
            t={(key) => {
              if (key === "groupId") return m.groupId;
              if (key === "company") return m.company;
              if (key === "groupFilterAll") return m.all || "All";
              return m[key] || key;
            }}
          />
        </div>
      </div>
    </div>
  );
}
