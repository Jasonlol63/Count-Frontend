import { useMemo } from "react";
import ProcessSelect from "../../shared/ProcessSelect.jsx";
import {
  buildMaintenancePeriodPresets,
  parseDmy,
} from "../../shared/maintenanceDateHelpers.js";
import ReportDatePicker from "../../../report/common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../../../report/shared/ReportGcFilterPanel.jsx";

export default function TransactionMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
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
