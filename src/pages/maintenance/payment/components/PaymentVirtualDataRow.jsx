import { memo } from "react";
import {
  formatAmount,
  stripBankProcessDescriptionPrefix,
  isPaymentMaintenanceRowSelectable,
} from "../paymentMaintenanceLogic.js";
import MaintenanceCreatedAtDisplay from "../../shared/MaintenanceCreatedAtDisplay.jsx";
import MaintenanceEllipsisText from "../../shared/MaintenanceEllipsisText.jsx";

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
  const fromDisplay =
    row.from_account && row.from_account !== "-" ? row.from_account : "-";
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
      >
        <MaintenanceEllipsisText value={row.account} />
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left"
      >
        <MaintenanceEllipsisText value={fromDisplay} />
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left maintenance-cell-amount"
      >
        <MaintenanceEllipsisText
          value={`${row.currency || ""} ${formatAmount(row.amount)}`.trim()}
        />
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left payment-virtual-cell--description"
      >
        <MaintenanceEllipsisText value={displayDescription} />
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left"
      >
        <MaintenanceEllipsisText value={row.remark} />
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left"
      >
        <MaintenanceEllipsisText value={row.created_by} />
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left"
      >
        <MaintenanceEllipsisText value={deletedDisplay} />
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
