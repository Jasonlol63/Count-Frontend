import { memo } from "react";
import { formatCurrency, formatPercentMagnitude, formatSignedChange } from "../../lib/dashboardFormat.js";

const VARIANT_META = {
  profit: { icon: "fa-dollar-sign", accent: "profit", iconTone: "profit" },
  expense: { icon: "fa-arrow-trend-down", accent: "expense", iconTone: "expense" },
  net: { icon: "fa-chart-line", accent: "net", iconTone: "net" },
  earnings: { icon: "fa-hand-holding-dollar", accent: "earnings", iconTone: "earnings" },
};

const DashboardKpiCard = memo(function DashboardKpiCard({
  variant,
  label,
  value,
  compare,
  compareLabel,
  loading,
  selected = false,
  onSelect,
}) {
  const meta = VARIANT_META[variant] || VARIANT_META.net;
  const display = loading ? null : formatCurrency(value);
  const pct = compare?.pct;
  const showCompare = !loading && compare && Number.isFinite(pct);

  return (
    <button
      type="button"
      className="m-dash-kpi tap-scale"
      aria-pressed={selected}
      onClick={() => onSelect?.(variant)}
    >
      <div className={`m-dash-kpi-accent m-dash-kpi-accent--${meta.accent}`} aria-hidden="true" />

      <div className="m-dash-kpi-head">
        <span className={`m-dash-kpi-icon m-dash-kpi-icon--${meta.iconTone}`}>
          <i className={`fas ${meta.icon}`} aria-hidden="true" />
        </span>
        <p className="m-dash-kpi-label">{label}</p>
      </div>

      <p className="m-dash-kpi-value">
        {display ?? <span className="m-dash-kpi-skeleton" />}
      </p>

      {showCompare ? (
        <div className="m-dash-kpi-compare-row">
          <span className={`m-dash-kpi-pct ${compare.isUp ? "m-dash-kpi-pct--up" : "m-dash-kpi-pct--down"}`}>
            <i className={`fas fa-arrow-${compare.isUp ? "up" : "down"}`} aria-hidden="true" />
            {formatPercentMagnitude(pct, { clamped: compare.clamped })}
          </span>
          <span className={`m-dash-kpi-delta ${compare.isUp ? "m-dash-kpi-delta--up" : "m-dash-kpi-delta--down"}`}>
            {formatSignedChange(compare.delta)}
          </span>
        </div>
      ) : (
        <p className="m-dash-kpi-compare-label">{compareLabel}</p>
      )}
    </button>
  );
});

export default DashboardKpiCard;
