import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { resolveDeleteSelectionBounds } from "../grid/dataCaptureDeleteSelection.js";
import { hideContextMenu } from "../lib/dataCaptureContextMenu.js";
import {
  callDataCaptureRuntime,
  getDataCaptureRuntime,
  registerDataCaptureRuntime,
  unregisterDataCaptureRuntime,
} from "../lib/dataCaptureRuntime.js";

/** Delete row/column/cell dialog — context menu "Delete" opens this React modal. */
export function useDataCaptureDeleteDialog() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOption, setDeleteOption] = useState("shiftLeft");
  const deleteOptionRef = useRef(deleteOption);
  deleteOptionRef.current = deleteOption;
  const deleteSelectionRef = useRef(null);

  const openDeleteDialog = useCallback(() => {
    hideContextMenu();
    const getGrid = getDataCaptureRuntime().getGridModel;
    const grid = typeof getGrid === "function" ? getGrid() : null;
    deleteSelectionRef.current = resolveDeleteSelectionBounds(grid);
    setDeleteOption("shiftLeft");
    setDeleteOpen(true);
  }, []);

  const closeDeleteDialog = useCallback(() => setDeleteOpen(false), []);

  const runConfirmDelete = useCallback(() => {
    const option = deleteOptionRef.current;
    const selection = deleteSelectionRef.current;
    switch (option) {
      case "entireRow":
        callDataCaptureRuntime("deleteRow", selection);
        break;
      case "entireColumn":
        callDataCaptureRuntime("deleteColumn", selection);
        break;
      case "shiftUp":
        callDataCaptureRuntime("shiftSelectedCellsUp", selection);
        break;
      case "shiftLeft":
      default:
        callDataCaptureRuntime("shiftSelectedCellsLeft", selection);
        break;
    }
    deleteSelectionRef.current = null;
    setDeleteOpen(false);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    runConfirmDelete();
  }, [runConfirmDelete]);

  const handlersRef = useRef({});
  handlersRef.current = { openDeleteDialog, closeDeleteDialog, runConfirmDelete };

  useLayoutEffect(() => {
    const api = {
      openDeleteDialog: () => handlersRef.current.openDeleteDialog(),
      closeDeleteDialog: () => handlersRef.current.closeDeleteDialog(),
      showDeleteDialog: () => handlersRef.current.openDeleteDialog(),
      confirmDelete: () => handlersRef.current.runConfirmDelete(),
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, []);

  return {
    deleteOpen,
    deleteOption,
    setDeleteOption,
    handleConfirmDelete,
    closeDeleteDialog,
  };
}
