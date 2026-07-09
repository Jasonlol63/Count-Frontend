import { KPI_CARD_ICONS } from "../lib/dashboardConstants.js";
import { formatCurrency, formatSignedChange } from "../lib/dashboardFormat.js";

export function DashboardKpiCard({
  variant,
  label,
  value,
  loading,
  id,
  tone,
  compare,
  compareLabel,
  fallbackFoot,
  footNote,
}) {
  const showCompare = compare && !loading;
  const badgeUp = compare?.pct >= 0;
  const deltaUp = compare?.isUp;

  return (
    <div
      id={id}
      className={`dashboard-kpi-card dashboard-kpi-card--${variant}${tone ? ` dashboard-kpi-card--${tone}` : ""}`}
    >
      <div className="kpi-card-head">
        <i className={`kpi-card-head-icon ${KPI_CARD_ICONS[variant] || "far fa-chart-bar"}`} aria-hidden="true" />
        <span className="kpi-card-head-label">{label}</span>
      </div>
      <div className="kpi-card-main">
        <div className="kpi-card-value">
          {formatCurrency(value)}
        </div>
        {showCompare && (
          <span className={`kpi-card-badge${badgeUp ? " is-up" : " is-down"}`}>
            <i className={`fas fa-arrow-${badgeUp ? "up" : "down"}`} aria-hidden="true" />
            {Math.abs(compare.pct).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="kpi-card-foot">
        {showCompare ? (
          <>
            <span className={`kpi-card-delta${deltaUp ? " is-up" : " is-down"}`}>
              {formatSignedChange(compare.delta)}
            </span>
            <span className="kpi-card-foot-muted">{compareLabel}</span>
          </>
        ) : (
          <span className="kpi-card-foot-muted">{fallbackFoot}</span>
        )}
        {footNote ? <span className="kpi-card-foot-note">{footNote}</span> : null}
      </div>
    </div>
  );
}
