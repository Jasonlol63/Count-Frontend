import { useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  pickMaintenanceVirtualOverscan,
  useMaintenanceTableScrollExtent,
  useMaintenanceVirtualScrollReset,
} from "../../shared/maintenanceVirtualScroll.js";
import { formatAmount } from "../transactionMaintenanceLogic.js";
import MaintenanceCreatedAtDisplay from "../../shared/MaintenanceCreatedAtDisplay.jsx";
import { MAINTENANCE_REPORT_ROW_HEIGHT } from "../../shared/maintenanceReportRowMetrics.js";
import { measureMaintenanceVirtualRow } from "../../shared/measureMaintenanceVirtualRow.js";

const ROW_HEIGHT = MAINTENANCE_REPORT_ROW_HEIGHT;

const HEADER_LABELS = (m) => [
  m.tblNo,
  m.tblCreatedAt,
  m.tblProcess,
  m.tblIdProduct,
  m.tblAccount,
  m.tblDescription,
  m.tblRemark,
  m.tblPercent,
  m.tblCurrency,
  m.tblRate,
  m.tblCr,
  m.tblDr,
  m.tblSubmitter,
];

function VirtualTableHeader({ m }) {
  return (
    <div className="maintenance-virtual-thead" role="rowgroup">
      <div className="maintenance-virtual-head-row transaction-virtual-head-row" role="row">
        {HEADER_LABELS(m).map((label, i) => (
          <div
            key={label}
            role="columnheader"
            className={`maintenance-virtual-th transaction-virtual-th--left${i === 0 ? " transaction-virtual-th--no" : ""}`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopLoadingBar({ label }) {
  return (
    <div className="maintenance-virtual-stale-hint" role="status" aria-live="polite">
      {label}
    </div>
  );
}

function WrapCell({ children, className = "", title }) {
  return (
    <div
      role="cell"
      className={`maintenance-virtual-cell maintenance-virtual-cell--left transaction-virtual-cell--wrap ${className}`}
      title={title}
    >
      <span className="transaction-cell-clamp-2">{children}</span>
    </div>
  );
}

function VirtualDataRow({ row, index }) {
  const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";
  return (
    <div
      role="row"
      className={`maintenance-virtual-data-row transaction-virtual-data-row maintenance-row ${stripe}${
        isDeleted ? " maintenance-row-deleted" : ""
      }`}
    >
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left transaction-virtual-cell--no">
        {row.no || index + 1}
      </div>
      <WrapCell className="maintenance-virtual-cell--mono maintenance-virtual-cell--created-at">
        <MaintenanceCreatedAtDisplay value={row.dts_created} />
      </WrapCell>
      <WrapCell title={row.process || "-"}>{row.process || "-"}</WrapCell>
      <WrapCell title={row.id_product || "-"}>{row.id_product || "-"}</WrapCell>
      <WrapCell title={row.account || "-"}>{row.account || "-"}</WrapCell>
      <WrapCell title={row.description || "-"}>{row.description || "-"}</WrapCell>
      <WrapCell title={row.remark || "-"}>{row.remark || "-"}</WrapCell>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left" title={row.percent || "-"}>
        {row.percent || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-cell-currency maintenance-virtual-cell--left" title={row.currency || "-"}>
        {row.currency || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left" title={row.rate || "-"}>
        {row.rate || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left" title={formatAmount(row.cr)}>
        {formatAmount(row.cr)}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left" title={formatAmount(row.dr)}>
        {formatAmount(row.dr)}
      </div>
      <WrapCell title={row.created_by || "-"}>{row.created_by || "-"}</WrapCell>
    </div>
  );
}

/**
 * @param {object} props
 * @param {Array} props.data
 * @param {boolean} props.showSkeleton
 * @param {boolean} props.showEmptyState
 * @param {string} props.statusMessage
 * @param {boolean} props.listSyncing
 * @param {boolean} props.dataIncomplete
 * @param {string} props.scrollResetKey
 * @param {object} props.m
 */
export default function TransactionMaintenanceTable({
  data,
  showSkeleton,
  showEmptyState = false,
  statusMessage = "",
  showTopLoading = false,
  topLoadingLabel = "",
  listSyncing = false,
  dataIncomplete = false,
  scrollResetKey = "",
  m,
}) {
  const scrollRef = useRef(null);
  const sizeCacheRef = useRef(new Map());
  const rows = Array.isArray(data) ? data : [];

  const getItemKey = useCallback(
    (index) => {
      const row = rows[index];
      const tid = row?.transaction_id;
      return tid != null ? tid : index;
    },
    [rows],
  );

  const measureElement = useCallback((el) => {
    if (!el) return ROW_HEIGHT;
    const idx = Number(el.dataset?.index);
    const h = measureMaintenanceVirtualRow(el, ROW_HEIGHT, ".transaction-virtual-data-row");
    if (Number.isFinite(idx)) {
      sizeCacheRef.current.set(idx, h);
    }
    return h;
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => sizeCacheRef.current.get(index) ?? ROW_HEIGHT,
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
    rowHeightEstimate: ROW_HEIGHT,
    scrollResetKey,
    listSyncing,
    dataIncomplete,
  });

  if (rows.length === 0 && (showSkeleton || statusMessage)) {
    const label = statusMessage || m.loading;
    return (
      <div className="maintenance-list-container maintenance-virtual-table transaction-virtual-table">
        <div className="maintenance-virtual-table-inner transaction-virtual-table-inner" role="table" aria-label={m.pageTitleTransaction}>
          <TopLoadingBar label={label} />
          <div className="maintenance-virtual-scroll" tabIndex={0}>
            <VirtualTableHeader m={m} />
            <div className="maintenance-virtual-empty-loading" aria-hidden />
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0 && showEmptyState && !showSkeleton) {
    return (
      <div className="empty-state-container" style={{ display: "block" }}>
        <div className="empty-state">
          <p>{m.noDataAdjustSearch}</p>
        </div>
      </div>
    );
  }

  const showBlueBar = Boolean(showTopLoading);
  const topLabel = topLoadingLabel || m.loading;

  return (
    <div
      className={`maintenance-list-container maintenance-virtual-table transaction-virtual-table${
        listSyncing ? " maintenance-list-container--syncing" : ""
      }`}
    >
      <div className="maintenance-virtual-table-inner transaction-virtual-table-inner" role="table" aria-label={m.pageTitleTransaction}>
        {showBlueBar ? <TopLoadingBar label={topLabel} /> : null}
        <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
          <VirtualTableHeader m={m} />
          {rows.length > 0 ? (
            <div className="maintenance-virtual-spacer" style={{ height: displayTotalH, position: "relative", width: "100%" }}>
              {vItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    className="maintenance-virtual-row-wrap"
                    data-index={virtualRow.index}
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
                    <VirtualDataRow row={row} index={virtualRow.index} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="maintenance-virtual-empty-loading" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
