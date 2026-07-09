/**
 * Phase 9b: Reference formula resolution + evaluation (extracted from datacapturesummary.js).
 * Regenerate: node frontend/scripts/extract-summary-formula-reference.mjs
 */
import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import { evaluateExpression } from "./summaryFormulaEvaluate.js";
import { parseIdProductColumnRef, removeThousandsSeparators } from "./summaryFormulaParseUtils.js";
import { normalizeSummaryIdProductText } from "../lib/summaryIdProductUtils.js";
import {
  getCapturedProcessData,
  getTransformedTableData,
} from "../lib/summaryFormulaContext.js";

function normalizeIdProductText(text) {
  return normalizeSummaryIdProductText(text);
}

function truncateProcessedAmountTo6Decimals(value) {
  try {
    return MoneyDecimal.formatDisplay(value, 6);
  } catch {
    return value;
  }
}

function readTransformedTableData() {
  const fromCtx = getTransformedTableData();
  if (fromCtx) return fromCtx;
  try {
    const raw = localStorage.getItem("capturedTableData");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function findCaptureRowIndexByLabel(tableData, rowLabel, idProductResolved) {
    if (!tableData?.rows?.length || !rowLabel) {
        return { rowIndex: null, idMatches: false };
    }
    const idTrim = String(idProductResolved || '').trim();
    const normalizedTarget = normalizeIdProductText(idProductResolved);
    for (let i = 0; i < tableData.rows.length; i += 1) {
        const row = tableData.rows[i];
        const label = row[0]?.type === 'header' ? String(row[0].value || '').trim() : '';
        if (label !== rowLabel) continue;
        if (!row[1] || row[1].type !== 'data') {
            return { rowIndex: i, idMatches: false };
        }
        const rowId = String(row[1].value || '').trim();
        const idMatches =
            rowId === idTrim ||
            (typeof isFullIdProduct === 'function' && isFullIdProduct(idProductResolved)
                ? rowId === idTrim
                : normalizeIdProductText(rowId) === normalizedTarget);
        return { rowIndex: i, idMatches: !!idMatches };
    }
    return { rowIndex: null, idMatches: false };
}

function readDataColumnCellFromProcessRow(processRow, columnIndex) {
    if (!processRow || columnIndex == null) return null;
    const processRowIndex = columnIndex + 1;
    if (processRowIndex < 2 || processRowIndex >= processRow.length) return null;
    const cellData = processRow[processRowIndex];
    if (!cellData || cellData.type !== 'data' || cellData.value === null || cellData.value === undefined || cellData.value === '') {
        return null;
    }
    let cellValue = cellData.value.toString().trim();
    cellValue = cellValue.replace(/^\s*\([A-Za-z]{2,4}\)\s*/g, '').trim();
    cellValue = cellValue.replace(/\$/g, '');
    let numericValue = cellValue.replace(/[^0-9+\-*/.\s()]/g, '').trim();
    numericValue = numericValue.replace(/^\s*\(\s*\)\s*/, '').trim();
    if (numericValue && /^\(\s*-\d[\d.]*\)\s*$/.test(numericValue)) {
        const inner = numericValue.replace(/^\s*\(|\)\s*$/g, '').trim();
        if (!isNaN(parseFloat(inner))) numericValue = inner;
    } else if (numericValue && /^\(\s*\d[\d.]*\)\s*$/.test(numericValue)) {
        const inner = numericValue.replace(/^\s*\(|\)\s*$/g, '').trim();
        if (!isNaN(parseFloat(inner))) numericValue = '-' + inner;
    }
    return (numericValue && numericValue !== '') ? numericValue : cellValue;
}

// Get cell value from data capture table by id_product and column index
// Supports row_label parameter to distinguish between multiple rows with same id_product
// captureRowIndex: 可选，Data Capture 行序（0-based），与 id_product:#N:col 一致
// Format: "id_product:row_label:column_index" (e.g., "BB:C:3") or "id_product:column_index" (backward compatibility)

export function getCellValueByIdProductAndColumn(idProduct, columnIndex, rowLabel = null, captureRowIndex = null) {
    try {
        // 若传入的是截断 id（如 "(T07)"），先解析为完整 id_product，避免 No row found / Cell value not found（有 row_label 时优先按行标签匹配）
        const idProductResolved = typeof resolveToFullIdProduct === 'function' ? resolveToFullIdProduct(idProduct, rowLabel) : idProduct;

        // Use transformed table data if available, otherwise get from localStorage
        let parsedTableData;
        parsedTableData = readTransformedTableData();
        if (!parsedTableData) {
            console.error('No captured table data found');
            return null;
        }

        if (captureRowIndex !== null && captureRowIndex !== undefined && String(captureRowIndex).trim() !== '') {
            const idx = parseInt(String(captureRowIndex), 10);
            if (!Number.isNaN(idx) && idx >= 0) {
                const rowByIdx = findProcessRow(parsedTableData, idProductResolved, idx);
                if (rowByIdx) {
                    const v = readDataColumnCellFromProcessRow(rowByIdx, columnIndex);
                    if (v !== null) return v;
                }
            }
        }

        // If row_label is provided, find the row by both id_product and row_label
        // CRITICAL: Always prioritize id_product matching over row_label/row_index
        // This ensures correct data is read even when row positions change
        let processRow = null;
        let rowIndex = null;
        let rowIndexIdProductMatches = false;

        if (rowLabel) {
            const labelMatch = findCaptureRowIndexByLabel(parsedTableData, rowLabel, idProductResolved);
            rowIndex = labelMatch.rowIndex;
            rowIndexIdProductMatches = labelMatch.idMatches;

            // Only use rowIndex if id_product matches
            if (rowIndex !== null && rowIndexIdProductMatches) {
                console.log('getCellValueByIdProductAndColumn: Using rowIndex:', rowIndex, 'for row_label:', rowLabel, 'id_product matches');
                processRow = findProcessRow(parsedTableData, idProductResolved, rowIndex);
                console.log('getCellValueByIdProductAndColumn: Found row by row_label:', rowLabel, 'rowIndex:', rowIndex, 'id_product:', idProductResolved, 'processRow:', processRow ? 'found' : 'not found');
            } else {
                console.log('getCellValueByIdProductAndColumn: row_label not usable, falling back to id_product search. rowLabel:', rowLabel);
            }
        }

        // CRITICAL: Always fallback to id_product search if row_label didn't yield a valid match
        // This ensures correct data is read even when row positions change
        if (!processRow) {
            processRow = findProcessRow(parsedTableData, idProductResolved);
            if (rowLabel) {
                console.log('getCellValueByIdProductAndColumn: Row not found by row_label, falling back to first matching row for id_product:', idProductResolved);
            }
        }

        if (!processRow) {
            console.error('Process row not found for id_product:', idProductResolved, 'row_label:', rowLabel);
            return null;
        }

        // columnIndex is 1-based data column index (1 = first data column)
        // In processRow: index 0 = row header, index 1 = id_product, index 2 = first data column (column 1)
        // So: columnIndex 1 -> processRow index 2, columnIndex 2 -> processRow index 3, etc.
        const fallbackVal = readDataColumnCellFromProcessRow(processRow, columnIndex);
        if (fallbackVal !== null) {
            console.log('Found cell value for id_product:', idProductResolved, 'row_label:', rowLabel, 'column:', columnIndex, 'value:', fallbackVal);
            return fallbackVal;
        }

        console.error('Cell not found for id_product:', idProductResolved, 'row_label:', rowLabel, 'column:', columnIndex);
        return null;
    } catch (error) {
        console.error('Error getting cell value by id_product and column:', error);
        return null;
    }
}

function isFullIdProduct(value) {
    if (!value || typeof value !== 'string') return false;
    const t = value.trim();
    if (t.indexOf(' - ') >= 0) return true;
    const openParen = t.indexOf('(');
    return openParen > 0 && t.indexOf(')', openParen) > openParen;
}

// 判断是否为截断的 id_product（仅对明确短格式解析，如 "(T07)"、"(T07):AF"、极短缩写）
// 整组 Id_product：ALLBET95MS(KM)MYR / ALLBET95MS (KM) MYR / (SV)/ (SEXY) 等均为完整 id，不解析
// 含 " - " 或长度≥25 视为完整；仅长度<15 或含 ":" 或以 "(" 开头的才当截断
function isTruncatedIdProduct(value) {
    if (!value || typeof value !== 'string') return false;
    const t = value.trim();
    if (t.indexOf(' - ') >= 0) return false;
    if (t.length >= 25) return false;
    return t.length < 15 || t.indexOf(':') >= 0 || /^\s*\([^)]*\)/.test(t);
}

// 将 Excel 风格行标签转为 0-based 行索引：A=0, B=1, ..., Z=25, AA=26, ..., AF=31
function rowLabelToZeroBasedIndex(label) {
    if (!label || typeof label !== 'string') return -1;
    const s = label.trim().toUpperCase();
    if (!s) return -1;
    let index = 0;
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code < 65 || code > 90) return -1;
        index = index * 26 + (code - 64);
    }
    return index - 1;
}

function resolveToFullIdProduct(shortId, rowLabel) {
    let shortTrim = (shortId || '').trim();
    if (!shortTrim) return shortId;
    // 若传入的是 "(T07):AF" 这类格式且未传 rowLabel，先拆出 rowLabel 再解析
    let extractedRowLabel = rowLabel || null;
    if (shortTrim.indexOf(':') >= 0 && !extractedRowLabel) {
        const labelMatch = shortTrim.match(/:([A-Z]+)$/);
        if (labelMatch) {
            extractedRowLabel = labelMatch[1];
            shortTrim = shortTrim.substring(0, shortTrim.length - labelMatch[0].length).trim();
            if (!shortTrim) return shortId;
        }
    }
    // Replace Word 转换得到的产品 ID 视为独立 MAIN，不参与前缀/截断解析，避免 SZ 被解析成 SZT
    const processData = getCapturedProcessData() || (function () {
        try {
            const raw = localStorage.getItem('capturedProcessData');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    })();
    if (processData) {
        const rwTo = (processData.replaceWordTo ?? processData.replace_word_to ?? '').toString().trim();
        if (rwTo && (shortTrim === rwTo || (typeof normalizeIdProductText === 'function' && normalizeIdProductText(shortTrim) === normalizeIdProductText(rwTo)))) {
            return shortId;
        }
    }
    if (!isTruncatedIdProduct(shortTrim)) return shortId;
    let parsedTableData;
    parsedTableData = readTransformedTableData();
    if (!parsedTableData) {
        try {
            const tableData = localStorage.getItem('capturedTableData');
            if (!tableData) return shortId;
            parsedTableData = JSON.parse(tableData);
        } catch (e) { return shortId; }
    }
    if (parsedTableData && parsedTableData.rows) {
        if (extractedRowLabel) {
            const nSpLabel = (s) => (s || '').trim().replace(/\s+/g, '');
            const shortNormLabel = nSpLabel(shortTrim);
            for (let i = 0; i < parsedTableData.rows.length; i++) {
                const row = parsedTableData.rows[i];
                if (row && row.length > 1 && row[1].type === 'data') {
                    const headerVal = (row[0] && (row[0].value != null)) ? String(row[0].value).trim() : '';
                    if (headerVal !== extractedRowLabel) continue;
                    const full = (row[1].value || '').trim();
                    if (full === shortTrim || full.endsWith(shortTrim)) {
                        console.log('resolveToFullIdProduct: resolved', shortTrim, 'with rowLabel', extractedRowLabel, '->', full);
                        return full;
                    }
                    if (shortNormLabel && nSpLabel(full).indexOf(shortNormLabel) === 0) {
                        console.log('resolveToFullIdProduct: resolved (prefix) with rowLabel', extractedRowLabel, shortTrim, '->', full);
                        return full;
                    }
                }
            }
            for (let i = 0; i < parsedTableData.rows.length; i++) {
                const row = parsedTableData.rows[i];
                if (row && row.length > 1 && row[1].type === 'data') {
                    const headerVal = (row[0] && (row[0].value != null)) ? String(row[0].value).trim() : '';
                    if (headerVal !== extractedRowLabel) continue;
                    const full = (row[1].value || '').trim();
                    if (normalizeIdProductText(full) === normalizeIdProductText(shortTrim)) {
                        console.log('resolveToFullIdProduct: resolved (base) with rowLabel', extractedRowLabel, shortTrim, '->', full);
                        return full;
                    }
                }
            }
            // 行标签未匹配时：将行标签转为行索引（A=0, B=1, ..., Z=25, AA=26, ..., AF=31）再取该行 id_product
            const rowIndexFromLabel = rowLabelToZeroBasedIndex(extractedRowLabel);
            if (rowIndexFromLabel >= 0 && rowIndexFromLabel < parsedTableData.rows.length) {
                const row = parsedTableData.rows[rowIndexFromLabel];
                if (row && row.length > 1 && row[1].type === 'data') {
                    const full = (row[1].value || '').trim();
                    if (full && (full === shortTrim || full.endsWith(shortTrim) || full.indexOf(' - ') >= 0)) {
                        console.log('resolveToFullIdProduct: resolved by row index', extractedRowLabel, '->', full);
                        return full;
                    }
                }
            }
        }
        const nSp = (s) => (s || '').trim().replace(/\s+/g, '');
        const shortNorm = nSp(shortTrim);
        for (let i = 0; i < parsedTableData.rows.length; i++) {
            const row = parsedTableData.rows[i];
            if (row && row.length > 1 && row[1].type === 'data') {
                const full = (row[1].value || '').trim();
                if (full === shortTrim || full.endsWith(shortTrim)) {
                    console.log('resolveToFullIdProduct: resolved', shortTrim, '->', full);
                    return full;
                }
                if (shortNorm && nSp(full).indexOf(shortNorm) === 0) {
                    console.log('resolveToFullIdProduct: resolved (prefix match)', shortTrim, '->', full);
                    return full;
                }
            }
        }
        for (let i = 0; i < parsedTableData.rows.length; i++) {
            const row = parsedTableData.rows[i];
            if (row && row.length > 1 && row[1].type === 'data') {
                const full = (row[1].value || '').trim();
                if (normalizeIdProductText(full) === normalizeIdProductText(shortTrim)) {
                    console.log('resolveToFullIdProduct: resolved (base match)', shortTrim, '->', full);
                    return full;
                }
            }
        }
    }
    // 回退：从 Data Capture 表 DOM 按行标签取完整 id_product（表数据可能为截断 id）
    if (extractedRowLabel) {
        const capturedTableBody = document.getElementById('capturedTableBody');
        if (capturedTableBody) {
            const rows = capturedTableBody.querySelectorAll('tr');
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowHeaderCell = row.querySelector('.row-header');
                if (!rowHeaderCell) continue;
                const headerText = (rowHeaderCell.textContent || '').trim();
                if (headerText !== extractedRowLabel) continue;
                const idCell = row.querySelector('td[data-column-index="1"]') || row.querySelector('td[data-col-index="1"]') || row.querySelectorAll('td')[1];
                if (idCell) {
                    const full = (idCell.textContent || '').trim();
                    if (full && (full === shortTrim || full.endsWith(shortTrim) || full.indexOf(' - ') >= 0)) {
                        console.log('resolveToFullIdProduct: resolved from DOM', shortTrim, 'with rowLabel', extractedRowLabel, '->', full);
                        return full;
                    }
                }
                break;
            }
        }
    }
    return shortId;
}

// Find the row that matches the process value

function findProcessRow(tableData, processValue, rowIndex = null) {
    if (!tableData.rows) return null;

    // 仅当传入的是截断 id（如 "(T07)"、"KZAWCMS(SV)"）时才解析为完整 id_product，完整 id（如 KZAWCMS (SV) MYR）直接使用，避免 (SV) 被错误解析成 (KM)
    const processValueResolved = (typeof resolveToFullIdProduct === 'function' && isTruncatedIdProduct(processValue))
        ? resolveToFullIdProduct(processValue) : (processValue || '').trim();

    // Normalize the process value for comparison (only used when not full id)
    const normalizedProcessValue = normalizeIdProductText(processValueResolved);
    const useExactOnly = isFullIdProduct(processValueResolved);

    // CRITICAL: Always prioritize id_product matching over rowIndex
    // If rowIndex is provided, verify that the row at that index matches the id_product
    // If not, fallback to searching all rows by id_product
    if (rowIndex !== null && rowIndex >= 0 && rowIndex < tableData.rows.length) {
        const row = tableData.rows[rowIndex];
        if (row && row.length > 1 && row[1].type === 'data') {
            const rowValue = row[1].value;
            const normalizedRowValue = normalizeIdProductText(rowValue);
            const exactMatch = (rowValue === processValueResolved);
            const normalizedMatch = !useExactOnly && normalizedRowValue && normalizedRowValue === normalizedProcessValue;
            if (exactMatch || normalizedMatch) {
                console.log('findProcessRow: Found row by rowIndex:', rowIndex, 'id_product matches:', processValueResolved);
                return row;
            } else {
                // CRITICAL: If id_product doesn't match, DO NOT use this row
                // 逻辑保持不变，仅降级为 log，避免在正常回退场景下刷 warn
                console.log('findProcessRow: rowIndex provided but id_product mismatch, falling back to id_product search.', {
                    rowIndex,
                    expected: processValueResolved,
                    found: rowValue
                });
            }
        } else {
            console.log('findProcessRow: rowIndex provided but row is invalid, falling back to id_product search.', {
                rowIndex
            });
        }
    }

    // 完整 id_product（ALLBET95MS(SV)MYR / (KM) / (SEXY) 等）只做精确或去空格匹配，不归一成同一 base
    const normalizeSpaces = (s) => (s || '').trim().replace(/\s+/g, '');
    console.log('findProcessRow: Searching all rows for id_product:', processValueResolved);
    for (let i = 0; i < tableData.rows.length; i++) {
        const row = tableData.rows[i];
        if (row.length > 1 && row[1].type === 'data') {
            const rowValue = row[1].value;
            if (rowValue === processValueResolved) {
                console.log('findProcessRow: Found row at index:', i, 'by exact match');
                return row;
            }
            if (useExactOnly && normalizeSpaces(rowValue) === normalizeSpaces(processValueResolved)) {
                console.log('findProcessRow: Found row at index:', i, 'by normalize-spaces match');
                return row;
            }
            if (!useExactOnly) {
                const normalizedRowValue = normalizeIdProductText(rowValue);
                if (normalizedRowValue && normalizedRowValue === normalizedProcessValue) {
                    console.log('findProcessRow: Found row at index:', i, 'by normalized match');
                    return row;
                }
            }
        }
    }

    // Fallback: 强制按「去掉说明文字后的 id_product」再比一次，确保像 "FAH07P1* (红股10%)"
    // 这种把 Description 拼在括号里的情况，仍然只按纯 ID_PRODUCT 匹配。
    try {
        const fallbackTarget = (typeof normalizeIdProductText === 'function')
            ? normalizeIdProductText(processValueResolved)
            : processValueResolved.trim();
        if (fallbackTarget) {
            for (let i = 0; i < tableData.rows.length; i++) {
                const row = tableData.rows[i];
                if (row.length > 1 && row[1].type === 'data') {
                    const raw = row[1].value;
                    const candidate = (typeof normalizeIdProductText === 'function')
                        ? normalizeIdProductText(raw)
                        : String(raw || '').trim();
                    if (candidate && candidate === fallbackTarget) {
                        console.log('findProcessRow: Fallback matched row at index:', i, 'by normalized id_product only (ignoring description)');
                        return row;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('findProcessRow: fallback normalized-id match failed:', e);
    }

    console.error('findProcessRow: No row found for processValue:', processValueResolved, 'rowIndex:', rowIndex);
    return null;
}

/** Row label (A, B, C, …) from capture table for a given id_product / row index. */
function getRowLabelFromProcessValue(processValue, rowIndexOverride = null) {
    try {
        const parsedTableData = readTransformedTableData();
        if (!parsedTableData) return null;

        const processRow = findProcessRow(parsedTableData, processValue, rowIndexOverride);
        if (!processRow?.length) return null;

        if (processRow[0]?.type === "header") {
            return String(processRow[0].value || "").trim() || null;
        }
        return null;
    } catch (error) {
        console.error("Error getting row label from process value:", error);
        return null;
    }
}

// Get column value by id_product and column_number (for reference format [id_product : column])

function getColumnValueByIdProduct(idProduct, columnNumber) {
    try {
        // Use transformed table data if available, otherwise get from localStorage
        let parsedTableData;
        parsedTableData = readTransformedTableData();
        if (!parsedTableData) {
            console.error('No captured table data found');
            return null;
        }

        // Find the row that matches the id_product
        const processRow = findProcessRow(parsedTableData, idProduct);
        if (!processRow) {
            console.error('Process row not found for:', idProduct);
            return null;
        }

        // Get column value (column A is at index 1, B at 2, etc.)
        const colIndex = parseInt(columnNumber);
        if (colIndex >= 1 && colIndex < processRow.length) {
            const cellData = processRow[colIndex];
            if (cellData && cellData.type === 'data' && (cellData.value !== null && cellData.value !== undefined && cellData.value !== '')) {
                // Remove formatting including $ symbol and return numeric value
                let cellValue = cellData.value.toString();
                // Remove $ symbol first, then remove thousands separators
                cellValue = cellValue.replace(/\$/g, '');
                const numericValue = removeThousandsSeparators(cellValue);
                return numericValue;
            }
        }

        return null;
    } catch (error) {
        console.error('Error getting column value by id_product:', error);
        return null;
    }
}

// Get column value from cell reference (e.g., "A4" -> value from row A, column 4)

function getColumnValueFromCellReference(cellReference, processValue, rowIndexOverride = null) {
    try {
        if (!cellReference || !processValue) {
            return null;
        }

        // Parse cell reference (e.g., "A4" -> rowLabel="A", columnNumber=4)
        const cellRefMatch = cellReference.match(/^([A-Za-z]+)(\d+)$/);
        if (!cellRefMatch) {
            return null;
        }

        const rowLabel = cellRefMatch[1].toUpperCase();
        const columnNumber = parseInt(cellRefMatch[2]);

        if (isNaN(columnNumber) || columnNumber < 1) {
            return null;
        }

        const parsedTableData = readTransformedTableData();
        if (!parsedTableData) {
            return null;
        }

        // Find the row that matches the process value
        // If rowIndexOverride is provided, use it to disambiguate duplicated id_product rows.
        const processRow = findProcessRow(parsedTableData, processValue, rowIndexOverride);
        if (!processRow || processRow.length === 0) {
            return null;
        }

        // Verify row label matches
        if (processRow[0] && processRow[0].type === 'header') {
            const actualRowLabel = processRow[0].value.trim().toUpperCase();
            if (actualRowLabel !== rowLabel) {
                // Row label doesn't match, return null
                return null;
            }
        }

        // Get column value (column A is at index 1, B at 2, etc.)
        // Column number corresponds to column index in the table
        if (columnNumber >= 1 && columnNumber < processRow.length) {
            const cellData = processRow[columnNumber];
            if (cellData && cellData.type === 'data' && (cellData.value !== null && cellData.value !== undefined && cellData.value !== '')) {
                // Remove formatting including $ symbol and return numeric value
                let cellValue = cellData.value.toString();
                // Remove $ symbol first, then remove thousands separators
                cellValue = cellValue.replace(/\$/g, '');
                const numericValue = removeThousandsSeparators(cellValue);
                return numericValue;
            }
        }

        return null;
    } catch (error) {
        console.error('Error getting column value from cell reference:', error);
        return null;
    }
}

// Parse reference format formula and replace with actual values
// Example: "[iphsp3 : 4] + [iphsp3 : 2]" -> "17 + 42"
// Also supports cell references: "A4 + A3" -> "17 + 42"

export function parseReferenceFormula(formula, processValueOverride = null, clickedCellRefsOverride = undefined, rowIndexOverride = null) {
    try {
        if (!formula || formula.trim() === '') {
            return '';
        }

        // Get process value from form
        const processInput = document.getElementById('process');
        const processValue = processValueOverride != null && String(processValueOverride).trim() !== ''
            ? String(processValueOverride).trim()
            : (processInput ? processInput.value.trim() : null);

        let parsedFormula = formula;

        // First, parse [id_product,数字] format (other row references)
        // Pattern: [id_product,数字] (e.g., "[BBB,1]", "[YONG,4]")
        const bracketPattern = /\[([^,\]]+),(\d+)\]/g;
        let match;
        const bracketMatches = [];

        bracketPattern.lastIndex = 0;
        while ((match = bracketPattern.exec(parsedFormula)) !== null) {
            const fullMatch = match[0]; // e.g., "[BBB,1]"
            const idProduct = match[1].trim(); // e.g., "BBB"
            const displayColumnIndex = parseInt(match[2]); // e.g., 1
            const matchIndex = match.index;

            if (!isNaN(displayColumnIndex) && displayColumnIndex > 0) {
                bracketMatches.push({
                    fullMatch: fullMatch,
                    idProduct: idProduct,
                    displayColumnIndex: displayColumnIndex,
                    index: matchIndex
                });
            }
        }

        // Replace [id_product,数字] with actual values (from back to front)
        bracketMatches.sort((a, b) => b.index - a.index);
        for (let i = 0; i < bracketMatches.length; i++) {
            const bracketMatch = bracketMatches[i];
            const dataColumnIndex = bracketMatch.displayColumnIndex - 1;

            // Get cell value using id_product and column index
            const columnValue = getCellValueByIdProductAndColumn(bracketMatch.idProduct, dataColumnIndex, null);

            if (columnValue !== null) {
                // 如果值是负数，需要用括号包裹
                let replacementValue = columnValue;
                const numericValue = parseFloat(columnValue);
                if (!isNaN(numericValue) && numericValue < 0) {
                    // 检查前一个字符，确定是否需要括号
                    const charBefore = bracketMatch.index > 0 ? parsedFormula[bracketMatch.index - 1] : '';
                    const needsParentheses = bracketMatch.index === 0 || /[+\-*/\(\s]/.test(charBefore);

                    if (needsParentheses) {
                        // 保留负号，然后用括号包裹：-264.34 -> (-264.34)
                        replacementValue = `(${columnValue})`;
                    }
                }

                parsedFormula = parsedFormula.substring(0, bracketMatch.index) +
                    replacementValue +
                    parsedFormula.substring(bracketMatch.index + bracketMatch.fullMatch.length);
            } else {
                console.warn(`Cell value not found for [${bracketMatch.idProduct},${bracketMatch.displayColumnIndex}]`);
                parsedFormula = parsedFormula.substring(0, bracketMatch.index) +
                    '0' +
                    parsedFormula.substring(bracketMatch.index + bracketMatch.fullMatch.length);
            }
        }

        // Then, parse $数字 format (current row references) (e.g., "$2", "$3", "$10")
        // This must be done after parsing [id_product,数字] to avoid conflicts
        // IMPORTANT: 优先从 data-clicked-cell-refs 读取引用，因为它包含了正确的 id_product
        // 重要：优先从 data-clicked-cell-refs 读取引用，因为它包含了正确的 id_product
        const formulaInput = document.getElementById('formula');
        // undefined：沿用 #formula（编辑弹窗/预览）；传入字符串（含 ''）则只用该值，避免 Summary 重算吃到弹窗里其他行的 refs
        let clickedCellRefs = '';
        if (clickedCellRefsOverride === undefined) {
            clickedCellRefs = (formulaInput ? (formulaInput.getAttribute('data-clicked-cell-refs') || '') : '').trim();
        } else {
            clickedCellRefs = String(clickedCellRefsOverride || '').trim();
        }

        if (processValue) {
            // Match $ followed by digits (e.g., $2, $10, $123)
            // Use negative lookahead to ensure we match complete numbers (e.g., $10 not $1 and $0)
            const dollarPattern = /\$(\d+)(?!\d)/g;
            const dollarMatches = [];
            let match;

            // Reset regex lastIndex
            dollarPattern.lastIndex = 0;

            // Collect all matches
            while ((match = dollarPattern.exec(formula)) !== null) {
                const fullMatch = match[0]; // e.g., "$2"
                const columnNumber = parseInt(match[1]); // e.g., 2
                const matchIndex = match.index;

                if (!isNaN(columnNumber) && columnNumber > 0) {
                    dollarMatches.push({
                        fullMatch: fullMatch,
                        columnNumber: columnNumber,
                        index: matchIndex
                    });
                }
            }

            // Replace from end to start to preserve indices
            dollarMatches.sort((a, b) => b.index - a.index);

            // 优先从 data-clicked-cell-refs 读取引用
            if (clickedCellRefs && clickedCellRefs.trim() !== '') {
                const refs = clickedCellRefs.trim().split(/\s+/).filter(r => r.trim() !== '');
                // $数字 中的列号是 displayColumnIndex，引用中存储的是 dataColumnIndex
                // dataColumnIndex = displayColumnIndex - 1
                let refIndex = 0; // 跟踪已使用的引用索引

                for (let i = 0; i < dollarMatches.length; i++) {
                    const dollarMatch = dollarMatches[i];
                    let columnValue = null;
                    const dataColumnIndex = dollarMatch.columnNumber - 1;

                    // 按顺序查找匹配的引用（使用 parseIdProductColumnRef 保留完整 id_product）
                    // IMPORTANT: $数字 仅应解析为当前编辑行；不能只按列号匹配，否则会串到其他 id_product 的引用。
                    for (let j = refIndex; j < refs.length; j++) {
                        const ref = refs[j];
                        const parsed = parseIdProductColumnRef(ref);
                        if (parsed && parsed.dataColumnIndex === dataColumnIndex) {
                            const refIdProduct = parsed.idProduct;
                            const isCurrentRowRef = processValue && (
                                (typeof isFullIdProduct === 'function' && isFullIdProduct(refIdProduct))
                                    ? (refIdProduct.trim() === String(processValue).trim())
                                    : (normalizeIdProductText(refIdProduct) === normalizeIdProductText(processValue))
                            );
                            if (!isCurrentRowRef) {
                                continue;
                            }
                            columnValue = getCellValueByIdProductAndColumn(parsed.idProduct, parsed.dataColumnIndex, parsed.rowLabel, parsed.captureRowIndex);
                            refIndex = j + 1;
                            break;
                        }
                    }

                    // 如果从引用中找不到值，回退到使用当前编辑的 id_product
                    if (columnValue === null) {
                        const rowLabel = getRowLabelFromProcessValue(processValue, rowIndexOverride);
                        if (rowLabel) {
                            const columnReference = rowLabel + dollarMatch.columnNumber;
                            columnValue = getColumnValueFromCellReference(columnReference, processValue, rowIndexOverride);
                        }
                    }

                    if (columnValue !== null) {
                        // Replace $数字 with actual value
                        // IMPORTANT: If value is negative, wrap it in parentheses to avoid syntax errors like -5861.14--1416.03
                        // 重要：如果值是负数，用括号包裹，避免出现 -5861.14--1416.03 这样的语法错误
                        let replacementValue = String(columnValue);
                        const numericValue = parseFloat(columnValue);
                        if (!isNaN(numericValue) && numericValue < 0) {
                            // Check if the character before $数字 is an operator or at the start
                            const charBefore = dollarMatch.index > 0 ? parsedFormula[dollarMatch.index - 1] : '';
                            const needsParentheses = dollarMatch.index === 0 || /[+\-*/\(\s]/.test(charBefore);
                            if (needsParentheses) {
                                replacementValue = `(${columnValue})`;
                            }
                        }
                        parsedFormula = parsedFormula.substring(0, dollarMatch.index) +
                            replacementValue +
                            parsedFormula.substring(dollarMatch.index + dollarMatch.fullMatch.length);
                    } else {
                        // If value not found, replace with 0
                        console.warn(`Cell value not found for $${dollarMatch.columnNumber}`);
                        parsedFormula = parsedFormula.substring(0, dollarMatch.index) +
                            '0' +
                            parsedFormula.substring(dollarMatch.index + dollarMatch.fullMatch.length);
                    }
                }
            } else {
                // 如果没有 data-clicked-cell-refs，使用原来的逻辑
                const rowLabel = getRowLabelFromProcessValue(processValue, rowIndexOverride);
                if (rowLabel) {
                    for (let i = 0; i < dollarMatches.length; i++) {
                        const dollarMatch = dollarMatches[i];
                        // Convert $数字 to cell reference (e.g., $2 -> A2)
                        const columnReference = rowLabel + dollarMatch.columnNumber;
                        const columnValue = getColumnValueFromCellReference(columnReference, processValue, rowIndexOverride);

                        if (columnValue !== null) {
                            // Replace $数字 with actual value
                            // IMPORTANT: If value is negative, wrap it in parentheses to avoid syntax errors like -5861.14--1416.03
                            // 重要：如果值是负数，用括号包裹，避免出现 -5861.14--1416.03 这样的语法错误
                            let replacementValue = String(columnValue);
                            const numericValue = parseFloat(columnValue);
                            if (!isNaN(numericValue) && numericValue < 0) {
                                // Check if the character before $数字 is an operator or at the start
                                const charBefore = dollarMatch.index > 0 ? parsedFormula[dollarMatch.index - 1] : '';
                                const needsParentheses = dollarMatch.index === 0 || /[+\-*/\(\s]/.test(charBefore);
                                if (needsParentheses) {
                                    replacementValue = `(${columnValue})`;
                                }
                            }
                            parsedFormula = parsedFormula.substring(0, dollarMatch.index) +
                                replacementValue +
                                parsedFormula.substring(dollarMatch.index + dollarMatch.fullMatch.length);
                        } else {
                            // If value not found, replace with 0
                            console.warn(`Cell value not found for $${dollarMatch.columnNumber} (${columnReference})`);
                            parsedFormula = parsedFormula.substring(0, dollarMatch.index) +
                                '0' +
                                parsedFormula.substring(dollarMatch.index + dollarMatch.fullMatch.length);
                        }
                    }
                }
            }
        }

        // Then, parse cell references (e.g., "A4", "B3")
        // Pattern: letter(s) followed by digits (e.g., "A4", "AA10")
        const cellReferencePattern = /\b([A-Za-z]+)(\d+)\b/g;

        // Store matches to avoid replacing while iterating
        const cellReferences = [];
        while ((match = cellReferencePattern.exec(parsedFormula)) !== null) {
            const fullMatch = match[0]; // e.g., "A4"
            const rowLabel = match[1]; // e.g., "A"
            const columnNumber = match[2]; // e.g., "4"

            // Check if this is a valid cell reference (not part of a number or operator)
            const beforeMatch = parsedFormula.substring(Math.max(0, match.index - 1), match.index);
            const afterMatch = parsedFormula.substring(match.index + fullMatch.length, Math.min(parsedFormula.length, match.index + fullMatch.length + 1));

            // Only treat as cell reference if:
            // - Not preceded by a letter or digit (to avoid matching "A" in "10A4")
            // - Not followed by a letter (to avoid matching "A" in "A4B")
            if (!/[A-Za-z0-9]/.test(beforeMatch) && !/[A-Za-z]/.test(afterMatch)) {
                cellReferences.push({
                    fullMatch: fullMatch,
                    index: match.index,
                    rowLabel: rowLabel,
                    columnNumber: columnNumber
                });
            }
        }

        // Replace cell references in reverse order to preserve indices
        for (let i = cellReferences.length - 1; i >= 0; i--) {
            const ref = cellReferences[i];
            const cellValue = processValue ? getColumnValueFromCellReference(ref.fullMatch, processValue, rowIndexOverride) : null;

            if (cellValue !== null) {
                // Replace the cell reference with the actual value
                // 如果值是负数，需要用括号包裹
                let replacementValue = cellValue;
                const numericValue = parseFloat(cellValue);
                if (!isNaN(numericValue) && numericValue < 0) {
                    // 检查前一个字符，确定是否需要括号
                    const charBefore = ref.index > 0 ? parsedFormula[ref.index - 1] : '';
                    const needsParentheses = ref.index === 0 || /[+\-*/\(\s]/.test(charBefore);

                    if (needsParentheses) {
                        // 保留负号，然后用括号包裹：-264.34 -> (-264.34)
                        replacementValue = `(${cellValue})`;
                    }
                }

                parsedFormula = parsedFormula.substring(0, ref.index) +
                    replacementValue +
                    parsedFormula.substring(ref.index + ref.fullMatch.length);
            } else {
                // If value not found, replace with 0
                console.warn(`Cell value not found for ${ref.fullMatch}`);
                parsedFormula = parsedFormula.substring(0, ref.index) +
                    '0' +
                    parsedFormula.substring(ref.index + ref.fullMatch.length);
            }
        }

        // Finally, parse reference format if present (e.g., [id_product : column_number])
        // IMPORTANT: column_number here is displayColumnIndex (e.g., 7 means column 7 in the table)
        // We need to convert it to dataColumnIndex for getCellValueByIdProductAndColumn
        const referencePattern = /\[([^\]]+)\s*:\s*(\d+)\]/g;

        while ((match = referencePattern.exec(parsedFormula)) !== null) {
            const fullMatch = match[0]; // e.g., "[OVERALL : 7]"
            const idProduct = match[1].trim(); // e.g., "OVERALL"
            const displayColumnIndex = parseInt(match[2]); // e.g., 7 (displayColumnIndex)

            // Convert displayColumnIndex to dataColumnIndex (dataColumnIndex = displayColumnIndex - 1)
            // Because: colIndex 1 = id_product, colIndex 2 = data column 1, so displayColumnIndex 7 = dataColumnIndex 6
            const dataColumnIndex = displayColumnIndex - 1;

            // IMPORTANT: Use getCellValueByIdProductAndColumn instead of getColumnValueByIdProduct
            // Because getCellValueByIdProductAndColumn can handle row_label if needed
            // Try without row_label first (most common case)
            let columnValue = getCellValueByIdProductAndColumn(idProduct, dataColumnIndex, null);

            if (columnValue !== null) {
                // Replace the reference with the actual value
                // 如果值是负数，需要用括号包裹
                let replacementValue = columnValue;
                const numericValue = parseFloat(columnValue);
                if (!isNaN(numericValue) && numericValue < 0) {
                    // 检查前一个字符，确定是否需要括号
                    const matchIndex = parsedFormula.indexOf(fullMatch);
                    const charBefore = matchIndex > 0 ? parsedFormula[matchIndex - 1] : '';
                    const needsParentheses = matchIndex === 0 || /[+\-*/\(\s]/.test(charBefore);

                    if (needsParentheses) {
                        // 保留负号，然后用括号包裹：-264.34 -> (-264.34)
                        replacementValue = `(${columnValue})`;
                    }
                }

                parsedFormula = parsedFormula.replace(fullMatch, replacementValue);
            } else {
                // If value not found, keep the reference or replace with 0
                console.warn(`Column value not found for [${idProduct} : ${displayColumnIndex}] (dataColumnIndex: ${dataColumnIndex})`);
                parsedFormula = parsedFormula.replace(fullMatch, '0');
            }
        }

        return parsedFormula;
    } catch (error) {
        console.error('Error parsing reference formula:', error);
        return formula; // Return original if parsing fails
    }
}

export function evaluateFormulaExpression(formula, processValueOverride = null, clickedCellRefsOverride = undefined, rowIndexOverride = null) {
    try {
        if (!formula || formula.trim() === '') {
            return 0;
        }

        // IMPORTANT: For pure numeric expressions (e.g., (-5861.14)-(-1416.03)),
        // check if they contain any reference formats ($, [, ]) before calling parseReferenceFormula
        // This avoids potential issues with parseReferenceFormula when processing pure numeric expressions
        // 重要：对于纯数字表达式（如 (-5861.14)-(-1416.03)），在调用 parseReferenceFormula 之前
        // 先检查是否包含任何引用格式（$、[、]），这样可以避免 parseReferenceFormula 处理纯数字表达式时可能出现的问题
        const trimmedFormula = formula.trim();
        const hasReferences = trimmedFormula.includes('$') ||
            trimmedFormula.includes('[') ||
            trimmedFormula.includes(']');

        if (!hasReferences) {
            // Pure numeric expression, evaluate directly without parseReferenceFormula
            // 纯数字表达式，直接计算，跳过 parseReferenceFormula
            let sanitized = removeThousandsSeparators(trimmedFormula.replace(/\s+/g, ''));
            sanitized = sanitized.replace(/\u2212/g, '-'); // Unicode minus -> ASCII minus
            if (/^[0-9+\-*/().]+$/.test(sanitized)) {
                const result = evaluateExpression(sanitized);
                const resultForLog = typeof truncateProcessedAmountTo6Decimals === 'function' ? truncateProcessedAmountTo6Decimals(result) : result;
                console.log('Formula expression evaluated (pure numeric, direct):', formula, '->', sanitized, '=', resultForLog);
                return result;
            }
        }

        // First, parse reference format if present (e.g., [iphsp3 : 4] -> 17)
        const parsedFormula = parseReferenceFormula(formula, processValueOverride, clickedCellRefsOverride, rowIndexOverride);

        // Remove spaces and evaluate
        // IMPORTANT: For formulas with negative numbers in parentheses (e.g., (-1234)-(-2234)),
        // ensure proper evaluation by directly using evaluateExpression
        // This ensures real-time calculation works correctly
        let sanitized = removeThousandsSeparators(parsedFormula.trim().replace(/\s+/g, ''));
        sanitized = sanitized.replace(/\u2212/g, '-'); // Unicode minus -> ASCII minus

        // Check if the formula contains only numbers, operators, and parentheses (no references)
        // If so, evaluate directly without additional parsing
        if (/^[0-9+\-*/().]+$/.test(sanitized)) {
            const result = evaluateExpression(sanitized);
            const resultForLog = typeof truncateProcessedAmountTo6Decimals === 'function' ? truncateProcessedAmountTo6Decimals(result) : result;
            console.log('Formula expression evaluated (direct):', formula, '->', sanitized, '=', resultForLog);
            return result;
        }

        // For formulas with references, use evaluateExpression after parsing
        const result = evaluateExpression(sanitized);
        const resultForLog = typeof truncateProcessedAmountTo6Decimals === 'function' ? truncateProcessedAmountTo6Decimals(result) : result;
        console.log('Formula expression evaluated:', formula, '->', parsedFormula, '=', resultForLog);
        return result;
    } catch (error) {
        console.error('Error evaluating formula expression:', error, 'formula:', formula);
        return 0;
    }
}

function hasBinaryAdditiveAtDepthZero(prefix) {
    if (!prefix || typeof prefix !== 'string') return false
    const str = prefix.replace(/\s+/g, '')
    let depth = 0
    for (let i = 0; i < str.length; i++) {
        const c = str[i]
        if (c === '(') {
            depth++
            continue
        }
        if (c === ')') {
            depth--
            continue
        }
        if (depth !== 0) continue
        if (c === '+') {
            if (i === 0) continue
            const prev = str[i - 1]
            if ('(*/^+-'.includes(prev)) continue
            if (/[0-9.)]/.test(prev)) return true
            continue
        }
        if (c === '-') {
            if (i === 0) continue
            const prev = str[i - 1]
            if (prev === '(' || '*/^+-'.includes(prev)) continue
            if (/[0-9.)]/.test(prev)) return true
        }
    }
    return false
}

// 仅当尾段乘子与当前 Source 数值相同时才剥掉，避免「公式里已乘 Source、外面再乘 Source」叠两层。
// 不再按 (0,1] 盲剥，否则会误删用户刻意写的 *0.2（Source=1 时）。
// 与 Source 同值时仍用 hasBinaryAdditiveAtDepthZero，避免误剥加法表达式末尾项上的占成。
function stripTrailingEmbeddedCommissionFactors(expr, sourceDecimal, options) {
    if (!expr || typeof expr !== 'string') return ''
    const stripDuplicateOfSource = options && options.stripDuplicateOfSource === true
    let src
    try {
        src = MoneyDecimal.toDecimal(sourceDecimal)
    } catch (_) {
        return expr.trim()
    }
    if (!stripDuplicateOfSource || sourceDecimal == null) {
        return expr.trim()
    }
    let s = expr.trim().replace(/\s+/g, '')
    const maxIter = 24
    for (let i = 0; i < maxIter && s.length > 0; i++) {
        const mParen = s.match(/^(.*)\*\(([0-9.]+)\)$/)
        if (mParen) {
            const v = MoneyDecimal.toDecimal(mParen[2], 0)
            if (v.minus(src).abs().lt('0.0001')) {
                const nextPrefix = mParen[1].trim()
                if (hasBinaryAdditiveAtDepthZero(nextPrefix)) {
                    break
                }
                s = nextPrefix
                continue
            }
        }
        const mStar = s.match(/^(.*)\*([0-9.]+)$/)
        if (mStar) {
            const v = MoneyDecimal.toDecimal(mStar[2], 0)
            if (v.minus(src).abs().lt('0.0001')) {
                const nextPrefix = mStar[1].trim()
                if (hasBinaryAdditiveAtDepthZero(nextPrefix)) {
                    break
                }
                s = nextPrefix
                continue
            }
        }
        break
    }
    return s
}

export function calculateFormulaResultFromExpression(formula, sourcePercentValue, inputMethod = '', enableInputMethod = false, enableSourcePercent = true, processValueForRefs = null, clickedCellRefsOverride = undefined, rowIndexOverride = null) {
    try {
        if (!formula) {
            return 0;
        }

        // 先解析 $/[id:n]；仅当尾段与 Source 同值时才剥，避免与 Source 叠乘，且不剥用户手写的 *0.2（Source≈1 时）
        const afterRefs = parseReferenceFormula(String(formula).trim(), processValueForRefs, clickedCellRefsOverride, rowIndexOverride)

        let shouldStripDuplicateOfSource = false
        let sourceDecimalForStrip = 1
        if (enableSourcePercent && sourcePercentValue && sourcePercentValue.trim() !== '') {
            try {
                const sanitizedForStrip = removeThousandsSeparators(sourcePercentValue.trim())
                const sp = MoneyDecimal.toDecimal(evaluateExpression(sanitizedForStrip), 0)
                if (sp.minus(1).abs().gte('0.0001')) {
                    shouldStripDuplicateOfSource = true
                    sourceDecimalForStrip = sp.toString()
                }
            } catch (e) { /* ignore */ }
        }

        // IMPORTANT: 只在启用 Source % 时才剥末尾乘子，避免 1000*0.18*(0.14) 再乘 Source 叠三层
        // 当 Source % 未启用时，公式末尾的 *(0.12) 等是用户手写的公式结构（先乘除后加减），
        // 不能剥掉，否则会破坏运算符优先级（例如 a+b*c*(0.12) 被错误计算为 (a+b*c)*0.12）
        let strippedBody, formulaResult;
        if (!enableSourcePercent) {
            // Source % 未启用：直接对完整公式求值，保留所有乘子，确保运算优先级正确
            strippedBody = afterRefs.trim();
            formulaResult = evaluateFormulaExpression(strippedBody, processValueForRefs, clickedCellRefsOverride, rowIndexOverride);
            // Apply input method transformation if enabled
            let result = formulaResult;
            if (enableInputMethod && inputMethod) {
                result = applyInputMethodTransformation(result, inputMethod);
            }
            console.log('Formula result calculated from expression (source percent disabled, no strip):', result);
            return result;
        }
        // Source % 启用时才剥与 Source 同值的末尾乘子，防止与 Source % 重复叠乘
        strippedBody = stripTrailingEmbeddedCommissionFactors(afterRefs.trim(), sourceDecimalForStrip, { stripDuplicateOfSource: shouldStripDuplicateOfSource })
        formulaResult = evaluateFormulaExpression(strippedBody, processValueForRefs, clickedCellRefsOverride, rowIndexOverride);

        // If enableSourcePercent is true but sourcePercentValue is empty, treat as 1 (100%)
        // IMPORTANT: Empty sourcePercentValue should be treated as 1 (100%), not 0, to avoid incorrect 0 results
        if (!sourcePercentValue || sourcePercentValue.trim() === '') {
            // Treat empty source percent as 1 (100%), so result = formulaResult * 1 = formulaResult
            let result = formulaResult;
            // Apply input method transformation if enabled
            if (enableInputMethod && inputMethod) {
                result = applyInputMethodTransformation(result, inputMethod);
            }
            console.log('Formula result calculated from expression (source percent is empty, treated as 1):', result);
            return result;
        }

        // Source percent is now in decimal format (e.g., 1 = 100%, 0.5 = 50%)
        // Evaluate the source percent expression directly (no need to divide by 100)
        const sourcePercentExpr = sourcePercentValue.trim();
        const sanitizedSourcePercent = removeThousandsSeparators(sourcePercentExpr);
        const decimalValue = MoneyDecimal.toDecimal(evaluateExpression(sanitizedSourcePercent), 0);

        // If source is 1, don't multiply (multiplying by 1 has no effect)
        // If formula已经含与 Source 相同的尾段，不再乘（用剥完后的式子判断，与 evaluate 输入一致）
        const formulaTrimmed = (strippedBody || '').trim().replace(/\s+/g, '');
        const srcNorm = sourcePercentExpr.replace(/\s+/g, '');
        let alreadyHasSource = formulaTrimmed.endsWith('*(' + srcNorm + ')') || formulaTrimmed.endsWith('*' + srcNorm);
        if (!alreadyHasSource && formulaTrimmed.endsWith(')')) {
            const lastClose = formulaTrimmed.length - 1;
            let depth = 1;
            let i = lastClose - 1;
            while (i >= 0 && depth > 0) {
                if (formulaTrimmed[i] === ')') depth++;
                else if (formulaTrimmed[i] === '(') { depth--; if (depth === 0) break; }
                i--;
            }
            if (depth === 0 && i >= 0) {
                const beforeParen = formulaTrimmed.substring(0, i).trimEnd();
                const trailingExpr = formulaTrimmed.substring(i + 1, lastClose);
                if (beforeParen.endsWith('*') && trailingExpr && /^[0-9+\-*/().\s]+$/.test(trailingExpr.replace(/\s/g, ''))) {
                    try {
                        const trailingVal = MoneyDecimal.toDecimal(evaluateExpression(trailingExpr), 0);
                        if (trailingVal.minus(decimalValue).abs().lt('0.0001')) {
                            alreadyHasSource = true;
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        }

        let result;
        if (decimalValue.minus(1).abs().lt('0.0001')) {
            result = formulaResult; // Don't multiply by 1
        } else if (alreadyHasSource) {
            result = formulaResult; // Formula already contains *(source), don't multiply again
        } else {
            // Calculate: formula result * source percent (already in decimal format)
            result = MoneyDecimal.mul(formulaResult, decimalValue).toString();
        }

        // Apply input method transformation if enabled
        if (enableInputMethod && inputMethod) {
            result = applyInputMethodTransformation(result, inputMethod);
        }

        console.log('Formula result calculated from expression:', result);
        return result;
    } catch (error) {
        console.error('Error calculating formula result from expression:', error);
        return 0;
    }
}

function applyInputMethodTransformation(result, inputMethod) {
    const value = MoneyDecimal.toDecimal(result, 0);
    switch (inputMethod) {
        case 'positive_to_negative_negative_to_positive':
            return value.neg().toString(); // Flip the sign
        case 'positive_to_negative_negative_to_zero':
            return value.gt(0) ? value.neg().toString() : '0'; // Positive becomes negative, negative becomes zero
        case 'negative_to_positive_positive_to_zero':
            return value.lt(0) ? value.neg().toString() : '0'; // Negative becomes positive, positive becomes zero
        case 'positive_unchanged_negative_to_zero':
            return value.gt(0) ? value.toString() : '0'; // Positive unchanged, negative becomes zero
        case 'negative_unchanged_positive_to_zero':
            return value.lt(0) ? value.toString() : '0'; // Negative unchanged, positive becomes zero
        case 'change_to_positive':
            return value.abs().toString(); // Always positive
        case 'change_to_negative':
            return value.abs().neg().toString(); // Always negative
        case 'change_to_zero':
            return '0'; // Always zero
        default:
            return value.toString(); // No transformation
    }
}
