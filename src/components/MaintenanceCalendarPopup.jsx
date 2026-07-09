const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Shared #calendar-popup markup for MaintenanceDateRangePicker (single or range).
 */
export default function MaintenanceCalendarPopup({
  className = "",
  monthLabels = MONTH_LABELS,
  weekdaysShort = WEEKDAYS_SHORT,
  clearLabel = "Clear",
}) {
  const now = new Date();
  const monthLabel = monthLabels[now.getMonth()];
  const yearLabel = String(now.getFullYear());

  return (
    <div
      className={`calendar-popup calendar-popup--transaction-range calendar-popup--no-presets ${className}`.trim()}
      id="calendar-popup"
      style={{ display: "none" }}
      aria-hidden="true"
    >
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
              {monthLabel}
            </button>
            <button type="button" id="calendar-year-select" className="calendar-year-trigger" aria-label="Year">
              {yearLabel}
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
          {weekdaysShort.map((d) => (
            <div key={d} className="calendar-weekday">
              {d}
            </div>
          ))}
        </div>
        <div className="calendar-days" id="calendar-days" />
        <div className="calendar-popup-clear-wrap" id="calendar-popup-clear-wrap" style={{ display: "none" }} aria-hidden="true">
          <button type="button" className="calendar-popup-clear-btn" id="calendar-popup-clear-btn">
            {clearLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
