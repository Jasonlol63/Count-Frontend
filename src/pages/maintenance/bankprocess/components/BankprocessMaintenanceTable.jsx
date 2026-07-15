import { useEffect, useMemo, useRef } from "react";
import BankprocessVirtualRows from "./BankprocessVirtualRows.jsx";
import { MAINTENANCE_REPORT_ROW_HEIGHT } from "../../shared/maintenanceReportRowMetrics.js";

const ROW_HEIGHT = MAINTENANCE_REPORT_ROW_HEIGHT;

function isRowDeleted(row) {
  return row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
}

export default function BankprocessMaintenanceTable({
  loading,
  listSyncing = false,
  rows,
  hasSearched,
  listEpoch = 0,
  rowKeyCompanyId = null,
  selectedIds,
  onToggleRow,
  selectAll,
  onToggleSelectAll,
  m,
}) {
  const selectAllRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const rowKeyPrefix = `${String(rowKeyCompanyId ?? "na")}-${listEpoch}`;
  const data = Array.isArray(rows) ? rows : [];

  useEffect(() => {
    if (selectAllRef.current) {
      const selectable = data.filter((r) => !isRowDeleted(r));
      const checked = selectable.filter((r) => selectedSet.has(r.transaction_id));
      selectAllRef.current.indeterminate = checked.length > 0 && checked.length < selectable.length;
    }
  }, [selectedSet, data]);

  if (data.length === 0) {
    if (loading || listSyncing) {
      return (
        <div className="empty-state-container" id="emptyState" style={{ display: "block" }}>
          <div className="empty-state">
            <p>{m.loading}</p>
          </div>
        </div>
      );
    }
    if (hasSearched) {
      return (
        <div className="empty-state-container" id="emptyState" style={{ display: "block" }}>
          <div className="empty-state">
            <p>{m.noDataAdjustSearch}</p>
          </div>
        </div>
      );
    }
    return null;
  }


  return (
    <div
      className={`maintenance-list-container maintenance-virtual-table bankprocess-virtual-table${
        listSyncing ? " maintenance-list-container--syncing" : ""
      }`}
      id="tableContainer"
    >
      <div className="maintenance-virtual-table-inner bankprocess-virtual-table-inner" role="table">
        <BankprocessVirtualRows
          rows={data}
          rowHeight={ROW_HEIGHT}
          rowKeyPrefix={rowKeyPrefix}
          scrollResetKey={rowKeyPrefix}
          listSyncing={listSyncing}
          selectedSet={selectedSet}
          onToggleRow={onToggleRow}
          alreadyDeletedTitle={m.alreadyDeleted}
          selectAllRef={selectAllRef}
          selectAll={selectAll}
          toggleSelectAll={onToggleSelectAll}
          m={m}
          disableSelectAll={false}
        />
      </div>
    </div>
  );
}

