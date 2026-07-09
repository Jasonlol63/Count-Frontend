/**
 * Build Id Product column entries from captured table data (column A / index 1).
 * Ported from populateOriginalTableWithColumnAData in js/datacapturesummary.js.
 */

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
    if (!cellValue.trim()) return;

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
