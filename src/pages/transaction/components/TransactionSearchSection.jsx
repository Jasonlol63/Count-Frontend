import { useMemo } from "react";
import GcInlineFilterPanel from "../../../components/GcInlineFilterPanel.jsx";
import { buildTransactionCompanyStripRows } from "../lib/transactionCompanyStrip.js";

export default function TransactionSearchSection({
  selectedCategories,
  categoryOpen,
  toggleCategory,
  removeCategoryTag,
  categoryAllCheckboxRef,
  categories,
  onCategoryAllChange,
  toggleCategoryValue,
  searchState,
  setSearchState,
  fs,
  onGroupButtonClick,
  onCompanyButtonClick,
  onWarmCompany,
  onPickAllGroups,
  onPickAllInGroup,
  allowCompanyDeselect = false,
  currencyRowsOrdered,
  showAllCurrencies,
  selectedCurrencies,
  onCurrencyDragStart,
  onCurrencyDropOn,
  toggleCurrencyBtn,
  toggleAllCurrenciesBtn,
  m,
  t,
}) {
  const selectedCurrencySet = useMemo(
    () => new Set((selectedCurrencies || []).map((x) => String(x || "").toUpperCase().trim())),
    [selectedCurrencies],
  );

  const displayFilterChips = useMemo(() => [
    { id: "show_name", key: "showName", label: m.showName },
    { id: "show_capture_only", key: "showCaptureOnly", label: m.showCaptureOnly },
    { id: "show_inactive", key: "showPaymentOnly", label: m.showPaymentOnly },
    { id: "show_zero_balance", key: "showZeroBalance", label: m.showZeroBalance },
  ], [m]);

  const companiesForCompanyStrip = useMemo(() => {
    if (!fs) return [];
    return buildTransactionCompanyStripRows(fs, {
      selectedGroup: fs.selectedGroup,
      companyId: fs.companyId,
      groupsAllMode: Boolean(fs.groupsAllMode),
    });
  }, [
    fs,
    fs?.selectedGroup,
    fs?.companyId,
    fs?.groupFilterOptOut,
    fs?.groupsAllMode,
    fs?.snapCompanies,
    fs?.snapCompaniesAll,
    fs?.snapGroupIds,
  ]);

  return (
    <div className="transaction-search-section">
      <div className="transaction-category-date-row">
        <div
          className={`report-outlined-anchor transaction-outlined-field-col transaction-outlined-field-col--category${categoryOpen ? " is-select-open" : ""}`}
        >
          <div className={`report-outlined-shell${categoryOpen ? " report-outlined-shell--menu-open" : ""}`}>
            <span className="report-outlined-label" id="transaction-category-outlined-label">
              {m.category}
            </span>
            <div className="report-outlined-inner">
              <div id="filter_category" className="transaction-category-multiselect">
                <div className="category-dropdown">
                  <button
                    type="button"
                    className="category-dropdown-button"
                    id="category_dropdown_button"
                    aria-labelledby="transaction-category-outlined-label"
                    onClick={toggleCategory}
                  >
                    <div id="category_selected_tags" className="category-selected-tags">
                      {selectedCategories.length === 0 ? (
                        <span className="category-placeholder">{m.selectAllCategories}</span>
                      ) : (
                        selectedCategories.map((c) => (
                          <div key={c} className="category-tag" data-category-value={c}>
                            <span>{c}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="category-tag-remove"
                              data-category-value={c}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeCategoryTag(c);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeCategoryTag(c);
                                }
                              }}
                            >
                              ×
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    <i className="fas fa-chevron-down" />
                  </button>
                  <div className="category-dropdown-menu" id="category_dropdown_menu" style={{ display: categoryOpen ? "block" : "none" }}>
                    <div className="category-option">
                      <label className="category-checkbox-label">
                        <input
                          ref={categoryAllCheckboxRef}
                          type="checkbox"
                          value=""
                          className="category-checkbox"
                          id="category_all"
                          checked={
                            selectedCategories.length === 0 ||
                            (categories.length > 0 && selectedCategories.length === categories.length)
                          }
                          onChange={(e) => onCategoryAllChange(e.target.checked)}
                        />
                        <span>{m.selectAllCategories}</span>
                      </label>
                    </div>
                    <div id="category_options_container">
                      {categories.map((c) => (
                        <div className="category-option" key={c}>
                          <label className="category-checkbox-label">
                            <input
                              type="checkbox"
                              className="category-checkbox"
                              value={c}
                              checked={selectedCategories.length === 0 ? false : selectedCategories.includes(c)}
                              onChange={() => toggleCategoryValue(c)}
                            />
                            <span>{c}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="report-outlined-anchor transaction-outlined-field-col transaction-outlined-field-col--date">
          <div className="report-outlined-shell">
            <span className="report-outlined-label report-outlined-label--txn-capture-date" id="transaction-capture-date-outlined-label">
              {m.captureDate}
            </span>
            <div className="report-outlined-inner">
              <div className="transaction-date-range-group">
                <div
                  className="date-range-picker"
                  id="date-range-picker"
                  role="button"
                  tabIndex={0}
                  aria-labelledby="transaction-capture-date-outlined-label"
                >
                  <i className="fas fa-calendar-alt" />
                  {/* Text driven by MaintenanceDateRangePicker — React children would fight DOM updates. */}
                  <span id="date-range-display" aria-live="polite" />
                  <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
                </div>
                <input type="hidden" id="date_from" readOnly />
                <input type="hidden" id="date_to" readOnly />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="transaction-checkboxes userlist-filter-chips" role="group" aria-label="Display filters">
        {displayFilterChips.map((chip) => {
          const selected = !!searchState[chip.key];
          return (
            <button
              key={chip.id}
              type="button"
              id={chip.id}
              className={`user-filter-chip${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => setSearchState((s) => ({ ...s, [chip.key]: !s[chip.key] }))}
            >
              <span className="user-filter-chip__dot" aria-hidden>
                {selected ? (
                  <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 12l4 4 8-8" />
                  </svg>
                ) : null}
              </span>
              <span className="user-filter-chip__label">{chip.label}</span>
            </button>
          );
        })}
      </div>

      {fs && (fs.snapGroupIds?.length > 0 || fs.snapCompanies?.length > 0) && (
        <div className="transaction-bottom-filters">
          <GcInlineFilterPanel
            t={(key) => m[key] ?? key}
            groupIds={fs.snapGroupIds ?? []}
            groupsAllMode={Boolean(fs.groupsAllMode)}
            selectedGroup={fs.selectedGroup}
            onPickAllGroups={onPickAllGroups}
            onPickGroup={onGroupButtonClick}
            companiesForPicker={companiesForCompanyStrip}
            groupAllMode={Boolean(fs.groupAllMode)}
            pickerCompanyId={fs.companyId}
            onPickAllInGroup={onPickAllInGroup}
            onPickCompany={onCompanyButtonClick}
            onWarmCompany={onWarmCompany}
            allowCompanyDeselect={allowCompanyDeselect}
          >
            {currencyRowsOrdered.length > 0 && (
              <div id="currency-buttons-wrapper" className="user-gc-inline-row">
                <span className="user-gc-inline-label">{m.currencyLabel}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div id="currency-buttons-container" className="user-gc-segment-group" role="group" aria-label="Currency">
                    <button
                      type="button"
                      className={`user-gc-segment${showAllCurrencies ? " is-on" : ""}`}
                      data-currency-code="ALL"
                      onClick={toggleAllCurrenciesBtn}
                    >
                      {m.all}
                    </button>
                    {currencyRowsOrdered.map((c) => {
                      const code = String(c.code || "").toUpperCase().trim();
                      const on = showAllCurrencies || selectedCurrencySet.has(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          className={`user-gc-segment user-gc-segment--draggable-pill${on ? " is-on" : ""}`}
                          data-currency-code={code}
                          draggable
                          onDragStart={() => onCurrencyDragStart(code)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onCurrencyDropOn(code)}
                          onClick={() => toggleCurrencyBtn(code)}
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </GcInlineFilterPanel>
        </div>
      )}
    </div>
  );
}
