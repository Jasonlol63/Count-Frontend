import { parseYmd } from "../lib/dashboardDateUtils.js";

export function DashboardCalendarPopup({ i18n, periodPresets, dateFrom, className = "" }) {
  return (
    <div
      className={`calendar-popup calendar-popup--transaction-range ${className}`.trim()}
      id="calendar-popup"
      style={{ display: "none" }}
      aria-hidden="true"
    >
      <div className="transaction-calendar-presets" aria-label={i18n.periodShortcutsAria}>
        {periodPresets.map(([key, label]) => (
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
            {label}
          </button>
        ))}
      </div>
      <div className="transaction-calendar-panel">
        <div className="calendar-header">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={(e) => {
              e.stopPropagation();
              window.changeMonth?.(-1);
            }}
          >
            <i className="fas fa-chevron-left" />
          </button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
            <button type="button" id="calendar-month-select" className="calendar-month-trigger" aria-label="Month">
              {i18n.monthLabels[parseYmd(dateFrom)?.getMonth() ?? new Date().getMonth()]}
            </button>
            <button type="button" id="calendar-year-select" className="calendar-year-trigger" aria-label="Year">
              {parseYmd(dateFrom)?.getFullYear() ?? new Date().getFullYear()}
            </button>
          </div>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={(e) => {
              e.stopPropagation();
              window.changeMonth?.(1);
            }}
          >
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <div className="calendar-weekdays">
          {i18n.weekdaysShort.map((d) => (
            <div key={d} className="calendar-weekday">
              {d}
            </div>
          ))}
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </div>
  );
}
