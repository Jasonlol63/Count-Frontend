import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatFrankfurterUnitRate } from "../../../utils/dashboard/frankfurterRates.js";
import {
  buildCompanyBreakdownPieSlices,
  buildCompanyBreakdownShareByCode,
  companyRowDisplayAmount,
  computeCompanyBreakdownCenterMetrics,
  computeCompanyBreakdownSharePct,
} from "../lib/dashboardCompanyProfit.js";
import {
  buildEarningsPieSlices,
  buildEarningsShareByCode,
  computeCurrencySharePct,
  computePieCenterMetrics,
  computeSectorTooltipPosition,
  getCurrencyColor,
  resolveEarningsPiePaddingAngle,
  resolveEarningsRowDisplayAmounts,
} from "../lib/dashboardEarnings.js";
import { DASHBOARD_EARNINGS_PIE_MIN_ANGLE } from "../lib/dashboardConstants.js";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import { formatCurrency, formatI18nTemplate } from "../lib/dashboardFormat.js";
import { DashboardAnimatedValue } from "./DashboardAnimatedValue.jsx";
import { EarningsPieSectorTooltip } from "./EarningsPieSectorTooltip.jsx";

export function DashboardEarningsSummary({
  i18n,
  currencyCode,
  currencies,
  earningsCurrencyRows,
  useConvertedEarnings,
  earningsBreakdownShowsRate = false,
  summaryPanelLabel,
  summaryEarningsValue,
  summaryConversionNote,
  summaryEarningsLoading,
  earningsPanelStable = true,
  earningsByCurrencyLoading,
  exchangeRates,
  exchangeRatesError,
  exchangeRatesLoading,
  exchangeRateScopeKey = "",
  rateFootnoteText,
  showProfitChartTab = false,
  earningsPanelView = "currency",
  onEarningsPanelViewChange,
  companyBreakdownRows = [],
  companyNetProfitTotal = 0,
}) {
  const isNetProfitCompanyView = showProfitChartTab && earningsPanelView === "netProfit";
  const isCompanyBreakdownView = isNetProfitCompanyView;
  const companyBreakdownView = "netProfit";
  const pieAreaRef = useRef(null);
  const pieShellRef = useRef(null);
  const [pieShellLayout, setPieShellLayout] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [hoveredPieSector, setHoveredPieSector] = useState(null);

  const earningsPieSlices = useMemo(() => {
    if (isCompanyBreakdownView) {
      return buildCompanyBreakdownPieSlices(companyBreakdownRows, companyBreakdownView);
    }
    return buildEarningsPieSlices(earningsCurrencyRows, { useConverted: useConvertedEarnings });
  }, [
    isCompanyBreakdownView,
    companyBreakdownRows,
    companyBreakdownView,
    earningsCurrencyRows,
    useConvertedEarnings,
  ]);

  const earningsShareByCode = useMemo(() => {
    if (isCompanyBreakdownView) {
      return buildCompanyBreakdownShareByCode(companyBreakdownRows, companyBreakdownView);
    }
    return buildEarningsShareByCode(earningsCurrencyRows, currencyCode, {
      useConverted: useConvertedEarnings,
    });
  }, [
    isCompanyBreakdownView,
    companyBreakdownRows,
    companyBreakdownView,
    earningsCurrencyRows,
    currencyCode,
    useConvertedEarnings,
  ]);

  const pieCenterMetrics = useMemo(() => {
    if (isCompanyBreakdownView) {
      return computeCompanyBreakdownCenterMetrics(companyBreakdownRows, companyBreakdownView);
    }
    return computePieCenterMetrics(earningsCurrencyRows, currencyCode, {
      useConverted: useConvertedEarnings,
    });
  }, [
    isCompanyBreakdownView,
    companyBreakdownRows,
    companyBreakdownView,
    earningsCurrencyRows,
    currencyCode,
    useConvertedEarnings,
  ]);

  const currencyPieFillByCode = useMemo(() => {
    const map = {};
    if (isCompanyBreakdownView) {
      companyBreakdownRows.forEach((row, index) => {
        map[row.company_id] = getCurrencyColor(row.company_id, index);
      });
      return map;
    }
    earningsCurrencyRows.forEach((row, index) => {
      map[row.code] = getCurrencyColor(row.code, index);
    });
    return map;
  }, [isCompanyBreakdownView, companyBreakdownRows, earningsCurrencyRows]);

  const piePaddingAngle = useMemo(
    () => resolveEarningsPiePaddingAngle(earningsPieSlices.length),
    [earningsPieSlices.length]
  );

  const summaryPieReady =
    earningsPanelStable && earningsPieSlices.length > 0 && !summaryEarningsLoading;

  /** Unique per page visit so pie enter animation replays when navigating back to Dashboard. */
  const [pieVisitKey] = useState(() => Date.now());
  const [pieFlowIdle, setPieFlowIdle] = useState(false);
  const pieAnimKey = `${pieVisitKey}-${exchangeRateScopeKey || "scope"}-${
    summaryPieReady ? "ready" : "pending"
  }`;

  useEffect(() => {
    if (!summaryPieReady) {
      setPieFlowIdle(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setPieFlowIdle(true), 920);
    return () => window.clearTimeout(timer);
  }, [pieAnimKey, summaryPieReady]);

  const animatedPiePct = useAnimatedNumber(Number(pieCenterMetrics.pct) || 0, {
    duration: 920,
    active: summaryPieReady,
  });

  useEffect(() => {
    setHoveredPieSector(null);
  }, [currencyCode, earningsPanelView]);

  const isRowAmountLoading = useCallback(
    (code) => {
      if (currencies.length <= 1) return summaryEarningsLoading;
      const row = earningsCurrencyRows.find((r) => r.code === code);
      return row?.earnings == null;
    },
    [currencies.length, earningsCurrencyRows, summaryEarningsLoading]
  );

  const isRowRateLoading = useCallback(() => {
    if (currencies.length <= 1) return false;
    return (
      exchangeRatesLoading ||
      (exchangeRateScopeKey && exchangeRates.scopeKey !== exchangeRateScopeKey)
    );
  }, [currencies.length, exchangeRatesLoading, exchangeRates.scopeKey, exchangeRateScopeKey]);

  useLayoutEffect(() => {
    const wrap = pieAreaRef.current;
    const shell = pieShellRef.current;
    if (!wrap || !shell) return undefined;

    const syncLayout = () => {
      setPieShellLayout({
        left: shell.offsetLeft,
        top: shell.offsetTop,
        width: shell.clientWidth,
        height: shell.clientHeight,
      });
    };

    syncLayout();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncLayout) : null;
    observer?.observe(wrap);
    observer?.observe(shell);
    window.addEventListener("resize", syncLayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncLayout);
    };
  }, [summaryPieReady, currencyCode]);

  const handlePieSectorEnter = useCallback(
    (sectorData, index) => {
      const slice = earningsPieSlices[index];
      if (!slice || sectorData?.midAngle == null) return;
      setHoveredPieSector({
        slice,
        cx: sectorData.cx,
        cy: sectorData.cy,
        innerRadius: sectorData.innerRadius,
        outerRadius: sectorData.outerRadius,
        midAngle: sectorData.midAngle,
      });
    },
    [earningsPieSlices]
  );

  const hoveredPieTooltip = useMemo(() => {
    if (!hoveredPieSector || pieShellLayout.width <= 0) return null;
    const pos = computeSectorTooltipPosition(
      hoveredPieSector,
      pieShellLayout.width,
      pieShellLayout.height
    );
    if (!pos) return null;
    const slice = hoveredPieSector.slice;
    let primary = slice?.earnings ?? null;
    let native = slice?.originalEarnings ?? null;
    let sharePct = null;
    let unitRateLabel = null;
    if (isCompanyBreakdownView) {
      const row = companyBreakdownRows.find(
        (r) =>
          (r.group_id
            ? `${r.company_id} · ${r.group_id}`
            : r.company_id) === slice?.code
      );
      primary = row ? companyRowDisplayAmount(row, companyBreakdownView) : primary;
      sharePct = row ? computeCompanyBreakdownSharePct(row, earningsShareByCode) : null;
    } else {
      const row = earningsCurrencyRows.find(
        (r) => String(r.code).toUpperCase() === String(slice?.code || "").toUpperCase()
      );
      const amounts = row
        ? resolveEarningsRowDisplayAmounts(
            row,
            currencyCode,
            exchangeRates.rates,
            useConvertedEarnings
          )
        : { primary: slice?.earnings ?? null, native: slice?.originalEarnings ?? null };
      primary = amounts.primary;
      native = amounts.native;
      sharePct = row ? computeCurrencySharePct(row, earningsShareByCode) : null;
      unitRateLabel = formatFrankfurterUnitRate(slice?.code, currencyCode, exchangeRates.rates);
    }
    return {
      slice,
      displayAmount: primary,
      nativeAmount: native,
      sharePct,
      unitRateLabel,
      left: pos.left + pieShellLayout.left,
      top: pos.top + pieShellLayout.top,
      placeAbove: pos.placeAbove,
      radial: pos.radial,
    };
  }, [
    hoveredPieSector,
    earningsPieSlices,
    earningsCurrencyRows,
    companyBreakdownRows,
    earningsShareByCode,
    isCompanyBreakdownView,
    companyBreakdownView,
    useConvertedEarnings,
    currencyCode,
    exchangeRates.rates,
    pieShellLayout,
  ]);

  const showMultiCurrencyBreakdown = !isCompanyBreakdownView && currencies.length > 1;
  const heroLabel = isNetProfitCompanyView
    ? i18n.netProfitCompanyCaption
    : summaryPanelLabel || i18n.earnings;
  const heroValue = isNetProfitCompanyView ? companyNetProfitTotal : summaryEarningsValue;
  const showPieCenterBadge = isCompanyBreakdownView
    ? companyBreakdownRows.length > 0
    : showMultiCurrencyBreakdown;

  const summaryHero = (
    <div className="dashboard-summary-hero dashboard-summary-hero--compact">
      <span className="dashboard-summary-hero-caption">
        {heroLabel}
        {currencyCode ? ` · ${currencyCode}` : ""}
      </span>
      <div className="dashboard-summary-hero-value">
        <DashboardAnimatedValue
          value={heroValue}
          active={!summaryEarningsLoading}
          className="dashboard-summary-hero-value-anim"
        />
      </div>
      {!isCompanyBreakdownView && summaryConversionNote && (
        <span className="dashboard-summary-hero-conversion-note">{summaryConversionNote}</span>
      )}
    </div>
  );

  const summaryViewTabs = showProfitChartTab ? (
    <div className="dashboard-summary-view-tabs" role="tablist" aria-label={i18n.statistics}>
      <button
        type="button"
        role="tab"
        aria-selected={earningsPanelView === "currency"}
        className={`dashboard-summary-view-tab${
          earningsPanelView === "currency" ? " is-active" : ""
        }`}
        onClick={() => onEarningsPanelViewChange?.("currency")}
      >
        {i18n.earningsChartTab}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={earningsPanelView === "netProfit"}
        className={`dashboard-summary-view-tab${
          earningsPanelView === "netProfit" ? " is-active" : ""
        }`}
        onClick={() => onEarningsPanelViewChange?.("netProfit")}
      >
        {i18n.netProfitChartTab}
      </button>
    </div>
  ) : null;

  return (
    <div
      className={`dashboard-panel-card dashboard-panel-card--summary${
        showProfitChartTab ? " dashboard-panel-card--summary-has-tabs" : ""
      }`}
    >
      <div className="dashboard-summary-layout">
        <div className="dashboard-summary-top-row">
          {summaryViewTabs}
          {summaryHero}
          <div
            ref={pieAreaRef}
            className={`dashboard-summary-pie-wrap${pieFlowIdle ? " is-flow-idle" : ""}`}
            aria-hidden={!earningsPanelStable && !earningsPieSlices.length}
            onMouseLeave={() => setHoveredPieSector(null)}
          >
            <div
              ref={pieShellRef}
              className={`dashboard-summary-pie-chart-shell${
                summaryPieReady ? " is-enter is-flow-active" : ""
              }`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Pie
                    key={pieAnimKey}
                    data={
                      earningsPieSlices.length
                        ? earningsPieSlices
                        : [{ code: "—", earnings: 0, value: 1, fill: "#e0e7ff" }]
                    }
                    dataKey="value"
                    nameKey="code"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="84%"
                    paddingAngle={piePaddingAngle}
                    minAngle={DASHBOARD_EARNINGS_PIE_MIN_ANGLE}
                    stroke="#fff"
                    strokeWidth={2}
                    label={false}
                    activeShape={false}
                    isAnimationActive={summaryPieReady}
                    animationBegin={80}
                    animationDuration={920}
                    animationEasing="ease-out"
                    onMouseEnter={handlePieSectorEnter}
                    onMouseLeave={() => setHoveredPieSector(null)}
                  >
                    {(earningsPieSlices.length ? earningsPieSlices : [{ fill: "#e0e7ff" }]).map(
                      (entry, index) => (
                        <Cell key={entry.code || index} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                      )
                    )}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {!summaryEarningsLoading &&
                earningsPanelStable &&
                earningsPieSlices.length > 0 &&
                !hoveredPieTooltip &&
                showPieCenterBadge && (
                <div
                  key={pieAnimKey}
                  className={`dashboard-summary-pie-center${summaryPieReady ? " is-enter" : ""}`}
                  aria-hidden="true"
                >
                  <span className="dashboard-summary-pie-center-pct">{animatedPiePct.toFixed(1)}%</span>
                  <span className="dashboard-summary-pie-center-code">{pieCenterMetrics.code}</span>
                  <span className="dashboard-summary-pie-center-caption">{i18n.shareOfTotal}</span>
                </div>
              )}
            </div>
            {hoveredPieTooltip && (
              <div
                className={`dashboard-summary-pie-tooltip-anchor${
                  hoveredPieTooltip.radial ? " is-radial" : hoveredPieTooltip.placeAbove ? "" : " is-below"
                }`}
                style={{
                  left: hoveredPieTooltip.left,
                  top: hoveredPieTooltip.top,
                }}
              >
                <EarningsPieSectorTooltip
                  slice={hoveredPieTooltip.slice}
                  displayAmount={hoveredPieTooltip.displayAmount}
                  nativeAmount={hoveredPieTooltip.nativeAmount}
                  sharePct={hoveredPieTooltip.sharePct}
                  unitRateLabel={hoveredPieTooltip.unitRateLabel}
                  baseCode={currencyCode}
                  rateOneUnitTemplate={i18n.rateOneUnit}
                  nativeAmountTemplate={i18n.nativeAmountIn}
                  placeAbove={hoveredPieTooltip.placeAbove}
                />
              </div>
            )}
          </div>
        </div>
        <div
          className={`dashboard-summary-currency-list${
            showMultiCurrencyBreakdown ? " is-multi-currency" : ""
          }${earningsBreakdownShowsRate ? " is-with-original" : ""}${
            isCompanyBreakdownView ? " is-company-profit" : ""
          }`}
          aria-label={isCompanyBreakdownView ? i18n.companyBreakdown : i18n.currencyBreakdown}
        >
          <div className="dashboard-summary-currency-list-head" aria-hidden="true">
            {isCompanyBreakdownView ? (
              <>
                <span>{i18n.breakdownCompany}</span>
                <span>
                  {currencyCode
                    ? `${i18n.breakdownAmount} (${currencyCode})`
                    : i18n.breakdownAmount}
                </span>
                <span>{i18n.breakdownShare}</span>
              </>
            ) : (
              <>
                <span>{i18n.breakdownCurrency}</span>
                <span>
                  {showMultiCurrencyBreakdown && currencyCode
                    ? `${i18n.breakdownAmount} (${currencyCode})`
                    : i18n.breakdownAmount}
                </span>
                {earningsBreakdownShowsRate && (
                  <span>{i18n.breakdownOriginalAmount}</span>
                )}
                <span>{earningsBreakdownShowsRate ? i18n.breakdownRate : i18n.breakdownShare}</span>
              </>
            )}
          </div>
          <div className="dashboard-summary-currency-list-body" role="list">
            {isCompanyBreakdownView &&
              companyBreakdownRows.map((row, index) => {
                const sharePct = computeCompanyBreakdownSharePct(row, earningsShareByCode);
                const rowAmount = companyRowDisplayAmount(row, companyBreakdownView);
                const rowKey = `${row.group_id || ""}:${row.company_pk ?? row.company_id}`;
                return (
                  <div
                    key={rowKey}
                    role="listitem"
                    className="dashboard-summary-currency-row"
                    style={{
                      "--currency-accent":
                        currencyPieFillByCode[row.company_id] ||
                        getCurrencyColor(row.company_id, index),
                    }}
                  >
                    <div className="dashboard-summary-currency-label">
                      <span
                        className="dashboard-summary-currency-dot"
                        style={{
                          backgroundColor:
                            currencyPieFillByCode[row.company_id] ||
                            getCurrencyColor(row.company_id, index),
                        }}
                        aria-hidden="true"
                      />
                      <span className="dashboard-summary-currency-code-wrap">
                        <span className="dashboard-summary-currency-code">{row.company_id}</span>
                        {row.group_id && (
                          <span className="dashboard-summary-company-group">{row.group_id}</span>
                        )}
                      </span>
                    </div>
                    <div className="dashboard-summary-currency-amount-col">
                      <span className="dashboard-summary-currency-amount">
                        {summaryEarningsLoading ? "…" : formatCurrency(rowAmount)}
                      </span>
                    </div>
                    <span className="dashboard-summary-currency-rate">
                      {sharePct != null ? `${sharePct.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                );
              })}
            {!isCompanyBreakdownView &&
              earningsCurrencyRows.map((row, index) => {
              const rowAmountLoading = isRowAmountLoading(row.code);
              const rowRateLoading = isRowRateLoading();
              const { primary, native } = resolveEarningsRowDisplayAmounts(
                row,
                currencyCode,
                exchangeRates.rates,
                useConvertedEarnings
              );
              const unitRateLabel = earningsBreakdownShowsRate
                ? formatFrankfurterUnitRate(row.code, currencyCode, exchangeRates.rates)
                : null;
              const unitRateTitle =
                unitRateLabel && unitRateLabel !== "—"
                  ? formatI18nTemplate(i18n.rateOneUnit, {
                      from: row.code,
                      rate: unitRateLabel,
                      base: currencyCode,
                    })
                  : undefined;
              const showOriginalAmount =
                earningsBreakdownShowsRate &&
                useConvertedEarnings &&
                String(row.code).toUpperCase() !== String(currencyCode).toUpperCase();
              return (
                <div
                  key={row.code}
                  role="listitem"
                  className={`dashboard-summary-currency-row${row.code === currencyCode ? " is-active" : ""}`}
                  style={
                    row.code === currencyCode
                      ? {
                          "--currency-accent":
                            currencyPieFillByCode[row.code] || getCurrencyColor(row.code, index),
                        }
                      : undefined
                  }
                >
                  <div className="dashboard-summary-currency-label">
                    <span
                      className="dashboard-summary-currency-dot"
                      style={{
                        backgroundColor: currencyPieFillByCode[row.code] || getCurrencyColor(row.code, index),
                      }}
                      aria-hidden="true"
                    />
                    <span className="dashboard-summary-currency-code">{row.code}</span>
                  </div>
                  <div className="dashboard-summary-currency-amount-col">
                    <span className="dashboard-summary-currency-amount">
                      {rowAmountLoading
                        ? "…"
                        : primary != null
                          ? formatCurrency(primary)
                          : "—"}
                    </span>
                  </div>
                  {earningsBreakdownShowsRate && (
                    <div className="dashboard-summary-currency-original-col">
                      <span className="dashboard-summary-currency-original">
                        {rowAmountLoading
                          ? "…"
                          : showOriginalAmount && native != null
                            ? formatCurrency(native)
                            : "—"}
                      </span>
                    </div>
                  )}
                  <span className="dashboard-summary-currency-rate" title={unitRateTitle}>
                    {rowRateLoading
                      ? "…"
                      : earningsBreakdownShowsRate
                        ? unitRateLabel && unitRateLabel !== "—"
                          ? unitRateLabel
                          : "—"
                        : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!isCompanyBreakdownView && showMultiCurrencyBreakdown && rateFootnoteText && (
        <p
          className={`dashboard-summary-rate-footnote${
            exchangeRatesError || exchangeRates.unsupported?.length ? " is-warn" : ""
          }${exchangeRatesLoading ? " is-muted" : ""}`}
        >
          {rateFootnoteText}
        </p>
      )}
    </div>
  );
}
