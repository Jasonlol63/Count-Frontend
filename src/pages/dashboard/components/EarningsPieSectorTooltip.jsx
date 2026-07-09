import { formatCurrency, formatI18nTemplate } from "../lib/dashboardFormat.js";

export function EarningsPieSectorTooltip({
  slice,
  displayAmount,
  nativeAmount,
  sharePct,
  unitRateLabel,
  baseCode,
  rateOneUnitTemplate,
  nativeAmountTemplate,
  placeAbove = true,
}) {
  if (!slice?.code) return null;
  const showNative =
    nativeAmount != null &&
    String(slice.code).toUpperCase() !== String(baseCode || "").toUpperCase();
  const showShare = sharePct != null;
  const showRate = !showShare && unitRateLabel && unitRateLabel !== "—";

  return (
    <div className={`dashboard-summary-pie-tooltip-stack${placeAbove ? "" : " is-below"}`}>
      <div className="dashboard-summary-pie-tooltip dashboard-summary-pie-tooltip--sector">
        <div className="dashboard-summary-pie-tooltip-label">{slice.code}</div>
        <div className="dashboard-summary-pie-tooltip-value">
          {displayAmount != null ? formatCurrency(displayAmount) : "—"}
        </div>
        {showNative && (
          <div className="dashboard-summary-pie-tooltip-converted">
            {formatI18nTemplate(nativeAmountTemplate, {
              amount: formatCurrency(nativeAmount),
              code: slice.code,
            })}
          </div>
        )}
        {showShare && (
          <div className="dashboard-summary-pie-tooltip-pct">{sharePct.toFixed(1)}%</div>
        )}
        {showRate && (
          <div className="dashboard-summary-pie-tooltip-pct">
            {formatI18nTemplate(rateOneUnitTemplate, {
              from: slice.code,
              rate: unitRateLabel,
              base: baseCode,
            })}
          </div>
        )}
      </div>
      <div className="dashboard-summary-pie-tooltip-arrow" aria-hidden="true" />
    </div>
  );
}
