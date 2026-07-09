import { useLayoutEffect } from "react";
import {
  handleCellClick,
  handleCellKeydown,
  moveCaretToClickPosition,
  moveCaretToEnd,
  setActiveCell,
  setActiveCellCore,
  setActiveCellWithoutFocus,
} from "../grid/gridCellInteraction.js";
import {
  hideContextMenu,
  showColumnContextMenu,
  showContextMenu,
  showRowContextMenu,
  updateActiveContextMenuPosition,
  getContextMenuColumnIndex,
  getContextMenuRowIndex,
  setContextMenuColumn,
  setContextMenuRow,
} from "../lib/dataCaptureContextMenu.js";
import {
  clearAllSelections,
  clearSelectedCells,
  copySelectedCells,
  getSelectedCellCount,
  getSelectedCells,
  pasteToSelectedCells,
  registerSelectedCell,
  selectAllCells,
} from "../grid/dataCaptureGridSelection.js";
import {
  handleCellMouseDown,
  handleCellMouseOver,
  handleColumnHeaderClick,
  handleColumnHeaderMousedown,
  handleColumnHeaderMouseover,
  handleMouseUp,
  handleRowHeaderClick,
  handleRowHeaderMousedown,
  handleRowHeaderMouseover,
  selectColumn,
} from "../grid/dataCaptureGridMouseSelection.js";
import { setTableActive, isTableActive } from "../grid/dataCaptureGridMeta.js";
import {
  clearPasteHistory,
  hasPasteHistory,
  pushPasteHistory,
  undoLastPaste,
} from "../grid/dataCaptureGridPasteHistory.js";
import { registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

function attachColumnHeaderListeners(header) {
  if (!header) return;
  header.style.cursor = "pointer";
}

function attachRowHeaderListeners(rowHeader) {
  if (!rowHeader) return;
  rowHeader.style.cursor = "pointer";
}

/** Runtime bridges for paste, selection, clipboard, context menus, and header attach. */
export function useDataCaptureGridWindowBridges() {
  useLayoutEffect(() => {
    const api = {
      attachColumnHeader: attachColumnHeaderListeners,
      attachRowHeader: attachRowHeaderListeners,
      clearAllSelections,
      registerSelectedCell,
      getSelectedCells,
      getSelectedCellCount,
      copySelectedCells,
      pasteToSelectedCells,
      clearSelectedCells,
      selectAllCells,
      setTableActive,
      getTableActive: isTableActive,
      pushPasteHistory,
      clearPasteHistory,
      hasPasteHistory,
      undoLastPaste,
      handleCellMousedown: handleCellMouseDown,
      handleCellMouseover: handleCellMouseOver,
      handleMouseUp,
      handleColumnHeaderMousedown,
      handleColumnHeaderMouseover,
      handleColumnHeaderClick,
      handleRowHeaderMousedown,
      handleRowHeaderMouseover,
      handleRowHeaderClick,
      selectColumn,
      setActiveCell,
      setActiveCellCore,
      setActiveCellWithoutFocus,
      moveCaretToEnd,
      moveCaretToClickPosition,
      handleCellClick,
      handleCellKeydown,
      showContextMenu,
      showColumnContextMenu,
      showRowContextMenu,
      hideContextMenu,
      updateContextMenuPosition: updateActiveContextMenuPosition,
      setContextMenuColumn,
      getContextMenuColumn: getContextMenuColumnIndex,
      setContextMenuRow,
      getContextMenuRow: getContextMenuRowIndex,
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, []);
}
