import { useMemo } from "react";
import {
  buildMaintenancePeriodPresets,
  formatDmyFromYmd,
  parseDmy,
} from "../../shared/maintenanceDateHelpers.js";
import ReportDatePicker from "../../../report/common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../../../report/shared/ReportGcFilterPanel.jsx";

export default function PaymentMaintenanceFilters({
  transactionType,
  setTransactionType,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  today,
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
  currencies,
  selectedCurrency,
  setSelectedCurrency,
  onDelete,
  confirmDelete,
  setConfirmDelete,
  deleteDisabled,
  m,
}) {
  const periodPresets = useMemo(() => buildMaintenancePeriodPresets(m), [m]);

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span id="payment-maint-type-legend" className="report-outlined-label">
              {m.transactionType}
            </span>
            <div className="report-outlined-inner">
              <select
                id="filter_transaction_type"
                className="maintenance-select"
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                aria-labelledby="payment-maint-type-legend"
              >
                <option value="">{m.allTypes}</option>
                <option value="CONTRA">CONTRA</option>
                <option value="PAYMENT">PAYMENT</option>
                <option value="RECEIVE">RECEIVE</option>
                <option value="CLAIM">CLAIM</option>
                <option value="ADJUSTMENT">ADJUSTMENT</option>
                <option value="RATE">RATE</option>
              </select>
            </div>
          </div>
        </div>

        <ReportDatePicker
          dateFrom={parseDmy(dateFrom || today)}
          dateTo={parseDmy(dateTo || today)}
          onRangeChange={(start, end) => {
            setDateFrom(formatDmyFromYmd(start));
            setDateTo(formatDmyFromYmd(end));
          }}
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
            currencyList={currencies}
            showAllCurrencies={!selectedCurrency}
            selectedCurrencies={selectedCurrency ? [selectedCurrency] : []}
            toggleCurrency={(code) => setSelectedCurrency(code)}
            t={(key) => {
              if (key === "groupId") return m.groupId;
              if (key === "company") return m.company;
              if (key === "currency") return m.currency;
              if (key === "groupFilterAll") return m.all || "All";
              return m[key] || key;
            }}
          />
        </div>
      </div>
    </div>
  );
}
