import { getHistoryRemark, toUpperDisplay, formatRateForHistoryDisplay } from "../lib/transactionFormat.js";
import TransactionHistoryEllipsisCell from "./TransactionHistoryEllipsisCell.jsx";
import TransactionWinLossCell from "./TransactionWinLossCell.jsx";

function HistoryTableColgroup({ showDescriptionColumn }) {
  if (showDescriptionColumn) {
    return (
      <colgroup>
        <col className="transaction-history-col-date" />
        <col className="transaction-history-col-product" />
        <col className="transaction-history-col-currency" />
        <col className="transaction-history-col-rate" />
        <col className="transaction-history-col-winloss" />
        <col className="transaction-history-col-crdr" />
        <col className="transaction-history-col-balance" />
        <col className="transaction-history-col-description" />
        <col className="transaction-history-col-remark" />
        <col className="transaction-history-col-created" />
      </colgroup>
    );
  }

  return (
    <colgroup>
      <col className="transaction-history-col-date" />
      <col className="transaction-history-col-product" />
      <col className="transaction-history-col-currency" />
      <col className="transaction-history-col-rate" />
      <col className="transaction-history-col-winloss" />
      <col className="transaction-history-col-crdr" />
      <col className="transaction-history-col-balance" />
      <col className="transaction-history-col-remark" />
      <col className="transaction-history-col-created" />
    </colgroup>
  );
}

function historyHeadLabel(m, fullKey, compactKey, compactHeaders) {
  if (compactHeaders && m[compactKey]) return m[compactKey];
  return m[fullKey];
}

export default function TransactionHistoryTable({ rows, histMoney, histBalanceMoney, showDescriptionColumn, m, compactHeaders = false }) {
  const balanceMoney = histBalanceMoney || histMoney;
  const tableClass = showDescriptionColumn
    ? "transaction-history-table--with-desc"
    : "transaction-history-table--no-desc";
  const compactClass = compactHeaders ? " transaction-history-report-table--compact-head" : "";

  return (
    <div className="transaction-history-table-frame transaction-history-report-scroll" role="region" aria-label="Payment History">
      <table className={`transaction-table transaction-history-report-table ${tableClass}${compactClass}`}>
        <HistoryTableColgroup showDescriptionColumn={showDescriptionColumn} />
        <thead>
          <tr className="transaction-table-header">
            <th scope="col" className="transaction-history-col-date">
              {historyHeadLabel(m, "date", "date", compactHeaders)}
            </th>
            <th scope="col" className="transaction-history-col-product">
              {historyHeadLabel(m, "idProduct", "idProductCompact", compactHeaders)}
            </th>
            <th scope="col" className="transaction-history-col-currency">
              {historyHeadLabel(m, "currency", "currencyCompact", compactHeaders)}
            </th>
            <th scope="col" className="transaction-history-col-rate">
              {historyHeadLabel(m, "rate", "rate", compactHeaders)}
            </th>
            <th scope="col" className="transaction-history-col-winloss">
              {historyHeadLabel(m, "winLossTable", "winLossTableCompact", compactHeaders)}
            </th>
            <th scope="col" className="transaction-history-col-crdr">
              {historyHeadLabel(m, "crDrTable", "crDrTable", compactHeaders)}
            </th>
            <th scope="col" className="transaction-history-col-balance">
              {historyHeadLabel(m, "balanceTable", "balanceTableCompact", compactHeaders)}
            </th>
            {showDescriptionColumn ? (
              <th scope="col" className="transaction-history-col-description">
                {historyHeadLabel(m, "description", "descriptionCompact", compactHeaders)}
              </th>
            ) : null}
            <th scope="col" className="transaction-history-col-remark">
              {historyHeadLabel(m, "remark", "remark", compactHeaders)}
            </th>
            <th scope="col" className="transaction-history-col-created">
              {historyHeadLabel(m, "createdBy", "createdByCompact", compactHeaders)}
            </th>
          </tr>
        </thead>
        <tbody id="modal_tbody">
          {rows.map((r, idx) => {
            const isBf = r.row_type === "bf";
            const idProductDisplay = r.is_bank_process_transaction ? r.card_owner || "-" : r.product || "-";
            const createdRaw = r.created_by;
            const createdByDisplay =
              createdRaw === null ||
              createdRaw === undefined ||
              String(createdRaw).trim() === "" ||
              String(createdRaw).toLowerCase() === "null"
                ? "-"
                : String(createdRaw);
            return (
              <tr
                key={r.id ?? `${idx}-${r.date || ""}-${r.balance || ""}`}
                className={isBf ? "transaction-bf-row transaction-history-bf-row" : "transaction-table-row"}
              >
                <td className="transaction-history-col-date">
                  <TransactionHistoryEllipsisCell value={r.date || "-"} />
                </td>
                <td className="transaction-history-col-product">
                  <TransactionHistoryEllipsisCell value={idProductDisplay} />
                </td>
                <td className="transaction-history-col-currency">{r.currency || "-"}</td>
                <td className="transaction-history-col-rate">
                  {r.rate && r.rate !== "-" ? formatRateForHistoryDisplay(r.rate) : "-"}
                </td>
                <td className="transaction-history-col-winloss">
                  <TransactionWinLossCell value={r.win_loss} formatMoney={histMoney} />
                </td>
                <td className="transaction-history-col-crdr">
                  <TransactionWinLossCell value={r.cr_dr} formatMoney={histMoney} />
                </td>
                <td className="transaction-history-col-balance">
                  <TransactionWinLossCell value={r.balance} formatMoney={balanceMoney} />
                </td>
                {showDescriptionColumn ? (
                  <td className="transaction-history-col-description text-uppercase">
                    <TransactionHistoryEllipsisCell value={toUpperDisplay(r.description)} />
                  </td>
                ) : null}
                <td className="transaction-history-col-remark text-uppercase">
                  <TransactionHistoryEllipsisCell value={getHistoryRemark(r)} />
                </td>
                <td className="transaction-history-col-created">
                  <TransactionHistoryEllipsisCell value={createdByDisplay} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
