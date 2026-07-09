/**
 * Facade for paste/grid modules — delegates to `dataCaptureRuntime` (registered by React hooks).
 */
import {
  callDataCaptureRuntime,
  getDataCaptureRuntime,
  getDataCaptureState,
} from "./dataCaptureRuntime.js";
import { pushDataCaptureNotification } from "./dataCaptureNotify.js";

// --- Capture type / format display ---

export function getBridgeCaptureType(defaultType = "1.Text") {
  return callDataCaptureRuntime("getCaptureType") || defaultType;
}

/** @alias getBridgeCaptureType */
export const getActiveCaptureType = getBridgeCaptureType;

export function applyBridgeCaptureType(nextType) {
  callDataCaptureRuntime("applyCaptureType", nextType);
}

/** @alias applyBridgeCaptureType */
export const applyActiveCaptureType = applyBridgeCaptureType;

export function getIsRestoring() {
  return getDataCaptureState().isRestoring === true;
}

export function setBridgeTableActive(active = true) {
  callDataCaptureRuntime("setTableActive", active);
}

export function setBridgeFormatGridReady(ready) {
  callDataCaptureRuntime("setFormatGridReady", ready);
}

/** @alias setBridgeFormatGridReady */
export const setFormatGridReady = setBridgeFormatGridReady;

export function toggleBridgeFormatDisplay() {
  callDataCaptureRuntime("toggleFormatDisplay");
}

/** @alias toggleBridgeFormatDisplay */
export const toggleFormatDisplay = toggleBridgeFormatDisplay;

export function onFormatGridReady(ready) {
  callDataCaptureRuntime("onFormatGridReady", ready);
}

export function processFormatHtml(html, options) {
  return callDataCaptureRuntime("processFormatHtml", html, options);
}

export function parseHtmlFormat(html, options) {
  return callDataCaptureRuntime("parseHtmlFormat", html, options);
}

// --- Grid model (paste pipeline) ---

export function updateBridgeCell(rowIndex, colIndex, patch) {
  callDataCaptureRuntime("updateCell", rowIndex, colIndex, patch);
}

/** @param {Array<{ row: number, col: number }>} positions */
export function clearBridgeCells(positions) {
  callDataCaptureRuntime("clearCellsAt", positions);
}

export function getBridgeCellValue(rowIndex, colIndex) {
  const grid = getPasteGridModel();
  if (!grid) return "";
  return String(grid.cells?.[rowIndex]?.[colIndex]?.value ?? "");
}

export function getPasteGridModel() {
  const fn = getDataCaptureRuntime().getGridModel;
  return typeof fn === "function" ? fn() : null;
}

export function replacePasteGridModel(grid) {
  callDataCaptureRuntime("replaceGrid", grid);
}

export function ensurePasteTableInitialized(rows, cols) {
  callDataCaptureRuntime("initializeTable", rows, cols);
}

export function getFirstSelectedGridCell() {
  return callDataCaptureRuntime("getSelectedCells")?.[0] ?? null;
}

export function recordPasteHistory(changes) {
  if (changes?.length > 0) {
    callDataCaptureRuntime("pushPasteHistory", changes);
  }
}

export function recomputeSubmitStateAfterPaste() {
  callDataCaptureRuntime("recomputeSubmitState");
}

export function runConvertTableOnSubmit(captureType) {
  if (captureType != null && captureType !== "") {
    callDataCaptureRuntime("convertTableOnSubmit", captureType);
  } else {
    callDataCaptureRuntime("convertTableOnSubmit");
  }
}

export function notifyPasteUser(message, level = "success") {
  pushDataCaptureNotification(message, level);
}

export function setTableActiveForPaste() {
  setBridgeTableActive(true);
}

// --- Grid interaction (used by grid/*.js) ---

export function gridClearAllSelections() {
  callDataCaptureRuntime("clearAllSelections");
}

export function gridRegisterSelectedCell(cell) {
  callDataCaptureRuntime("registerSelectedCell", cell);
}

export function gridGetSelectedCells() {
  return callDataCaptureRuntime("getSelectedCells") ?? [];
}

export function gridGetSelectedCellCount() {
  return callDataCaptureRuntime("getSelectedCellCount") ?? 0;
}

export function gridHasPasteHistory() {
  return callDataCaptureRuntime("hasPasteHistory") ?? false;
}

export function gridUndoLastPaste() {
  callDataCaptureRuntime("undoLastPaste");
}

export function gridRecomputeSubmitState() {
  callDataCaptureRuntime("recomputeSubmitState");
}

export function gridAddNewColumn() {
  return callDataCaptureRuntime("addNewColumn") ?? null;
}

export function gridAddNewRow() {
  return callDataCaptureRuntime("addNewRow") ?? null;
}

export function gridSetTableActive(active) {
  callDataCaptureRuntime("setTableActive", active);
}

export function gridHandleCellPaste(event) {
  callDataCaptureRuntime("handleCellPaste", event);
}

export function gridSetActiveCellWithoutFocus(cell) {
  callDataCaptureRuntime("setActiveCellWithoutFocus", cell);
}

export function gridSetActiveCell(cell) {
  callDataCaptureRuntime("setActiveCell", cell);
}

export function gridMoveCaretToEnd(cell) {
  callDataCaptureRuntime("moveCaretToEnd", cell);
}

export function gridGetTableActive() {
  return callDataCaptureRuntime("getTableActive") ?? false;
}

export function gridSetContextMenuColumn(index) {
  callDataCaptureRuntime("setContextMenuColumn", index);
}

export function gridSetContextMenuRow(index) {
  callDataCaptureRuntime("setContextMenuRow", index);
}

export function gridCopySelectedCells() {
  callDataCaptureRuntime("copySelectedCells");
}

export function gridPasteToSelectedCells() {
  callDataCaptureRuntime("pasteToSelectedCells");
}

export function gridClearSelectedCells() {
  callDataCaptureRuntime("clearSelectedCells");
}

export function gridSelectAllCells(e) {
  callDataCaptureRuntime("selectAllCells", e);
}

export function gridMoveCaretToClickPosition(cell, clickEvent) {
  callDataCaptureRuntime("moveCaretToClickPosition", cell, clickEvent);
}

export function gridGetContextMenuColumn() {
  return callDataCaptureRuntime("getContextMenuColumn") ?? null;
}

export function gridGetContextMenuRow() {
  return callDataCaptureRuntime("getContextMenuRow") ?? null;
}
