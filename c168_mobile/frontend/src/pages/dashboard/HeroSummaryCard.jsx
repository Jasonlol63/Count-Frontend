import { memo } from "react";
import { formatCurrencyHero, formatPercentMagnitude, formatSignedChange } from "../../lib/dashboardFormat.js";

const HeroSummaryCard = memo(function HeroSummaryCard({
  i18n,
  label,
  currency,
  value,
  compare,
  compareLabel,
  multiCurrency,
  loading,
  empty = false,
  emptyLabel,
  sparklineValues = [],
  accent = "net",
}) {
  const showCompare = !loading && !empty && compare && Number.isFinite(compare?.pct);
  const title = label || i18n.netProfit;

  const sparkPath = (() => {
    if (empty || loading) return null;
    const vals = (sparklineValues || []).filter((v) => Number.isFinite(v));
    if (vals.length < 2) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const w = 120;
    const h = 40;
    return vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * w;
        const y = h - ((v - min) / span) * (h - 4) - 2;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  })();

  return (
    <section className={`m-dash-hero m-dash-hero--${accent}`}>
      <div className="m-dash-hero-glow" aria-hidden="true" />

      {sparkPath ? (
        <svg className="m-dash-hero-spark" viewBox="0 0 120 40" fill="none" aria-hidden="true">
          <path d={sparkPath} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}

      <div className={`m-dash-hero-top${sparkPath ? " m-dash-hero-top--spark" : ""}`}>
        <div>
          <p className="m-dash-hero-label">{title}</p>
          <p className="m-dash-hero-currency">{currency}</p>
        </div>
        {showCompare && (
          <span
            className={`m-dash-hero-compare-badge ${
              compare.isUp ? "m-dash-hero-compare-badge--up" : "m-dash-hero-compare-badge--down"
            }`}
          >
            <i className={`fas fa-arrow-${compare.isUp ? "up" : "down"}`} aria-hidden="true" />
            {formatPercentMagnitude(compare.pct, { clamped: compare.clamped })}
          </span>
        )}
      </div>

      <p className={`m-dash-hero-value${sparkPath ? " m-dash-hero-value--spark" : ""}`}>
        {loading ? (
          <span className="m-dash-hero-skeleton" />
        ) : empty ? (
          <span className="m-dash-hero-empty-value">—</span>
        ) : (
          formatCurrencyHero(value)
        )}
      </p>

      {showCompare && (
        <p className="m-dash-hero-delta">
          {compareLabel} <span className="font-bold">{formatSignedChange(compare.delta)}</span>
        </p>
      )}

      {empty && !loading && emptyLabel !== false ? (
        <p className="m-dash-hero-note">{typeof emptyLabel === "string" ? emptyLabel : i18n.noData}</p>
      ) : null}

      {multiCurrency && !empty ? (
        <p className="m-dash-hero-multi">{i18n.multiCurrencyNote}</p>
      ) : null}
    </section>
  );
});

export default HeroSummaryCard;
