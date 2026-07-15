import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import GcInlineFilterPanel from "../../../components/GcInlineFilterPanel.jsx";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";
import { splitWinLossAccountBands } from "../../member/memberPageHelpers.js";
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

  const currencyButtonsRef = useRef(null);
  const currencyMeasureRef = useRef(null);
  const [currencyLayout, setCurrencyLayout] = useState({ containerWidth: 0, segmentWidths: [] });

  const currencyCells = useMemo(() => {
    const rows = currencyRowsOrdered || [];
    const cells = [];
    if (rows.length >= 2) {
      cells.push({ type: "all" });
    }
    rows.forEach((c) => {
      const code = String(c.code || "").toUpperCase().trim();
      if (code) cells.push({ type: "code", code });
    });
    return cells;
  }, [currencyRowsOrdered]);

  const currencyFilterBands = useMemo(
    () =>
      splitWinLossAccountBands(
        currencyCells,
        currencyLayout.segmentWidths,
        currencyLayout.containerWidth,
      ),
    [currencyCells, currencyLayout.containerWidth, currencyLayout.segmentWidths],
  );

  useLayoutEffect(() => {
    const container = currencyButtonsRef.current;
    const measure = currencyMeasureRef.current;
    if (!container || !measure) return undefined;

    const update = () => {
      const containerWidth = Math.max(container.clientWidth, 0);
      const buttons = measure.querySelectorAll("button.user-gc-segment");
      const segmentWidths = Array.from(buttons).map((btn) => btn.offsetWidth);
      setCurrencyLayout((prev) => {
        if (
          prev.containerWidth === containerWidth
          && prev.segmentWidths.length === segmentWidths.length
          && prev.segmentWidths.every((w, i) => w === segmentWidths[i])
        ) {
          return prev;
        }
        return { containerWidth, segmentWidths };
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [currencyCells, showAllCurrencies, selectedCurrencies, m.all]);

  const categoryItemCount = 1 + categories.length;
  const categoryAllChecked =
    selectedCategories.length === 0 ||
    (categories.length > 0 && selectedCategories.length === categories.length);

  const closeCategoryMenu = useCallback(() => {
    if (categoryOpen) toggleCategory();
  }, [categoryOpen, toggleCategory]);

  const openCategoryMenu = useCallback(() => {
    if (!categoryOpen) toggleCategory();
  }, [categoryOpen, toggleCategory]);

  const activateCategoryIndex = useCallback(
    (idx) => {
      if (idx === 0) {
        if (!categoryAllChecked) onCategoryAllChange(true);
        return;
      }
      const cat = categories[idx - 1];
      if (cat) toggleCategoryValue(cat);
    },
    [categories, categoryAllChecked, onCategoryAllChange, toggleCategoryValue],
  );

  const getCategoryItemLabel = useCallback(
    (idx) => (idx === 0 ? m.selectAllCategories : categories[idx - 1] ?? ""),
    [categories, m.selectAllCategories],
  );

  const { highlightIdx, setHighlightIdx, listRef, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open: categoryOpen,
    itemCount: categoryItemCount,
    initialIndex: 0,
    getItemLabel: getCategoryItemLabel,
  });

  const onCategoryButtonKeyDown = useCallback(
    (e) => {
      handleButtonKeyDown(e, {
        isOpen: categoryOpen,
        onToggleOpen: openCategoryMenu,
        onClose: closeCategoryMenu,
        len: categoryItemCount,
        onSelectIndex: activateCategoryIndex,
      });
      if (categoryOpen && e.key === " ") {
        e.preventDefault();
        activateCategoryIndex(highlightIdx >= 0 ? highlightIdx : 0);
      }
    },
    [
      activateCategoryIndex,
      categoryItemCount,
      categoryOpen,
      closeCategoryMenu,
      handleButtonKeyDown,
      highlightIdx,
      openCategoryMenu,
    ],
  );

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
                    aria-haspopup="listbox"
                    aria-expanded={categoryOpen}
                    onClick={toggleCategory}
                    onKeyDown={onCategoryButtonKeyDown}
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
                  <div
                    className={`category-dropdown-menu${categoryOpen ? " show" : ""}`}
                    id="category_dropdown_menu"
                    style={{ display: categoryOpen ? "block" : "none" }}
                    role="listbox"
                    aria-multiselectable="true"
                    ref={listRef}
                  >
                    <div
                      className={`category-option${highlightClass(0)}`}
                      data-kb-idx={0}
                      role="option"
                      aria-selected={categoryAllChecked}
                      onMouseEnter={() => setHighlightIdx(0)}
                    >
                      <label className="category-checkbox-label">
                        <input
                          ref={categoryAllCheckboxRef}
                          type="checkbox"
                          value=""
                          className="category-checkbox"
                          id="category_all"
                          checked={categoryAllChecked}
                          onChange={(e) => onCategoryAllChange(e.target.checked)}
                          tabIndex={-1}
                        />
                        <span>{m.selectAllCategories}</span>
                      </label>
                    </div>
                    <div id="category_options_container">
                      {categories.map((c, catIdx) => (
                        <div
                          className={`category-option${highlightClass(catIdx + 1)}`}
                          data-kb-idx={catIdx + 1}
                          key={c}
                          role="option"
                          aria-selected={
                            selectedCategories.length === 0 ? false : selectedCategories.includes(c)
                          }
                          onMouseEnter={() => setHighlightIdx(catIdx + 1)}
                        >
                          <label className="category-checkbox-label">
                            <input
                              type="checkbox"
                              className="category-checkbox"
                              value={c}
                              checked={selectedCategories.length === 0 ? false : selectedCategories.includes(c)}
                              onChange={() => toggleCategoryValue(c)}
                              tabIndex={-1}
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
                <div
                  className="user-gc-inline-pills transaction-currency-pills"
                  ref={currencyButtonsRef}
                  role="group"
                  aria-label="Currency"
                >
                  <div
                    ref={currencyMeasureRef}
                    className="transaction-currency-measure"
                    aria-hidden="true"
                  >
                    {currencyCells.map((cell) =>
                      cell.type === "all" ? (
                        <button key="tx-ccy-measure-all" type="button" tabIndex={-1} className="user-gc-segment">
                          {m.all}
                        </button>
                      ) : (
                        <button
                          key={`tx-ccy-measure-${cell.code}`}
                          type="button"
                          tabIndex={-1}
                          className="user-gc-segment"
                        >
                          {cell.code}
                        </button>
                      ),
                    )}
                  </div>
                  {currencyFilterBands.map((band, segIdx) => (
                    <div
                      key={`tx-ccy-band-${segIdx}`}
                      id={segIdx === 0 ? "currency-buttons-container" : undefined}
                      className="user-gc-segment-group transaction-currency-segments"
                      style={{
                        width: "fit-content",
                        maxWidth: "100%",
                      }}
                    >
                      {band.map((cell) =>
                        cell.type === "all" ? (
                          <button
                            key="tx-ccy-all"
                            type="button"
                            className={`user-gc-segment${showAllCurrencies ? " is-on" : ""}`}
                            data-currency-code="ALL"
                            onClick={toggleAllCurrenciesBtn}
                          >
                            {m.all}
                          </button>
                        ) : (
                          <button
                            key={cell.code}
                            type="button"
                            className={`user-gc-segment user-gc-segment--draggable-pill${showAllCurrencies || selectedCurrencySet.has(cell.code) ? " is-on" : ""}`}
                            data-currency-code={cell.code}
                            draggable
                            onDragStart={() => onCurrencyDragStart(cell.code)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => onCurrencyDropOn(cell.code)}
                            onClick={() => toggleCurrencyBtn(cell.code)}
                          >
                            {cell.code}
                          </button>
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GcInlineFilterPanel>
        </div>
      )}
    </div>
  );
}
