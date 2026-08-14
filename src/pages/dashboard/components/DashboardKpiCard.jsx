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
  // KPI cards must paint immediately — never sit invisible while the rest of the
  // dashboard's heavier fetch (per-company × currency fan-out) resolves. The value
  // shows 0.00 during scope loading and snaps to real figures as data lands; only
  // the compare row waits for data so it doesn't flash wrong deltas.
  const revealed = true;

  return (
    <div
      id={id}
      className={`dashboard-kpi-card dashboard-kpi-card--${variant}${tone ? ` dashboard-kpi-card--${tone}` : ""}`}
    >
      <div className="kpi-card-head">
        <i className={`kpi-card-head-icon ${KPI_CARD_ICONS[variant] || "far fa-chart-bar"}`} aria-hidden="true" />
        <span className="kpi-card-head-label">{label}</span>
      </div>
      <div className={`kpi-card-main dashboard-summary-reveal${revealed ? " is-revealed" : ""}`}>
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
      <div className={`kpi-card-foot dashboard-summary-reveal${revealed ? " is-revealed" : ""}`}>
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
