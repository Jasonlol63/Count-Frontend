import { memo, useMemo } from "react";
import { callDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

function useGridMenuActions() {
  return useMemo(
    () => ({
      copySelectedCells: () => callDataCaptureRuntime("copySelectedCells"),
      pasteToSelectedCells: () => callDataCaptureRuntime("pasteToSelectedCells"),
      clearSelectedCells: () => callDataCaptureRuntime("clearSelectedCells"),
      selectAllCells: (e) => callDataCaptureRuntime("selectAllCells", e),
      showDeleteDialog: (e) => callDataCaptureRuntime("showDeleteDialog", e),
      insertColumnLeft: () => callDataCaptureRuntime("insertColumnLeft"),
      insertColumnRight: () => callDataCaptureRuntime("insertColumnRight"),
      deleteColumn: () => callDataCaptureRuntime("deleteColumn"),
      clearColumn: () => callDataCaptureRuntime("clearColumn"),
      insertRowAbove: () => callDataCaptureRuntime("insertRowAbove"),
      insertRowBelow: () => callDataCaptureRuntime("insertRowBelow"),
      deleteRow: () => callDataCaptureRuntime("deleteRow"),
      clearRow: () => callDataCaptureRuntime("clearRow"),
    }),
    [],
  );
}

function DataCaptureContextMenus({ t }) {
  const actions = useGridMenuActions();

  return (
    <>
      <div id="contextMenu" className="context-menu">
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); actions.copySelectedCells?.(); }}>
          <span>📋 {t("copy")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); actions.pasteToSelectedCells?.(); }}>
          <span>📄 {t("paste")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); actions.clearSelectedCells?.(); }}>
          <span>🗑️ {t("clear")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); actions.showDeleteDialog?.(e); }}>
          <span>🗑️ {t("delete")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => actions.selectAllCells?.(e)}>
          <span>☑️ {t("selectAll")}</span>
        </div>
      </div>

      <div id="columnContextMenu" className="context-menu">
        <div className="context-menu-item" role="presentation" onClick={() => actions.insertColumnLeft?.()}>
          <span>➕ {t("insertColumnLeft")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => actions.insertColumnRight?.()}>
          <span>➕ {t("insertColumnRight")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => actions.deleteColumn?.()}>
          <span>🗑️ {t("deleteColumn")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => actions.clearColumn?.()}>
          <span>❌ {t("clearColumn")}</span>
        </div>
      </div>

      <div id="rowContextMenu" className="context-menu">
        <div className="context-menu-item" role="presentation" onClick={() => actions.insertRowAbove?.()}>
          <span>➕ {t("insertRowAbove")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => actions.insertRowBelow?.()}>
          <span>➕ {t("insertRowBelow")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => actions.deleteRow?.()}>
          <span>🗑️ {t("deleteRow")}</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => actions.clearRow?.()}>
          <span>❌ {t("clearRow")}</span>
        </div>
      </div>
    </>
  );
}

export default memo(DataCaptureContextMenus, (prev, next) => prev.t === next.t);
