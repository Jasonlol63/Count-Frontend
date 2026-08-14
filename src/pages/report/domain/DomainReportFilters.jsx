import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import ReportDatePicker from "../common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../shared/ReportGcFilterPanel.jsx";
import { isTypeAheadKey } from "../../../components/typeAheadMatch.js";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";

const QUICK_RANGE_KEYS = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];

export default function DomainReportFilters({
  companyId,
  highlightCompanyId,
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
  processId,
  setProcessId,
  processes,
  isGroupScope = false,
  dateFrom,
  dateTo,
  onRangeChange,
  t,
  monthLabels,
  weekdaysShort,
}) {
  const [processSearch, setProcessSearch] = useState("");
  const [processDropdownOpen, setProcessDropdownOpen] = useState(false);

  const processDropdownRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (processDropdownRef.current && !processDropdownRef.current.contains(e.target)) setProcessDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filteredProcesses = useMemo(() => {
    const list = isGroupScope ? [...processes] : [{ id: "", display_text: t("allProcess") }, ...processes];
    if (!processSearch.trim() || isGroupScope) return list;
    const s = processSearch.toLowerCase();
    const allLabel = t("allProcess").toLowerCase();
    return list.filter((p) => {
      const text = (p.display_text || "").toLowerCase();
      return text.includes(s) || (p.id === "" && allLabel.includes(s));
    });
  }, [processes, processSearch, t, isGroupScope]);

  const getItemLabel = useCallback(
    (idx) => filteredProcesses[idx]?.display_text ?? "",
    [filteredProcesses],
  );

  // Group scope has no search box — use type-ahead. Company scope seeds search on letter.
  const { highlightIdx, setHighlightIdx, listRef, handleListKeyDown, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open: processDropdownOpen,
    itemCount: filteredProcesses.length,
    resetToken: processSearch,
    getItemLabel: isGroupScope ? getItemLabel : null,
  });

  const selectedProcessLabel = useMemo(() => {
    if (!processId) return isGroupScope ? t("selectProcess") : t("allProcess");
    const found = processes.find((p) => String(p.id) === String(processId));
    if (found) return found.display_text;
    return isGroupScope ? t("selectProcess") : t("allProcess");
  }, [processes, processId, t, isGroupScope]);

  const periodPresets = useMemo(
    () => QUICK_RANGE_KEYS.map((key) => ({ key, label: t(key) })),
    [t],
  );

  return (
    <div className="domain-report-filter-container">
      <div className="domain-report-filters">
        <div className="domain-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span className="report-outlined-label" id="report-process-outlined-label">
              {t("process")}
            </span>
            <div className="report-outlined-inner">
              <div className="custom-select-wrapper" ref={processDropdownRef}>
                <button
                  type="button"
                  id="dr-process-dropdown-btn"
                  aria-labelledby="report-process-outlined-label"
                  className={`custom-select-button ${processDropdownOpen ? "open" : ""}`}
                  onClick={() => setProcessDropdownOpen(!processDropdownOpen)}
                  onKeyDown={(e) => {
                    if (
                      !processDropdownOpen &&
                      !isGroupScope &&
                      isTypeAheadKey(e.key) &&
                      !e.ctrlKey &&
                      !e.metaKey &&
                      !e.altKey
                    ) {
                      e.preventDefault();
                      setProcessSearch(e.key);
                      setProcessDropdownOpen(true);
                      return;
                    }
                    handleButtonKeyDown(e, {
                      isOpen: processDropdownOpen,
                      onToggleOpen: () => setProcessDropdownOpen(true),
                      onClose: () => setProcessDropdownOpen(false),
                      len: filteredProcesses.length,
                      onSelectIndex: (idx) => {
                        const p = filteredProcesses[idx];
                        if (p) {
                          setProcessId(p.id);
                          setProcessDropdownOpen(false);
                        }
                      },
                    });
                  }}
                >
                  {selectedProcessLabel}
                </button>
                {processDropdownOpen && (
                  <div className="custom-select-dropdown show">
                    {!isGroupScope && (
                      <div className="custom-select-search">
                        <input
                          type="text"
                          placeholder={t("searchProcess")}
                          autoComplete="off"
                          value={processSearch}
                          onChange={(e) => setProcessSearch(e.target.value)}
                          style={{ textTransform: "uppercase" }}
                          autoFocus
                          onKeyDown={(e) => {
                            handleListKeyDown(e, {
                              len: filteredProcesses.length,
                              onSelectIndex: (idx) => {
                                const p = filteredProcesses[idx];
                                if (p) {
                                  setProcessId(p.id);
                                  setProcessDropdownOpen(false);
                                }
                              },
                              onClose: () => setProcessDropdownOpen(false),
                            });
                          }}
                        />
                      </div>
                    )}
                    <div className="custom-select-options" ref={listRef}>
                      {filteredProcesses.map((p, idx) => (
                        <div
                          key={p.id || "all"}
                          className={`custom-select-option ${String(p.id) === String(processId) ? "selected" : ""}${highlightClass(idx)}`}
                          data-kb-idx={idx}
                          onMouseEnter={() => setHighlightIdx(idx)}
                          onClick={() => { setProcessId(p.id); setProcessDropdownOpen(false); }}
                        >
                          {p.display_text}
                        </div>
                      ))}
                      {filteredProcesses.length === 0 && (
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
          containerClass="domain-report-filter-group"
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
        t={t}
      />
    </div>
  );
}
