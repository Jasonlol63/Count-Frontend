/** Ported from js/datacapture.js — normalize clipboard text into row lines for generic paste. */
export function parsePastedData(pastedData) {
  const normalizedData = String(pastedData ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const rows = normalizedData.split("\n");

  let rowsWithTabs = 0;
  let rowsWithoutTabs = 0;
  let maxCellsInRow = 0;
  let totalRowsWithData = 0;

  for (const row of rows) {
    const trimmed = row.trim();
    if (trimmed === "") continue;

    totalRowsWithData += 1;
    if (trimmed.includes("\t")) {
      rowsWithTabs += 1;
      const cellCount = trimmed.split("\t").length;
      maxCellsInRow = Math.max(maxCellsInRow, cellCount);
    } else {
      rowsWithoutTabs += 1;
    }
  }

  const tableFormatRatio = totalRowsWithData > 0 ? rowsWithTabs / totalRowsWithData : 0;
  const textFormatRatio = totalRowsWithData > 0 ? rowsWithoutTabs / totalRowsWithData : 0;

  console.log("Format detection:");
  console.log("  Total rows with data:", totalRowsWithData);
  console.log("  Table format rows:", rowsWithTabs, `(${(tableFormatRatio * 100).toFixed(1)}%)`);
  console.log("  Text format rows:", rowsWithoutTabs, `(${(textFormatRatio * 100).toFixed(1)}%)`);
  console.log("  Max cells in a row:", maxCellsInRow);

  const isTableFormat = tableFormatRatio > 0.5;
  const isMixedFormat = tableFormatRatio > 0.2 && tableFormatRatio < 0.8;

  return {
    rows,
    isTableFormat,
    isMixedFormat,
    maxCellsInRow,
    rowsWithTabs,
    rowsWithoutTabs,
  };
}
