import { useEffect, useMemo, useRef } from "react";
import { isPaymentMaintenanceRowSelectable } from "../paymentMaintenanceLogic.js";
import PaymentVirtualRows from "./PaymentVirtualRows.jsx";
import { MAINTENANCE_REPORT_ROW_HEIGHT } from "../../shared/maintenanceReportRowMetrics.js";

const ROW_HEIGHT = MAINTENANCE_REPORT_ROW_HEIGHT;



export default function PaymentMaintenanceTable({
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
      const selectable = data.filter(
        (r) =>
          isPaymentMaintenanceRowSelectable(r) &&
          !(r.is_deleted === 1 || r.is_deleted === "1" || r.is_deleted === true),
      );
      const checked = selectable.filter((r) => selectedSet.has(r.transaction_id));
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
      className={`maintenance-list-container maintenance-virtual-table payment-virtual-table${
        listSyncing ? " maintenance-list-container--syncing" : ""
      }`}
    >
      <div className="maintenance-virtual-table-inner payment-virtual-table-inner" role="table">
        <PaymentVirtualRows
          rows={data}
          rowHeight={ROW_HEIGHT}
          rowKeyPrefix={rowKeyPrefix}
          scrollResetKey={rowKeyPrefix}
          listSyncing={listSyncing}
          selectedSet={selectedSet}
          onToggleRow={toggleSelect}
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

