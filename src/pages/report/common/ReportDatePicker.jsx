import { useEffect, useMemo, useRef } from "react";
import {
  bindMaintenanceCalendarDismissListeners,
  ensureMaintenanceDateRangePicker,
} from "../../../utils/date/dateRangePicker.js";
import { formatDmy, parseYmd } from "../../../utils/date/dateUtils.js";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ymdToDmy(ymd) {
  const d = parseYmd(ymd);
  return d ? formatDmy(d) : "";
}

function dmyToYmd(dmy) {
  const text = String(dmy || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3];
  return `${year}-${month}-${day}`;
}

export default function ReportDatePicker({
  dateFrom,
  dateTo,
  onRangeChange,
  label = "Date Range",
  containerClass = "report-date-range-group",
  placeholder = "Select date range",
  selectEndDateHint = "Select end date",
  outlinedFloatingLabel = false,
  /** Transaction-style bar: chevron, calendar popup with period presets (layout matches transaction search). */
  captureDateStyle = false,
  /** `{ key, label }[]` e.g. quick range keys with translated labels. Used when `captureDateStyle`. */
  periodPresets = [],
  /** Optional aria-label for the preset column (i18n). */
  periodShortcutsAria = "Period shortcuts",
  monthLabels = MONTH_LABELS,
  weekdaysShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
}) {
  const anchorLabelId = "report-date-range-outlined-label";
  const onRangeChangeRef = useRef(onRangeChange);
  onRangeChangeRef.current = onRangeChange;

  const parsedFrom = useMemo(() => parseYmd(dateFrom), [dateFrom]);
  const initialMonthLabel = parsedFrom ? monthLabels[parsedFrom.getMonth()] : monthLabels[new Date().getMonth()];
  const initialYearLabel = parsedFrom ? String(parsedFrom.getFullYear()) : String(new Date().getFullYear());
  const initialMonthValue = parsedFrom ? String(parsedFrom.getMonth()) : String(new Date().getMonth());

  useEffect(() => {
    const fromEl = document.getElementById("date_from");
    const toEl = document.getElementById("date_to");
    if (fromEl) fromEl.value = ymdToDmy(dateFrom);
    if (toEl) toEl.value = ymdToDmy(dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!window.MaintenanceDateRangePicker?.setLocaleStrings) return;
    window.MaintenanceDateRangePicker.setLocaleStrings({
      placeholder,
      selectEndDateHint,
      monthLabels,
    });
  }, [placeholder, selectEndDateHint, monthLabels]);

  useEffect(() => {
    bindMaintenanceCalendarDismissListeners();
  }, []);

  useEffect(() => {
    let disposed = false;

    const initPicker = () => {
      if (disposed || !window?.MaintenanceDateRangePicker?.init) return;
      window.MaintenanceDateRangePicker.init({
        allowEmpty: false,
        placeholder,
        selectEndDateHint,
        onChange: () => {
          const nextFromDmy = window.MaintenanceDateRangePicker.getDateFrom?.() || "";
          const nextToDmy = window.MaintenanceDateRangePicker.getDateTo?.() || "";
          const nextFrom = dmyToYmd(nextFromDmy);
          const nextTo = dmyToYmd(nextToDmy);
          if (nextFrom && nextTo) onRangeChangeRef.current?.(nextFrom, nextTo);
        },
      });
    };

    ensureMaintenanceDateRangePicker();
    initPicker();

    return () => {
      disposed = true;
    };
  }, [placeholder, selectEndDateHint]);

  const dateBar = captureDateStyle ? (
    <div className="transaction-date-range-group">
      <div
        className="date-range-picker"
        id="date-range-picker"
        role="button"
        tabIndex={0}
        aria-labelledby={outlinedFloatingLabel ? anchorLabelId : undefined}
      >
        <i className="fas fa-calendar-alt" />
        <span id="date-range-display">
          {ymdToDmy(dateFrom)} - {ymdToDmy(dateTo)}
        </span>
        <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
      </div>
      <input type="hidden" id="date_from" readOnly aria-hidden="true" defaultValue={ymdToDmy(dateFrom)} />
      <input type="hidden" id="date_to" readOnly aria-hidden="true" defaultValue={ymdToDmy(dateTo)} />
    </div>
  ) : (
    <div
      className="date-range-picker"
      id="date-range-picker"
      {...(outlinedFloatingLabel
        ? { role: "button", tabIndex: 0, "aria-labelledby": anchorLabelId }
        : {})}
    >
      <i className="fas fa-calendar-alt" />
      <span className="report-date-range-input" id="date-range-display">
        {ymdToDmy(dateFrom)} - {ymdToDmy(dateTo)}
      </span>
    </div>
  );

  const hiddenInputsLegacy = !captureDateStyle ? (
    <>
      <input type="hidden" id="date_from" defaultValue={ymdToDmy(dateFrom)} />
      <input type="hidden" id="date_to" defaultValue={ymdToDmy(dateTo)} />
    </>
  ) : null;

  const calendarPopup = captureDateStyle ? (
    <div className="calendar-popup calendar-popup--transaction-range" id="calendar-popup" style={{ display: "none" }}>
      <div className="transaction-calendar-presets" aria-label={periodShortcutsAria}>
        {periodPresets.map(({ key, label: plabel }) => (
          <button
            key={key}
            type="button"
            className="transaction-calendar-preset"
            data-period-key={key}
            aria-pressed="false"
            onClick={(e) => {
              e.stopPropagation();
              window.selectQuickRange?.(key);
            }}
          >
            {plabel}
          </button>
        ))}
      </div>
      <div className="transaction-calendar-panel">
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
            <i className="fas fa-chevron-left" />
          </button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
            <button
              type="button"
              id="calendar-month-select"
              className="calendar-month-trigger"
              value={initialMonthValue}
              aria-label="Month"
            >
              {initialMonthLabel}
            </button>
            <button type="button" id="calendar-year-select" className="calendar-year-trigger" value={initialYearLabel} aria-label="Year">
              {initialYearLabel}
            </button>
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <div className="calendar-weekdays">
          {weekdaysShort.map((d) => (
            <div key={d} className="calendar-weekday">{d}</div>
          ))}
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </div>
  ) : (
    <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
      <div className="calendar-header">
        <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
          <i className="fas fa-chevron-left" />
        </button>
        <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
          <select id="calendar-month-select" aria-label="Month">
            {monthLabels.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select id="calendar-year-select" aria-label="Year" />
        </div>
        <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
          <i className="fas fa-chevron-right" />
        </button>
      </div>
      <div className="calendar-weekdays">
        {weekdaysShort.map((d) => (<div key={d} className="calendar-weekday">{d}</div>))}
      </div>
      <div className="calendar-days" id="calendar-days" />
    </div>
  );

  const labelClassName = captureDateStyle
    ? "report-outlined-label report-outlined-label--txn-capture-date"
    : "report-outlined-label";

  if (outlinedFloatingLabel) {
    return (
      <div className={`report-filter-group ${containerClass} report-outlined-anchor report-date-range-picker-container`}>
        <div className="report-outlined-shell">
          <span className={labelClassName} id={anchorLabelId}>
            {label}
          </span>
          <div className="report-outlined-inner">
            {dateBar}
            {hiddenInputsLegacy}
          </div>
        </div>
        {calendarPopup}
      </div>
    );
  }

  return (
    <div className={`report-filter-group ${containerClass} report-date-range-picker-container`}>
      <label className="maintenance-label">{label}</label>
      {dateBar}
      {hiddenInputsLegacy}
      {calendarPopup}
    </div>
  );
}
