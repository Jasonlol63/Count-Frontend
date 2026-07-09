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

  if (loading && data.length === 0) {
    return (
      <div className="maintenance-list-container" id="tableContainer" style={{ display: "block" }}>
        <table className="maintenance-table">
          <thead>
            <tr>
              <th>{m.tblNo}</th>
              <th>{m.tblDtsCreated}</th>
              <th>{m.tblAccount}</th>
              <th>{m.tblFrom}</th>
              <th className="maintenance-header-amount">{m.tblAmount}</th>
              <th>{m.tblDescription}</th>
              <th>{m.tblRemark}</th>
              <th>{m.tblSubmittedBy}</th>
              <th className="maintenance-select-all-header">
                <input type="checkbox" className="maintenance-row-checkbox maintenance-select-all-checkbox" disabled />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="maintenance-table-cell" colSpan="9" style={{ textAlign: "center", padding: "20px" }}>
                {m.loading}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (!loading && hasSearched && data.length === 0) {
    return (
      <div className="empty-state-container" id="emptyState" style={{ display: "block" }}>
        <div className="empty-state">
          <p>{listSyncing ? m.loading : m.noDataAdjustSearch}</p>
        </div>
      </div>
    );
  }

  if (!data.length) return null;

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

