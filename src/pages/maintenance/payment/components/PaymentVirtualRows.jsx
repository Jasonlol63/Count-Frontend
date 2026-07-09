import { useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { measureMaintenanceVirtualRow } from "../../shared/measureMaintenanceVirtualRow.js";
import {
  pickMaintenanceVirtualOverscan,
  useMaintenanceTableScrollExtent,
  useMaintenanceVirtualScrollReset,
} from "../../shared/maintenanceVirtualScroll.js";
import PaymentVirtualDataRow from "./PaymentVirtualDataRow.jsx";
import { isPaymentMaintenanceRowSelectable } from "../paymentMaintenanceLogic.js";

function PaymentVirtualTableHead({ selectAllRef, selectAll, toggleSelectAll, m, disableSelectAll }) {
  const labels = [
    m.tblNo,
    m.tblCreatedAt,
    m.tblAccountTo,
    m.tblAccountFrom,
    m.tblAmount,
    m.tblDescription,
    m.tblRemark,
    m.tblSubmitter,
    m.tblDeleter,
  ];

  return (
    <div className="maintenance-virtual-thead" role="rowgroup">
      <div className="maintenance-virtual-head-row payment-virtual-head-row" role="row">
        {labels.map((label, i) => (
            <div
              key={label}
              role="columnheader"
              className={`maintenance-virtual-th payment-virtual-th--left${i === 4 ? " maintenance-header-amount" : ""}`}
            >
              {label}
            </div>
          ))}
        <div
          role="columnheader"
          className="maintenance-virtual-th payment-virtual-th-checkbox maintenance-select-all-header"
        >
          <span className="maintenance-checkbox-cell-inner">
            <input
              type="checkbox"
              id={disableSelectAll ? undefined : "select_all_payment"}
              ref={disableSelectAll ? undefined : selectAllRef}
              className="maintenance-row-checkbox"
              checked={selectAll}
              onChange={toggleSelectAll}
              title={m.selectAll}
              disabled={disableSelectAll}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PaymentVirtualRows({
  rows,
  rowHeight,
  rowKeyPrefix,
  scrollResetKey = "",
  listSyncing = false,
  selectedSet,
  onToggleRow,
  selectAllRef,
  selectAll,
  toggleSelectAll,
  m,
  disableSelectAll,
}) {
  const scrollRef = useRef(null);
  const sizeCacheRef = useRef(new Map());

  const getItemKey = useCallback(
    (index) => {
      const row = rows[index];
      const tid = row?.transaction_id;
      if (tid != null && rowKeyPrefix) return `${rowKeyPrefix}-${tid}`;
      return tid != null ? tid : index;
    },
    [rows, rowKeyPrefix],
  );

  const measureElement = useCallback(
    (el) => {
      if (!el) return rowHeight;
      const idx = Number(el.dataset?.index);
      const h = measureMaintenanceVirtualRow(el, rowHeight, ".payment-virtual-data-row");
      if (Number.isFinite(idx)) {
        sizeCacheRef.current.set(idx, h);
      }
      return h;
    },
    [rowHeight],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => sizeCacheRef.current.get(index) ?? rowHeight,
    overscan: pickMaintenanceVirtualOverscan(rows.length),
    getItemKey,
    measureElement,
  });

  useMaintenanceVirtualScrollReset({
    scrollRef,
    scrollResetKey,
    rowVirtualizer,
    sizeCacheRef,
  });

  const vItems = rowVirtualizer.getVirtualItems();
  const totalH = rowVirtualizer.getTotalSize();
  const { displayTotalH, cyclicRowOffset } = useMaintenanceTableScrollExtent({
    scrollRef,
    actualTotalH: totalH,
    rowCount: rows.length,
    rowHeightEstimate: rowHeight,
    scrollResetKey,
    listSyncing,
  });

  return (
    <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
      <PaymentVirtualTableHead
        selectAllRef={selectAllRef}
        selectAll={selectAll}
        toggleSelectAll={toggleSelectAll}
        m={m}
        disableSelectAll={disableSelectAll}
      />
      <div className="maintenance-virtual-spacer" style={{ height: displayTotalH, position: "relative", width: "100%" }}>
        {vItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const tid = row.transaction_id;
          const canSelect = isPaymentMaintenanceRowSelectable(row);
          const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="maintenance-virtual-row-wrap"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                minHeight: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start - cyclicRowOffset}px)`,
              }}
            >
              <PaymentVirtualDataRow
                row={row}
                index={virtualRow.index}
                selected={canSelect && !isDeleted && selectedSet.has(tid)}
                onToggleRow={onToggleRow}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
