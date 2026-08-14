import {
  formatSummaryProcessCurrency,
  formatSummaryProcessDescriptions,
} from "../lib/summaryTransform.js";

function resolveHeaderCurrency(processData, rows) {
  const fromProcess = formatSummaryProcessCurrency(processData);
  if (fromProcess && fromProcess !== "-") return fromProcess;
  if (!Array.isArray(rows)) return fromProcess;
  for (const row of rows) {
    const text = String(row.currency || "")
      .replace(/[()]/g, "")
      .trim();
    if (text && !/^select\s*curren/i.test(text)) return text;
  }
  return fromProcess;
}

export default function SummaryProcessInfo({ t, processData, rows = [], visible = true }) {
  if (!visible || !processData) return null;
  const currencyDisplay = resolveHeaderCurrency(processData, rows);

  return (
    <div className="process-info-container" id="processInfoContainer">
      <div className="process-info-row">
        <div className="process-info-item">
          <span className="process-info-label">{t("date")}</span>
          <span className="process-info-value" id="processInfoDate">
            {processData.date || "-"}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">{t("process")}</span>
          <span className="process-info-value" id="processInfoProcess">
            {processData.processName || processData.process || "-"}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">{t("description")}</span>
          <span className="process-info-value" id="processInfoDescription">
            {formatSummaryProcessDescriptions(processData)}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">{t("currency")}</span>
          <span className="process-info-value" id="processInfoCurrency">
            {currencyDisplay}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">{t("remark")}</span>
          <span className="process-info-value" id="processInfoRemark">
            {processData.remark || "-"}
          </span>
        </div>
      </div>
    </div>
  );
}
