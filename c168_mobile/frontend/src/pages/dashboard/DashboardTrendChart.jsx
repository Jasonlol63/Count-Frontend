import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { computeTrendYDomain } from "../../lib/dashboardChart.js";
import { formatCompactAxis, formatCurrency } from "../../lib/dashboardFormat.js";

function stripRechartsFocus(root) {
  if (!root) return;
  root.querySelectorAll(".recharts-wrapper, .recharts-surface, svg").forEach((node) => {
    if (node.hasAttribute("tabindex")) node.removeAttribute("tabindex");
    if (node instanceof HTMLElement || node instanceof SVGElement) {
      node.style.outline = "none";
      node.style.webkitTapHighlightColor = "transparent";
    }
  });
}

const DashboardTrendChart = memo(function DashboardTrendChart({
  rows,
  series,
  visible,
  onToggleSeries,
  label,
  dateRangeText,
  xAxisLayout,
  emptyText,
  tapHint,
}) {
  const activeSeries = useMemo(() => series.filter((s) => visible[s.idx]), [series, visible]);
  const activeKeys = useMemo(() => activeSeries.map((s) => s.dataKey), [activeSeries]);
  const yDomain = useMemo(() => computeTrendYDomain(rows, activeKeys), [rows, activeKeys]);
  const hasSeriesOn = activeKeys.length > 0;
  const [activeIndex, setActiveIndex] = useState(null);
  const chartHostRef = useRef(null);

  useEffect(() => {
    setActiveIndex(null);
  }, [rows]);

  useEffect(() => {
    const root = chartHostRef.current;
    if (!root || !rows?.length || !hasSeriesOn) return;
    stripRechartsFocus(root);
    const observer = new MutationObserver(() => stripRechartsFocus(root));
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["tabindex"] });
    return () => observer.disconnect();
  }, [rows, hasSeriesOn, activeSeries.length]);

  const selected =
    activeIndex != null && rows?.[activeIndex] ? rows[activeIndex] : null;

  const handleChartClick = (state) => {
    if (state?.activeTooltipIndex == null) return;
    const idx = Number(state.activeTooltipIndex);
    if (!Number.isFinite(idx) || idx < 0) return;
    setActiveIndex((prev) => (prev === idx ? null : idx));
    // Drop any residual browser focus ring after tap/click.
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      stripRechartsFocus(chartHostRef.current);
    });
  };

  const renderXTick = (props) => {
    const { x, y, payload, index } = props;
    const isActive = activeIndex != null && index === activeIndex;
    const text = payload?.value ?? "";
    if (isActive) {
      const w = Math.max(28, String(text).length * 7 + 10);
      return (
        <g transform={`translate(${x},${y})`}>
          <rect x={-w / 2} y={0} width={w} height={16} rx={4} fill="#2563eb" />
          <text dy={12} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700}>
            {text}
          </text>
        </g>
      );
    }
    return (
      <text x={x} y={y} dy={12} textAnchor="middle" fill="var(--m-color-label)" fontSize={10} fontWeight={600}>
        {text}
      </text>
    );
  };

  return (
    <section className="m-dash-card m-dash-trend">
      <div className="m-dash-card-head m-dash-card-head--spaced">
        <h2 className="m-dash-card-title">{label}</h2>
        <span className="m-dash-card-badge">{dateRangeText}</span>
      </div>

      <div className="m-dash-trend-toggles" role="group" aria-label={label}>
        {series.map((s) => {
          const on = Boolean(visible[s.idx]);
          return (
            <button
              key={s.dataKey}
              type="button"
              aria-pressed={on}
              className={`m-dash-trend-toggle tap-scale${on ? " m-dash-trend-toggle--on" : ""}`}
              style={on ? { backgroundColor: s.color } : undefined}
              onClick={() => onToggleSeries(s.idx)}
            >
              <span
                className={`m-dash-trend-toggle-dot${on ? " m-dash-trend-toggle-dot--on" : ""}`}
                style={!on ? { backgroundColor: s.color } : undefined}
                aria-hidden="true"
              />
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        ref={chartHostRef}
        className="m-dash-trend-chart"
        onMouseDown={(e) => {
          // Prevent SVG/wrapper from taking focus (native black focus rect).
          e.preventDefault();
        }}
      >
        {rows?.length && hasSeriesOn ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={rows}
              margin={{
                top: 10,
                right: 8,
                left: 0,
                bottom: xAxisLayout.marginBottom ?? 10,
              }}
              onClick={handleChartClick}
              style={{ outline: "none" }}
            >
              <defs>
                <linearGradient id="mGProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mGExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.16} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mGNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mGEarn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--m-color-chart-grid)" vertical={false} />
              <ReferenceLine y={0} stroke="var(--m-color-chart-zero)" strokeWidth={1.25} />
              <XAxis
                dataKey="label"
                interval={xAxisLayout.interval}
                minTickGap={xAxisLayout.minTickGap}
                height={xAxisLayout.height}
                tick={renderXTick}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: "var(--m-color-label)", fontWeight: 600 }}
                tickFormatter={(v) => formatCompactAxis(v)}
                width={44}
                axisLine={false}
                tickLine={false}
              />
              {activeSeries.map((s) => (
                <Area
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.label}
                  stroke={s.color}
                  fill={s.fill}
                  strokeWidth={s.dataKey === "netProfit" ? 2.5 : 2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: s.color, fill: "var(--m-color-surface)" }}
                  isAnimationActive={false}
                  cursor="pointer"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="m-dash-card-empty">{rows?.length && !hasSeriesOn ? emptyText || "—" : emptyText}</p>
        )}
      </div>

      {selected ? (
        <div className="m-dash-trend-detail" role="status">
          <p className="m-dash-trend-detail-label">{selected.label}</p>
          <ul className="m-dash-trend-detail-list">
            {activeSeries.map((s) => (
              <li key={s.dataKey} className="m-dash-trend-detail-row">
                <span>
                  <span
                    className="m-dash-trend-detail-dot"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  {s.label}
                </span>
                <strong>{formatCurrency(selected[s.dataKey])}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : rows?.length && hasSeriesOn ? (
        <p className="m-dash-trend-hint">{tapHint || "Tap the chart for details"}</p>
      ) : null}
    </section>
  );
});

export default DashboardTrendChart;
