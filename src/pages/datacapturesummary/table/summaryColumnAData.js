/**
 * Build Id Product column entries from captured table data (column A / index 1).
 * Ported from populateOriginalTableWithColumnAData in js/datacapturesummary.js.
 */

function cellLooksLikeAmount(value) {
  const raw = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!raw) return false;
  if (/^\$/.test(raw)) return true;
  const normalized = raw.replace(/[,$]/g, "").replace(/^\((.*)\)$/, "-$1");
  return /^-?\d+(?:\.\d+)?$/.test(normalized);
}

function cellLooksLikeRichAmount(value) {
  const raw = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!raw) return false;
  if (/^\$/.test(raw)) return true;
  if (/,\d{3}/.test(raw)) return true;
  if (/\d\.\d{1,4}\b/.test(raw)) return true;
  return false;
}

/** True when Id Product is empty but the captured row still has money (C8 k-group-footer). */
function rowHasAmountWithoutIdProduct(rowData) {
  if (!Array.isArray(rowData) || rowData.length <= 1) return false;
  const idCell = rowData[1];
  if (idCell?.type !== "data") return false;
  if (String(idCell.value || "").trim()) return false;
  const amountCells = rowData.filter(
    (cell, index) => index > 1 && cell?.type === "data" && cellLooksLikeAmount(cell.value),
  );
  if (!amountCells.length) return false;
  // Require rich money or ≥2 amount cells — bare integer alone may be a product id.
  if (amountCells.some((cell) => cellLooksLikeRichAmount(cell.value))) return true;
  return amountCells.length >= 2;
}

function split655RowDEntries(cellValue) {
  const trimmedValue = cellValue.trim();
  if (!trimmedValue) return null;

  if (trimmedValue.includes("\n")) {
    const entries = trimmedValue.split("\n").map((e) => e.trim()).filter((e) => e !== "");
    if (entries.length > 1) return entries;
  }

  const upperValue = trimmedValue.toUpperCase();
  if (upperValue.includes("SUB TOTAL") && upperValue.includes("GRAND TOTAL")) {
    const spaceSplit = trimmedValue.split(/\s{2,}|\t+/).map((e) => e.trim()).filter((e) => e !== "");
    if (spaceSplit.length > 1) return spaceSplit;

    const subTotalMatch = trimmedValue.match(/SUB\s*TOTAL/i);
    const grandTotalMatch = trimmedValue.match(/GRAND\s*TOTAL/i);
    if (subTotalMatch && grandTotalMatch) {
      const subTotalIndex = subTotalMatch.index;
      const grandTotalIndex = grandTotalMatch.index;
      if (subTotalIndex < grandTotalIndex) {
        return [
          trimmedValue.substring(0, grandTotalIndex).trim(),
          trimmedValue.substring(grandTotalIndex).trim(),
        ];
      }
      return [
        trimmedValue.substring(0, subTotalIndex).trim(),
        trimmedValue.substring(subTotalIndex).trim(),
      ];
    }
  }

  return null;
}

/**
 * @returns {{ entries: Array<{ idProduct: string, rowIndex: number }>, idProducts: string[] }}
 */
export function buildColumnAEntries(tableData) {
  const entries = [];

  if (!tableData?.rows?.length) {
    return { entries, idProducts: [] };
  }

  tableData.rows.forEach((rowData, rowIndex) => {
    if (rowData.length <= 1 || rowData[1]?.type !== "data") return;

    const cellValue = rowData[1].value || "";
    if (!cellValue.trim()) {
      // Keep money-only footers (empty Id Product) so Submit → Summary shows the row.
      if (rowHasAmountWithoutIdProduct(rowData)) {
        entries.push({ idProduct: "", rowIndex });
      }
      return;
    }

    if (rowIndex === 3 && cellValue.trim() !== "") {
      const split = split655RowDEntries(cellValue);
      if (split?.length) {
        split.forEach((entry) => {
          if (entry?.trim()) {
            entries.push({ idProduct: entry, rowIndex });
          }
        });
        return;
      }
    }

    entries.push({ idProduct: cellValue, rowIndex });
  });

  const idProducts = entries.map((e) => e.idProduct).filter((v) => v && v.trim() !== "");

  return { entries, idProducts };
}
