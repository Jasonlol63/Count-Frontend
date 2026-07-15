import { useMemo } from "react";
import ProcessSelect from "../../shared/ProcessSelect.jsx";
import {
  buildMaintenancePeriodPresets,
  parseDmy,
} from "../../shared/maintenanceDateHelpers.js";
import ReportDatePicker from "../../../report/common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../../../report/shared/ReportGcFilterPanel.jsx";
import { normalizeMaintenanceSearchInput } from "../../shared/maintenanceSearchInput.js";

export default function TransactionMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
  query,
  setQuery,
  dateFrom,
  dateTo,
  onDateRangeChange,
  today,
  companyId,
  snapGroupIds,
  visibleCompanies,
  selectedGroup,
  onGroupClick,
  onPickCompany,
  onPickAllGroups,
  onPickAllInGroup,
  onClearCompany,
  allowClearCompany = false,
  groupsAllMode = false,
  groupAllMode = false,
  processValueMode = "processName",
  m,
}) {
  const periodPresets = useMemo(() => buildMaintenancePeriodPresets(m), [m]);

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span
              id="transaction-maintenance-process-legend"
              className="report-outlined-label"
            >
              {m.process}
            </span>
            <div className="report-outlined-inner">
              <ProcessSelect
                key={`process-select-${companyId ?? "none"}-${processValueMode}`}
                valueMode={processValueMode}
                processes={processes}
                selectedValue={selectedProcess}
                onSelect={setSelectedProcess}
                placeholder={m.selectAllProcesses}
                searchPlaceholder={m.searchProcessPlaceholder}
                noResultsText={m.noResultsFound}
                ariaLabelledBy="transaction-maintenance-process-legend"
              />
            </div>
          </div>
        </div>

        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span id="transaction-maint-search-legend" className="report-outlined-label">
              {m.search}
            </span>
            <div className="report-outlined-inner">
              <div className="search-container maintenance-search-container">
                <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input
                  type="text"
                  id="filter_transaction_search"
                  placeholder={m.transactionSearchPlaceholder}
                  className="search-input maintenance-search-input"
                  autoComplete="off"
                  value={query}
                  aria-labelledby="transaction-maint-search-legend"
                  onChange={(e) => setQuery(normalizeMaintenanceSearchInput(e.target.value))}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
            </div>
          </div>
        </div>

        <ReportDatePicker
          dateFrom={parseDmy(dateFrom || today)}
          dateTo={parseDmy(dateTo || today)}
          onRangeChange={(start, end) => onDateRangeChange(start, end)}
          containerClass="customer-report-filter-group"
          label={m.dateRange}
          placeholder={m.selectDateRange}
          selectEndDateHint={m.selectEndDate}
          outlinedFloatingLabel
          captureDateStyle
          periodPresets={periodPresets}
          periodShortcutsAria={m.period}
          monthLabels={m.monthsShort}
          weekdaysShort={m.weekdaysShort}
        />
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
