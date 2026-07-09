/** INVOICE HTML table fill. */
import { notifyPasteUser } from "../../lib/dataCaptureBridge.js";
import { applyParsedMatrixToGrid } from "../core/dataCapturePasteApply.js";

function buildInvoiceHtmlCellPatch(sourceCell) {
    let cellContent = sourceCell.innerHTML;
    if (!cellContent || cellContent.trim() === "") {
        cellContent = sourceCell.textContent || "";
    }

    const cleanContent = cellContent
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

    const textContent = (sourceCell.textContent || "").trim();

    if (/^[A-Za-z]+-[0-9.,-]+$/i.test(textContent)) {
        const match = textContent.match(/^([A-Za-z]+)(-[0-9.,-]+)$/i);
        if (match) {
            const description = match[1];
            const amount = match[2];
            return {
                split: true,
                description:
                    cleanContent.includes("<") && cleanContent.includes(">")
                        ? { value: description, html: description }
                        : description,
                amount,
            };
        }
    }

    if (cleanContent.includes("<") && cleanContent.includes(">")) {
        return { value: textContent || cellContent, html: cleanContent };
    }

    return textContent || cellContent;
}

export function parseAndFillHtmlTableForInvoice(htmlString, startCell) {
    try {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlString;

        const table = tempDiv.querySelector("table");
        if (!table) {
            return false;
        }

        console.log("2.10 INVOICE: Parsing HTML table and preserving PDF format...");

        const allRows = table.querySelectorAll("tr");
        if (allRows.length === 0) {
            return false;
        }

        const dataMatrix = [];

        allRows.forEach((sourceRow) => {
            const sourceCells = sourceRow.querySelectorAll("td, th");
            const row = [];
            let currentCol = 0;

            sourceCells.forEach((sourceCell) => {
                const colspan = parseInt(sourceCell.getAttribute("colspan") || "1", 10);
                const patch = buildInvoiceHtmlCellPatch(sourceCell);

                while (row.length <= currentCol) {
                    row.push("");
                }

                if (patch && typeof patch === "object" && patch.split) {
                    row[currentCol] = patch.description;
                    row[currentCol + 1] = patch.amount;
                    for (let i = 2; i < colspan; i += 1) {
                        row[currentCol + i] = "";
                    }
                } else {
                    row[currentCol] = patch;
                    for (let i = 1; i < colspan; i += 1) {
                        row[currentCol + i] = "";
                    }
                }

                currentCol += colspan;
            });

            if (row.length > 0) {
                dataMatrix.push(row);
            }
        });

        if (dataMatrix.length === 0) {
            return false;
        }

        const { successCount, maxRows, maxCols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
            trimValues: false,
        });

        if (successCount > 0) {
            notifyPasteUser(
                `2.10 INVOICE: 成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${maxCols} 列)，已保持PDF原始格式!`,
                "success",
            );
            return true;
        }

        console.log("2.10 INVOICE: No cells were pasted");
        return false;
    } catch (error) {
        console.error("2.10 INVOICE: Error parsing HTML table:", error);
        return false;
    }
}
