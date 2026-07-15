import { memo } from "react";
import MaintenanceCreatedAtDisplay from "../../shared/MaintenanceCreatedAtDisplay.jsx";
import MaintenanceEllipsisText from "../../shared/MaintenanceEllipsisText.jsx";

function WrapCell({ value, align = "left", className = "" }) {
  const alignClass =
    align === "center"
      ? "maintenance-virtual-cell--center"
      : align === "right"
        ? "maintenance-virtual-cell--right"
        : "maintenance-virtual-cell--left";
  return (
    <div
      role="cell"
      className={`maintenance-virtual-cell ${alignClass} ${className}`}
    >
      <MaintenanceEllipsisText value={value} className="capture-cell-text" />
    </div>
  );
}

const CaptureVirtualDataRow = memo(function CaptureVirtualDataRow({
  row,
  index,
  selected,
  onToggleRow,
  alreadyDeletedTitle,
}) {
  const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
  const deletedBy = row.deleted_by || "";
  const dtsDeleted = row.dts_deleted || "";
  const deletedDisplay =
    isDeleted && deletedBy
      ? deletedBy + " (" + (dtsDeleted || "-") + ")"
      : isDeleted
        ? dtsDeleted || "-"
        : "-";

  const cid = row.capture_id;
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";
  const rowClass =
    "maintenance-virtual-data-row capture-virtual-data-row maintenance-row " +
    stripe +
    (isDeleted ? " maintenance-row-deleted" : "");

  return (
    <div role="row" className={rowClass}>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left capture-virtual-cell--no"
      >
        <span className="capture-cell-text">{row.no || index + 1}</span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left maintenance-virtual-cell--mono maintenance-virtual-cell--created-at"
      >
        <MaintenanceCreatedAtDisplay value={row.dts_created} />
      </div>
      <WrapCell value={row.product} />
      <WrapCell value={row.process} />
      <WrapCell value={row.currency} className="maintenance-cell-currency" />
      <WrapCell value={row.wl_group} />
      <WrapCell value={row.submitted_by} />
      <WrapCell value={deletedDisplay} />
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center capture-virtual-cell-checkbox">
        <span className="maintenance-checkbox-cell-inner">
          <input
            type="checkbox"
            className="maintenance-row-checkbox"
            checked={selected}
            onChange={() => !isDeleted && onToggleRow(cid)}
            disabled={isDeleted}
            title={isDeleted ? alreadyDeletedTitle : ""}
          />
        </span>
      </div>
    </div>
  );
});

export default CaptureVirtualDataRow;
