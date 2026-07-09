/** Generic / fallback cell paste (payment reports, TSV, HTML). */
import { detectHtmlTableInClipboard } from "./dataCaptureClipboard.js";
import {
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
  parseCitibetFormatBasedPaste,
} from "../vendors/dataCaptureCitibetParsers.js";
import {
  parseSimplePaymentReport,
  parseFullPaymentReport,
  parseExcelFormatPaymentReport,
} from "./dataCapturePaymentParsers.js";
import { formatNumberToTwoDecimals } from "./dataCapturePasteMoneyUtils.js";
import { parsePastedData } from "./dataCaptureParsePastedData.js";




import { applyParsedMatrixToGrid, parseGenericHtmlTable } from "./dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste, runConvertTableOnSubmit } from "../../lib/dataCaptureBridge.js";

/** @returns {boolean} */
export function handleGenericPaste(e, pastedData) {
  if (!pastedData) {
    const clipboard = e.clipboardData || window.clipboardData;
    const getData = (type) => {
      try {
        return clipboard?.getData?.(type) || "";
      } catch {
        return "";
      }
    };
    pastedData = getData("text/plain") || getData("text") || getData("Text") || "";
  }
    const loweredForDetect = (pastedData || '').toLowerCase();
    const isPaymentReportLike =
        loweredForDetect.includes('downline payment') &&
        loweredForDetect.includes('profit/loss');

    // 对于 Payment Report（包含 DOWNLINE PAYMENT / PROFIT/LOSS 的），
    // 强制走纯文本解析逻辑，避免 HTML 分支抢先处理导致无法做「只保留 MAJOR / 忽略 NO/LVL/MINOR」的特殊规则。
    if (!isPaymentReportLike) {
        // 只有在不是 Payment Report 的情况下，才尝试用 HTML 表格解析
        const htmlData = detectHtmlTableInClipboard(e);
        if (htmlData) {
            const startCell = e.target;
            const filled = parseGenericHtmlTable(htmlData, startCell);
            if (filled) {
                // HTML表格已直接填充，更新提交按钮状态
                recomputeSubmitStateAfterPaste();
                return true;
            }
        }

        // 通用多行表格数据处理：如果HTML解析失败，但数据是多行制表符分隔的，使用简单分割
        const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedData.split('\n').map(line => line.trim()).filter(line => line !== '');

        // 检查是否是多行制表符分隔的数据（标准表格格式，如从Excel复制）
        if (lines.length >= 2) {
            const hasTabSeparator = lines.some(line => line.includes('\t'));

            if (hasTabSeparator) {
                // 尝试解析为多行表格数据
                const dataMatrix = [];
                let maxCols = 0;

                lines.forEach(line => {
                    if (line.includes('\t')) {
                        const cells = line.split('\t').map(c => c.trim());
                        dataMatrix.push(cells);
                        maxCols = Math.max(maxCols, cells.length);
                    } else if (line !== '') {
                        // 如果没有制表符但有内容，作为单列数据
                        dataMatrix.push([line]);
                        maxCols = Math.max(maxCols, 1);
                    }
                });

                // 确保所有行都有相同的列数
                dataMatrix.forEach(row => {
                    while (row.length < maxCols) {
                        row.push('');
                    }
                });

                // 如果成功解析成多行数据，填充到表格
                if (dataMatrix.length > 0 && maxCols > 0) {
                    const result = applyParsedMatrixToGrid(dataMatrix, e.target, { trimValues: true });
                    if (result.applied) {
                        notifyPasteUser(
                            `成功粘贴 ${result.successCount} 个单元格 (${result.maxRows} 行 x ${result.maxCols} 列)! 按 Ctrl+Z 可撤销`,
                            "success",
                        );
                        recomputeSubmitStateAfterPaste();
                        return true;
                    }
                }
            }
        }
    }

    // 使用普通的文本格式处理（包括 Payment Report 的专用解析）

    console.log('=== PASTE DEBUG START ===');
    console.log('Pasted data length:', pastedData.length);
    console.log('Pasted data raw (first 500 chars):', JSON.stringify(pastedData.substring(0, 500)));

    // 新增：先尝试Excel格式解析（MY EARNINGS金额在列10的格式）
    const excelFormatParsed = parseExcelFormatPaymentReport(pastedData);
    if (excelFormatParsed) {
        const { dataMatrix, maxRows, maxCols } = excelFormatParsed;
        const { successCount } = applyParsedMatrixToGrid(dataMatrix, e.target, { uppercaseValues: true });

        if (successCount > 0) {
            notifyPasteUser(`Successfully pasted Excel format (${successCount} cells, ${maxRows} rows x ${maxCols} cols)!`, 'success');
        } else {
            notifyPasteUser('No cells were pasted from Excel format.', 'danger');
        }

        recomputeSubmitStateAfterPaste();

        if (successCount > 0) {
            setTimeout(() => {
                runConvertTableOnSubmit();
            }, 100);
        }

        return;
    }

    // 先尝试使用「完整 Payment Report 解析」，专门处理 riding formula.txt 这一类结构
    const fullPayment = parseFullPaymentReport(pastedData);
    if (fullPayment) {
        const { dataMatrix, maxRows, maxCols } = fullPayment;
        const { successCount } = applyParsedMatrixToGrid(dataMatrix, e.target, { uppercaseValues: true });

        if (successCount > 0) {
            notifyPasteUser(`Successfully pasted ${successCount} cells (${maxRows} rows x ${maxCols} cols)!`, 'success');
        } else {
            notifyPasteUser('No cells were pasted from payment report.', 'danger');
        }

        recomputeSubmitStateAfterPaste();

        if (successCount > 0) {
            setTimeout(() => {
                runConvertTableOnSubmit();
            }, 100);
        }

        console.log('=== PASTE DEBUG END (full payment parser) ===');
        return;
    }

    // 如果不是完整 Payment Report，再尝试简单版解析（旧逻辑，兼容其它报表）
    const simplePayment = parseSimplePaymentReport(pastedData);
    if (simplePayment) {
        const { dataMatrix, maxRows, maxCols } = simplePayment;
        const { successCount } = applyParsedMatrixToGrid(dataMatrix, e.target, { uppercaseValues: true });

        if (successCount > 0) {
            notifyPasteUser(`Successfully pasted ${successCount} cells (${maxRows} rows x ${maxCols} cols)!`, 'success');
        } else {
            notifyPasteUser('No cells were pasted from payment report.', 'danger');
        }

        recomputeSubmitStateAfterPaste();

        if (successCount > 0) {
            setTimeout(() => {
                runConvertTableOnSubmit();
            }, 100);
        }

        console.log('=== PASTE DEBUG END (simple payment parser) ===');
        return;
    }

    // 检测并处理单行空格分隔的数据（从PDF复制的情况）
    // 例如: "AG:ASIAGAMING - GSC LC - VTBM PT 7.50 (MYR) 1,758.33 131.87"
    // 应该分割成多列: A1="AG:ASIAGAMING - GSC LC - VTBM", B1="PT", C1="7.50", D1="(MYR) 1,758.33", E1="131.87"
    const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedData.split('\n').map(line => line.trim()).filter(line => line !== '');

    // 如果是单行数据，且不包含制表符，尝试按空格分割
    if (lines.length === 1 && !normalizedData.includes('\t')) {
        const singleLine = lines[0];

        // 方法1: 先尝试按多个空格分割（PDF表格列之间通常有多个空格）
        // 保留空单元格的位置，以便在粘贴时保留空列
        const multiSpaceSplit = singleLine.split(/\s{2,}/).map(part => part.trim());

        // 方法2: 如果多个空格分割结果太少，使用智能分割
        let finalSplit = [];

        if (multiSpaceSplit.length >= 2) {
            // 多个空格分割结果合理，使用它（保留空字符串以表示空列）
            finalSplit = multiSpaceSplit;
            console.log('Using multi-space split:', finalSplit);
        } else {
            // 使用智能分割
            const words = singleLine.split(/\s+/).filter(w => w.trim() !== '');

            if (words.length >= 3) {
                console.log('Detected single-line space-separated data from PDF, using smart split');
                console.log('Original:', singleLine);
                console.log('Words:', words);

                // 智能分割：识别产品名称、类型代码、数值等
                const smartSplit = [];
                let currentPart = '';
                let i = 0;

                while (i < words.length) {
                    const word = words[i];
                    const nextWord = i + 1 < words.length ? words[i + 1] : null;
                    const nextNextWord = i + 2 < words.length ? words[i + 2] : null;

                    // 检测产品名称的开始（包含冒号，如 "AG:ASIAGAMING"）
                    if (word.includes(':') && currentPart === '') {
                        currentPart = word;
                        i++;

                        // 继续累积产品名称，直到遇到类型代码或数值
                        while (i < words.length) {
                            const w = words[i];
                            // 检查是否是类型代码
                            const isTypeCode = /^(PT|TYPE|TYPE:|TYPE\s*)$/i.test(w);
                            // 检查是否是数值
                            const isNumeric = /^[+-]?[\d,]+(\.\d+)?$/.test(w.replace(/[(),]/g, ''));

                            if (isTypeCode || isNumeric) {
                                // 遇到类型代码或数值，结束产品名称
                                break;
                            }

                            // 继续累积（可能包含连字符，如 "- GSC LC - VTBM"）
                            currentPart += ' ' + w;
                            i++;
                        }

                        if (currentPart) {
                            smartSplit.push(currentPart);
                            currentPart = '';
                        }
                        continue;
                    }

                    // 处理类型代码（如 PT）
                    if (/^(PT|TYPE|TYPE:|TYPE\s*)$/i.test(word)) {
                        if (currentPart) {
                            smartSplit.push(currentPart);
                            currentPart = '';
                        }
                        smartSplit.push(word);
                        i++;
                        continue;
                    }

                    // 处理括号内容（如 (MYR)）
                    if (word.startsWith('(')) {
                        if (currentPart) {
                            smartSplit.push(currentPart);
                            currentPart = '';
                        }

                        // 检查下一个词是否是数值
                        if (nextWord && /^[\d,.-]+$/.test(nextWord.replace(/[(),]/g, ''))) {
                            // 合并括号内容和数值
                            smartSplit.push(word + ' ' + nextWord);
                            i += 2;
                        } else {
                            // 单独的括号内容
                            smartSplit.push(word);
                            i++;
                        }
                        continue;
                    }

                    // 处理数值
                    const isNumeric = /^[+-]?[\d,]+(\.\d+)?$/.test(word.replace(/[(),]/g, ''));
                    if (isNumeric) {
                        if (currentPart) {
                            smartSplit.push(currentPart);
                            currentPart = '';
                        }
                        smartSplit.push(word);
                        i++;
                        continue;
                    }

                    // 其他情况：累积到当前部分
                    currentPart = (currentPart ? currentPart + ' ' : '') + word;
                    i++;
                }

                // 添加最后的部分
                if (currentPart) {
                    smartSplit.push(currentPart);
                }

                finalSplit = smartSplit.length >= 2 ? smartSplit : words;
                console.log('Smart split result:', finalSplit);
            } else {
                // 单词太少，不处理
                finalSplit = [];
            }
        }

        // 如果成功分割成多列，填充到表格
        if (finalSplit.length >= 2) {

            console.log('Final split result:', finalSplit);

            const { successCount } = applyParsedMatrixToGrid([finalSplit], e.target, {
                trimValues: true,
                uppercaseValues: true,
            });

            if (successCount > 0) {
                notifyPasteUser(`Successfully pasted ${successCount} cells in ${finalSplit.length} columns!`, 'success');
            }

            recomputeSubmitStateAfterPaste();

            if (successCount > 0) {
                setTimeout(() => {
                    runConvertTableOnSubmit();
                }, 100);
            }

            console.log('=== PASTE DEBUG END (single-line space-separated parser) ===');
            return;
        }
    }

    // 智能解析粘贴数据
    const parseResult = parsePastedData(pastedData);
    let rows = parseResult.rows;

    // ===== 特殊处理：合并单行表格数据（即使有换行符也保持在同一行） =====
    // 检测是否是单行表格数据被换行符分割的情况
    // 例如：allbet95sgd\t\r\n901\r\n374.40\t374.40\t... 应该合并成一行
    // 但是：如果包含"Grand Total"行，应该保持为两行（第一行数据 + Grand Total行）
    if (rows.length > 1) {
        // 首先检查是否包含"Grand Total"行（作为分隔点）
        let grandTotalIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i].trim();
            if (row === '') continue;

            // 检查是否包含"Grand Total"（不区分大小写）
            const rowUpper = row.toUpperCase();
            const cells = row.split('\t').map(c => c.trim().toUpperCase());
            if (rowUpper.includes('GRAND TOTAL') || cells.some(c => c === 'GRAND TOTAL' || c.includes('GRAND TOTAL'))) {
                grandTotalIndex = i;
                break;
            }
        }

        let hasTabSeparatedRow = false;
        let singleValueRows = [];
        let tabSeparatedRows = [];

        // 检查是否有包含制表符的行，以及单值行
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i].trim();
            if (row === '') continue;

            if (row.includes('\t')) {
                hasTabSeparatedRow = true;
                tabSeparatedRows.push({ index: i, row: row });
            } else {
                // 单值行（没有制表符）
                singleValueRows.push({ index: i, value: row });
            }
        }

        // 如果检测到"Grand Total"行，需要特殊处理
        if (grandTotalIndex >= 0) {
            // 检查 Grand Total 之前是否有多个制表符分隔的行
            const beforeGrandTotalTabRows = [];
            const beforeGrandTotalSingleRows = [];

            for (let i = 0; i < grandTotalIndex; i++) {
                const row = rows[i].trim();
                if (row === '') continue;

                if (row.includes('\t')) {
                    beforeGrandTotalTabRows.push({ index: i, row: row });
                } else {
                    beforeGrandTotalSingleRows.push({ index: i, value: row });
                }
            }

            // 检查 Grand Total 之前的数据是否包含多个行标识符
            // 需要检查制表符行和单值行，因为数据可能被分割
            let hasMultipleRowsWithIdentifiers = false;
            const allRowIdentifiers = [];

            // 检查制表符分隔的行
            for (let i = 0; i < beforeGrandTotalTabRows.length; i++) {
                const row = beforeGrandTotalTabRows[i].row;
                const cells = row.split('\t').map(c => c.trim());
                if (cells.length > 0 && cells[0]) {
                    const firstCell = cells[0];
                    // 检查是否是行标识符格式（如JDW01, JDW02, BW876等）
                    if (/^[A-Z]{2,}[A-Z0-9]*\d*$/i.test(firstCell) && firstCell.length >= 3 && firstCell.length <= 10) {
                        allRowIdentifiers.push({ type: 'tab', value: firstCell, index: beforeGrandTotalTabRows[i].index });
                    }
                }
            }

            // 检查单值行
            for (let i = 0; i < beforeGrandTotalSingleRows.length; i++) {
                const val = beforeGrandTotalSingleRows[i].value.trim();
                // 检查是否是行标识符格式（如JDW01, JDW02, BW876等）
                if (/^[A-Z]{2,}[A-Z0-9]*\d*$/i.test(val) && val.length >= 3 && val.length <= 10) {
                    allRowIdentifiers.push({ type: 'single', value: val, index: beforeGrandTotalSingleRows[i].index });
                }
            }

            // 如果找到2个或更多的行标识符，说明是多行独立数据，不应该合并
            if (allRowIdentifiers.length >= 2) {
                // 如果至少有2个行标识符是制表符行的第一列，说明是多行独立数据
                const tabRowIdentifiers = allRowIdentifiers.filter(r => r.type === 'tab');
                if (tabRowIdentifiers.length >= 2) {
                    hasMultipleRowsWithIdentifiers = true;
                    console.log('Detected multiple tab-separated rows with identifiers before Grand Total:', tabRowIdentifiers.map(r => r.value));
                    console.log('Keeping them separate instead of merging');
                } else {
                    // 如果行标识符分布在制表符行和单值行中，检查它们是否代表不同的行
                    const sortedIdentifiers = allRowIdentifiers.sort((a, b) => a.index - b.index);
                    let hasDataBetweenIdentifiers = false;

                    for (let i = 0; i < sortedIdentifiers.length - 1; i++) {
                        const currentIdx = sortedIdentifiers[i].index;
                        const nextIdx = sortedIdentifiers[i + 1].index;

                        // 检查两个标识符之间是否有其他数据
                        for (let j = currentIdx + 1; j < nextIdx; j++) {
                            if (rows[j] && rows[j].trim() !== '') {
                                hasDataBetweenIdentifiers = true;
                                break;
                            }
                        }

                        if (hasDataBetweenIdentifiers) break;
                    }

                    // 如果行标识符之间有数据，说明是不同的行
                    if (hasDataBetweenIdentifiers) {
                        hasMultipleRowsWithIdentifiers = true;
                        console.log('Detected multiple rows with identifiers before Grand Total:', allRowIdentifiers.map(r => r.value));
                        console.log('Keeping them separate instead of merging');
                    }
                }
            }

            // 如果 Grand Total 之前有多行独立数据，保持它们分开，不合并
            if (hasMultipleRowsWithIdentifiers) {
                // 只处理 Grand Total 行，保持之前的多行数据不变
                // 移除 Grand Total 行及其后面的空行，然后重新插入 Grand Total 行
                const grandTotalRow = rows[grandTotalIndex].trim();
                const grandTotalCells = grandTotalRow.includes('\t')
                    ? grandTotalRow.split('\t').map(c => c.trim())
                    : [grandTotalRow];

                // 找到最后一个数据行的索引
                let lastDataRowIndex = grandTotalIndex - 1;
                while (lastDataRowIndex >= 0 && rows[lastDataRowIndex].trim() === '') {
                    lastDataRowIndex--;
                }

                if (lastDataRowIndex >= 0) {
                    // 删除 Grand Total 行及其后面的空行
                    const indicesToRemove = [];
                    for (let i = grandTotalIndex; i < rows.length; i++) {
                        if (rows[i].trim() !== '') {
                            indicesToRemove.push(i);
                        }
                    }

                    // 从后往前删除
                    for (let idx of indicesToRemove.sort((a, b) => b - a)) {
                        rows.splice(idx, 1);
                    }

                    // 在最后一个数据行之后插入 Grand Total 行
                    const grandTotalRowText = grandTotalCells.join('\t');
                    rows.splice(lastDataRowIndex + 1, 0, grandTotalRowText);

                    console.log('Detected Grand Total row, kept multiple rows format before Grand Total');
                }
            } else {
                // 如果 Grand Total 之前的数据确实是单行被分割，则合并
                // 将数据分成两部分：
                // 1. 从开始到Grand Total行之前的所有行（合并成第一行）
                // 2. Grand Total行及其后面的数据（保持为第二行）

                const beforeGrandTotal = [];
                const grandTotalAndAfter = [];

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i].trim();
                    if (row === '') continue;

                    if (i < grandTotalIndex) {
                        // Grand Total行之前的数据
                        if (row.includes('\t')) {
                            const cells = row.split('\t').map(c => c.trim());
                            beforeGrandTotal.push(...cells);
                        } else {
                            beforeGrandTotal.push(row);
                        }
                    } else {
                        // Grand Total行及其后面的数据
                        if (row.includes('\t')) {
                            const cells = row.split('\t').map(c => c.trim());
                            grandTotalAndAfter.push(...cells);
                        } else {
                            grandTotalAndAfter.push(row);
                        }
                    }
                }

                // 如果两部分都有数据，创建两行
                if (beforeGrandTotal.length > 0 && grandTotalAndAfter.length > 0) {
                    // 找到第一个非空行的索引
                    let firstRowIndex = -1;
                    for (let i = 0; i < rows.length; i++) {
                        if (rows[i].trim() !== '') {
                            firstRowIndex = i;
                            break;
                        }
                    }

                    if (firstRowIndex >= 0) {
                        // 创建第一行（合并Grand Total之前的所有数据）
                        const firstRow = beforeGrandTotal.join('\t');
                        rows[firstRowIndex] = firstRow;

                        // 创建第二行（Grand Total及其后面的数据）
                        const secondRow = grandTotalAndAfter.join('\t');

                        // 删除中间的所有行，然后插入第二行
                        const indicesToRemove = [];
                        for (let i = firstRowIndex + 1; i < rows.length; i++) {
                            if (rows[i].trim() !== '') {
                                indicesToRemove.push(i);
                            }
                        }

                        // 从后往前删除，避免索引变化
                        for (let idx of indicesToRemove.sort((a, b) => b - a)) {
                            rows.splice(idx, 1);
                        }

                        // 插入第二行（在第一行之后）
                        rows.splice(firstRowIndex + 1, 0, secondRow);

                        console.log('Detected Grand Total row, merged single-row data before Grand Total');
                        console.log('First row:', firstRow);
                        console.log('Second row:', secondRow);
                    }
                }
            }
        } else {
            // 没有Grand Total行，使用原来的合并逻辑
            // 如果存在包含制表符的行，且有很多单值行，可能是同一行数据被分割了
            // 或者只有少量行（2-10行），且大部分是单值行，可能是同一行数据

            // 检查是否所有非空行都包含制表符（标准表格格式）
            // 如果是标准表格格式，不应该合并，即使行数少于6行
            let allRowsAreTabSeparated = true;
            let nonEmptyRowCount = 0;
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i].trim();
                if (row === '') continue;
                nonEmptyRowCount++;
                if (!row.includes('\t')) {
                    allRowsAreTabSeparated = false;
                    break;
                }
            }

            // 如果所有行都是制表符分隔的（标准表格格式），不进行合并
            // 这样可以保持少于6行的正常表格数据不被合并
            if (allRowsAreTabSeparated && nonEmptyRowCount > 0) {
                console.log('All rows are tab-separated (standard table format), skipping merge to preserve multi-row structure');
            } else if (hasTabSeparatedRow && singleValueRows.length > 0) {
                // 检查单值行是否看起来像是数值或标识符（而不是独立的行）
                const allSingleValuesAreData = singleValueRows.every(item => {
                    const val = item.value;
                    // 检查是否是数值、标识符（如allbet95sgd）或其他数据格式
                    return /^[\d.]+$/.test(val) || // 纯数字
                        /^[a-z0-9]+$/i.test(val) || // 字母数字组合（如allbet95sgd）
                        /^-?\d[\d,.-]*$/.test(val); // 带符号的数字
                });

                // 如果所有单值行都像是数据，且总行数不多（可能是单行数据被分割），则合并
                // 但只有当数据明显是单行被分割时（制表符行数量少于单值行数量）才合并
                const totalDataRows = tabSeparatedRows.length + singleValueRows.length;

                // 检查制表符分隔的行是否包含行标识符（如JDW01, JDW02等）
                // 如果有多行制表符分隔的数据，且每行的第一列都是行标识符，说明是多行独立数据，不应该合并
                let hasMultipleTabRowsWithIdentifiers = false;
                if (tabSeparatedRows.length >= 2) {
                    // 检查每行制表符分隔的数据的第一列是否是行标识符
                    const rowIdentifiers = [];
                    for (let i = 0; i < tabSeparatedRows.length; i++) {
                        const row = tabSeparatedRows[i].row;
                        const cells = row.split('\t').map(c => c.trim());
                        if (cells.length > 0 && cells[0]) {
                            const firstCell = cells[0];
                            // 检查是否是行标识符格式（如JDW01, JDW02, BW876等）
                            // 格式：字母数字组合，长度3-10，通常以字母开头
                            if (/^[A-Z]{2,}[A-Z0-9]*\d*$/i.test(firstCell) && firstCell.length >= 3 && firstCell.length <= 10) {
                                rowIdentifiers.push(firstCell);
                            }
                        }
                    }
                    // 如果有多行且每行的第一列都是行标识符，说明是多行独立数据
                    if (rowIdentifiers.length >= 2 && rowIdentifiers.length === tabSeparatedRows.length) {
                        hasMultipleTabRowsWithIdentifiers = true;
                        console.log('Detected multiple tab-separated rows with row identifiers:', rowIdentifiers);
                        console.log('Skipping merge to preserve multi-row structure');
                    }
                }

                // 检查单值行中是否包含行标识符（如JDW01, JDW02等）
                // 如果单值行中包含行标识符，说明可能是多行数据被分割了，不应该合并
                let hasRowIdentifiersInSingleValues = false;
                if (singleValueRows.length > 0) {
                    const identifiersInSingleValues = singleValueRows.filter(item => {
                        const val = item.value.trim();
                        // 检查是否是行标识符格式（如JDW01, JDW02, BW876等）
                        return /^[A-Z]{2,}[A-Z0-9]*\d*$/i.test(val) && val.length >= 3 && val.length <= 10;
                    });
                    // 如果单值行中有2个或更多的行标识符，说明是多行数据，不应该合并
                    if (identifiersInSingleValues.length >= 2) {
                        hasRowIdentifiersInSingleValues = true;
                        console.log('Detected row identifiers in single-value rows:', identifiersInSingleValues.map(item => item.value));
                        console.log('Skipping merge to preserve multi-row structure');
                    }
                }

                // 修改条件：只有当制表符行数量明显少于单值行数量时，才认为是单行被分割
                const isLikelySingleRowSplit = tabSeparatedRows.length < singleValueRows.length ||
                    (tabSeparatedRows.length === 1 && singleValueRows.length >= 2);
                // 如果检测到多行制表符分隔的数据且每行都有行标识符，或者单值行中包含行标识符，不进行合并
                if (!hasMultipleTabRowsWithIdentifiers && !hasRowIdentifiersInSingleValues && allSingleValuesAreData && totalDataRows <= 10 && isLikelySingleRowSplit) {
                    // 收集所有需要合并的值（按原始顺序）
                    const allValues = [];
                    const allIndices = [];

                    // 收集所有非空行的索引和值（按原始顺序）
                    for (let i = 0; i < rows.length; i++) {
                        const row = rows[i];
                        const trimmed = row.trim();
                        if (trimmed === '') continue;

                        if (row.includes('\t')) {
                            // 制表符分隔的行，分割成多个值（保留空单元格）
                            const cells = row.split('\t').map(c => c.trim());
                            // 过滤掉末尾的空单元格（但保留中间的空单元格）
                            let filteredCells = [];
                            let foundNonEmpty = false;
                            for (let j = cells.length - 1; j >= 0; j--) {
                                if (cells[j] !== '' || foundNonEmpty) {
                                    foundNonEmpty = true;
                                    filteredCells.unshift(cells[j]);
                                }
                            }
                            allValues.push(...filteredCells);
                            allIndices.push(i);
                        } else {
                            // 单值行
                            allValues.push(trimmed);
                            allIndices.push(i);
                        }
                    }

                    // 如果收集到的值看起来像是一行表格数据（至少3个值），则合并
                    if (allValues.length >= 3) {
                        // 创建合并后的行（用制表符连接所有值）
                        const mergedRow = allValues.join('\t');

                        // 替换第一行，删除其他行
                        const firstDataRowIndex = allIndices[0];
                        rows[firstDataRowIndex] = mergedRow;

                        // 删除其他数据行（从后往前删除，避免索引变化）
                        const indicesToRemove = allIndices.slice(1).sort((a, b) => b - a);
                        for (let idx of indicesToRemove) {
                            rows.splice(idx, 1);
                        }

                        console.log('Merged single-row table data: combined', totalDataRows, 'rows into 1 row');
                        console.log('Merged row:', mergedRow);
                        console.log('Total cells in merged row:', allValues.length);
                    }
                }
            } else if (!hasTabSeparatedRow && singleValueRows.length > 0 && singleValueRows.length <= 15) {
                // 如果没有制表符行，但有很多单值行（可能是单行数据被完全分割）
                // 检查是否所有值都像是数据
                const allValuesAreData = singleValueRows.every(item => {
                    const val = item.value;
                    return /^[\d.]+$/.test(val) ||
                        /^[a-z0-9]+$/i.test(val) ||
                        /^-?\d[\d,.-]*$/.test(val);
                });

                // 只有当数据明显是单行被分割时（所有值都是简单的数据，没有行标识符），才合并
                // 如果数据包含行标识符（如BW876, BW97等），说明是多行数据，不应该合并
                const hasRowIdentifiers = singleValueRows.some(item => {
                    const val = item.value.trim();
                    // 检查是否是行标识符格式（如BW876, BW97, BWGM等）
                    return /^[A-Z]{2,}[A-Z0-9]*\d*$/i.test(val) && val.length >= 3 && val.length <= 10;
                });

                // 如果包含行标识符，说明是多行数据，不应该合并
                if (hasRowIdentifiers) {
                    console.log('Detected row identifiers in data, skipping merge to preserve multi-row structure');
                } else if (allValuesAreData && singleValueRows.length >= 3) {
                    // 合并所有单值行成一行
                    const allValues = singleValueRows.map(item => item.value);
                    const mergedRow = allValues.join('\t');

                    // 替换第一行，删除其他行
                    rows[singleValueRows[0].index] = mergedRow;
                    const indicesToRemove = singleValueRows.slice(1).map(item => item.index).sort((a, b) => b - a);
                    for (let idx of indicesToRemove) {
                        rows.splice(idx, 1);
                    }

                    console.log('Merged single-row table data (no tabs): combined', singleValueRows.length, 'rows into 1 row');
                    console.log('Merged row:', mergedRow);
                }
            }
        }
    }
    // ===== 单行表格数据合并处理结束 =====

    // ===== 专用过滤：Downline Payment 报表（纯文本格式） =====
    // 检测是否是 Downline Payment 格式（从 Excel/Google Sheet 复制）
    // 特征：可能包含 Overall、My Earnings、IPHSP3 IPHSP3 MAJOR、MG 行等
    let isDownlinePaymentText = false;
    if (rows.length >= 2) {
        // 检查是否包含 Overall 行
        const hasOverall = rows.some(row => {
            const cells = row.split('\t').map(c => c.trim());
            return (cells[0] || '').toString().toUpperCase().includes('OVERALL');
        });

        // 检查是否包含 IPHSP3 IPHSP3 MAJOR 格式的行
        const hasIPHSP3Major = rows.some(row => {
            const cells = row.split('\t').map(c => c.trim());
            const r0a = (cells[0] || '').toString().toUpperCase();
            const r0b = (cells[1] || '').toString().toUpperCase();
            const r0c = (cells[2] || '').toString().toUpperCase();
            return r0a && r0a === r0b && r0c === 'MAJOR';
        });

        // 检查是否有 MG 行
        const hasMGRow = rows.some(row => {
            const cells = row.split('\t').map(c => c.trim());
            return (cells[0] || '').toString().toUpperCase() === 'MG';
        });

        // 如果包含 Overall 或 IPHSP3 MAJOR 格式，且包含 MG 行，则认为是 Downline Payment 格式
        if ((hasOverall || hasIPHSP3Major) && hasMGRow) {
            isDownlinePaymentText = true;
        }
    }

    if (isDownlinePaymentText) {
        console.log('Detected Downline Payment format (text), applying filter...');
        const filteredRows = [];

        // 首先处理 Overall 行（如果存在）
        let overallIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const rowCells = rows[i].split('\t').map(c => c.trim());
            // 检查是否包含 OVERALL（可能在任意列）
            let hasOverall = false;
            let overallTextIndex = -1;
            for (let j = 0; j < rowCells.length; j++) {
                if ((rowCells[j] || '').toString().toUpperCase().includes('OVERALL')) {
                    hasOverall = true;
                    overallTextIndex = j;
                    break;
                }
            }

            if (hasOverall) {
                // 创建新行，将 "OVERALL" 放在第一列，其他数据保持原位置
                const overallRow = new Array(11).fill('');
                if (overallTextIndex >= 0) {
                    overallRow[0] = rowCells[overallTextIndex].toUpperCase(); // 第一列：OVERALL
                    // 其他数据保持原列位置（不移动）
                    for (let j = 0; j < rowCells.length; j++) {
                        if (j !== overallTextIndex && rowCells[j] && j < 11) {
                            // 保持原列位置，但跳过 OVERALL 文本所在列
                            overallRow[j] = rowCells[j];
                        }
                    }
                } else {
                    // 如果没找到 OVERALL 文本，保持原样
                    for (let j = 0; j < Math.min(11, rowCells.length); j++) {
                        overallRow[j] = rowCells[j] || '';
                    }
                }
                filteredRows.push(overallRow.join('\t'));
                overallIndex = i;
                break;
            }
        }

        // 检查 Overall 行之后是否有 IPHSP3 数据（Upline Payment 部分）
        if (overallIndex >= 0) {
            for (let i = overallIndex + 1; i < rows.length; i++) {
                const rowCells = rows[i].split('\t').map(c => c.trim());
                const first = (rowCells[0] || '').toString().toUpperCase();

                // 如果遇到 My Earnings 或 Downline Payment，停止处理
                if (first.includes('MY EARNINGS') || first.includes('DOWNLINE PAYMENT') || first.includes('RINGGIT MALAYSIA')) {
                    break;
                }

                const r0a = (rowCells[0] || '').toString().toUpperCase();
                const r0b = (rowCells[1] || '').toString().toUpperCase();
                const r0c = (rowCells[2] || '').toString().toUpperCase();

                // 检查是否是 IPHSP3 IPHSP3 MAJOR/MINOR 格式（Upline Payment 部分的 IPHSP3）
                if (r0a && r0a === r0b && (r0c === 'MAJOR' || r0c === 'MINOR')) {
                    // 保留前11列
                    const ownerRow = [];
                    for (let j = 0; j < Math.min(11, rowCells.length); j++) {
                        ownerRow.push(rowCells[j] || '');
                    }
                    while (ownerRow.length < 11) ownerRow.push('');
                    filteredRows.push(ownerRow.join('\t'));

                    // 检查后面是否还有相同用户名的 MINOR/MAJOR 行
                    let j = i + 1;
                    while (j < rows.length) {
                        const nextRowCells = rows[j].split('\t').map(c => c.trim());
                        const nextA = (nextRowCells[0] || '').toString().toUpperCase();
                        const nextB = (nextRowCells[1] || '').toString().toUpperCase();
                        const nextC = (nextRowCells[2] || '').toString().toUpperCase();

                        // 如果遇到 My Earnings 或 Downline Payment，停止处理
                        if (nextA.includes('MY EARNINGS') || nextA.includes('DOWNLINE PAYMENT') || nextA.includes('RINGGIT MALAYSIA')) {
                            break;
                        }

                        // 如果是相同用户名且是 MINOR 或 MAJOR 行，也处理
                        if (nextA === r0a && nextB === r0b && (nextC === 'MINOR' || nextC === 'MAJOR')) {
                            const minorRow = [];
                            for (let k = 0; k < Math.min(11, nextRowCells.length); k++) {
                                minorRow.push(nextRowCells[k] || '');
                            }
                            while (minorRow.length < 11) minorRow.push('');
                            filteredRows.push(minorRow.join('\t'));
                            j++;
                        } else {
                            break;
                        }
                    }
                    i = j - 1;
                }
            }
        }

        // 处理 My Earnings 行（如果存在）：将标签放在第1列，金额放在第10列
        for (let i = 0; i < rows.length; i++) {
            const rowCells = rows[i].split('\t').map(c => c.trim());
            const first = (rowCells[0] || '').toString().toUpperCase();
            if (first.includes('MY EARNINGS') || first.includes('RINGGIT MALAYSIA')) {
                const earningsRow = new Array(11).fill('');

                // 尝试从第一列中分离标签和金额
                const firstCell = rowCells[0] || '';
                // 匹配金额模式（如 $0.00, ($123.45), -$50.00 等）
                const amountMatch = firstCell.match(/([\(]?[-]?\$?[\d,]+\.?\d*[\)]?)$/);

                if (amountMatch) {
                    // 找到金额，分离标签和金额
                    const amount = amountMatch[1];
                    const label = firstCell.substring(0, amountMatch.index).trim().toUpperCase();
                    earningsRow[0] = label;   // 列1：MY EARNINGS : (RINGGIT MALAYSIA (RM))
                    earningsRow[10] = amount;  // 列11：金额如 $0.00
                } else {
                    // 如果第一列没有金额，尝试从其他列找金额
                    // 先放标签到第一列
                    earningsRow[0] = firstCell.toUpperCase();

                    // 从右往左找金额（跳过可能的空列）
                    let foundAmount = false;
                    for (let j = rowCells.length - 1; j >= 1; j--) {
                        const cell = rowCells[j] || '';
                        if (cell && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(cell)) {
                            earningsRow[10] = cell; // 列11：金额
                            foundAmount = true;
                            break;
                        }
                    }

                    // 如果没找到金额，保持其他列的位置（向后兼容）
                    if (!foundAmount) {
                        for (let j = 1; j < Math.min(11, rowCells.length); j++) {
                            earningsRow[j] = rowCells[j] || '';
                        }
                    }
                }

                filteredRows.push(earningsRow.join('\t'));
                break;
            }
        }

        // 处理 IPHSP3 IPHSP3 MAJOR/MINOR 行（包括 Upline 和 Downline 部分的所有 IPHSP3 行）
        // 需要区分 Upline 和 Downline 部分的 IPHSP3 数据
        let startIndex = 0;
        let foundMyEarnings = false;
        let foundDownlinePayment = false;

        for (let i = 0; i < rows.length; i++) {
            const rowCells = rows[i].split('\t').map(c => c.trim());
            const first = (rowCells[0] || '').toString().toUpperCase();

            // 检查是否遇到 My Earnings 或 Downline Payment 标题
            if (first.includes('MY EARNINGS') || first.includes('RINGGIT MALAYSIA')) {
                foundMyEarnings = true;
            }
            if (first.includes('DOWNLINE PAYMENT')) {
                foundDownlinePayment = true;
            }

            const r0a = (rowCells[0] || '').toString().toUpperCase();
            const r0b = (rowCells[1] || '').toString().toUpperCase();
            const r0c = (rowCells[2] || '').toString().toUpperCase();

            // 检查是否是 IPHSP3 IPHSP3 MAJOR 或 MINOR 格式
            // 处理所有 IPHSP3 行，不管是在 Upline 还是 Downline 部分
            if (r0a && r0a === r0b && (r0c === 'MAJOR' || r0c === 'MINOR')) {
                // 保留前11列，忽略后面的列（如 No, Lvl 等）
                const ownerRow = [];
                for (let j = 0; j < Math.min(11, rowCells.length); j++) {
                    ownerRow.push(rowCells[j] || '');
                }
                while (ownerRow.length < 11) ownerRow.push('');
                filteredRows.push(ownerRow.join('\t'));

                // 检查后面是否还有相同用户名的 MINOR/MAJOR 行
                let j = i + 1;
                while (j < rows.length) {
                    const nextRowCells = rows[j].split('\t').map(c => c.trim());
                    const nextA = (nextRowCells[0] || '').toString().toUpperCase();
                    const nextB = (nextRowCells[1] || '').toString().toUpperCase();
                    const nextC = (nextRowCells[2] || '').toString().toUpperCase();

                    // 如果是相同用户名且是 MINOR 或 MAJOR 行，也处理
                    if (nextA === r0a && nextB === r0b && (nextC === 'MINOR' || nextC === 'MAJOR')) {
                        const minorRow = [];
                        for (let k = 0; k < Math.min(11, nextRowCells.length); k++) {
                            minorRow.push(nextRowCells[k] || '');
                        }
                        while (minorRow.length < 11) minorRow.push('');
                        filteredRows.push(minorRow.join('\t'));
                        j++;
                    } else {
                        break; // 不是相同用户名的行，停止处理
                    }
                }
                startIndex = Math.max(startIndex, j);
                i = j - 1; // 更新 i，因为 j 已经指向下一个需要处理的行
            }
        }

        // 处理后续行：合并 MG 行 + 后续的 MAJOR/MINOR 行（可能有多个）
        // 跳过已经处理过的行（Overall、My Earnings、IPHSP3 行）
        const processedIndices = new Set();
        for (let i = 0; i < rows.length; i++) {
            if (processedIndices.has(i)) continue;

            const rowCells = rows[i].split('\t').map(c => c.trim());
            const first = (rowCells[0] || '').toString().toUpperCase();

            // 跳过已经处理过的 Overall、My Earnings、IPHSP3 行
            if (first.includes('OVERALL') || first.includes('MY EARNINGS') || first.includes('RINGGIT MALAYSIA')) {
                continue;
            }

            // 跳过已经处理过的 IPHSP3 行
            const r0a = (rowCells[0] || '').toString().toUpperCase();
            const r0b = (rowCells[1] || '').toString().toUpperCase();
            const r0c = (rowCells[2] || '').toString().toUpperCase();
            if (r0a && r0a === r0b && (r0c === 'MAJOR' || r0c === 'MINOR')) {
                continue;
            }

            // 识别 "MG  m99m06" 这种行
            if (first === 'MG' && rowCells.length >= 2) {
                const parentUser = rowCells[1] || '';      // m99m06

                // 处理后续的所有 MAJOR 和 MINOR 行，直到遇到下一个 MG 行或数据结束
                let j = i + 1;
                while (j < rows.length) {
                    const nextRowCells = rows[j].split('\t').map(c => c.trim());
                    const nextFirst = (nextRowCells[0] || '').toString().toUpperCase();

                    // 如果遇到下一个 MG 行，停止处理
                    if (nextFirst === 'MG') {
                        break;
                    }

                    // 检查是否是 Total 行
                    if (nextFirst.includes('TOTAL') && (nextFirst.includes('RINGGIT') || nextFirst.includes('RM') || nextFirst.includes('MALAYSIA') || nextRowCells.some(c => c.includes('$') || c.includes('(')))) {
                        // 处理 Total 行：标签在列1，金额在列11
                        const totalRow = new Array(11).fill('');

                        // 尝试分离标签和金额
                        let label = '';
                        let amount = '';

                        // 查找包含 TOTAL 和 RINGGIT 的单元格
                        for (let k = 0; k < nextRowCells.length; k++) {
                            const cell = (nextRowCells[k] || '').trim();
                            const cellLower = cell.toLowerCase();
                            if (cellLower.includes('total') && (cellLower.includes('ringgit') || cellLower.includes('rm') || cellLower.includes('malaysia'))) {
                                // 尝试从这个单元格分离标签和金额
                                const labelAmountMatch = cell.match(/^(.+?)\s+([\(]?[-]?\$?[\d,]+\.?\d*[\)]?)$/);
                                if (labelAmountMatch) {
                                    label = labelAmountMatch[1].trim();
                                    amount = labelAmountMatch[2];
                                } else {
                                    label = cell;
                                }
                            } else if (cell && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(cell)) {
                                if (!amount) {
                                    amount = cell;
                                }
                            }
                        }

                        // 如果没找到标签，组合所有包含 TOTAL 的单元格
                        if (!label) {
                            const labelCells = [];
                            for (let k = 0; k < nextRowCells.length; k++) {
                                const cell = (nextRowCells[k] || '').trim();
                                if (cell.toLowerCase().includes('total') || cell.toLowerCase().includes('ringgit') || cell.toLowerCase().includes('rm') || cell.toLowerCase().includes('malaysia')) {
                                    labelCells.push(cell);
                                }
                            }
                            label = labelCells.join(' ');
                        }

                        totalRow[0] = label.toUpperCase();  // 列1：TOTAL : (RINGGIT MALAYSIA (RM))
                        totalRow[10] = amount;               // 列11：金额

                        filteredRows.push(totalRow.join('\t'));
                        processedIndices.add(j);
                        j++;
                        break; // Total 行通常是最后一行
                    }

                    const nextType = (nextRowCells[1] || '').toString().toUpperCase(); // 简化表里 type 在第二格

                    // 期望下一行形如 "M06-KZ  MAJOR  340  $2.38 ..." 或 "M06-KZ  MINOR  ..."
                    if (nextType === 'MAJOR' || nextType === 'MINOR') {
                        const downlineCode = nextRowCells[0] || '';   // M06-KZ

                        // 构建新行：parentUser | downlineCode | 类型 | Bet | Bet Tax | Eat | Eat Tax | Tax | Profit/Loss | Total Tax | Total Profit/Loss
                        const newRow = [
                            parentUser,
                            downlineCode,
                            nextType,  // 保留原始类型（MAJOR 或 MINOR）
                            nextRowCells[2] || '',  // Bet
                            nextRowCells[3] || '',  // Bet Tax
                            nextRowCells[4] || '',  // Eat
                            nextRowCells[5] || '',  // Eat Tax
                            nextRowCells[6] || '',  // Tax
                            nextRowCells[7] || '',  // Profit/Loss
                            nextRowCells[8] || '',  // Total Tax
                            nextRowCells[9] || ''   // Total Profit/Loss
                        ];

                        filteredRows.push(newRow.join('\t'));
                        processedIndices.add(j);
                        j++; // 继续处理下一行
                    } else {
                        // 如果不是 MAJOR/MINOR，可能是其他数据，停止处理这个 MG 组
                        break;
                    }
                }

                // 更新 i，因为 j 已经指向下一个需要处理的行
                i = j - 1;
                continue;
            }

            // 检查是否是 Total 行（不在 MG 组内的）
            if (first.includes('TOTAL') && (first.includes('RINGGIT') || first.includes('RM') || first.includes('MALAYSIA') || rowCells.some(c => c.includes('$') || c.includes('(')))) {
                // 处理 Total 行：标签在列1，金额在列11
                const totalRow = new Array(11).fill('');

                // 尝试分离标签和金额
                let label = '';
                let amount = '';

                // 查找包含 TOTAL 和 RINGGIT 的单元格
                for (let k = 0; k < rowCells.length; k++) {
                    const cell = (rowCells[k] || '').trim();
                    const cellLower = cell.toLowerCase();
                    if (cellLower.includes('total') && (cellLower.includes('ringgit') || cellLower.includes('rm') || cellLower.includes('malaysia'))) {
                        // 尝试从这个单元格分离标签和金额
                        const labelAmountMatch = cell.match(/^(.+?)\s+([\(]?[-]?\$?[\d,]+\.?\d*[\)]?)$/);
                        if (labelAmountMatch) {
                            label = labelAmountMatch[1].trim();
                            amount = labelAmountMatch[2];
                        } else {
                            label = cell;
                        }
                    } else if (cell && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(cell)) {
                        if (!amount) {
                            amount = cell;
                        }
                    }
                }

                // 如果没找到标签，组合所有包含 TOTAL 的单元格
                if (!label) {
                    const labelCells = [];
                    for (let k = 0; k < rowCells.length; k++) {
                        const cell = (rowCells[k] || '').trim();
                        if (cell.toLowerCase().includes('total') || cell.toLowerCase().includes('ringgit') || cell.toLowerCase().includes('rm') || cell.toLowerCase().includes('malaysia')) {
                            labelCells.push(cell);
                        }
                    }
                    label = labelCells.join(' ');
                }

                totalRow[0] = label.toUpperCase();  // 列1：TOTAL : (RINGGIT MALAYSIA (RM))
                totalRow[10] = amount;             // 列11：金额

                filteredRows.push(totalRow.join('\t'));
                processedIndices.add(i);
                continue;
            }
        }

        if (filteredRows.length > 0) {
            console.log('Downline Payment filter applied:', filteredRows.length, 'rows');
            rows = filteredRows;
        }
    }
    // ===== 专用过滤结束 =====

    // 智能过滤和合并：处理标识符行和数据行分离的情况
    // 模式1: 标识符行（如"KZ006\t"）+ 数据行
    // 模式2: 标识符行（如"KZ006"）+ 名称行（如"LUN-KL"）+ 数据行（如"-664.09\t822.00\t..."）
    let processedRows = [];
    let hasDataStarted = false;
    let trailingEmptyCount = 0;

    // 检测标识符模式（如KZ006, KZ010等）
    const identifierPattern = /^[A-Z]{2,}[A-Z0-9]*\d+$/i;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const trimmed = row.trim();

        if (trimmed !== '') {
            // 有数据的行
            hasDataStarted = true;
            trailingEmptyCount = 0;

            // 检查是否是单行值（没有制表符分隔，或只有一个非空单元格）
            const hasTabSeparator = row.includes('\t');
            const cells = row.split('\t').map(c => c.trim());
            const nonEmptyCells = cells.filter(c => c !== '');
            const isSingleValueRow = !hasTabSeparator || nonEmptyCells.length === 1;

            // 检查下一行是否是数据行（包含制表符分隔的多个值）
            let nextRowIsDataRow = false;
            if (i + 1 < rows.length) {
                const nextRow = rows[i + 1].trim();
                const nextRowHasTabs = nextRow.includes('\t');
                const nextRowCells = nextRow.split('\t').map(c => c.trim());
                const nextRowNonEmpty = nextRowCells.filter(c => c !== '');
                nextRowIsDataRow = nextRowHasTabs && nextRowNonEmpty.length > 1;
            }

            // 如果当前行是单值行，且下一行是数据行，则合并它们
            if (isSingleValueRow && nextRowIsDataRow) {
                const currentValue = trimmed;
                let nextRowIndex = i + 1;
                let nextRow = rows[nextRowIndex] ? rows[nextRowIndex].trim() : '';

                // 跳过空行，找到下一个有数据的行
                while (nextRowIndex < rows.length && nextRow === '') {
                    nextRowIndex++;
                    nextRow = rows[nextRowIndex] ? rows[nextRowIndex].trim() : '';
                }

                if (nextRow && nextRow.includes('\t')) {
                    // 使用原始行（不trim）来保留空列结构
                    const nextRowOriginal = rows[nextRowIndex];
                    const nextRowCells = nextRowOriginal.split('\t');
                    const nextRowFirstCol = (nextRowCells[0] || '').trim();

                    // 如果下一行第一列为空，将当前值作为第一列，但保留空列结构
                    // 否则将当前值添加到下一行开头
                    let mergedRow;
                    if (nextRowFirstCol === '') {
                        // 保留原始行的空列结构
                        // 找到第一个非空列的索引，保留之前的所有空列
                        let firstNonEmptyIndex = 0;
                        for (let j = 0; j < nextRowCells.length; j++) {
                            const cell = (nextRowCells[j] || '').trim();
                            if (cell !== '') {
                                firstNonEmptyIndex = j;
                                break;
                            }
                        }

                        // 构建合并行：当前值 + 保留的空列 + 剩余数据
                        // firstNonEmptyIndex 是第一个非空列的索引，也就是空列的数量
                        const restOfRow = nextRowCells.slice(firstNonEmptyIndex).join('\t');

                        // 构建合并行：当前值 + 保留的空列（用制表符分隔）+ 剩余数据
                        // 如果 firstNonEmptyIndex = 3，那么有3个空列
                        // 当前值会替换第一列，所以需要保留剩余的2个空列
                        if (firstNonEmptyIndex > 0) {
                            // 保留空列：添加 (firstNonEmptyIndex - 1) 个制表符（因为第一列已被当前值替换）
                            // 然后添加一个制表符来连接剩余数据
                            const emptyColsStr = firstNonEmptyIndex > 1 ? '\t'.repeat(firstNonEmptyIndex - 1) : '';
                            mergedRow = currentValue + '\t' + emptyColsStr + '\t' + restOfRow;
                        } else {
                            mergedRow = currentValue + '\t' + restOfRow;
                        }
                    } else {
                        // 将当前值添加到下一行开头
                        mergedRow = currentValue + '\t' + nextRowOriginal;
                    }

                    processedRows.push(mergedRow);
                    const skippedRows = nextRowIndex - i - 1;
                    i = nextRowIndex; // 跳到已合并的行
                    if (skippedRows > 0) {
                        console.log(`✓ Merged single value row "${currentValue}" with data row (skipped ${skippedRows} empty row(s))`);
                    } else {
                        console.log(`✓ Merged single value row "${currentValue}" with data row`);
                    }
                    continue;
                }
            }

            // 检查是否是标识符行
            const isIdentifierRow = identifierPattern.test(trimmed) ||
                (row.includes('\t') && row.split('\t').filter(cell => cell.trim() !== '').length === 1 && identifierPattern.test(trimmed.split('\t')[0]));

            if (isIdentifierRow) {
                // 这是一个标识符行，检查后续行
                let mergedRow = trimmed;
                let skipCount = 0;

                // 检查下一行是否是名称行（不包含制表符，且不是标识符）
                if (i + 1 < rows.length) {
                    const nextRow = rows[i + 1].trim();
                    const nextRowIsIdentifier = identifierPattern.test(nextRow);
                    const potentialDataRow = i + 2 < rows.length ? rows[i + 2].trim() : '';
                    const nextRowLooksLikeDataFollows = potentialDataRow !== '' && (potentialDataRow.includes('\t') || /^-?\d/.test(potentialDataRow));
                    const treatNextAsName = nextRow !== ''
                        && !nextRow.includes('\t')
                        && (
                            !nextRowIsIdentifier
                            || nextRow.toUpperCase() === trimmed.toUpperCase()
                            || nextRowLooksLikeDataFollows
                        );
                    if (treatNextAsName) {
                        // 下一行是名称行，合并它
                        mergedRow += '\t' + nextRow;
                        skipCount++;

                        // 检查再下一行是否是数据行（包含制表符或数值）
                        if (i + 2 < rows.length) {
                            const dataRow = rows[i + 2].trim();
                            if (dataRow !== '' && (dataRow.includes('\t') || /^-?\d/.test(dataRow))) {
                                // 这是数据行，合并它
                                mergedRow += '\t' + dataRow;
                                skipCount++;
                            }
                        }
                    } else if (nextRow !== '' && (nextRow.includes('\t') || /^-?\d/.test(nextRow))) {
                        // 下一行直接是数据行（没有名称行）
                        mergedRow += '\t' + nextRow;
                        skipCount++;
                    }
                }

                if (skipCount > 0) {
                    // 合并了后续行
                    processedRows.push(mergedRow);
                    i += skipCount; // 跳过已合并的行
                    console.log(`Merged ${skipCount + 1} rows: "${trimmed}" + ${skipCount} following row(s)`);
                    continue;
                }
            }

            processedRows.push(row);
        } else {
            // 空行
            if (hasDataStarted) {
                // 数据已经开始，空行可能代表空单元格，保留它
                processedRows.push(row);
                trailingEmptyCount++;
            }
            // 如果数据还没开始，跳过开头的空行
        }
    }

    // 移除结尾的连续空行（这些通常是多余的）
    while (trailingEmptyCount > 0 && processedRows.length > 0 && processedRows[processedRows.length - 1].trim() === '') {
        processedRows.pop();
        trailingEmptyCount--;
    }

    rows = processedRows;

    if (rows.length === 0) {
        console.log('No data to paste');
        return;
    }

    console.log('Number of rows after split:', rows.length);
    console.log('First 5 rows (raw):', rows.slice(0, 5).map(r => JSON.stringify(r)));
    console.log('Rows with empty values:', rows.filter(r => r.trim() === '').length);

    // 检测数据格式：是行优先（标准表格格式）还是列优先（垂直排列）
    // 行优先格式：每行包含多个列（用制表符分隔），行与行之间用换行符分隔
    // 列优先格式：每个单元格占一行，顺序是按列排列的

    let isColumnMajor = false; // 是否为列优先格式
    let estimatedColumns = 0;

    // 检测策略：
    // 1. 如果大部分行都包含制表符，可能是行优先格式
    // 2. 如果大部分行都不包含制表符，可能是列优先格式
    // 3. 如果数据量很大但列数很少，可能是列优先格式

    let rowsWithTabs = 0;
    let maxCellsInRow = 0;

    for (let row of rows) {
        const trimmed = row.trim();
        if (trimmed.includes('\t')) {
            rowsWithTabs++;
            const cellCount = trimmed.split('\t').length;
            maxCellsInRow = Math.max(maxCellsInRow, cellCount);
        }
    }

    const rowsWithTabsRatio = rowsWithTabs / rows.length;
    console.log('Rows with tabs:', rowsWithTabs, 'out of', rows.length, '(', (rowsWithTabsRatio * 100).toFixed(1), '%)');
    console.log('Max cells in a row:', maxCellsInRow);

    // 判断是否为特殊格式（每个单元格占一行的行优先格式）：
    // - 如果大部分行（少于30%）包含制表符，且行数很多，可能是特殊格式
    // - 这种格式：每个单元格占一行，顺序是行优先的（第一行的所有列，然后第二行的所有列）
    // - 或者是列优先的（第一列的所有行，然后第二列的所有行）

    // 首先，尝试识别格式模式
    // 如果大部分行是单个单元格（没有制表符），可能是特殊格式
    if (rowsWithTabsRatio < 0.3 && rows.length > 10) {
        // 这可能是特殊格式，需要进一步判断是行优先还是列优先
        // 从数据模式来看，可能是行优先（每个单元格占一行）
        // 尝试通过数据模式来判断

        // 临时假设：先按行优先处理（每个单元格占一行，顺序是第一行所有列，第二行所有列...）
        // 这样可以横向排列数据
        isColumnMajor = false; // 标记为特殊格式，不是标准列优先
        console.log('Detected SPECIAL format (one cell per line), will try row-major grouping');
    } else if (rowsWithTabsRatio < 0.5 && rows.length > 10) {
        // 可能有部分行包含多个单元格，可能是混合格式
        // 仍然尝试按行优先处理
        isColumnMajor = false;
        console.log('Detected MIXED format, will try row-major grouping');
    } else {
        // 标准格式：每行包含多个单元格（用制表符分隔）
        console.log('Detected ROW-MAJOR format (standard table format)');
    }

    let dataMatrix = [];

    // 处理特殊格式：每个单元格占一行的格式
    // 这种情况下，数据可能是行优先的（第一行所有列，然后第二行所有列）
    // 或者是列优先的（第一列所有行，然后第二列所有行）

    // 首先，解析所有单元格值（处理制表符分隔的单元格）
    let allCells = [];
    for (let row of rows) {
        const trimmed = row.trim();
        if (trimmed.includes('\t')) {
            // 如果行中包含制表符，分割成多个单元格
            const cells = trimmed.split('\t').map(cell => cell.trim());
            // 保留空单元格，因为它们可能是重要的位置标记
            allCells.push(...cells);
        } else if (trimmed !== '') {
            // 否则整行作为一个单元格
            allCells.push(trimmed);
        } else {
            // 空行表示空单元格，保留它（这可能是第二行中的空列）
            allCells.push('');
        }
    }

    console.log('Total cells extracted:', allCells.length);
    console.log('First 20 cells:', allCells.slice(0, 20));
    console.log('Last 10 cells:', allCells.slice(-10));

    // 检查是否有"Total"或"TOTAL"在数据中，以及它的位置
    let totalIndex = -1;
    for (let i = 0; i < allCells.length; i++) {
        const cell = (allCells[i] || '').trim().toUpperCase();
        if (cell === 'TOTAL') {
            totalIndex = i;
            const expectedRow = Math.floor(i / 18) + 1;
            const expectedCol = (i % 18) + 1;
            console.log(`Found "TOTAL" at index ${i} (expected Row ${expectedRow}, Col ${expectedCol} if 18 columns)`);
        }
    }

    // 检测行标识符（如CKZ03, CKZ16, BCA10A2, KZ006等）- 通常是以字母开头，可能包含数字的代码
    // 这些标识符通常出现在每行的第一列，可以用来判断列数
    let rowIdentifierIndices = [];
    // 更宽泛的标识符模式：
    // 1. 至少2个字母，后面有数字（如CKZ03, BCA10A2）
    // 2. 字母和数字混合，以数字结尾（如KZ006, KZ010）
    // 3. 简单的代码格式（至少2个字母开头）
    const identifierPattern1 = /^[A-Z]{2,}[A-Z0-9]*\d+$/i; // 匹配如CKZ03, BCA10A2, KZ006, KZ010等
    const identifierPattern2 = /^[A-Z]{2,}\d+$/i; // 匹配如KZ006, KZ010等
    const identifierPattern3 = /^[A-Z]{2,}[A-Z0-9]{1,}$/i; // 匹配任何以2+字母开头的代码

    for (let i = 0; i < allCells.length; i++) {
        const cell = (allCells[i] || '').trim();
        if (cell && (identifierPattern1.test(cell) || identifierPattern2.test(cell) ||
            (identifierPattern3.test(cell) && cell.length >= 4 && cell.length <= 10))) {
            // 排除常见的非标识符（如日期、普通单词等）
            const upperCell = cell.toUpperCase();
            if (upperCell !== 'AGENT' && upperCell !== 'MEMBER' && upperCell !== 'TOTAL' &&
                upperCell !== 'GRAND TOTAL' && !upperCell.match(/^\d{4}-\d{2}-\d{2}$/)) {
                rowIdentifierIndices.push(i);
                console.log(`Found row identifier "${cell}" at index ${i}`);
            }
        }
    }

    console.log(`Total row identifiers found: ${rowIdentifierIndices.length}`);
    if (rowIdentifierIndices.length > 0) {
        console.log(`Row identifier indices:`, rowIdentifierIndices);
    }

    // 也检测"Grand Total"这样的特殊行
    let grandTotalIndex = -1;
    for (let i = 0; i < allCells.length; i++) {
        const cell = (allCells[i] || '').trim().toUpperCase();
        if (cell === 'GRAND TOTAL' || cell === 'TOTAL') {
            grandTotalIndex = i;
            console.log(`Found "${cell}" at index ${i}`);
        }
    }

    // 特殊处理：如果检测到行标识符模式，可以判断列数
    let force18Columns = false;
    let needsPaddingAfterTotal = false;
    let detectedColumnCount = 0;

    // 方法1：如果Total在索引18，强制使用18列
    if (totalIndex === 18) {
        // Total在索引18，说明第一行有18个数据（索引0-17），Total是第二行第一列
        // 这意味着应该使用18列分组
        force18Columns = true;
        detectedColumnCount = 18;
        // 如果Total后面直接跟数据（如"1"），说明缺少了3个空列，需要插入
        if (totalIndex + 1 < allCells.length && allCells[totalIndex + 1] && allCells[totalIndex + 1].trim() !== '') {
            // Total后面有数据，需要插入3个空单元格
            needsPaddingAfterTotal = true;
            console.log('Detected pattern: Total at index 18, will use 18 columns and insert 3 empty cells after Total');
        }
    }
    // 方法2：如果检测到多个行标识符，检查它们之间的间隔来判断列数
    else if (rowIdentifierIndices.length >= 2) {
        // 检查第一个和第二个标识符之间的间隔
        const firstInterval = rowIdentifierIndices[1] - rowIdentifierIndices[0];

        console.log(`Row identifier intervals: First=${rowIdentifierIndices[0]}, Second=${rowIdentifierIndices[1]}, Interval=${firstInterval}`);

        // 如果间隔是18（或接近18），说明每行有18列
        if (firstInterval === 18) {
            force18Columns = true;
            detectedColumnCount = 18;
            console.log(`Detected pattern: Row identifiers at indices ${rowIdentifierIndices[0]} and ${rowIdentifierIndices[1]}, interval is 18, will use 18 columns`);
        } else if (firstInterval >= 14 && firstInterval <= 25) {
            // 如果间隔在14-25之间，使用间隔值作为列数
            // 这样可以处理不同列数的表格
            force18Columns = true;
            detectedColumnCount = firstInterval;
            console.log(`Detected pattern: Row identifiers at indices ${rowIdentifierIndices[0]} and ${rowIdentifierIndices[1]}, interval is ${firstInterval}, will use ${firstInterval} columns`);
        } else if (firstInterval > 0 && firstInterval < 14) {
            // 如果间隔较小（2-13），需要检查是否是合理的列数
            // 对于少量行的数据（2-20行），较小的间隔可能是正确的列数
            const estimatedRows = Math.ceil(allCells.length / firstInterval);
            if (estimatedRows >= 2 && estimatedRows <= 20 && allCells.length <= 200) {
                // 数据行数合理，且总单元格数不太大，使用这个间隔作为列数
                force18Columns = true;
                detectedColumnCount = firstInterval;
                console.log(`Detected pattern: Row identifiers at indices ${rowIdentifierIndices[0]} and ${rowIdentifierIndices[1]}, interval is ${firstInterval}, will use ${firstInterval} columns (estimated ${estimatedRows} rows)`);
            } else if (rowIdentifierIndices.length >= 3) {
                // 如果间隔太小，可能是检测错误，尝试检查第三个标识符
                const secondInterval = rowIdentifierIndices[2] - rowIdentifierIndices[1];
                if (secondInterval === firstInterval) {
                    // 如果两个间隔相同，说明这是正确的列数
                    // 但是，对于AWC格式，如果间隔为1，不应该强制使用1列（因为数据应该是多列的）
                    if (typeof currentDataCaptureType !== 'undefined' && currentDataCaptureType === 'AWC' && firstInterval === 1) {
                        console.log(`AWC (2.7): Detected consistent intervals (1), but skipping force 1 column (will use smart detection instead)`);
                        // 不强制使用1列，继续使用智能检测
                    } else {
                        force18Columns = true;
                        detectedColumnCount = firstInterval;
                        console.log(`Detected pattern: Consistent intervals (${firstInterval}), will use ${firstInterval} columns`);
                    }
                }
            }
        }
    }
    // 方法3：如果只有一个行标识符，尝试通过数据总量来推断列数（适用于少量行的数据）
    else if (rowIdentifierIndices.length === 1 && allCells.length <= 200) {
        const identifierIndex = rowIdentifierIndices[0];
        // 如果标识符不在索引0，尝试推断列数
        // 假设标识符是每行的第一个单元格，那么从标识符位置可以推断出已经有多少列
        // 如果标识符在索引6，且总共有11个单元格，可能是2行，每行约5-6列
        if (identifierIndex > 0 && identifierIndex <= 15) {
            // 尝试使用标识符的位置作为列数（如果标识符在索引N，可能是第2行的开始，列数=N）
            const estimatedRows = Math.ceil(allCells.length / identifierIndex);
            const remainder = allCells.length % identifierIndex;
            // 放宽条件：如果估计的行数合理（2-20行），且剩余单元格数不超过标识符位置（允许最后一行不完整）
            if (estimatedRows >= 2 && estimatedRows <= 20 && remainder <= identifierIndex) {
                force18Columns = true;
                detectedColumnCount = identifierIndex;
                console.log(`Detected pattern: Single identifier at index ${identifierIndex}, will try ${identifierIndex} columns (estimated ${estimatedRows} rows, remainder ${remainder})`);
            } else {
                // 如果使用标识符位置作为列数不合理，尝试通过总单元格数推断合理的列数
                // 对于少量行的数据（2-10行），尝试常见的列数（3-12列）
                let bestMatch = null;
                for (let cols = 3; cols <= 12; cols++) {
                    const rows = Math.ceil(allCells.length / cols);
                    const rem = allCells.length % cols;
                    if (rows >= 2 && rows <= 10 && rem < cols * 0.3) {
                        if (!bestMatch || rem < bestMatch.remainder) {
                            bestMatch = { cols: cols, rows: rows, remainder: rem };
                        }
                    }
                }
                if (bestMatch) {
                    force18Columns = true;
                    detectedColumnCount = bestMatch.cols;
                    console.log(`Detected pattern: Single identifier, trying ${bestMatch.cols} columns (estimated ${bestMatch.rows} rows, remainder ${bestMatch.remainder})`);
                }
            }
        }
    }
    // 方法4：如果没有检测到多个标识符，但检测到了Grand Total，可以根据它来估算列数
    else if (grandTotalIndex > 0 && rowIdentifierIndices.length >= 1) {
        // 计算从第一个标识符到Grand Total之间的单元格数
        const cellsBeforeGrandTotal = grandTotalIndex - rowIdentifierIndices[0];
        // 假设有N行数据（不包括Grand Total），每行有相同的列数
        const estimatedRows = rowIdentifierIndices.length + 1; // +1 for grand total row
        const estimatedColumns = Math.ceil(cellsBeforeGrandTotal / estimatedRows);

        if (estimatedColumns >= 14 && estimatedColumns <= 25) {
            force18Columns = true;
            detectedColumnCount = estimatedColumns;
            console.log(`Detected pattern: Using Grand Total position to estimate ${estimatedColumns} columns`);
        }
    }

    // 检测是否为特殊格式（每个单元格占一行的行优先格式）
    const isSpecialRowMajorFormat = rowsWithTabsRatio < 0.3 && rows.length > 10;

    // 特殊检查：如果第一行包含制表符，且只有一个行标识符，应该将所有数据合并成一行
    // 这种情况通常是：第一行是制表符分隔的多个值，后面每行都是单个值，但实际应该是一行数据
    let shouldTreatAsSingleRow = false;
    if (isSpecialRowMajorFormat && rowIdentifierIndices.length === 1 && allCells.length > 0 && allCells.length <= 30) {
        // 检查第一行是否包含制表符
        const firstRow = rows[0] || '';
        if (firstRow.includes('\t')) {
            // 第一行包含制表符，且只有一个行标识符，应该将所有数据合并成一行
            shouldTreatAsSingleRow = true;
            console.log('Detected single-row format: First row has tabs, only one row identifier found, treating all data as single row');
        }
    }

    if (isSpecialRowMajorFormat && !shouldTreatAsSingleRow) {
        // 特殊格式：每个单元格占一行，顺序是行优先的（第一行所有列，第二行所有列...）
        // 直接按列数分组，每N个单元格组成一行
        console.log('Processing as ROW-MAJOR special format (one cell per line)');
    } else if (isSpecialRowMajorFormat && shouldTreatAsSingleRow) {
        // 单行格式：将所有数据合并成一行
        console.log('Processing as SINGLE-ROW format (first row has tabs, merging all into one row)');
    } else if (isColumnMajor) {
        // 标准列优先格式：数据是垂直排列的（列1的所有值，然后是列2的所有值，等等）
        console.log('Processing as COLUMN-MAJOR format');
    }

    // 处理单行格式：如果检测到单行格式，直接处理并跳过后续的列数检测和分组逻辑
    if (isSpecialRowMajorFormat && shouldTreatAsSingleRow) {
        // 单行格式：将所有数据合并成一行
        console.log('Processing single-row format: All data in one row');
        console.log('  Total cells:', allCells.length);

        dataMatrix = [allCells]; // 直接将所有单元格放在一行
        estimatedColumns = allCells.length; // 列数等于单元格数

        console.log('Single-row matrix:', dataMatrix.length, 'x', estimatedColumns);
        console.log('First row (all cells):', dataMatrix[0]);
    }
    // 两种特殊格式都需要检测列数（除非是单行格式）
    else if ((isSpecialRowMajorFormat && !shouldTreatAsSingleRow) || isColumnMajor) {
        // 智能检测列数
        // 方法1：查找模式 - 如果数据是列优先的，可能包含重复模式或分组标记
        // 方法2：查找空单元格或特殊值作为列分隔符
        // 方法3：尝试不同的列数，找到最合理的组合

        // 查找可能的列数：尝试识别数据分组
        // 从原始数据模式来看：\t, CKZ03, 87\tAgent\t, 39,992.11, 0.00, ...
        // 可能需要识别这些分组来确定列数

        // 尝试多种方法检测列数
        let detectedColumns = 0;

        // 方法0：特殊处理 - 如果检测到特定模式，强制使用检测到的列数
        if (force18Columns && detectedColumnCount > 0) {
            detectedColumns = detectedColumnCount;
            console.log(`FORCE using ${detectedColumnCount} columns (detected from pattern)`);

            // 如果需要在Total后面插入3个空单元格
            if (needsPaddingAfterTotal && totalIndex >= 0 && totalIndex < allCells.length) {
                // 在Total后面（索引totalIndex + 1位置）插入3个空单元格
                allCells.splice(totalIndex + 1, 0, '', '', '');
                console.log(`Inserted 3 empty cells after Total at index ${totalIndex + 1}`);
                console.log('Total cells after padding:', allCells.length);
            }
        } else {
            // 方法1：如果有包含制表符的行，参考其列数，但不直接使用
            // 因为可能只是部分行有多个单元格
            let referenceColumns = maxCellsInRow;
            if (referenceColumns > 0) {
                console.log('Reference columns from tab-separated rows:', referenceColumns);
            }

            // 方法2：尝试查找数据模式 - 通过估算行数来反推列数
            // 从原始数据来看，应该有几行数据（比如3-10行），每行有很多列（比如15-20列）
            // 尝试不同的行数假设，找到最合理的列数

            // 特殊处理：如果第一个单元格是"Total"或"TOTAL"，且数据量较少（可能是单行数据）
            // 优先尝试将所有数据放在一行
            const firstCell = (allCells[0] || '').trim().toUpperCase();
            const isTotalRow = (firstCell === 'TOTAL') && allCells.length <= 25;

            if (isTotalRow) {
                console.log('Detected single-row Total data, prioritizing single-row layout');
                // 尝试使用能容纳所有数据在一行的列数（15-25列）
                const singleRowCols = [];
                for (let cols = 15; cols <= 25; cols++) {
                    const rows = Math.ceil(allCells.length / cols);
                    const remainder = allCells.length % cols;
                    // 如果能放在一行（rows === 1），或者剩余很少，优先考虑
                    if (rows === 1) {
                        singleRowCols.push({ cols: cols, rows: 1, remainder: remainder, score: 2000 + (25 - cols) });
                    } else if (rows === 2 && remainder < cols * 0.1) {
                        // 如果必须分成2行，但剩余很少，也考虑（但分数较低）
                        singleRowCols.push({ cols: cols, rows: 2, remainder: remainder, score: 500 + (25 - cols) });
                    }
                }

                // 如果找到能放在一行的列数，优先使用
                if (singleRowCols.length > 0) {
                    // 优先选择能放在一行的（rows === 1），其次选择列数最接近数据量的
                    singleRowCols.sort((a, b) => {
                        if (a.rows === 1 && b.rows !== 1) return -1;
                        if (a.rows !== 1 && b.rows === 1) return 1;
                        if (a.rows === 1 && b.rows === 1) {
                            // 都能放在一行，选择列数最接近数据量的（但至少15列）
                            const aDiff = Math.abs(a.cols - allCells.length);
                            const bDiff = Math.abs(b.cols - allCells.length);
                            return aDiff - bDiff;
                        }
                        return b.score - a.score;
                    });

                    const bestSingleRow = singleRowCols[0];
                    if (bestSingleRow.rows === 1) {
                        detectedColumns = bestSingleRow.cols;
                        console.log(`Using single-row layout: ${bestSingleRow.cols} columns (all ${allCells.length} cells in 1 row)`);
                    } else {
                        // 如果无法放在一行，继续使用原来的逻辑
                        console.log(`Cannot fit all data in one row, continuing with standard detection`);
                    }
                }
            }

            // 先尝试常见的列数（15-20列），看看对应的行数是否合理
            // 优先尝试18列（因为原始表格是A到R，18列）
            // 但如果已经检测到单行Total数据，跳过这一步
            const commonColumnCounts = [18, 17, 19, 16, 20, 15, 14, 12, 10]; // 优先18列
            let bestMatch = { cols: 0, rows: 0, score: 0, remainder: Infinity };

            // 如果已经检测到单行Total数据且找到了合适的列数，跳过常见列数检测
            if (isTotalRow && detectedColumns > 0 && Math.ceil(allCells.length / detectedColumns) === 1) {
                console.log('Skipping common column detection, using single-row Total layout');
            } else {

                for (let cols of commonColumnCounts) {
                    const rows = Math.ceil(allCells.length / cols);
                    // 行数应该在合理范围内（2-702行，支持到ZZ）
                    if (rows >= 2 && rows <= 702) {
                        const remainder = allCells.length % cols;
                        const expectedCells = rows * cols;

                        // 计算分数：
                        // 1. 如果能整除（remainder === 0），分数很高（优先）
                        // 2. 如果18列能整除，额外加分（因为原始表格是18列）
                        // 3. 剩余越少越好
                        // 4. 列数越多越好（更可能是原始表格）
                        let score = 0;
                        if (remainder === 0) {
                            // 能整除：基础分1000，如果是18列再加500
                            score = 1000 + (cols === 18 ? 500 : 0);
                        } else {
                            // 不能整除：根据剩余数计算分数，剩余越少分数越高
                            const remainderRatio = remainder / cols;
                            score = (1 - remainderRatio) * 100 + (cols === 18 ? 50 : 0);
                        }

                        // 更新最佳匹配：优先选择能整除的，如果不能整除则选择剩余最少的
                        if (remainder === 0 && bestMatch.remainder !== 0) {
                            // 当前能整除，之前不能，选择当前
                            bestMatch = { cols: cols, rows: rows, score: score, remainder: remainder };
                        } else if (remainder === 0 && bestMatch.remainder === 0) {
                            // 都能整除，选择列数更多的或分数更高的
                            if (score > bestMatch.score || (score === bestMatch.score && cols > bestMatch.cols)) {
                                bestMatch = { cols: cols, rows: rows, score: score, remainder: remainder };
                            }
                        } else if (remainder !== 0 && bestMatch.remainder !== 0) {
                            // 都不能整除，选择剩余更少的或列数更多的
                            if (remainder < bestMatch.remainder || (remainder === bestMatch.remainder && (score > bestMatch.score || cols > bestMatch.cols))) {
                                bestMatch = { cols: cols, rows: rows, score: score, remainder: remainder };
                            }
                        }

                        console.log(`  Trying ${cols} cols -> ${rows} rows (remainder: ${remainder}, score: ${score.toFixed(2)}, expected: ${expectedCells} cells)`);
                    }
                }

                if (bestMatch.cols > 0 && (!isTotalRow || detectedColumns === 0 || Math.ceil(allCells.length / detectedColumns) > 1)) {
                    detectedColumns = bestMatch.cols;
                    const actualCellsUsed = bestMatch.rows * bestMatch.cols;
                    console.log('Best match found:', bestMatch.cols, 'columns,', bestMatch.rows, 'rows (remainder:', bestMatch.remainder, ', score:', bestMatch.score.toFixed(2), ')');
                    console.log(`  Total cells: ${allCells.length}, Used: ${actualCellsUsed}, Unused: ${actualCellsUsed - allCells.length}`);
                }

                // 方法3：如果还没有找到，尝试智能估算
                // 如果已经检测到单行Total数据，跳过此方法
                if ((detectedColumns === 0 || detectedColumns < 5) && (!isTotalRow || Math.ceil(allCells.length / detectedColumns) > 1)) {
                    // 基于数据量估算：假设数据有3-10行，每行有合理的列数
                    // 从总单元格数除以可能的行数来估算列数
                    const possibleRowCounts = [3, 4, 5, 6, 7, 8, 9, 10]; // 可能的行数
                    let bestEstimate = { cols: 0, rows: 0 };

                    for (let rowCount of possibleRowCounts) {
                        const colCount = Math.ceil(allCells.length / rowCount);
                        // 列数应该在合理范围内（5-25列）
                        if (colCount >= 5 && colCount <= 25) {
                            // 检查是否能整除或接近整除
                            const remainder = allCells.length % colCount;
                            const actualRows = Math.ceil(allCells.length / colCount);

                            if (actualRows === rowCount || Math.abs(actualRows - rowCount) <= 1) {
                                if (bestEstimate.cols === 0 || remainder < (allCells.length % bestEstimate.cols)) {
                                    bestEstimate = { cols: colCount, rows: actualRows };
                                }
                            }
                        }
                    }

                    if (bestEstimate.cols > 0) {
                        detectedColumns = bestEstimate.cols;
                        console.log('Best estimate:', bestEstimate.cols, 'columns,', bestEstimate.rows, 'rows');
                    } else {
                        // 如果还是找不到，使用启发式方法
                        const estimatedRows = Math.ceil(Math.sqrt(allCells.length)); // 估算行数
                        detectedColumns = Math.ceil(allCells.length / estimatedRows);
                        console.log('Estimated columns using heuristic:', detectedColumns, 'rows:', estimatedRows);
                    }
                }

                // 方法4：如果检测到的列数太少（<5列），可能检测错误，使用默认值
                // 如果已经检测到单行Total数据，跳过此方法
                if (detectedColumns < 5 && (!isTotalRow || Math.ceil(allCells.length / detectedColumns) > 1)) {
                    // 从原始数据来看，应该有18列左右（A到R列）
                    // 但如果数据量不够，也可能更少
                    // 尝试根据总单元格数来判断
                    if (allCells.length > 50) {
                        // 数据量较大，应该是多列数据
                        detectedColumns = 18; // 默认18列
                    } else {
                        // 数据量较小，可能是较少的列数
                        detectedColumns = Math.max(5, Math.ceil(allCells.length / 3)); // 至少5列
                    }
                    console.log('Using fallback column count:', detectedColumns, '(total cells:', allCells.length, ')');
                }

                // 特殊检查：优先使用能整除的列数（包括18列，但不限于18列）
                // 检查常见列数（15-25列）中哪些能整除或接近整除
                // 如果已经检测到单行Total数据，跳过此检查
                if (allCells.length > 0 && (!isTotalRow || Math.ceil(allCells.length / detectedColumns) > 1)) {
                    const commonColumnCounts = [18, 20, 19, 17, 21, 16, 22, 15, 23, 24, 25]; // 优先18和20列
                    let bestDivisibleCols = null;
                    let bestDivisibleScore = 0;

                    for (let cols of commonColumnCounts) {
                        const rows = Math.ceil(allCells.length / cols);
                        const remainder = allCells.length % cols;
                        const remainderRatio = remainder / cols;

                        // 如果能整除，优先选择
                        if (remainder === 0 && rows >= 2 && rows <= 702) {
                            const score = 1000 + (cols === 18 ? 100 : cols === 20 ? 90 : 0); // 18列和20列额外加分
                            if (score > bestDivisibleScore) {
                                bestDivisibleCols = cols;
                                bestDivisibleScore = score;
                            }
                        }
                        // 如果剩余很少（<5%），也考虑
                        else if (remainderRatio < 0.05 && rows >= 2 && rows <= 702) {
                            const score = (1 - remainderRatio) * 100 + (cols === 18 ? 10 : cols === 20 ? 9 : 0);
                            if (score > bestDivisibleScore && bestDivisibleCols === null) {
                                bestDivisibleCols = cols;
                                bestDivisibleScore = score;
                            }
                        }
                    }

                    // 如果找到能整除的列数，使用它（但只有在当前检测到的列数不能整除时才替换）
                    if (bestDivisibleCols !== null) {
                        const currentRemainder = allCells.length % detectedColumns;
                        const bestRemainder = allCells.length % bestDivisibleCols;

                        // 如果当前列数不能整除，但找到的列数能整除，或者找到的列数剩余更少，则替换
                        if ((currentRemainder !== 0 && bestRemainder === 0) ||
                            (bestRemainder < currentRemainder && bestRemainder === 0)) {
                            console.log(`Switching to ${bestDivisibleCols} columns (perfect fit: ${Math.ceil(allCells.length / bestDivisibleCols)} rows, remainder=0)`);
                            detectedColumns = bestDivisibleCols;
                        } else if (currentRemainder !== 0 && bestRemainder < currentRemainder && bestRemainder / bestDivisibleCols < 0.05) {
                            console.log(`Switching to ${bestDivisibleCols} columns (better fit: remainder=${bestRemainder}, ratio=${((bestRemainder / bestDivisibleCols) * 100).toFixed(1)}%)`);
                            detectedColumns = bestDivisibleCols;
                        }
                    }
                }

                // 确保列数在合理范围内（但如果已经检测到单行Total数据，允许更大的列数）
                if (detectedColumns > 25 && (!isTotalRow || Math.ceil(allCells.length / detectedColumns) > 1)) {
                    detectedColumns = 18; // 限制最大列数
                    console.log('Column count too large, using default:', detectedColumns);
                }

            } // 结束 else 块（如果已经检测到单行Total数据，跳过常见列数检测）

        } // 结束 else 块（如果force18Columns为false）

        estimatedColumns = detectedColumns;
        const totalCells = allCells.length;

        // 根据格式类型处理（单行格式已在前面处理，这里只处理需要分组的情况）
        if (isSpecialRowMajorFormat) {
            // 特殊格式：行优先（每个单元格占一行）
            // 数据顺序是：第一行的所有列，第二行的所有列，...
            // 直接按列数分组即可
            const actualRows = Math.ceil(totalCells / estimatedColumns);

            console.log('Grouping row-major format (one cell per line):');
            console.log('  Total cells:', totalCells);
            console.log('  Detected columns:', estimatedColumns);
            console.log('  Calculated rows:', actualRows);
            console.log('  Expected total cells (rows x cols):', actualRows * estimatedColumns);
            console.log('  Remainder (unused cells):', (actualRows * estimatedColumns) - totalCells);

            // 按列数分组：每N个单元格组成一行
            dataMatrix = [];
            let cellsUsed = 0;
            for (let row = 0; row < actualRows; row++) {
                const rowData = [];
                for (let col = 0; col < estimatedColumns; col++) {
                    // 行优先格式：索引 = row * numCols + col
                    const index = row * estimatedColumns + col;
                    if (index < totalCells) {
                        const cellValue = allCells[index] || '';
                        rowData.push(cellValue);
                        if (cellValue.trim() !== '') {
                            cellsUsed++;
                        }
                    } else {
                        // 超出数据范围，填充空值
                        rowData.push('');
                    }
                }
                dataMatrix.push(rowData);
            }

            console.log('Grouped matrix:', dataMatrix.length, 'x', estimatedColumns);
            console.log('Cells used:', cellsUsed, 'out of', totalCells);
            console.log('First row (length:', dataMatrix[0]?.length, '):', dataMatrix[0]);
            console.log('First row last column:', dataMatrix[0]?.[estimatedColumns - 1]);
            if (dataMatrix.length > 1) {
                console.log('Second row (length:', dataMatrix[1]?.length, '):', dataMatrix[1]);
                console.log('Second row first column:', dataMatrix[1]?.[0]);
                console.log('Second row columns 1-5:', dataMatrix[1]?.slice(0, 5));
                console.log('Second row last column:', dataMatrix[1]?.[estimatedColumns - 1]);

                // 验证：检查Total是否在第二行第一列
                const secondRowFirstCol = (dataMatrix[1]?.[0] || '').trim().toUpperCase();
                if (secondRowFirstCol === 'TOTAL') {
                    console.log('✓ Total is correctly in Row 2, Column A');
                } else if (secondRowFirstCol !== '') {
                    console.warn(`⚠ Total is NOT in Row 2, Column A. Found "${secondRowFirstCol}" instead.`);
                    // 尝试查找Total在哪里
                    for (let col = 0; col < Math.min(dataMatrix[1].length, 10); col++) {
                        const cell = (dataMatrix[1]?.[col] || '').trim().toUpperCase();
                        if (cell === 'TOTAL') {
                            console.warn(`  Total is at Row 2, Column ${String.fromCharCode(65 + col)} (index ${col})`);
                            break;
                        }
                    }
                }
            }
            if (dataMatrix.length > 2) {
                console.log('Third row (length:', dataMatrix[2]?.length, '):', dataMatrix[2]);
                console.log('Third row last column:', dataMatrix[2]?.[estimatedColumns - 1]);
            }

            // 验证：检查最后一列是否有数据
            let lastColHasData = false;
            for (let row = 0; row < Math.min(3, dataMatrix.length); row++) {
                const lastCell = dataMatrix[row]?.[estimatedColumns - 1];
                if (lastCell && lastCell.trim() !== '') {
                    lastColHasData = true;
                    console.log(`Row ${row + 1} last column (R) has data: "${lastCell}"`);
                }
            }
            if (!lastColHasData && totalCells >= estimatedColumns * 2) {
                console.warn('WARNING: Last column appears empty, but data should exist. Possible data loss!');
                console.log('Last 10 cells in allCells:', allCells.slice(-10));
            }

            // ===== SUB TOTAL / GRAND TOTAL 纠正逻辑 =====
            // 有些报表在复制时会把 SUB TOTAL / GRAND TOTAL 两行压成一列少列的矩阵（例如 2 列多行），
            // 这里如果检测到这种情况，则根据实际数据量确定列数重新分组，让两行各自成为一整行。
            try {
                const flatCells = dataMatrix.flat().map(v => (v || '').toString().toUpperCase().trim());
                const hasSubTotal = flatCells.includes('SUB TOTAL');
                const hasGrandTotal = flatCells.includes('GRAND TOTAL');

                if (hasSubTotal && hasGrandTotal && estimatedColumns <= 3 && totalCells >= 10) {
                    console.log('Detected SUB TOTAL + GRAND TOTAL with too few columns, regrouping based on actual data');

                    // 根据实际数据量确定列数：尝试常见的列数（15-25列），找到能整除或接近整除的列数
                    // 假设有2行数据（SUB TOTAL 和 GRAND TOTAL），每行应该有相同的列数
                    const expectedRows = 2;
                    const possibleCols = [];

                    // 尝试常见的列数范围（15-25列）
                    for (let cols = 15; cols <= 25; cols++) {
                        const expectedCells = expectedRows * cols;
                        const remainder = totalCells % cols;
                        const remainderRatio = remainder / cols;

                        // 如果能整除，或者剩余很少（<5%），认为这个列数合理
                        if (remainder === 0 || remainderRatio < 0.05) {
                            possibleCols.push({
                                cols: cols,
                                remainder: remainder,
                                remainderRatio: remainderRatio,
                                score: remainder === 0 ? 1000 : (1 - remainderRatio) * 100
                            });
                        }
                    }

                    // 如果找不到能整除的，尝试根据总单元格数除以行数来估算
                    if (possibleCols.length === 0) {
                        const estimatedCols = Math.ceil(totalCells / expectedRows);
                        if (estimatedCols >= 15 && estimatedCols <= 25) {
                            possibleCols.push({
                                cols: estimatedCols,
                                remainder: totalCells % estimatedCols,
                                remainderRatio: (totalCells % estimatedCols) / estimatedCols,
                                score: 500
                            });
                        }
                    }

                    // 选择最佳列数：优先选择能整除的，其次选择剩余最少的
                    if (possibleCols.length > 0) {
                        possibleCols.sort((a, b) => {
                            if (a.remainder === 0 && b.remainder !== 0) return -1;
                            if (a.remainder !== 0 && b.remainder === 0) return 1;
                            return a.remainder - b.remainder;
                        });

                        const bestCols = possibleCols[0].cols;
                        const forcedRows = Math.ceil(totalCells / bestCols);

                        console.log(`Regrouping SUB TOTAL + GRAND TOTAL with ${bestCols} columns (${forcedRows} rows, remainder: ${totalCells % bestCols})`);

                        const regrouped = [];
                        for (let r = 0; r < forcedRows; r++) {
                            const rowArr = [];
                            for (let c = 0; c < bestCols; c++) {
                                const idx = r * bestCols + c;
                                rowArr.push(idx < totalCells ? (allCells[idx] || '') : '');
                            }
                            regrouped.push(rowArr);
                        }

                        dataMatrix = regrouped;
                        estimatedColumns = bestCols;
                        console.log('Regrouped matrix for SUB / GRAND TOTAL:', dataMatrix.length, 'x', estimatedColumns);
                    } else {
                        console.warn('Could not determine optimal column count for SUB TOTAL / GRAND TOTAL, using detected columns');
                    }
                }
            } catch (err) {
                console.error('Error while applying SUB / GRAND TOTAL regrouping fix:', err);
            }
            // ===== 纠正逻辑结束 =====

        } else {
            // 标准列优先格式：需要转换为行优先格式
            // 数据顺序是：第一列的所有行，第二列的所有行，...
            const actualRows = Math.ceil(totalCells / estimatedColumns);

            console.log('Converting column-major to row-major:');
            console.log('  Total cells:', totalCells);
            console.log('  Detected columns:', estimatedColumns);
            console.log('  Calculated rows:', actualRows);
            console.log('  Total expected cells (rows x cols):', actualRows * estimatedColumns);
            console.log('  Remaining cells:', (actualRows * estimatedColumns) - totalCells);

            // 列优先转行优先转换
            // 列优先格式：数据按列存储，先存储第一列的所有行，然后第二列的所有行，等等
            // 原始数据索引 i 在列优先格式中的位置：
            // - 它在第 col = Math.floor(i / actualRows) 列
            // - 它在第 row = i % actualRows 行
            //
            // 例如，如果原始表格有 3 行 18 列：
            // 索引 0: 第0列第0行 (row0_col0)
            // 索引 1: 第0列第1行 (row1_col0)
            // 索引 2: 第0列第2行 (row2_col0)
            // 索引 3: 第1列第0行 (row0_col1)
            // ...
            // 索引 i = col * actualRows + row

            dataMatrix = [];
            for (let row = 0; row < actualRows; row++) {
                const rowData = [];
                for (let col = 0; col < estimatedColumns; col++) {
                    // 列优先索引转换公式：
                    // 在列优先格式中，索引 i = col * numRows + row
                    // 所以要从列优先转为行优先：
                    // 对于位置 (row, col)，原数据的索引是 col * actualRows + row
                    const index = col * actualRows + row;

                    if (index < totalCells) {
                        rowData.push(allCells[index] || '');
                    } else {
                        // 超出数据范围，填充空值
                        rowData.push('');
                    }
                }
                dataMatrix.push(rowData);
            }

            console.log('Converted matrix:', dataMatrix.length, 'x', estimatedColumns);
            console.log('First row:', dataMatrix[0]);
            console.log('Second row:', dataMatrix.length > 1 ? dataMatrix[1] : 'N/A');
            console.log('Third row:', dataMatrix.length > 2 ? dataMatrix[2] : 'N/A');

            // 验证转换结果：检查第一列的值，看是否符合预期
            if (dataMatrix.length > 0) {
                const firstColumn = dataMatrix.map(row => row[0]).filter(val => val !== '');
                console.log('First column values:', firstColumn.slice(0, 5));
            }
        }

    } else if (!(isSpecialRowMajorFormat && shouldTreatAsSingleRow)) {
        // 行优先格式（标准格式）：每行是完整的行数据
        // 注意：单行格式已在前面处理，这里跳过
        console.log('Using ROW-MAJOR parsing');

        // 检测分隔符类型
        let hasTabSeparator = false;
        let hasMultipleSpaces = false;

        for (let row of rows) {
            if (row.includes('\t')) {
                hasTabSeparator = true;
                break;
            }
            if (/\s{2,}/.test(row)) {
                hasMultipleSpaces = true;
            }
        }

        console.log('Has tab separator:', hasTabSeparator);
        console.log('Has multiple spaces:', hasMultipleSpaces);

        if (hasTabSeparator) {
            // 使用制表符分隔（标准格式，如 Excel 复制的数据）
            console.log('Using TAB separator');
            dataMatrix = rows.map((row) => {
                const cells = row.split('\t');
                return cells.map(cell => cell.trim());
            });

            // 检测并移除行号列（如 "1.", "2.", "10" 等），避免把序号当成正常数据
            // 新规则（修复单行/少量行复制时顺序错乱的问题）：
            //  - 匹配「数字」或「数字+小数点」格式（例如 "1", "1.", "10", "10."）
            //  - 只要所有非空行的第一列都满足该格式，就认为是行号列并移除
            if (dataMatrix.length > 0 && dataMatrix[0].length > 0) {
                const firstCell = dataMatrix[0][0] || '';
                const rowNumberPattern = /^\d+\.?$/; // 匹配 "1" 或 "1." 这种
                const isRowNumber = rowNumberPattern.test(firstCell.trim());

                let allRowsHaveRowNumbers = true;
                if (isRowNumber) {
                    // 检查所有非空行，第一列是否都长得像序号
                    for (let i = 0; i < dataMatrix.length; i++) {
                        const row = dataMatrix[i];
                        if (!row || row.length === 0) continue;
                        const cell = (row[0] || '').trim();
                        if (cell === '') continue; // 允许尾部空行
                        if (!rowNumberPattern.test(cell)) {
                            allRowsHaveRowNumbers = false;
                            break;
                        }
                    }
                } else {
                    allRowsHaveRowNumbers = false;
                }

                if (allRowsHaveRowNumbers && isRowNumber) {
                    console.log('Detected row number column (like 1., 2., ...), removing first column');
                    dataMatrix = dataMatrix.map(row => {
                        if (row.length > 0) {
                            return row.slice(1); // 移除第一列
                        }
                        return row;
                    });
                }
            }

            // ⚠️ 之前这里有一大段针对「SUB TOTAL / GRAND TOTAL」的特殊重排逻辑，
            // 会把原本的表头样式改成两行小计/总计行，导致和原始数据不一致。
            // 为了保证粘贴出来的 Data Capture Table 和源数据一模一样，
            // 我们直接移除这段重排逻辑，不再对 SUB TOTAL / GRAND TOTAL 进行结构上的改写。
        } else if (hasMultipleSpaces) {
            // 尝试按多个空格分割
            // 保留空单元格的位置，以便在粘贴时保留空列
            console.log('Using MULTIPLE SPACES separator');
            dataMatrix = rows.map((row) => {
                // 使用正则表达式分割，保留空字符串以表示空列
                const cells = row.split(/\s{2,}/);
                // 不过滤空字符串，保留它们以表示空列的位置
                return cells.map(cell => cell.trim());
            });
            dataMatrix = dataMatrix.filter(row => row.length > 0);
        } else {
            // 单列格式，每个值作为一列（横向排列）
            console.log('Single column detected, will arrange horizontally');
            dataMatrix = rows.map((row) => [row.trim()]);
            // 但我们需要转置，让数据横向排列
            // 如果用户希望横向排列，应该把所有值放在一行
            // 或者让用户选择如何排列
            // 暂时将每个值作为一行的一列（但这样还是垂直的）
            // 改为：所有值放在一行，多列
            if (rows.length > 0) {
                const singleRow = rows.map(row => row.trim());
                dataMatrix = [singleRow]; // 所有值放在一行
            }
        }

        // 确保所有行都有相同的列数（用空字符串填充）
        const maxCols = Math.max(...dataMatrix.map(row => row.length), 1);
        dataMatrix = dataMatrix.map(row => {
            const paddedRow = [...row];
            while (paddedRow.length < maxCols) {
                paddedRow.push('');
            }
            return paddedRow;
        });
    }

    // 后处理：移除每行前面的空列或非标识符列，将第一个标识符列移到第一列
    // 标识符列通常是：以字母开头的代码（如CKZ03, CKZ16），或者第一列应该是标识符
    // 1.Text 模式且前两列已是「序号+用户ID」时跳过，保持 No./User 在前，不把 JDB 等移到第一列
    let skipIdentifierShift = false;
    if (typeof currentDataCaptureType !== 'undefined' && currentDataCaptureType === '1.Text' && dataMatrix.length >= 2) {
        const looksLikeRowNo = (s) => { const t = (s || '').trim(); return /^\d+$/.test(t) && t.length <= 6; };
        const looksLikeUserId = (s) => { const t = (s || '').trim(); return t.length >= 2 && /^[a-zA-Z0-9_]+$/.test(t) && /[a-zA-Z]/.test(t) && /\d/.test(t); };
        let matchCount = 0;
        for (let ri = 0; ri < Math.min(3, dataMatrix.length); ri++) {
            const r = dataMatrix[ri];
            if (r && r.length >= 2 && looksLikeRowNo(r[0]) && looksLikeUserId(r[1])) matchCount++;
        }
        if (matchCount >= 2) {
            skipIdentifierShift = true;
            console.log('1.Text: First columns are No.+User, skipping identifier shift to preserve order.');
        }
    }
    let shiftedRowsCount = 0;
    if (!skipIdentifierShift) {
        console.log('Post-processing: Removing leading empty/non-identifier columns...');

        // 定义标识符的模式：通常是以字母开头，可能包含数字，或者特殊的关键词
        const isIdentifier = (value) => {
            if (!value || value.trim() === '') return false;
            const trimmed = value.trim().toUpperCase();
            // 标识符通常是：
            // 1. 以字母开头，可能是代码格式（如CKZ03, BK001, BCA10A2等）
            // 2. 特殊关键词（如TOTAL, TOTAL, Agent等）
            // 3. 常见的标识符模式
            if (/^[A-Z]/.test(trimmed) || /^[A-Z]{2,}\d+/.test(trimmed)) {
                return true;
            }
            // 特殊关键词
            const specialKeywords = ['TOTAL', 'AGENT', 'MEMBER', 'USER'];
            if (specialKeywords.includes(trimmed)) {
                return true;
            }
            return false;
        };

        // 判断是否是数值（可能是从后面错位过来的数据）
        const isNumericValue = (value) => {
            if (!value || value.trim() === '') return false;
            const trimmed = value.trim();
            // 数值格式：可能包含逗号、小数点、负号
            return /^-?\d[\d,.-]*$/.test(trimmed.replace(/,/g, ''));
        };

        // 首先，确定第一行的标识符列位置
        let firstRowIdentifierCol = 0;
        if (dataMatrix.length > 0) {
            const firstRow = dataMatrix[0];
            for (let colIndex = 0; colIndex < Math.min(firstRow.length, 5); colIndex++) {
                const cellValue = (firstRow[colIndex] || '').trim();
                if (isIdentifier(cellValue)) {
                    firstRowIdentifierCol = colIndex;
                    break;
                }
            }
            console.log(`First row identifier column: ${firstRowIdentifierCol + 1}`);
        }

        // 处理每一行：如果第一列不是标识符（或为空），且后面有标识符列，则向左移动
        // 但是，如果数据已经正确分组（第一列是正确的），就不要移动
        for (let rowIndex = 0; rowIndex < dataMatrix.length; rowIndex++) {
            const row = dataMatrix[rowIndex];
            if (!row || row.length === 0) continue;

            const firstColValue = (row[0] || '').trim();
            const isEmpty = firstColValue === '';
            const isFirstColIdentifier = isIdentifier(firstColValue);

            // 检查是否是数值（可能是从后面错位过来的数据）
            const isNumeric = isNumericValue(firstColValue);

            // 特殊处理：如果第一列是"TOTAL"，应该在第一列（已经是正确位置）
            const isTotal = firstColValue.toUpperCase() === 'TOTAL';

            // 如果第一列已经是标识符（包括TOTAL），或者数据已经正确对齐，不需要移动
            if (isFirstColIdentifier || isTotal) {
                console.log(`  Row ${rowIndex + 1}: First column is already identifier ("${firstColValue}"), no shift needed`);
                continue;
            }

            // 如果第一列为空，或者第一列是数值（可能是错位的数据），需要查找标识符列
            if (isEmpty || isNumeric) {
                // 查找第一个标识符列（包括TOTAL）的索引
                let identifierColIndex = -1;

                // 优先查找在第一个标识符列附近的位置（前后2列范围）
                const searchStart = Math.max(0, firstRowIdentifierCol - 2);
                const searchEnd = Math.min(row.length, firstRowIdentifierCol + 3);

                for (let colIndex = searchStart; colIndex < searchEnd; colIndex++) {
                    const cellValue = (row[colIndex] || '').trim();
                    if (isIdentifier(cellValue)) {
                        identifierColIndex = colIndex;
                        break;
                    }
                }

                // 如果在预期位置没找到，在整个行中搜索（但限制在前10列，避免移动太远）
                if (identifierColIndex === -1) {
                    for (let colIndex = 1; colIndex < Math.min(row.length, 10); colIndex++) {
                        const cellValue = (row[colIndex] || '').trim();
                        if (isIdentifier(cellValue)) {
                            identifierColIndex = colIndex;
                            break;
                        }
                    }
                }

                // 如果找到标识符列，向左移动数据
                if (identifierColIndex > 0) {
                    const shiftAmount = identifierColIndex;

                    // 保存移动前的数据以便调试
                    const beforeMove = [...row];
                    const lastCellBeforeMove = beforeMove[beforeMove.length - 1];

                    // 创建新行数据：将标识符列及其后面的所有数据向左移动
                    const newRow = [];

                    // 第一部分：从标识符列开始到行尾的所有数据
                    for (let i = identifierColIndex; i < row.length; i++) {
                        newRow.push(row[i] || '');
                    }

                    // 第二部分：在标识符列之前的数据（如果有需要保留的）
                    // 实际上，如果标识符列在索引identifierColIndex，那么前面的数据应该被丢弃
                    // 或者，我们可以把前面的数据移到末尾

                    // 将前面的数据移到末尾（保留所有数据）
                    for (let i = 0; i < identifierColIndex; i++) {
                        if (newRow.length < row.length) {
                            newRow.push(row[i] || '');
                        }
                    }

                    // 确保新行的长度和原行相同
                    while (newRow.length < row.length) {
                        newRow.push('');
                    }
                    while (newRow.length > row.length) {
                        newRow.pop();
                    }

                    // 将新数据复制回原行
                    for (let i = 0; i < row.length; i++) {
                        row[i] = newRow[i] || '';
                    }

                    shiftedRowsCount++;
                    const movedValue = row[0] || '';
                    const lastCellAfterMove = row[row.length - 1];
                    console.log(`  Row ${rowIndex + 1}: Shifted left by ${shiftAmount} columns (moved "${movedValue}" to first column)`);
                    console.log(`    Last cell before: "${lastCellBeforeMove}", after: "${lastCellAfterMove}"`);
                }
            }
        }

        if (shiftedRowsCount > 0) {
            console.log(`Post-processing complete: Shifted ${shiftedRowsCount} row(s) to align identifier columns`);
        } else {
            console.log('Post-processing: No shifts needed (all rows start with identifier or empty)');
        }
    }

    // 过滤掉完全为空的行，避免出现 "空白行" 被粘贴到表格
    const beforeFilterRowCount = dataMatrix.length;
    dataMatrix = dataMatrix.filter(row => {
        if (!Array.isArray(row)) {
            return false;
        }
        return row.some(cell => (cell ?? '').trim() !== '');
    });
    if (beforeFilterRowCount !== dataMatrix.length) {
        console.log(`Removed ${beforeFilterRowCount - dataMatrix.length} empty row(s) from pasted data`);
    }
    if (dataMatrix.length === 0) {
        console.warn('All pasted rows were empty after filtering; aborting paste.');
        notifyPasteUser('Pasted content is empty after filtering blank lines.', 'danger');
        return;
    }

    // ===== 最终过滤：Downline Payment 报表（在 dataMatrix 构建完成后） =====
    // 检测是否是 Downline Payment 格式
    let isDownlinePaymentFinal = false;
    if (dataMatrix.length >= 2) {
        const firstRow = dataMatrix[0] || [];
        const r0a = (firstRow[0] || '').toString().toUpperCase().trim();
        const r0b = (firstRow[1] || '').toString().toUpperCase().trim();
        const r0c = (firstRow[2] || '').toString().toUpperCase().trim();
        const hasMGRow = dataMatrix.some(row => {
            const first = (row[0] || '').toString().toUpperCase().trim();
            return first === 'MG';
        });
        const hasMinorRow = dataMatrix.some(row => {
            const first = (row[0] || '').toString().toUpperCase().trim();
            return first === 'MINOR';
        });
        if (r0a && r0a === r0b && r0c === 'MAJOR' && (hasMGRow || hasMinorRow)) {
            isDownlinePaymentFinal = true;
        }
    }

    if (isDownlinePaymentFinal) {
        console.log('Final filter: Detected Downline Payment format, applying filter to dataMatrix...');
        const filteredMatrix = [];

        // 处理第一行 owner 总览
        // 可能后面还有相同用户名的 MINOR 行，需要全部处理
        let startIndex = 1;
        if (dataMatrix.length > 0) {
            const row0 = dataMatrix[0].map(c => (c || '').toString().trim());
            const r0a = (row0[0] || '').toString().toUpperCase();
            const r0b = (row0[1] || '').toString().toUpperCase();
            const r0c = (row0[2] || '').toString().toUpperCase();
            if (r0a && r0a === r0b && r0c === 'MAJOR') {
                // 只保留前11列
                const ownerRow = [];
                for (let i = 0; i < Math.min(11, row0.length); i++) {
                    ownerRow.push(row0[i] || '');
                }
                while (ownerRow.length < 11) ownerRow.push('');
                filteredMatrix.push(ownerRow);

                // 检查后面是否还有相同用户名的 MINOR 行
                let j = 1;
                while (j < dataMatrix.length) {
                    const nextRow = dataMatrix[j].map(c => (c || '').toString().trim());
                    const nextA = (nextRow[0] || '').toString().toUpperCase();
                    const nextB = (nextRow[1] || '').toString().toUpperCase();
                    const nextC = (nextRow[2] || '').toString().toUpperCase();

                    // 如果是相同用户名且是 MINOR 行，也处理
                    if (nextA === r0a && nextB === r0b && nextC === 'MINOR') {
                        const minorRow = [];
                        for (let i = 0; i < Math.min(11, nextRow.length); i++) {
                            minorRow.push(nextRow[i] || '');
                        }
                        while (minorRow.length < 11) minorRow.push('');
                        filteredMatrix.push(minorRow);
                        j++;
                        startIndex = j; // 更新起始索引
                    } else {
                        break; // 不是相同用户名的 MINOR 行，停止处理
                    }
                }
            }
        }

        // 处理后续行：合并 MG + 后续的 MAJOR/MINOR 行（可能有多个）
        for (let i = startIndex; i < dataMatrix.length; i++) {
            const row = dataMatrix[i].map(c => (c || '').toString().trim());
            const first = (row[0] || '').toString().toUpperCase();

            // 识别 "MG  m99m06" 这种行
            if (first === 'MG' && row.length >= 2) {
                const parentUser = row[1] || '';      // m99m06

                // 处理后续的所有 MAJOR 和 MINOR 行，直到遇到下一个 MG 行或数据结束
                let j = i + 1;
                while (j < dataMatrix.length) {
                    const nextRow = dataMatrix[j].map(c => (c || '').toString().trim());
                    const nextFirst = (nextRow[0] || '').toString().toUpperCase();

                    // 如果遇到下一个 MG 行，停止处理
                    if (nextFirst === 'MG') {
                        break;
                    }

                    const nextType = (nextRow[1] || '').toString().toUpperCase(); // type 在第二格

                    // 期望下一行形如 "M06-KZ  MAJOR  340  $2.38 ..." 或 "M06-KZ  MINOR  ..."
                    if (nextType === 'MAJOR' || nextType === 'MINOR') {
                        const downlineCode = nextRow[0] || '';   // M06-KZ

                        const getValIdx = (r, idx) =>
                            (idx >= 0 && idx < r.length && r[idx] != null) ? r[idx].toString().trim() : '';

                        const newRow = [
                            parentUser,
                            downlineCode,
                            nextType,  // 保留原始类型（MAJOR 或 MINOR）
                            getValIdx(nextRow, 2),  // Bet
                            getValIdx(nextRow, 3),  // Bet Tax
                            getValIdx(nextRow, 4),  // Eat
                            getValIdx(nextRow, 5),  // Eat Tax
                            getValIdx(nextRow, 6),  // Tax
                            getValIdx(nextRow, 7),  // Profit/Loss
                            getValIdx(nextRow, 8),  // Total Tax
                            getValIdx(nextRow, 9)   // Total Profit/Loss
                        ];

                        // 确保是11列
                        while (newRow.length < 11) newRow.push('');

                        if (newRow.some(v => (v || '').toString().trim() !== '')) {
                            filteredMatrix.push(newRow);
                            console.log(`  Merged MG row ${i} with ${nextType} row ${j}: ${parentUser} | ${downlineCode}`);
                        }

                        j++; // 继续处理下一行
                    } else {
                        // 如果不是 MAJOR/MINOR，可能是其他数据，停止处理这个 MG 组
                        break;
                    }
                }

                // 更新 i，因为 j 已经指向下一个需要处理的行
                i = j - 1;
                continue;
            }

            // 如果既不是 MG 也不是 MINOR，且第一行不是 owner 总览，可能是其他数据，跳过
            if (i > 0) {
                console.log(`  Skipping unrecognized row at index ${i}: first cell = "${first}"`);
            }
        }

        if (filteredMatrix.length > 0) {
            console.log(`Final filter applied: ${dataMatrix.length} rows -> ${filteredMatrix.length} rows`);
            dataMatrix = filteredMatrix;
        }
    }
    // ===== 最终过滤结束 =====

    const maxRows = dataMatrix.length;
    // 默认使用整行的列数；仅在 Downline Payment 特殊格式时才限制为 11 列
    // 计算最大列数：遍历所有行，找到最长的行
    let maxCols = 0;
    if (dataMatrix.length > 0) {
        dataMatrix.forEach(row => {
            if (row && row.length > maxCols) {
                maxCols = row.length;
            }
        });
    }
    if (isDownlinePaymentFinal && maxCols > 11) {
        maxCols = 11;
    }

    console.log('Final data matrix dimensions:', maxRows, 'x', maxCols);
    console.log('First row length:', dataMatrix[0]?.length);
    console.log('Second row length:', dataMatrix[1]?.length);
    console.log('Max columns found:', maxCols);
    console.log('First 3 rows of final matrix:', dataMatrix.slice(0, 3));
    console.log('=== PASTE DEBUG END ===');

    const matrixToApply = isDownlinePaymentFinal
        ? dataMatrix.map((row) => row.slice(0, 11))
        : dataMatrix;
    const fillMaxCols = isDownlinePaymentFinal ? Math.min(maxCols, 11) : maxCols;

    const { successCount } = applyParsedMatrixToGrid(matrixToApply, e.target, {
        trimValues: true,
        uppercaseValues: true,
    });

    console.log(`Paste completed: ${successCount} cells filled`);
    console.log(`Pasted ${maxRows} rows x ${fillMaxCols} cols`);

    if (successCount > 0) {
        let message = `Successfully pasted ${successCount} cells (${maxRows} rows x ${fillMaxCols} cols)! Press Ctrl+Z to undo`;
        notifyPasteUser(message, 'success');
    } else {
        notifyPasteUser('No cells were pasted. Check console for details.', 'danger');
    }

    recomputeSubmitStateAfterPaste();

    if (successCount > 0) {
        setTimeout(() => {
            runConvertTableOnSubmit();
        }, 100);
    }
  return successCount > 0;
}
