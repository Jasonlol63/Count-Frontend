import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatYmd, parseYmd } from "../../../utils/date/dateUtils.js";
import { formatAccountingDueDisplayDate } from "../lib/bankProcessHelpers.js";

const FALLBACK_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FALLBACK_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** 6 rows x 7 cols of ISO dates for the given month, padded with adjacent-month days. */
function buildMonthGrid(year, month) {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const cursor = new Date(year, month, 1 - startWeekday);
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    cells.push({ iso: formatYmd(cursor), day: cursor.getDate(), otherMonth: cursor.getMonth() !== month });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

/**
 * Standalone single-date calendar for the Accounting Due "early transaction date" control.
 *
 * Visually mirrors the app's shared date-range-picker (date-range-picker.css) but is a fully
 * independent component: no shared state, no shared DOM contract with `dateRangePicker.js`. That
 * lets it enforce a real min/max range (out-of-range days are rendered disabled, not just visually
 * dimmed) without touching the shared engine used by Bank Process forms, reports, etc.
 */
export default function AccountingDueDatePicker({ value, minIso, maxIso, onChange, disabled = false, label, t }) {
  const [open, setOpen] = useState(false);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const monthMenuRef = useRef(null);

  const selectedIso = value || minIso;
  const todayIso = useMemo(() => formatYmd(new Date()), []);

  const [viewDate, setViewDate] = useState(() => {
    const d = parseYmd(selectedIso) || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Jump the visible month to match the selected date whenever it changes from outside (chip click, reset).
  useEffect(() => {
    const d = parseYmd(selectedIso);
    if (!d) return;
    setViewDate({ year: d.getFullYear(), month: d.getMonth() });
  }, [selectedIso]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Closing the calendar also closes the nested month menu (it lives inside the calendar popup).
  useEffect(() => {
    if (!open) setMonthMenuOpen(false);
  }, [open]);

  useEffect(() => {
    if (!monthMenuOpen) return undefined;
    const onDocMouseDown = (e) => {
      if (monthMenuRef.current && !monthMenuRef.current.contains(e.target)) setMonthMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setMonthMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [monthMenuOpen]);

  const monthNames = useMemo(() => {
    const arr = t?.("monthsShort");
    return Array.isArray(arr) && arr.length === 12 ? arr : FALLBACK_MONTH_NAMES;
  }, [t]);

  const weekdayLabels = useMemo(() => {
    const arr = t?.("weekdaysShort");
    return Array.isArray(arr) && arr.length === 7 ? arr : FALLBACK_WEEKDAYS;
  }, [t]);

  const monthOptions = useMemo(() => {
    const min = parseYmd(minIso);
    const max = parseYmd(maxIso);
    if (!min || !max) return [];
    const opts = [];
    let cursor = new Date(min.getFullYear(), min.getMonth(), 1);
    const end = new Date(max.getFullYear(), max.getMonth(), 1);
    while (cursor <= end) {
      opts.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return opts;
  }, [minIso, maxIso]);

  const currentMonthIndex = monthOptions.findIndex((o) => o.year === viewDate.year && o.month === viewDate.month);
  const canGoPrev = currentMonthIndex > 0;
  const canGoNext = currentMonthIndex >= 0 && currentMonthIndex < monthOptions.length - 1;

  const goPrevMonth = useCallback(() => {
    if (currentMonthIndex <= 0) return;
    const o = monthOptions[currentMonthIndex - 1];
    setViewDate({ year: o.year, month: o.month });
  }, [currentMonthIndex, monthOptions]);

  const goNextMonth = useCallback(() => {
    if (currentMonthIndex < 0 || currentMonthIndex >= monthOptions.length - 1) return;
    const o = monthOptions[currentMonthIndex + 1];
    setViewDate({ year: o.year, month: o.month });
  }, [currentMonthIndex, monthOptions]);

  const handleMonthPick = useCallback((opt) => {
    setViewDate({ year: opt.year, month: opt.month });
    setMonthMenuOpen(false);
  }, []);

  const isOutOfRange = useCallback(
    (iso) => (minIso && iso < minIso) || (maxIso && iso > maxIso),
    [minIso, maxIso],
  );

  const gridCells = useMemo(() => buildMonthGrid(viewDate.year, viewDate.month), [viewDate.year, viewDate.month]);

  const handleDayClick = (cell) => {
    if (isOutOfRange(cell.iso)) return;
    onChange?.(cell.iso);
    setOpen(false);
  };

  return (
    <div className="accounting-due-cal-wrap" ref={wrapRef}>
      <button
        type="button"
        className="accounting-due-cal-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        </svg>
        <span className="accounting-due-cal-trigger-label">{label}</span>
        <span className="accounting-due-cal-trigger-value">{formatAccountingDueDisplayDate(selectedIso)}</span>
      </button>

      {open ? (
        <div className="accounting-due-cal-popup" role="dialog" aria-label={label}>
          <div className="accounting-due-cal-header">
            <button
              type="button"
              className="accounting-due-cal-nav"
              disabled={!canGoPrev}
              aria-label="Previous month"
              onClick={goPrevMonth}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="accounting-due-cal-month-menu" ref={monthMenuRef}>
              <button
                type="button"
                className="accounting-due-cal-month-trigger"
                aria-haspopup="listbox"
                aria-expanded={monthMenuOpen}
                onClick={() => setMonthMenuOpen((o) => !o)}
              >
                <span>
                  {monthNames[viewDate.month]} {viewDate.year}
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {monthMenuOpen ? (
                <ul className="accounting-due-cal-month-list" role="listbox">
                  {monthOptions.map((o) => {
                    const active = o.year === viewDate.year && o.month === viewDate.month;
                    return (
                      <li key={monthKey(o.year, o.month)}>
                        <button
                          type="button"
                          className={`accounting-due-cal-month-option${active ? " accounting-due-cal-month-option--active" : ""}`}
                          role="option"
                          aria-selected={active}
                          onClick={() => handleMonthPick(o)}
                        >
                          {monthNames[o.month]} {o.year}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              className="accounting-due-cal-nav"
              disabled={!canGoNext}
              aria-label="Next month"
              onClick={goNextMonth}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="accounting-due-cal-weekdays">
            {weekdayLabels.map((w, idx) => (
              <div key={`${w}-${idx}`} className="accounting-due-cal-weekday">
                {w}
              </div>
            ))}
          </div>

          <div className="accounting-due-cal-days">
            {gridCells.map((cell) => {
              const outOfRange = isOutOfRange(cell.iso);
              const cls = [
                "accounting-due-cal-day",
                cell.otherMonth ? "accounting-due-cal-day--other" : "",
                cell.iso === todayIso ? "accounting-due-cal-day--today" : "",
                cell.iso === selectedIso ? "accounting-due-cal-day--selected" : "",
                outOfRange ? "accounting-due-cal-day--disabled" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button key={cell.iso} type="button" className={cls} disabled={outOfRange} onClick={() => handleDayClick(cell)}>
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
