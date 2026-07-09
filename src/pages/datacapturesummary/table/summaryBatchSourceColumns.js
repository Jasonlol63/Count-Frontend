import { createFormulaDisplayFromExpression } from "../../../shared/formula/index.js";
import { normalizeSummaryIdProductText } from "../lib/summaryIdProductUtils.js";
import { getProcessValueFromSummaryRow } from "../lib/summaryIdProductDisplay.js";
import { calculateFormulaResultFromExpression } from "../formula/summaryFormulaReference.js";
import { parseSourceColumnsInput } from "../formula/summaryFormulaParseUtils.js";
import { recalculateRowAmounts } from "./summaryRowAmount.js";

function findProcessRow(tableData, processValue, rowIndex = null) {
  if (!tableData?.rows?.length || !processValue) return null;
  const target = String(processValue).trim();
  const norm = normalizeSummaryIdProductText(target);

  if (rowIndex != null && rowIndex >= 0 && rowIndex < tableData.rows.length) {
    const row = tableData.rows[rowIndex];
    if (row?.length > 1 && row[1]?.type === "data") {
      const rowValue = String(row[1].value || "").trim();
      if (rowValue === target || normalizeSummaryIdProductText(rowValue) === norm) {
        return row;
      }
    }
  }

  for (let i = 0; i < tableData.rows.length; i += 1) {
    const row = tableData.rows[i];
    if (row?.length <= 1 || row[1]?.type !== "data") continue;
    const rowValue = String(row[1].value || "").trim();
    if (rowValue === target || normalizeSummaryIdProductText(rowValue) === norm) {
      return row;
    }
  }
  return null;
}

function readDataColumn(processRow, colNum) {
  const colIndex = Number(colNum);
  if (!processRow || Number.isNaN(colIndex) || colIndex < 1 || colIndex >= processRow.length) {
    return null;
  }
  const cell = processRow[colIndex];
  if (!cell || cell.type !== "data" || cell.value === null || cell.value === undefined || cell.value === "") {
    return null;
  }
  return String(cell.value).trim();
}

function getColumnDataForRow(tableData, row, columnNumbers, operators) {
  const processValue = getProcessValueFromSummaryRow(row);
  if (!processValue) return "";

  const captureIndex =
    row.productType === "sub" && row.parentRowIndex != null ? row.parentRowIndex : row.rowIndex;
  const processRow = findProcessRow(tableData, processValue, captureIndex);
  if (!processRow) return "";

  const values = [];
  for (const colNum of columnNumbers) {
    const v = readDataColumn(processRow, colNum);
    if (v !== null && v !== "") values.push(v);
  }
  if (!values.length) return "";

  let result = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const op = operators && operators.length ? operators[(i - 1) % operators.length] : "+";
    result += op + values[i];
  }
  return result;
}

function getColumnDataWithParentheses(tableData, row, originalInput, columnNumbers) {
  const processValue = getProcessValueFromSummaryRow(row);
  if (!processValue) return originalInput;

  const captureIndex =
    row.productType === "sub" && row.parentRowIndex != null ? row.parentRowIndex : row.rowIndex;
  const processRow = findProcessRow(tableData, processValue, captureIndex);
  if (!processRow) return originalInput;

  let colIdx = 0;
  return originalInput.replace(/\d+/g, (match) => {
    const colNum = columnNumbers[colIdx];
    colIdx += 1;
    if (colNum == null) return match;
    const v = readDataColumn(processRow, colNum);
    return v !== null && v !== "" ? v : match;
  });
}

/**
 * Apply batch source columns to all rows with Id Product (legacy updateBatchSourceColumns).
 */
export function applyBatchSourceColumnsToRows(rows, tableData, inputValue) {
  const raw = String(inputValue || "").trim();
  if (!raw) return { ok: false, message: "empty", rows, updatedCount: 0 };

  const parseResult = parseSourceColumnsInput(raw);
  if (!parseResult) {
    return { ok: false, message: "invalid", rows, updatedCount: 0 };
  }

  const { columnNumbers, operators, originalInput, hasParentheses } = parseResult;
  let updatedCount = 0;

  const next = rows.map((row) => {
    const processValue = getProcessValueFromSummaryRow(row);
    if (!processValue) return row;

    const sourcePercent = String(row.sourcePercent || "1").trim() || "1";
    const enableSourcePercent = sourcePercent.trim() !== "" && sourcePercent !== "1";

    const sourceData = hasParentheses && originalInput
      ? getColumnDataWithParentheses(tableData, row, originalInput, columnNumbers)
      : getColumnDataForRow(tableData, row, columnNumbers, operators);

    if (!sourceData) return row;

    const formulaDisplay = createFormulaDisplayFromExpression(
      sourceData,
      sourcePercent,
      enableSourcePercent || sourcePercent !== "1"
    );

    const merged = {
      ...row,
      sourceColumns: columnNumbers.join(" "),
      formulaOperators: sourceData,
      formula: sourceData,
      formulaDisplay,
      enableSourcePercent: sourcePercent.trim() !== "",
    };

    updatedCount += 1;
    return recalculateRowAmounts(merged);
  });

  return { ok: true, rows: next, updatedCount };
}
