import { memo } from "react";
import MaintenanceCreatedAtDisplay from "../../shared/MaintenanceCreatedAtDisplay.jsx";

function WrapCell({ children, align = "left", className = "", title }) {
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
      title={title}
    >
      <span className="capture-cell-text">{children}</span>
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
      <WrapCell align="left" className="capture-virtual-cell--no" title={String(row.no || index + 1)}>
        {row.no || index + 1}
      </WrapCell>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left maintenance-virtual-cell--mono maintenance-virtual-cell--created-at"
      >
        <MaintenanceCreatedAtDisplay value={row.dts_created} />
      </div>
      <WrapCell align="left" title={row.product || "-"}>
        {row.product || "-"}
      </WrapCell>
      <WrapCell align="left" title={row.process || "-"}>
        {row.process || "-"}
      </WrapCell>
      <WrapCell align="left" className="maintenance-cell-currency" title={row.currency || "-"}>
        {row.currency || "-"}
      </WrapCell>
      <WrapCell align="left" title={row.wl_group || "-"}>
        {row.wl_group || "-"}
      </WrapCell>
      <WrapCell align="left" title={row.submitted_by || "-"}>
        {row.submitted_by || "-"}
      </WrapCell>
      <WrapCell align="left" title={deletedDisplay || "-"}>
        {deletedDisplay}
      </WrapCell>
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
