import { getDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";
import { pushDataCaptureNotification } from "../lib/dataCaptureNotify.js";
import { cloneGrid, gridModelHasEditableData, setCell } from "./gridModel.js";

const MAX_HISTORY_SIZE = 50;

/** @type {Array<{ type: "grid", snapshot: import("./gridModel.js").DataCaptureGridModel } | unknown[]>} */
export const pasteHistory = [];

/** Index of the current grid checkpoint in `pasteHistory`. */
let checkpointCursor = -1;

/** Bumps on undo to cancel in-flight post-paste convert + checkpoint commits. */
let pasteFinalizeGeneration = 0;

function getLiveGridModel() {
  const fn = getDataCaptureRuntime().getGridModel;
  return typeof fn === "function" ? fn() : null;
}

function replaceLiveGridModel(grid) {
  const fn = getDataCaptureRuntime().replaceGrid;
  if (typeof fn === "function") {
    fn(grid);
  }
}

function runLiveConvertTableOnSubmit() {
  const fn = getDataCaptureRuntime().convertTableOnSubmit;
  if (typeof fn === "function") {
    fn();
  }
}

function clearLiveSelections() {
  const fn = getDataCaptureRuntime().clearAllSelections;
  if (typeof fn === "function") {
    fn();
  }
}

function recomputeLiveSubmitState() {
  const fn = getDataCaptureRuntime().recomputeSubmitState;
  if (typeof fn === "function") {
    fn();
  }
}

function notifyUndoUser(message, level = "success") {
  pushDataCaptureNotification(message, level);
}

function isGridSnapshotEntry(entry) {
  return entry?.type === "grid" && entry.snapshot;
}

function truncateForwardCheckpoints() {
  if (checkpointCursor < 0) {
    pasteHistory.length = 0;
    return;
  }
  pasteHistory.length = checkpointCursor + 1;
}

function pushCheckpointSnapshot(snapshot) {
  if (!snapshot) return;
  truncateForwardCheckpoints();
  pasteHistory.push({ type: "grid", snapshot });
  checkpointCursor = pasteHistory.length - 1;
  if (pasteHistory.length > MAX_HISTORY_SIZE) {
    pasteHistory.shift();
    checkpointCursor = pasteHistory.length - 1;
  }
}

/**
 * Reset undo stack. Empty grids do NOT get a baseline — undo never restores blank.
 * @param {import("./gridModel.js").DataCaptureGridModel | null | undefined} grid
 * @param {{ recordBaseline?: boolean | "auto" }} [options]
 */
export function resetPasteUndoCheckpoints(grid, options = {}) {
  const { recordBaseline = "auto" } = options;
  pasteFinalizeGeneration += 1;
  pasteHistory.length = 0;
  checkpointCursor = -1;

  const snapshot = cloneGrid(grid ?? getLiveGridModel());
  if (!snapshot) return;

  const shouldRecord =
    recordBaseline === true
    || (recordBaseline === "auto" && gridModelHasEditableData(snapshot));

  if (shouldRecord) {
    pushCheckpointSnapshot(snapshot);
  }
}

/** Record grid state after a successful mutation (paste, delete, clear, shift, …). */
export function commitPasteGridCheckpoint(grid = getLiveGridModel()) {
  const snapshot = cloneGrid(grid);
  if (!snapshot) return;
  pushCheckpointSnapshot(snapshot);
}

/** @alias commitPasteGridCheckpoint */
export function commitGridUndoCheckpoint(grid = getLiveGridModel()) {
  commitPasteGridCheckpoint(grid);
}

export function pushPasteHistory(entry) {
  if (isGridSnapshotEntry(entry)) {
    pushCheckpointSnapshot(cloneGrid(entry.snapshot));
    return;
  }
  if (Array.isArray(entry) && entry.length > 0) {
    truncateForwardCheckpoints();
    pasteHistory.push(entry);
    checkpointCursor = pasteHistory.length - 1;
    if (pasteHistory.length > MAX_HISTORY_SIZE) {
      pasteHistory.shift();
      checkpointCursor = pasteHistory.length - 1;
    }
  }
}

/** @param {import("./gridModel.js").DataCaptureGridModel | null | undefined} grid */
export function pushPasteGridSnapshot(grid) {
  commitPasteGridCheckpoint(grid);
}

/**
 * Finish paste pipeline: optionally run convert, then commit one undo checkpoint.
 * @param {number} successCount
 * @param {{ runConvert?: boolean, convertDelay?: number, beforeCommit?: () => void }} [options]
 */
export function finalizePasteWithOptionalConvert(successCount, options = {}) {
  if (!(successCount > 0)) return;

  const { runConvert = false, convertDelay = 0, beforeCommit = null } = options;
  const generation = ++pasteFinalizeGeneration;

  const finish = () => {
    if (generation !== pasteFinalizeGeneration) return;
    if (typeof beforeCommit === "function") {
      beforeCommit();
    }
    commitPasteGridCheckpoint();
    recomputeLiveSubmitState();
  };

  if (!runConvert) {
    finish();
    return;
  }

  const run = () => {
    if (generation !== pasteFinalizeGeneration) return;
    runLiveConvertTableOnSubmit();
    finish();
  };

  if (convertDelay > 0) {
    setTimeout(run, convertDelay);
  } else {
    run();
  }
}

export function clearPasteHistory() {
  resetPasteUndoCheckpoints(getLiveGridModel());
}

export function hasPasteHistory() {
  return checkpointCursor > 0;
}

function restoreLegacyCellChanges(lastPaste, grid) {
  let next = grid;
  let undoCount = 0;

  lastPaste.forEach((change) => {
    if (!next.cells?.[change.row]?.[change.col]) return;
    const patch = {
      value: change.oldValue ?? "",
      html: change.oldHtml,
      style: change.oldStyle,
      styleCssText: change.oldStyleCssText,
      className: change.oldClassName,
      colspan: change.oldColspan,
      hidden: change.oldHidden,
    };
    next = setCell(next, change.row, change.col, patch);
    undoCount += 1;
  });

  return { next, undoCount };
}

export function undoLastPaste() {
  pasteFinalizeGeneration += 1;

  if (checkpointCursor <= 0) {
    notifyUndoUser("没有可撤销的操作", "danger");
    return;
  }

  const current = getLiveGridModel();
  if (!current) {
    notifyUndoUser("没有可撤销的操作", "danger");
    return;
  }

  checkpointCursor -= 1;
  const target = pasteHistory[checkpointCursor];

  if (Array.isArray(target)) {
    const { next, undoCount } = restoreLegacyCellChanges(target, current);
    replaceLiveGridModel(next);
    clearLiveSelections();
    recomputeLiveSubmitState();
    notifyUndoUser(`撤销完成：已恢复 ${undoCount} 个单元格`, "success");
    return;
  }

  if (!isGridSnapshotEntry(target)) {
    checkpointCursor += 1;
    notifyUndoUser("没有可撤销的操作", "danger");
    return;
  }

  replaceLiveGridModel(cloneGrid(target.snapshot));
  clearLiveSelections();
  recomputeLiveSubmitState();

  const remaining = checkpointCursor;
  notifyUndoUser(
    remaining > 0
      ? `撤销完成（还可撤销 ${remaining} 步）`
      : "撤销完成：已恢复删除前的数据",
    "success",
  );
}
