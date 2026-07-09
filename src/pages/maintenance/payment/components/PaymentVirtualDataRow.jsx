import { memo } from "react";
import {
  formatAmount,
  stripBankProcessDescriptionPrefix,
  isPaymentMaintenanceRowSelectable,
} from "../paymentMaintenanceLogic.js";
import MaintenanceCreatedAtDisplay from "../../shared/MaintenanceCreatedAtDisplay.jsx";

const PaymentVirtualDataRow = memo(function PaymentVirtualDataRow({
  row,
  index,
  selected,
  onToggleRow,
}) {
  const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
  const deletedBy = row.deleted_by || "";
  const dtsDeleted = row.dts_deleted || "";
  const deletedDisplay =
    isDeleted && deletedBy
      ? `${deletedBy} (${dtsDeleted || "-"})`
      : isDeleted
        ? dtsDeleted || "-"
        : "-";

  const rawDescription = row.description || "";
  const displayDescription = stripBankProcessDescriptionPrefix(rawDescription);
  const tid = row.transaction_id;
  const canSelect = isPaymentMaintenanceRowSelectable(row);
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";

  return (
    <div
      role="row"
      className={`maintenance-virtual-data-row payment-virtual-data-row maintenance-row ${stripe}${
        isDeleted ? " maintenance-row-deleted" : ""
      }`}
    >
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left payment-virtual-cell--no"
        title={String(index + 1)}
      >
        <span className="payment-cell-text">{index + 1}</span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left maintenance-virtual-cell--mono maintenance-virtual-cell--created-at"
      >
        <MaintenanceCreatedAtDisplay value={row.dts_created} />
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left"
        title={row.account || "-"}
      >
        <span className="payment-cell-text">{row.account || "-"}</span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left"
        title={row.from_account && row.from_account !== "-" ? row.from_account : "-"}
      >
        <span className="payment-cell-text">
          {row.from_account && row.from_account !== "-" ? row.from_account : "-"}
        </span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left maintenance-cell-amount"
        title={row.currency && row.amount ? `${row.currency} ${formatAmount(row.amount)}` : "-"}
      >
        <span className="payment-cell-text">
          {row.currency || ""} {formatAmount(row.amount)}
        </span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left payment-virtual-cell--description"
        title={displayDescription || "-"}
      >
        <span className="payment-cell-text">{displayDescription || "-"}</span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left"
        title={row.remark || "-"}
      >
        <span className="payment-cell-text">{row.remark || "-"}</span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left"
        title={row.created_by || "-"}
      >
        <span className="payment-cell-text">{row.created_by || "-"}</span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left"
        title={deletedDisplay || "-"}
      >
        <span className="payment-cell-text">{deletedDisplay}</span>
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left payment-virtual-cell-checkbox">
        <span className="maintenance-checkbox-cell-inner">
          <input
            type="checkbox"
            className="maintenance-row-checkbox"
            checked={selected}
            onChange={() => canSelect && onToggleRow(tid)}
            disabled={isDeleted || !canSelect}
          />
        </span>
      </div>
    </div>
  );
});

export default PaymentVirtualDataRow;
