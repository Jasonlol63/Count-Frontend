import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getProcessModalDropdownZIndex } from "../../../components/ProcessModalPortal.jsx";
import SimpleSelect from "../../../components/SimpleSelect.jsx";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";
import { formatDmy, formatYmd, parseYmd } from "../../../utils/date/dateUtils.js";
import { filterBankPickAccounts, formatBankAccountDisplay } from "../lib/bankProcessHelpers.js";

const PORTAL_MIN_WIDTH = 180;
const ACCOUNT_PICK_MIN_WIDTH = 220;
const PORTAL_EDGE_PAD = 16;
const PORTAL_GAP = 1;
const ACCOUNT_SEARCH_RESERVE = 0;
const PORTAL_DROPDOWN_CAP_ACCOUNT = 280;

function layoutPortalDropdown(buttonEl, wrapEl, { minWidth, searchReserve = 0, minMenu = 160, dropdownCap }) {
  const rect = buttonEl.getBoundingClientRect();
  const width = Math.max(rect.width, minWidth);
  const spaceBelow = window.innerHeight - rect.bottom - PORTAL_EDGE_PAD;
  const spaceAbove = rect.top - PORTAL_EDGE_PAD;
  const openBelow = spaceBelow >= minMenu || spaceBelow >= spaceAbove;
  const viewportFit = Math.max(minMenu, openBelow ? spaceBelow : spaceAbove);
  const dropdownMaxHeight = Math.min(dropdownCap, viewportFit);
  const optionsMaxHeight = Math.max(100, dropdownMaxHeight - searchReserve);

  return {
    optionsMaxHeight,
    menuStyle: {
      position: "fixed",
      left: `${rect.left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      maxHeight: `${dropdownMaxHeight}px`,
      display: "flex",
      flexDirection: "column",
      top: openBelow ? `${rect.bottom + PORTAL_GAP}px` : "auto",
      bottom: openBelow ? "auto" : `${window.innerHeight - rect.top + PORTAL_GAP}px`,
      zIndex: getProcessModalDropdownZIndex(wrapEl),
    },
  };
}

export function BankSimpleSelect({ className = "", ...props }) {
  return <SimpleSelect {...props} wrapperClassName={`bank-simple-select${className ? ` ${className}` : ""}`} />;
}

function toDisplayDate(value) {
  const date = parseYmd(String(value || "").trim());
  return date ? formatDmy(date) : "";
}

function firstOfMonth(value) {
  const date = parseYmd(String(value || "").trim()) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildCalendarCells(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const firstCell = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    date.setHours(0, 0, 0, 0);
    return {
      date,
      ymd: formatYmd(date),
      otherMonth: date.getMonth() !== month,
    };
  });
}

/**
 * Bank-style single-date field with its own calendar popup (no Period presets).
 * Used by Add/Edit and Resend so both share one design. It intentionally does
 * not use the shared MaintenanceDateRangePicker so the list Period picker
 * keeps its existing bindings and behavior.
 */
export function BankFormCalendarDateField({
  id,
  label,
  value,
  onValueChange,
  disabled = false,
  minYmd = "",
  placeholder,
  clearLabel,
  labelExtra = null,
  monthLabels,
  weekdaysShort,
  className = "",
  wrapClassName = "",
}) {
  const wrapRef = useRef(null);
  const popupRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => firstOfMonth(value));
  const [popupStyle, setPopupStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const anchorRect = wrapRef.current.getBoundingClientRect();
    const popupWidth = Math.min(292, Math.max(1, window.innerWidth - 24));
    const popupHeight = popupRef.current?.offsetHeight || 320;
    const left = Math.max(12, Math.min(anchorRect.left, window.innerWidth - popupWidth - 12));
    const fitsBelow = window.innerHeight - anchorRect.bottom >= popupHeight + 8;
    const top = fitsBelow
      ? anchorRect.bottom + 4
      : Math.max(12, anchorRect.top - popupHeight - 4);
    setPopupStyle({
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(popupWidth)}px`,
      zIndex: getProcessModalDropdownZIndex(wrapRef.current),
    });
  }, [open, viewMonth]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      const target = event.target;
      if (wrapRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOnViewportMove = () => setOpen(false);
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportMove);
    window.addEventListener("scroll", closeOnViewportMove, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportMove);
      window.removeEventListener("scroll", closeOnViewportMove, true);
    };
  }, [open]);

  const openCalendar = () => {
    if (disabled) return;
    setViewMonth(firstOfMonth(value || minYmd));
    setOpen(true);
  };

  const selectDay = (ymd) => {
    if (minYmd && ymd < minYmd) return;
    onValueChange?.(ymd);
    setOpen(false);
  };

  const clearValue = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onValueChange?.("");
    setOpen(false);
  };

  const cells = useMemo(() => buildCalendarCells(viewMonth), [viewMonth]);
  const todayYmd = formatYmd(new Date());
  const selectedYmd = String(value || "").trim();
  const selectedYear = parseYmd(selectedYmd)?.getFullYear();
  const extraYears = Number.isFinite(selectedYear) ? [selectedYear] : [];
  const currentYear = new Date().getFullYear();
  const minYear = Math.min(2022, ...extraYears);
  const maxYear = Math.max(currentYear + 1, ...extraYears);
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  const labels = Array.isArray(monthLabels) && monthLabels.length === 12
    ? monthLabels
    : Array.from({ length: 12 }, (_, index) => String(index + 1));
  const weekdays = Array.isArray(weekdaysShort) && weekdaysShort.length === 7
    ? weekdaysShort
    : Array(7).fill("");

  const popup = open && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={popupRef}
          className="calendar-popup calendar-popup--transaction-range calendar-popup--no-presets bank-form-range-calendar"
          style={{ ...popupStyle, display: "grid", visibility: popupStyle ? "visible" : "hidden" }}
          role="dialog"
          aria-label={label}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="transaction-calendar-panel">
            <div className="calendar-header">
              <button
                type="button"
                className="calendar-nav-btn"
                aria-label={labels[(viewMonth.getMonth() + 11) % 12]}
                onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <div className="calendar-month-year">
                <select
                  value={viewMonth.getMonth()}
                  aria-label={label}
                  onChange={(event) =>
                    setViewMonth((prev) => new Date(prev.getFullYear(), Number(event.target.value), 1))
                  }
                >
                  {labels.map((monthLabel, index) => (
                    <option key={monthLabel} value={index}>{monthLabel}</option>
                  ))}
                </select>
                <select
                  value={viewMonth.getFullYear()}
                  aria-label={label}
                  onChange={(event) =>
                    setViewMonth((prev) => new Date(Number(event.target.value), prev.getMonth(), 1))
                  }
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="calendar-nav-btn"
                aria-label={labels[(viewMonth.getMonth() + 1) % 12]}
                onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
            <div className="calendar-weekdays">
              {weekdays.map((weekday, index) => (
                <div key={`${weekday}-${index}`} className="calendar-weekday">{weekday}</div>
              ))}
            </div>
            <div className="calendar-days">
              {cells.map(({ ymd, date, otherMonth }) => {
                const dayDisabled = !!minYmd && ymd < minYmd;
                const classNames = [
                  "calendar-day",
                  otherMonth ? "other-month" : "",
                  ymd === todayYmd ? "today" : "",
                  ymd === selectedYmd ? "selected start-date end-date" : "",
                  dayDisabled ? "disabled" : "",
                ].filter(Boolean).join(" ");
                return (
                  <button
                    key={ymd}
                    type="button"
                    className={classNames}
                    aria-label={formatDmy(date)}
                    disabled={dayDisabled}
                    onClick={() => selectDay(ymd)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`form-group ${className}`.trim()}>
      {labelExtra ? (
        <div className="form-date-label-row bank-day-end-label-row">
          <label htmlFor={id}>{label}</label>
          {labelExtra}
        </div>
      ) : label ? (
        <label htmlFor={id}>{label}</label>
      ) : null}
      <div
        ref={wrapRef}
        className={`bank-form-datepicker-wrap ${wrapClassName}${disabled ? " bank-form-datepicker-wrap--disabled" : ""}`.trim()}
      >
        <input
          id={id}
          type="text"
          className="bank-input bank-form-datepicker-input"
          readOnly
          placeholder={placeholder}
          value={toDisplayDate(value)}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={openCalendar}
          onKeyDown={(event) => {
            if (!disabled && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              openCalendar();
            }
          }}
        />
        {selectedYmd && !disabled ? (
          <button
            type="button"
            className="bank-form-datepicker-clear"
            aria-label={clearLabel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearValue}
          >
            ×
          </button>
        ) : null}
      </div>
      {popup}
    </div>
  );
}

function accountLabel(account) {
  if (!account) return "";
  return formatBankAccountDisplay(account.account_id, account.name, account.id);
}

export function BankSearchableAccountPick({ value, onChange, accounts, disabled, t }) {
  const [open, setOpen] = useState(false);
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(320);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const { menuStyle: nextMenuStyle, optionsMaxHeight: nextOptionsMaxHeight } = layoutPortalDropdown(
      btn,
      wrapRef.current,
      {
        minWidth: ACCOUNT_PICK_MIN_WIDTH,
        searchReserve: ACCOUNT_SEARCH_RESERVE,
        minMenu: 180,
        dropdownCap: PORTAL_DROPDOWN_CAP_ACCOUNT,
      },
    );
    setOptionsMaxHeight(nextOptionsMaxHeight);
    setMenuStyle(nextMenuStyle);
  }, []);

  useLayoutEffect(() => {
    if (!open || !usePortal) return undefined;
    positionMenu();
    // Coalesce to one reposition per animation frame — an unthrottled scroll
    // listener re-measuring + setState on every scroll event is a common
    // cause of janky scrolling when this dropdown is left open while the
    // surrounding modal scrolls (e.g. on small screens).
    let rafId = null;
    const onReflow = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        positionMenu();
      });
    };
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, usePortal, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open, close]);

  const pickableAccounts = useMemo(() => {
    const list = filterBankPickAccounts(accounts);
    return list.slice().sort((a, b) => accountLabel(a).localeCompare(accountLabel(b), undefined, { sensitivity: "base" }));
  }, [accounts]);

  const menuItems = useMemo(() => {
    const placeholder = t("selectAccount");
    return [{ id: "", label: placeholder }, ...pickableAccounts.map((a) => ({ id: a.id, label: accountLabel(a) }))];
  }, [pickableAccounts, t]);

  const getItemLabel = useCallback((idx) => menuItems[idx]?.label ?? "", [menuItems]);

  const { highlightIdx, setHighlightIdx, listRef, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open,
    itemCount: menuItems.length,
    getItemLabel,
  });

  const selected = pickableAccounts.find((a) => String(a.id) === String(value));
  const placeholder = t("selectAccount");

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest("#addBankModal, #profitSharingModal");
    setUsePortal(inModal);
    setOpen(true);
    if (inModal) positionMenu();
  };

  const pick = (id) => {
    onChange(id ? String(id) : "");
    close();
  };

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${usePortal ? " custom-select-dropdown-portal" : ""}`}
      style={usePortal && menuStyle ? menuStyle : undefined}
      role="listbox"
    >
      <div
        ref={listRef}
        className="custom-select-options"
        style={usePortal ? { flex: "1 1 auto", minHeight: 0 } : { maxHeight: optionsMaxHeight }}
      >
        {menuItems.map((item, idx) => (
          <div
            key={item.id || "placeholder"}
            className={`custom-select-option${String(value) === String(item.id) ? " selected" : ""}${highlightClass(idx)}`}
            role="option"
            aria-selected={String(value) === String(item.id)}
            data-kb-idx={idx}
            onMouseEnter={() => setHighlightIdx(idx)}
            onClick={() => pick(item.id)}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="custom-select-wrapper bank-searchable-account-pick" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${open ? " open" : ""}${!selected ? " simple-select-button--placeholder" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openDropdown())}
        onKeyDown={(e) => {
          handleButtonKeyDown(e, {
            isOpen: open,
            onToggleOpen: openDropdown,
            onClose: close,
            len: menuItems.length,
            onSelectIndex: (idx) => {
              const item = menuItems[idx];
              if (item) pick(item.id);
            },
          });
        }}
      >
        {selected ? accountLabel(selected) : placeholder}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}
