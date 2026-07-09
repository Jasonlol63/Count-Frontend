import { Link } from "react-router-dom";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import CapturedReferenceTable from "./CapturedReferenceTable.jsx";
import SummaryTableRow from "./SummaryTableRow.jsx";
import {
  computeSummaryTotal,
  formatSummaryTotalDisplay,
  getSummaryTotalColor,
} from "../table/summaryRowData.js";

export default function SummaryTable({
  t,
  tableData,
  rows = [],
  visible = false,
  onRowChange,
  onNewFormula,
  onEditFormula,
  onInlineEditSave,
  onCapturedCellClick,
  globalRateInput = "",
}) {
  if (!visible || !tableData) return null;

  const total = computeSummaryTotal(rows, globalRateInput);
  const totalDisplay = formatSummaryTotalDisplay(total);
  const totalColor = getSummaryTotalColor(total);

  return (
    <>
      <div className="summary-table-x-scroll">
        <table className="summary-table" id="summaryTable">
          <thead>
            <tr>
              <th className="id-product-header">{t("idProduct")}</th>
              <th>{t("account")}</th>
              <th />
              <th>{t("currencyColumn")}</th>
              <th>{t("formula")}</th>
              <th>{t("source")}</th>
              <th>{t("rate")}</th>
              <th>{t("rateValue")}</th>
              <th>{t("processedAmount")}</th>
              <th>{t("skip")}</th>
              <th>{t("delete")}</th>
            </tr>
          </thead>
          <tbody id="summaryTableBody">
            {rows.map((row) => (
              <SummaryTableRow
                key={row.key}
                row={row}
                onRowChange={onRowChange}
                onNewFormula={onNewFormula}
                onEditFormula={onEditFormula}
                onInlineEditSave={onInlineEditSave}
              />
            ))}
          </tbody>
          <tfoot>
            <tr id="summaryTotalRow">
              <td colSpan={8} className="summary-total-label" />
              <td id="summaryTotalAmount" style={{ color: totalColor }}>
                {totalDisplay}
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <CapturedReferenceTable tableData={tableData} onCapturedCellClick={onCapturedCellClick} />
    </>
  );
}

export function SummaryEmptyState({ t }) {
  return (
    <div className="summary-table-container empty-state-container">
      <div className="table-header">
        <span>{t("noCapturedData")}</span>
      </div>
      <div className="empty-state">
        <p>{t("emptyStateHint")}</p>
        <Link to={spaPath("datacapture")} className="btn btn-save">
          {t("goToDataCapture")}
        </Link>
      </div>
    </div>
  );
}
