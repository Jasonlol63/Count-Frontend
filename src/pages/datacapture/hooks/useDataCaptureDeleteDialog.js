import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { hideContextMenu } from "../lib/dataCaptureContextMenu.js";
import { callDataCaptureRuntime, registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

/** Delete row/column/cell dialog — context menu "Delete" opens this React modal. */
export function useDataCaptureDeleteDialog() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOption, setDeleteOption] = useState("shiftLeft");
  const deleteOptionRef = useRef(deleteOption);
  deleteOptionRef.current = deleteOption;

  const openDeleteDialog = useCallback(() => {
    hideContextMenu();
    setDeleteOption("shiftLeft");
    setDeleteOpen(true);
  }, []);

  const closeDeleteDialog = useCallback(() => setDeleteOpen(false), []);

  const runConfirmDelete = useCallback(() => {
    const option = deleteOptionRef.current;
    switch (option) {
      case "entireRow":
        callDataCaptureRuntime("deleteRow");
        break;
      case "entireColumn":
        callDataCaptureRuntime("deleteColumn");
        break;
      case "shiftUp":
      case "shiftLeft":
      default:
        callDataCaptureRuntime("clearSelectedCells");
        break;
    }
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
