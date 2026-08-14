import { memo } from "react";
import { formatAmount, toUpperDisplay } from "../bankprocessMaintenanceLogic.js";
import MaintenanceCreatedAtDisplay from "../../shared/MaintenanceCreatedAtDisplay.jsx";
import MaintenanceEllipsisText from "../../shared/MaintenanceEllipsisText.jsx";

const BankprocessVirtualDataRow = memo(function BankprocessVirtualDataRow({
  row,
  index,
  selected,
  onToggleRow,
  alreadyDeletedTitle,
}) {
  const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
  const tid = row.transaction_id;
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";
  const currency = row.currency ? `${row.currency} ` : "";
  const amountDisplay =
    row.amount !== null && row.amount !== undefined && row.amount !== ""
      ? `${currency}${formatAmount(row.amount)}`
      : "-";

  return (
    <div
      role="row"
      className={`maintenance-virtual-data-row bankprocess-virtual-data-row maintenance-row ${stripe}${
        isDeleted ? " maintenance-row-deleted" : ""
      }`}
    >
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left bankprocess-virtual-cell--no">
        {index + 1}
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left maintenance-virtual-cell--mono maintenance-virtual-cell--created-at bankprocess-virtual-cell--created-at"
      >
        <MaintenanceCreatedAtDisplay value={row.dts_created} />
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        <MaintenanceEllipsisText value={row.account} className="bankprocess-cell-text" />
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        <MaintenanceEllipsisText
          value={toUpperDisplay(row.from_account)}
          className="bankprocess-cell-text text-uppercase"
        />
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left maintenance-cell-currency-amount"
      >
        <MaintenanceEllipsisText value={amountDisplay} className="bankprocess-cell-text" />
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left bankprocess-virtual-cell--description text-uppercase"
      >
        <MaintenanceEllipsisText
          value={toUpperDisplay(row.description)}
          className="bankprocess-cell-text text-uppercase"
        />
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left text-uppercase">
        <MaintenanceEllipsisText
          value={toUpperDisplay(row.remark)}
          className="bankprocess-cell-text text-uppercase"
        />
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        <MaintenanceEllipsisText value={row.created_by} className="bankprocess-cell-text" />
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left bankprocess-virtual-cell-checkbox">
        <input
          type="checkbox"
          className="maintenance-row-checkbox"
          checked={selected}
          onChange={() => !isDeleted && onToggleRow(tid)}
          disabled={isDeleted}
          title={isDeleted ? alreadyDeletedTitle : ""}
        />
      </div>
    </div>
  );
});

export default BankprocessVirtualDataRow;
