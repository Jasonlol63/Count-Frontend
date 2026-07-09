import { useMemo, useState, useRef, useEffect } from "react";
import ReportDatePicker from "../common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../shared/ReportGcFilterPanel.jsx";

const QUICK_RANGE_KEYS = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];

export default function CustomerReportFilters({
  companyId,
  onSwitchCompany,
  onClearCompany,
  allowClearCompany = true,
  groupIds,
  selectedGroup,
  onPickGroup,
  onPickAllGroups,
  onPickAllInGroup,
  groupsAllMode = false,
  groupAllMode = false,
  companyButtons,
  highlightCompanyId,
  accountId,
  setAccountId,
  accounts,
  dateFrom,
  dateTo,
  onRangeChange,
  showAll,
  setShowAll,
  currencyList,
  selectedCurrencies,
  toggleCurrency,
  showAllCurrencies,
  toggleAllCurrencies,
  t,
  monthLabels,
  weekdaysShort,
}) {
  const [accountSearch, setAccountSearch] = useState("");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const accountDropdownRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target)) setAccountDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const s = accountSearch.toLowerCase();
    return accounts.filter(a =>
      (a.account_id || "").toLowerCase().includes(s) ||
      (a.name || "").toLowerCase().includes(s) ||
      (a.display_text || "").toLowerCase().includes(s)
    );
  }, [accounts, accountSearch]);

  const selectedAccountLabel = useMemo(() => {
    if (!accountId) return t("allAccounts");
    const found = accounts.find(a => String(a.id) === String(accountId));
    return found ? (found.display_text || `${found.account_id} - ${found.name}`) : t("allAccounts");
  }, [accounts, accountId, t]);

  const periodPresets = useMemo(
    () => QUICK_RANGE_KEYS.map((key) => ({ key, label: t(key) })),
    [t],
  );

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span className="report-outlined-label" id="report-account-outlined-label">
              {t("account")}
            </span>
            <div className="report-outlined-inner">
              <div className="custom-select-wrapper" ref={accountDropdownRef}>
                <button
                  type="button"
                  id="cr-account-dropdown-btn"
                  aria-labelledby="report-account-outlined-label"
                  className={`custom-select-button ${accountDropdownOpen ? "open" : ""}`}
                  onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                >
                  {selectedAccountLabel}
                </button>
                {accountDropdownOpen && (
                  <div className="custom-select-dropdown show">
                    <div className="custom-select-search">
                      <input
                        type="text"
                        placeholder={t("searchAccount")}
                        autoComplete="off"
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="custom-select-options">
                      <div
                        className={`custom-select-option ${!accountId ? "selected" : ""}`}
                        onClick={() => { setAccountId(""); setAccountDropdownOpen(false); }}
                      >
                        {t("allAccounts")}
                      </div>
                      {filteredAccounts.map(a => (
                        <div
                          key={a.id}
                          className={`custom-select-option ${String(a.id) === String(accountId) ? "selected" : ""}`}
                          onClick={() => { setAccountId(a.id); setAccountDropdownOpen(false); }}
                        >
                          {a.display_text || `${a.account_id} - ${a.name}`}
                        </div>
                      ))}
                      {filteredAccounts.length === 0 && (
                        <div className="custom-select-no-results">{t("noResultsFound")}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <ReportDatePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={onRangeChange}
          containerClass="customer-report-filter-group"
          label={t("dateRange")}
          placeholder={t("selectDateRange")}
          selectEndDateHint={t("selectEndDate")}
          outlinedFloatingLabel
          captureDateStyle
          periodPresets={periodPresets}
          periodShortcutsAria={t("periodShortcutsAria")}
          monthLabels={monthLabels}
          weekdaysShort={weekdaysShort}
        />

        <div className="customer-report-quick-and-showall">
          <div className="customer-report-filter-group customer-report-showall-group">
            <div className="userlist-filter-chips" role="group">
              <button
                type="button"
                className={`user-filter-chip${showAll ? " is-selected" : ""}`}
                aria-pressed={showAll}
                onClick={() => setShowAll(!showAll)}
              >
                <span className="user-filter-chip__dot" aria-hidden>
                  {showAll ? (
                    <svg
                      className="user-filter-chip__check"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 12l4 4 8-8" />
                    </svg>
                  ) : null}
                </span>
                <span className="user-filter-chip__label">{t("showAll")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ReportGcFilterPanel
        layout="dashboard"
        groupIds={groupIds}
        selectedGroup={selectedGroup}
        onPickGroup={onPickGroup}
        onPickAllGroups={onPickAllGroups}
        onPickAllInGroup={onPickAllInGroup}
        groupsAllMode={groupsAllMode}
        groupAllMode={groupAllMode}
        companyButtons={companyButtons}
        companyId={companyId}
        highlightCompanyId={highlightCompanyId}
        onSwitchCompany={onSwitchCompany}
        onClearCompany={onClearCompany}
        allowClearCompany={allowClearCompany}
        currencyList={currencyList}
        showAllCurrencies={showAllCurrencies}
        selectedCurrencies={selectedCurrencies}
        toggleCurrency={toggleCurrency}
        t={t}
      />
    </div>
  );
}
