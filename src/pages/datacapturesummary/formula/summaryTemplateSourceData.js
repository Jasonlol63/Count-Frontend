/**
 * Rebuild template source expressions from captured table data
 * (ported from applyTemplateToSummaryRow in js/datacapturesummary.js).
 */
import {
  getCellValueByIdProductAndColumn,
  parseReferenceFormula,
} from "./summaryFormulaReference.js";
import {
  getFormulaNumberMatches,
  isNewIdProductColumnFormat,
  parseIdProductColumnRef,
  removeThousandsSeparators,
} from "./summaryFormulaParseUtils.js";
import { getTransformedTableData } from "../lib/summaryFormulaContext.js";
import { getProcessValueFromSummaryRow } from "../lib/summaryIdProductDisplay.js";

function extractOperatorsSequence(expression) {
  if (!expression || typeof expression !== "string") return "";
  const sanitized = expression.replace(/\s+/g, "");
  let operators = "";
  for (let i = 0; i < sanitized.length; i += 1) {
    const char = sanitized[i];
    if ("+-*/".includes(char)) {
      const prevChar = sanitized[i - 1] || "";
      if (char === "-" && (i === 0 || "(*+-/".includes(prevChar))) continue;
      operators += char;
    }
  }
  return operators;
}

function sanitizeSourceColumnsValue(sourceColumnsValue) {
  let value = String(sourceColumnsValue || "").trim();
  if (!value) return "";

  const isNewFormat = isNewIdProductColumnFormat(value);
  const parts = value.split(/\s+/).filter((c) => c.trim() !== "");
  const isCellPositionFormat = parts.length > 0 && /^[A-Z]+\d+$/.test(parts[0]);
  const isColumnNumberFormat = /^\d+(\s+\d+)*$/.test(value);

  if (/^\d+$/.test(value) && !isNewFormat && !isCellPositionFormat && !isColumnNumberFormat) {
    const numValue = Number.parseInt(value, 10);
    if (numValue > 1000 || numValue === 0) return "";
  }
  return value;
}

function readCellFromTableRow(processRow, displayColumnIndex) {
  if (!processRow || displayColumnIndex == null) return null;
  const idx = Number(displayColumnIndex);
  if (Number.isNaN(idx) || idx < 1 || idx >= processRow.length) return null;
  const cell = processRow[idx];
  if (!cell || cell.type !== "data" || cell.value === null || cell.value === undefined || cell.value === "") {
    return null;
  }
  let cellValue = String(cell.value).trim();
  cellValue = cellValue.replace(/^\s*\([A-Za-z]{2,4}\)\s*/g, "").trim();
  cellValue = cellValue.replace(/\$/g, "");
  let numericValue = cellValue.replace(/[^0-9+\-*/.\s()]/g, "").trim();
  numericValue = numericValue.replace(/^\s*\(\s*\)\s*/, "").trim();
  if (numericValue && /^\(\s*-\d[\d.]*\)\s*$/.test(numericValue)) {
    const inner = numericValue.replace(/^\s*\(|\)\s*$/g, "").trim();
    if (!Number.isNaN(Number.parseFloat(inner))) numericValue = inner;
  } else if (numericValue && /^\(\s*\d[\d.]*\)\s*$/.test(numericValue)) {
    const inner = numericValue.replace(/^\s*\(|\)\s*$/g, "").trim();
    if (!Number.isNaN(Number.parseFloat(inner))) numericValue = `-${inner}`;
  }
  return numericValue && numericValue !== "" ? numericValue : cellValue;
}

function getCellValueFromPosition(tableData, cellPosition) {
  if (!tableData?.rows?.length || !cellPosition) return null;
  const match = String(cellPosition).trim().match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;

  const rowLabel = match[1].toUpperCase();
  const columnIndex = Number.parseInt(match[2], 10);
  if (Number.isNaN(columnIndex) || columnIndex < 1) return null;

  for (const row of tableData.rows) {
    const label = row[0]?.type === "header" ? String(row[0].value || "").trim().toUpperCase() : "";
    if (label !== rowLabel) continue;
    return readCellFromTableRow(row, columnIndex);
  }
  return null;
}

export function getCellValuesFromNewFormat(sourceColumnsValue, formulaOperatorsValue) {
  if (!sourceColumnsValue || String(sourceColumnsValue).trim() === "") return [];

  const parts = String(sourceColumnsValue).split(/\s+/).filter((c) => c.trim() !== "");
  const cellValues = [];

  for (const part of parts) {
    const parsed = parseIdProductColumnRef(part);
    if (!parsed) continue;
    const { idProduct, rowLabel, dataColumnIndex, captureRowIndex } = parsed;
    const cellValue = getCellValueByIdProductAndColumn(
      idProduct,
      dataColumnIndex,
      rowLabel,
      captureRowIndex
    );
    if (cellValue !== null && cellValue !== "") {
      cellValues.push(cellValue);
    }
  }

  return cellValues;
}

function buildExpressionFromCellValues(cellValues, formulaOperatorsValue) {
  if (!cellValues.length) return "";
  const operatorsString = formulaOperatorsValue
    ? extractOperatorsSequence(formulaOperatorsValue) || "+"
    : "+";
  let expression = cellValues[0];
  for (let i = 1; i < cellValues.length; i += 1) {
    const operator = operatorsString[i - 1] || "+";
    expression += operator + cellValues[i];
  }
  return expression;
}

export function buildSourceExpressionFromTable(processValue, sourceColumnsValue, formulaOperatorsValue) {
  if (!sourceColumnsValue || String(sourceColumnsValue).trim() === "") return "";

  const operatorsString = formulaOperatorsValue
    ? extractOperatorsSequence(formulaOperatorsValue) || "+"
    : "+";
  const parts = String(sourceColumnsValue).split(/\s+/).filter((c) => c.trim() !== "");

  const newFormatWithRowLabel = /^[^:]+:[A-Z]+:\d+$/;
  const newFormatWithoutRowLabel = /^[^:]+:\d+$/;
  const isNewFormat =
    parts.length > 0 &&
    (newFormatWithRowLabel.test(parts[0]) || newFormatWithoutRowLabel.test(parts[0]));

  if (isNewFormat) {
    const references = [];
    for (const part of parts) {
      let match = part.match(/^([^:]+):([A-Z]+):(\d+)$/);
      if (match) {
        const idProduct = match[1];
        const displayColumnIndex = Number.parseInt(match[3], 10) + 1;
        references.push(`[${idProduct} : ${displayColumnIndex}]`);
        continue;
      }
      match = part.match(/^([^:]+):(\d+)$/);
      if (match) {
        const idProduct = match[1];
        const displayColumnIndex = Number.parseInt(match[2], 10) + 1;
        references.push(`[${idProduct} : ${displayColumnIndex}]`);
      }
    }
    if (references.length) {
      let expression = references[0];
      for (let i = 1; i < references.length; i += 1) {
        const operator = operatorsString[i - 1] || "+";
        expression += ` ${operator} ${references[i]}`;
      }
      return expression;
    }
  }

  const isCellPositionFormat = parts.length > 0 && /^[A-Z]+\d+$/.test(parts[0]);
  if (isCellPositionFormat) {
    let expression = `[${processValue} : ${parts[0]}]`;
    for (let i = 1; i < parts.length; i += 1) {
      const operator = operatorsString[i - 1] || "+";
      expression += ` ${operator} [${processValue} : ${parts[i]}]`;
    }
    return expression;
  }

  const columnNumbers = String(sourceColumnsValue)
    .split(/\s+/)
    .map((col) => Number.parseInt(col.trim(), 10))
    .filter((col) => !Number.isNaN(col));
  if (!columnNumbers.length) return "";

  let expression = `[${processValue} : ${columnNumbers[0]}]`;
  for (let i = 1; i < columnNumbers.length; i += 1) {
    const operator = operatorsString[i - 1] || "+";
    expression += ` ${operator} [${processValue} : ${columnNumbers[i]}]`;
  }
  return expression;
}

function preserveSourceStructure(savedSourceExpression, newSourceData) {
  if (!savedSourceExpression || !newSourceData) {
    return newSourceData || savedSourceExpression || "";
  }

  const cleanSourceData = removeThousandsSeparators(newSourceData);
  const numbers = getFormulaNumberMatches(cleanSourceData).map((m) => m.displayValue);
  if (!numbers.length) return savedSourceExpression;

  const structurePatterns = [/\*0\.\d+/, /\/0\.\d+/, /\*\(0\.\d+/, /\/\(0\.\d+/];
  const savedNumberMatches = getFormulaNumberMatches(savedSourceExpression);
  const baseSavedNumbers = [];

  savedNumberMatches.forEach((matchObj) => {
    const { raw: numStr, startIndex, endIndex } = matchObj;
    const contextBefore = savedSourceExpression.substring(Math.max(0, startIndex - 3), startIndex);
    const contextAfter = savedSourceExpression.substring(
      endIndex,
      Math.min(savedSourceExpression.length, endIndex + 3)
    );
    const testStr = contextBefore + numStr + contextAfter;
    const isStructureNumber = structurePatterns.some((pattern) => pattern.test(testStr));
    if (!isStructureNumber) baseSavedNumbers.push(matchObj);
  });

  if (baseSavedNumbers.length !== numbers.length) return newSourceData;

  let numberIndex = 0;
  return savedSourceExpression.replace(/-?\d+\.?\d*/g, (match, offset, string) => {
    const contextBefore = string.substring(Math.max(0, offset - 3), offset);
    const contextAfter = string.substring(
      offset + match.length,
      Math.min(string.length, offset + match.length + 3)
    );
    const isStructureNumber = structurePatterns.some((pattern) =>
      pattern.test(contextBefore + match + contextAfter)
    );
    if (isStructureNumber) return match;

    let isNegativeNumber = false;
    if (match.startsWith("-")) {
      if (offset > 0) {
        isNegativeNumber = /[+\-*/(\s]/.test(string[offset - 1]);
      } else {
        isNegativeNumber = true;
      }
    }

    if (match.startsWith("-") && !isNegativeNumber) {
      if (numberIndex < numbers.length) {
        let replacement = numbers[numberIndex++];
        const replacementValue = Number.parseFloat(replacement);
        if (!Number.isNaN(replacementValue) && replacementValue < 0) {
          return `-(${replacement})`;
        }
        replacement = replacement.replace(/^-/, "");
        return `-${replacement}`;
      }
      return match;
    }

    if (numberIndex < numbers.length) {
      const replacement = numbers[numberIndex++];
      const replacementValue = Number.parseFloat(replacement);
      if (!Number.isNaN(replacementValue) && replacementValue < 0) {
        const charBefore = offset > 0 ? string[offset - 1] : "";
        if (offset === 0 || /[+\-*/(\s]/.test(charBefore)) {
          return `(${replacement})`;
        }
      }
      return replacement;
    }
    return match;
  });
}

function resolveReferenceExpression(expression, idProduct, rowIndex) {
  const trimmed = String(expression || "").trim();
  if (!trimmed) return "";
  if (/\[[^\]]+\s*[: ,]\s*\d+\]/.test(trimmed)) {
    return parseReferenceFormula(trimmed, idProduct, trimmed, rowIndex ?? null);
  }
  return trimmed;
}

/**
 * Resolve live source expression from template + capture table (legacy applyTemplateToSummaryRow).
 */
export function resolveCurrentSourceDataFromTemplate({
  row,
  template,
  idProduct,
  tableData = null,
}) {
  const table = tableData || getTransformedTableData();
  const processValue = idProduct || getProcessValueFromSummaryRow(row);
  if (!processValue) return "";

  const mainTemplate = template?.main || template || {};
  let sourceColumnsValue = sanitizeSourceColumnsValue(mainTemplate.source_columns || "");
  const formulaOperatorsValue = String(
    mainTemplate.formula_operators || mainTemplate.formulaOperators || ""
  ).trim();
  const savedSourceValue = String(mainTemplate.last_source_value || "").trim();

  const isNewFormat = isNewIdProductColumnFormat(sourceColumnsValue);
  const cellPositions = sourceColumnsValue
    ? sourceColumnsValue.split(/\s+/).filter((c) => c.trim() !== "")
    : [];
  const isCellPositionFormat =
    !isNewFormat && cellPositions.length > 0 && /^[A-Z]+\d+$/.test(cellPositions[0]);
  const isReferenceFormat =
    formulaOperatorsValue && /\[[^\]]+\s*:\s*[A-Z]?\d+\]/.test(formulaOperatorsValue);
  const isCompleteExpression =
    formulaOperatorsValue && /[+\-*/]/.test(formulaOperatorsValue) && /\d/.test(formulaOperatorsValue);

  let currentSourceData = "";
  const rowIndex = row?.rowIndex ?? null;

  if (isNewFormat) {
    const cellValues = getCellValuesFromNewFormat(sourceColumnsValue, formulaOperatorsValue);
    if (cellValues.length) {
      currentSourceData = buildExpressionFromCellValues(cellValues, formulaOperatorsValue);
    } else {
      currentSourceData = buildSourceExpressionFromTable(
        processValue,
        sourceColumnsValue,
        formulaOperatorsValue
      );
      currentSourceData = resolveReferenceExpression(currentSourceData, processValue, rowIndex);
    }
  } else if (isCellPositionFormat && table) {
    const cellValues = [];
    for (const cellPosition of cellPositions) {
      const cellValue = getCellValueFromPosition(table, cellPosition);
      if (cellValue !== null && cellValue !== "") cellValues.push(cellValue);
    }
    if (cellValues.length) {
      currentSourceData = buildExpressionFromCellValues(cellValues, formulaOperatorsValue);
    } else {
      currentSourceData = buildSourceExpressionFromTable(
        processValue,
        sourceColumnsValue,
        formulaOperatorsValue
      );
      currentSourceData = resolveReferenceExpression(currentSourceData, processValue, rowIndex);
    }
  } else if (isReferenceFormat) {
    if (sourceColumnsValue) {
      currentSourceData = buildSourceExpressionFromTable(
        processValue,
        sourceColumnsValue,
        formulaOperatorsValue
      );
      currentSourceData = resolveReferenceExpression(currentSourceData, processValue, rowIndex);
    } else {
      currentSourceData = resolveReferenceExpression(formulaOperatorsValue, processValue, rowIndex);
    }
  } else if (isCompleteExpression) {
    if (sourceColumnsValue) {
      currentSourceData = buildSourceExpressionFromTable(
        processValue,
        sourceColumnsValue,
        formulaOperatorsValue
      );
      currentSourceData = resolveReferenceExpression(currentSourceData, processValue, rowIndex);
    } else {
      currentSourceData = formulaOperatorsValue;
    }
  } else if (sourceColumnsValue) {
    const columnNumbers = sourceColumnsValue
      .split(/\s+/)
      .map((col) => Number.parseInt(col.trim(), 10))
      .filter((col) => !Number.isNaN(col));
    if (columnNumbers.length) {
      const refExpr = buildSourceExpressionFromTable(
        processValue,
        sourceColumnsValue,
        formulaOperatorsValue
      );
      currentSourceData = resolveReferenceExpression(refExpr, processValue, rowIndex);
    } else {
      currentSourceData = buildSourceExpressionFromTable(
        processValue,
        sourceColumnsValue,
        formulaOperatorsValue
      );
      currentSourceData = resolveReferenceExpression(currentSourceData, processValue, rowIndex);
    }
  }

  if (
    !currentSourceData &&
    sourceColumnsValue &&
    isNewIdProductColumnFormat(sourceColumnsValue)
  ) {
    const cellValues = getCellValuesFromNewFormat(sourceColumnsValue, formulaOperatorsValue);
    if (cellValues.length) {
      currentSourceData = buildExpressionFromCellValues(cellValues, formulaOperatorsValue);
    }
  }

  if (!currentSourceData && sourceColumnsValue) {
    const refExpr = buildSourceExpressionFromTable(
      processValue,
      sourceColumnsValue,
      formulaOperatorsValue
    );
    currentSourceData = resolveReferenceExpression(refExpr, processValue, rowIndex);
  }

  const isCurrentDataReferenceFormat =
    currentSourceData && /\[[^\]]+\s*:\s*[A-Z]?\d+\]/.test(currentSourceData);

  let resolvedSourceExpression = "";
  if (currentSourceData && currentSourceData.trim() !== "") {
    if (isCurrentDataReferenceFormat) {
      resolvedSourceExpression = currentSourceData;
    } else if (
      savedSourceValue &&
      savedSourceValue !== "Source" &&
      /[*/]/.test(savedSourceValue)
    ) {
      const preserved = preserveSourceStructure(savedSourceValue, currentSourceData);
      resolvedSourceExpression =
        preserved && preserved.trim() !== "" ? preserved : currentSourceData;
    } else {
      resolvedSourceExpression = currentSourceData;
    }
  } else if (savedSourceValue && savedSourceValue !== "Source") {
    resolvedSourceExpression = savedSourceValue;
  }

  if (resolvedSourceExpression && /\[[^\]]+\s*[: ,]\s*\d+\]/.test(resolvedSourceExpression)) {
    return resolveReferenceExpression(resolvedSourceExpression, processValue, rowIndex);
  }

  return resolvedSourceExpression;
}

/**
 * Expand $column refs in formula_operators using current capture table
 * (legacy applyMainTemplateToRow hasDollarSigns branch).
 */
export function expandDollarFormulaOperators({
  formulaOperators,
  sourceColumns = "",
  idProduct,
  rowIndex = null,
  clickedColumns = "",
}) {
  const formulaOperatorsValue = String(formulaOperators || "").trim();
  if (!formulaOperatorsValue || !/\$(\d+)(?!\d)/.test(formulaOperatorsValue)) {
    return "";
  }

  let displayFormula = formulaOperatorsValue;
  const dollarPattern = /\$(\d+)(?!\d)/g;
  const allMatches = [];
  let match;
  dollarPattern.lastIndex = 0;
  while ((match = dollarPattern.exec(formulaOperatorsValue)) !== null) {
    const columnNumber = Number.parseInt(match[1], 10);
    if (!Number.isNaN(columnNumber) && columnNumber > 0) {
      allMatches.push({
        fullMatch: match[0],
        columnNumber,
        index: match.index,
      });
    }
  }
  if (!allMatches.length) return "";

  allMatches.sort((a, b) => b.index - a.index);

  const columnRefMap = new Map();
  const sourceColumnsValue = String(sourceColumns || "").trim();
  if (sourceColumnsValue && isNewIdProductColumnFormat(sourceColumnsValue)) {
    for (const part of sourceColumnsValue.split(/\s+/).filter((c) => c.trim())) {
      const parsedPart = parseIdProductColumnRef(part);
      if (parsedPart?.captureRowIndex != null) {
        const displayColumnKey = parsedPart.dataColumnIndex + 1;
        columnRefMap.set(displayColumnKey, {
          idProduct: parsedPart.idProduct,
          rowLabel: null,
          dataColumnIndex: parsedPart.dataColumnIndex,
          captureRowIndex: parsedPart.captureRowIndex,
        });
        continue;
      }
      let partMatch = part.match(/^([^:]+):([A-Z]+):(\d+)$/);
      if (partMatch) {
        const displayColumnIndex = Number.parseInt(partMatch[3], 10);
        columnRefMap.set(displayColumnIndex, {
          idProduct: partMatch[1],
          rowLabel: partMatch[2],
          dataColumnIndex: displayColumnIndex - 1,
          captureRowIndex: null,
        });
        continue;
      }
      partMatch = part.match(/^([^:]+):(\d+)$/);
      if (partMatch) {
        const displayColumnIndex = Number.parseInt(partMatch[2], 10);
        columnRefMap.set(displayColumnIndex, {
          idProduct: partMatch[1],
          rowLabel: null,
          dataColumnIndex: displayColumnIndex - 1,
          captureRowIndex: null,
        });
      }
    }
  }

  for (const dollarMatch of allMatches) {
    let columnValue = null;

    if (columnRefMap.has(dollarMatch.columnNumber)) {
      const ref = columnRefMap.get(dollarMatch.columnNumber);
      columnValue = getCellValueByIdProductAndColumn(
        ref.idProduct,
        ref.dataColumnIndex,
        ref.rowLabel,
        ref.captureRowIndex
      );
    }

    if (columnValue === null) {
      columnValue = getCellValueByIdProductAndColumn(
        idProduct,
        dollarMatch.columnNumber - 1,
        null,
        rowIndex
      );
    }

    if (columnValue === null) {
      columnValue = "0";
    }

    displayFormula =
      displayFormula.substring(0, dollarMatch.index) +
      columnValue +
      displayFormula.substring(dollarMatch.index + dollarMatch.fullMatch.length);
  }

  const parsed = parseReferenceFormula(
    displayFormula,
    idProduct,
    clickedColumns,
    rowIndex
  );
  return parsed || displayFormula;
}
