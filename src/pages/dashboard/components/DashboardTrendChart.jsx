import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Customized,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardChartBaseline } from "../lib/dashboardChart.jsx";
import {
  DashboardTrendAreaDefs,
  DASHBOARD_TREND_DRAW_DURATION_MS,
  computeTrendYDomain,
  resolveTrendAreaFill,
  zeroTrendChartRows,
} from "../lib/dashboardChartFx.jsx";
import { DASHBOARD_PANEL_ANIM_BEGIN_MS, DASHBOARD_PANEL_ANIM_EASING } from "../lib/dashboardConstants.js";
import { formatChartTooltipLabel } from "../lib/dashboardDateUtils.js";
import { formatCurrency } from "../lib/dashboardFormat.js";

export function DashboardTrendChart({
  i18n,
  chartRows,
  chartSeries,
  chartVisible,
  onToggleSeries,
  chartDateRangeText,
  chartXAxisLayout,
  chartScopeKey = "",
  panelAnimActive = false,
  panelAnimEpoch = 0,
  panelAnimDuration = DASHBOARD_TREND_DRAW_DURATION_MS,
}) {
  const [chartVisitKey] = useState(() => Date.now());
  const [chartReady, setChartReady] = useState(false);
  const [displayRows, setDisplayRows] = useState(null);
  const [drawAnimate, setDrawAnimate] = useState(false);
  const chartRowsRef = useRef(chartRows);
  chartRowsRef.current = chartRows;

  const hasChartData = chartRows.length > 0;
  const chartSessionKey = `${chartVisitKey}-${chartScopeKey || "scope"}-${chartDateRangeText}-${panelAnimEpoch}`;
  const chartRowsDigest = useMemo(
    () =>
      chartRows
        .map(
          (row) =>
            `${row.date}|${row.profit}|${row.expenses}|${row.netProfit}|${row.earnings ?? 0}`
        )
        .join(";"),
    [chartRows]
  );

  const activeDataKeys = useMemo(
    () => chartSeries.filter((s) => chartVisible[s.idx]).map((s) => s.dataKey),
    [chartSeries, chartVisible]
  );

  const yDomain = useMemo(
    () => computeTrendYDomain(chartRows, activeDataKeys),
    [chartRows, activeDataKeys]
  );

  useEffect(() => {
    setChartReady(false);
    setDisplayRows(null);
    setDrawAnimate(false);
  }, [chartSessionKey]);

  useEffect(() => {
    if (!hasChartData || !panelAnimActive) {
      setChartReady(false);
      setDisplayRows(null);
      setDrawAnimate(false);
      return undefined;
    }

    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    const targetRows = chartRowsRef.current;

    setChartReady(true);
    setDisplayRows(zeroTrendChartRows(targetRows));
    setDrawAnimate(false);

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (cancelled) return;
        setDisplayRows(targetRows);
        setDrawAnimate(true);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      setChartReady(false);
      setDisplayRows(null);
      setDrawAnimate(false);
    };
  }, [chartSessionKey, chartScopeKey, hasChartData, panelAnimActive, chartRowsDigest]);

  return (
    <div className="dashboard-panel-card dashboard-panel-card--chart">
      <div className="dashboard-panel-head">
        <h3 className="dashboard-panel-title">{i18n.trendChart}</h3>
        <div className="dashboard-panel-legend" role="group" aria-label={i18n.trendChart}>
          {chartSeries.map((s) => (
            <button
              key={s.dataKey}
              type="button"
              className={`dashboard-legend-item${chartVisible[s.idx] ? " is-on" : ""}`}
              aria-pressed={chartVisible[s.idx]}
              onClick={() => onToggleSeries(s.idx)}
            >
              <span className="dashboard-legend-dot" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="dashboard-panel-period-pill" id="chart-date-range">
          {chartDateRangeText}
        </div>
      </div>
      <div className="dashboard-panel-chart-body">
        {chartReady && displayRows ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              key={chartSessionKey}
              data={displayRows}
              baseValue={0}
              margin={{ top: 8, right: 16, left: 0, bottom: chartXAxisLayout.marginBottom }}
            >
              <DashboardTrendAreaDefs />
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <Customized component={DashboardChartBaseline} />
              <XAxis
                dataKey="label"
                interval={chartXAxisLayout.interval}
                minTickGap={chartXAxisLayout.minTickGap}
                tick={chartXAxisLayout.tick}
                height={chartXAxisLayout.height}
                tickMargin={0}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                tickFormatter={(v) => formatCurrency(v)}
                width={72}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                labelFormatter={(_, items) => {
                  const d = items?.[0]?.payload?.date;
                  return formatChartTooltipLabel(d, i18n.locale);
                }}
              />
              {chartSeries.map((s) => {
                if (!chartVisible[s.idx]) return null;
                const areaFill = resolveTrendAreaFill(s.dataKey) || s.fill;
                return (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.label}
                    stroke={s.color}
                    fill={areaFill}
                    strokeWidth={2}
                    baseValue={0}
                    dot={false}
                    activeDot={{ r: 8, strokeWidth: 2, stroke: s.color, fill: "#fff" }}
                    isAnimationActive={drawAnimate}
                    animationBegin={DASHBOARD_PANEL_ANIM_BEGIN_MS}
                    animationDuration={panelAnimDuration}
                    animationEasing={DASHBOARD_PANEL_ANIM_EASING}
                    className="dashboard-trend-area"
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="dashboard-panel-chart-placeholder" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
