import { memo } from "react";
import { formatAmount, toUpperDisplay } from "../bankprocessMaintenanceLogic.js";
import MaintenanceCreatedAtDisplay from "../../shared/MaintenanceCreatedAtDisplay.jsx";

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
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left bankprocess-virtual-cell--wrap">
        <span className="bankprocess-cell-clamp-2">{row.account || "-"}</span>
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left bankprocess-virtual-cell--wrap">
        <span className="bankprocess-cell-clamp-2">{toUpperDisplay(row.from_account)}</span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left maintenance-cell-currency-amount"
      >
        {amountDisplay}
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left bankprocess-virtual-cell--wrap bankprocess-virtual-cell--description text-uppercase"
      >
        <span className="bankprocess-cell-clamp-2">{toUpperDisplay(row.description)}</span>
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left bankprocess-virtual-cell--wrap text-uppercase">
        <span className="bankprocess-cell-clamp-2">{toUpperDisplay(row.remark)}</span>
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left bankprocess-virtual-cell--wrap">
        <span className="bankprocess-cell-clamp-2">{row.created_by || "-"}</span>
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


