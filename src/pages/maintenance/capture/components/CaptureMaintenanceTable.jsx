import { useEffect, useMemo, useRef } from "react";
import { MAINTENANCE_REPORT_ROW_HEIGHT } from "../../shared/maintenanceReportRowMetrics.js";
import CaptureVirtualRows from "./CaptureVirtualRows.jsx";

const ROW_HEIGHT = MAINTENANCE_REPORT_ROW_HEIGHT;

function isRowDeleted(row) {
  return row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
}



export default function CaptureMaintenanceTable({
  data,
  listEpoch = 0,
  rowKeyCompanyId = null,
  loading,
  listSyncing = false,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  selectAll,
  m,
}) {
  const selectAllRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const rowKeyPrefix = `${String(rowKeyCompanyId ?? "na")}-${listEpoch}`;

  useEffect(() => {
    if (selectAllRef.current) {
      const selectable = data.filter((r) => !isRowDeleted(r));
      const checked = selectable.filter((r) => selectedSet.has(r.capture_id));
      selectAllRef.current.indeterminate = checked.length > 0 && checked.length < selectable.length;
    }
  }, [selectedSet, data]);

  if (!data || data.length === 0) {
    return (
      <div className="empty-state-container" style={{ display: "block" }}>
        <div className="empty-state">
          <p>{(loading || listSyncing) ? m.loading : m.noDataAdjustSearch}</p>
        </div>
      </div>
    );
  }


  return (
    <div
      className={`maintenance-list-container maintenance-virtual-table capture-virtual-table${
        listSyncing ? " maintenance-list-container--syncing" : ""
      }`}
    >
      <div className="maintenance-virtual-table-inner capture-virtual-table-inner" role="table">
        <CaptureVirtualRows
          rows={data}
          rowHeight={ROW_HEIGHT}
          rowKeyPrefix={rowKeyPrefix}
          scrollResetKey={rowKeyPrefix}
          listSyncing={listSyncing}
          selectedSet={selectedSet}
          onToggleRow={toggleSelect}
          alreadyDeletedTitle={m.alreadyDeleted}
          selectAllRef={selectAllRef}
          selectAll={selectAll}
          toggleSelectAll={toggleSelectAll}
          m={m}
          disableSelectAll={false}
        />
      </div>
    </div>
  );
}
