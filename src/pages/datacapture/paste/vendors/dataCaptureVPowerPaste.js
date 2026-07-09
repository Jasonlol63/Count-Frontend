/** VPOWER paste. */
import { parseVPowerTableFormat } from "./dataCaptureVPowerParser.js";



import { applyParsedMatrixToGrid } from "../core/dataCapturePasteApply.js";
import { recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

/** @returns {boolean} */
export function handleVPowerPaste(e, pastedData) {
        console.log('VPOWER mode detected, attempting to parse...');
        console.log('Pasted data:', pastedData.substring(0, 200));
        let vpowerParsed = parseVPowerTableFormat(pastedData);
        console.log('VPOWER parse result:', vpowerParsed);

        if (vpowerParsed) {
            const { dataMatrix, maxRows, maxCols } = vpowerParsed;
            const isColumnFormat = maxRows === 1 && maxCols > 1;

            const { applied } = applyParsedMatrixToGrid(dataMatrix, e.target, {
                startColOverride: 0,
                trimValues: true,
                transformCell: (trimmedData, rowIndex, colIndex) => {
                    if (isColumnFormat && trimmedData.includes("\n")) {
                        const escapedData = trimmedData
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;")
                            .replace(/\n/g, "<br>");
                        return {
                            value: trimmedData,
                            html: escapedData,
                            style: { whiteSpace: "pre-wrap", wordBreak: "break-word" },
                        };
                    }
                    if (colIndex === 0) {
                        return trimmedData.toUpperCase();
                    }
                    return trimmedData;
                },
                successMessage: `Successfully pasted VPOWER data (${maxRows} rows x ${maxCols} cols)!`,
                emptyMessage: "No cells were pasted from VPOWER format.",
            });

            if (applied) {
                recomputeSubmitStateAfterPaste();
                return true;
            }
        } else {
            // VPOWER 模式下解析失败，给出提示但不阻止（让用户知道）
            console.log('VPOWER parser returned null, data may not match expected format');
            // 不 return，继续尝试其他解析器
        }
  return false;
}

