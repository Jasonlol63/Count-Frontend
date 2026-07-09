export default function MaintenanceCalendarPopup({ months = [], weekdays = [] }) {
  return (
    <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
      <div className="calendar-header">
        <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
          <i className="fas fa-chevron-left" />
        </button>
        <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
          <select id="calendar-month-select" defaultValue="0">
            {(months.length === 12 ? months : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]).map(
              (label, i) => (
                <option key={label} value={String(i)}>
                  {label}
                </option>
              )
            )}
          </select>
          <select id="calendar-year-select" />
        </div>
        <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
          <i className="fas fa-chevron-right" />
        </button>
      </div>
      <div className="calendar-weekdays">
        {(weekdays.length === 7 ? weekdays : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="calendar-days" id="calendar-days" />
    </div>
  );
}
