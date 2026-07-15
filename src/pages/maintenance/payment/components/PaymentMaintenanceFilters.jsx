import { useMemo } from "react";
import SimpleSelect from "../../../../components/SimpleSelect.jsx";
import {
  buildMaintenancePeriodPresets,
  formatDmyFromYmd,
  parseDmy,
} from "../../shared/maintenanceDateHelpers.js";
import ReportDatePicker from "../../../report/common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../../../report/shared/ReportGcFilterPanel.jsx";
import { normalizeMaintenanceSearchInput } from "../../shared/maintenanceSearchInput.js";

export default function PaymentMaintenanceFilters({
  transactionType,
  setTransactionType,
  query,
  setQuery,
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
  onCurrencySelectAll,
  onDelete,
  confirmDelete,
  setConfirmDelete,
  deleteDisabled,
  m,
}) {
  const periodPresets = useMemo(() => buildMaintenancePeriodPresets(m), [m]);
  const transactionTypeOptions = useMemo(
    () => [
      { value: "CONTRA", label: "CONTRA" },
      { value: "PAYMENT", label: "PAYMENT" },
      { value: "RECEIVE", label: "RECEIVE" },
      { value: "CLAIM", label: "CLAIM" },
      { value: "ADJUSTMENT", label: "ADJUSTMENT" },
      { value: "RATE", label: "RATE" },
    ],
    [],
  );

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span id="payment-maint-type-legend" className="report-outlined-label">
              {m.transactionType}
            </span>
            <div className="report-outlined-inner">
              <SimpleSelect
                id="filter_transaction_type"
                className="maintenance-select"
                value={transactionType}
                onChange={setTransactionType}
                options={transactionTypeOptions}
                placeholder={m.allTypes}
                ariaLabelledBy="payment-maint-type-legend"
              />
            </div>
          </div>
        </div>

        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span id="payment-maint-search-legend" className="report-outlined-label">
              {m.search}
            </span>
            <div className="report-outlined-inner">
              <div className="search-container maintenance-search-container">
                <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input
                  type="text"
                  id="filter_payment_search"
                  placeholder={m.paymentSearchPlaceholder}
                  className="search-input maintenance-search-input"
                  autoComplete="off"
                  value={query}
                  aria-labelledby="payment-maint-search-legend"
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
            toggleAllCurrencies={onCurrencySelectAll}
            toggleCurrency={(code) => setSelectedCurrency(code)}
            t={(key) => {
              if (key === "groupId") return m.groupId;
              if (key === "company") return m.company;
              if (key === "currency") return m.currency;
              if (key === "currencyAll") return m.currencyAll;
              if (key === "groupFilterAll") return m.all || "All";
              return m[key] || key;
            }}
          />
        </div>
      </div>
    </div>
  );
}
