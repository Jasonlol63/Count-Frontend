import { isCitibetCaptureType } from "../../lib/dataCaptureFormRules.js";
import { parseCitibetPasteData } from "../core/dataCapturePasteDetect.js";
import { applyDataMatrixToGrid, notifyPasteSuccess } from "../core/dataCapturePasteApply.js";
import { finalizePasteWithOptionalConvert } from "../../grid/dataCaptureGridPasteHistory.js";
import { recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

export function handleCitibetPaste(e, pastedData, anchorCell, captureType, preParsed = null) {
  const parsed = preParsed || parseCitibetPasteData(pastedData, captureType);
  if (!parsed?.dataMatrix?.length) return false;

  const { dataMatrix, maxRows, maxCols, usedMajorParser } = parsed;
  const { successCount } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
    uppercaseValues: true,
    deferUndoCheckpoint: true,
  });

  if (successCount > 0) {
    notifyPasteSuccess(`Successfully pasted ${successCount} cells (${maxRows} rows x ${maxCols} cols)!`);
  } else {
    notifyPasteSuccess("No cells were pasted from Citibet report.", "danger");
  }

  finalizePasteWithOptionalConvert(successCount, {
    runConvert: !usedMajorParser,
    beforeCommit: usedMajorParser ? () => recomputeSubmitStateAfterPaste() : undefined,
  });

  return successCount > 0;
}
