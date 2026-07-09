/** 3.API paste. */
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";
import { parseAndFillHtmlTableForWbetApi } from "./dataCaptureWbetHtmlPaste.js";
import { parseAndFillHtmlTableForInvoice } from "./dataCaptureInvoiceHtmlPaste.js";



import { applyParsedMatrixToGrid, parseGenericHtmlTable } from "../core/dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

/** @returns {boolean} */
export function handle3ApiPaste(e, pastedData) {
        console.log('3.API mode detected, attempting to parse...');
        console.log('3.API: Pasted data length:', pastedData.length);
        console.log('3.API: Pasted data raw (first 500 chars):', pastedData.substring(0, 500));

        // 3.1 WBET_API: 以下代码从 WBET_API 选项复制而来，用于在 3.API 模式下支持 WBET_API 格式的粘贴
        // 3.1 WBET_API: 保持原始格式，特别是保持 Sub Total 和 Grand Total 分开成两行
        const startCell = e.target;
        let formatDetected = false;

        // 3.1 WBET_API 快速特征检测：避免误把 INVOICE 当成 WBET_API
        // WBET_API 典型特征：包含 SUB TOTAL / GRAND TOTAL
        const isLikelyWBET_API = /SUB\s*TOTAL|SUBTOTAL|GRAND\s*TOTAL|GRANDTOTAL/i.test(pastedData);
        if (!isLikelyWBET_API) {
            console.log('3.API: 3.1 WBET_API format check failed (no SUB/GRAND TOTAL), skipping...');
        } else {

            // 优先使用 HTML 表格解析（从网页复制的内容通常是 HTML 格式）
            const htmlDataFromDetect = detectHtmlTableInClipboard(e);

            if (htmlDataFromDetect) {
                console.log('3.API: 3.1 WBET_API HTML data detected via detectAndParseHTML');
                const filled = parseAndFillHtmlTableForWbetApi(htmlDataFromDetect, startCell);
                if (filled) {
                    console.log('3.API: 3.1 WBET_API Successfully filled using parseAndFillHTMLTableForWBET_API');
                    formatDetected = true;
                    notifyPasteUser('3.API: 检测到WBET_API格式 (3.1)!', 'success');
                    recomputeSubmitStateAfterPaste();
                    return true;
                } else {
                    console.log('3.API: 3.1 WBET_API parseAndFillHTMLTableForWBET_API returned false, trying standard HTML parsing');
                }
            }

            // 如果上面的方法失败，尝试手动解析HTML
            let htmlData = null;
            try {
                htmlData = e.clipboardData.getData('text/html');
                if (!htmlData || !htmlData.toLowerCase().includes('<table')) {
                    htmlData = null;
                }
            } catch (err) {
                console.log('3.API: 3.1 WBET_API Could not get HTML data from clipboard:', err);
            }

            if (htmlData && !formatDetected) {
                console.log('3.API: 3.1 WBET_API HTML data detected, length:', htmlData.length);
                const filled = parseAndFillHtmlTableForWbetApi(htmlData, startCell);
                if (filled) {
                    formatDetected = true;
                    notifyPasteUser('3.API: 检测到WBET_API格式 (3.1)!', 'success');
                    recomputeSubmitStateAfterPaste();
                    return true;
                }
            }

            // 如果 HTML 解析失败，尝试纯文本解析
            if (!formatDetected) {
                console.log('3.API: 3.1 WBET_API Trying text-based parsing...');
                const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const lines = normalizedData.split('\n').map(line => line.trim()).filter(line => line !== '');

                if (lines.length > 0) {
                    // 第一步：解析原始数据成行
                    const rawDataMatrix = [];
                    lines.forEach(line => {
                        let cells = [];
                        if (line.includes('\t')) {
                            cells = line.split('\t').map(c => c.trim());
                        } else {
                            // 使用多个空格分割
                            cells = line.split(/\s{2,}/).map(c => c.trim());
                        }
                        if (cells.length > 0) {
                            rawDataMatrix.push(cells);
                        }
                    });

                    console.log('3.API: 3.1 WBET_API Raw parsed data:', rawDataMatrix.length, 'rows');

                    // 第二步：处理数据 - 移除行号、合并 Sub Total 和 Grand Total 的数据
                    const processedMatrix = [];
                    const rowsToSkip = new Set();
                    // 仅用于 WBET_API：严格数值判断（允许 Turnover/Valid Turnover 出现相同数字，如 71.00 / 71.00）
                    const isStrictNumberToken = (v) => {
                        if (v === null || v === undefined) return false;
                        const s = String(v).trim();
                        if (!s) return false;
                        // 允许：-123, 1,234.56, 123.4, 0, -0.25（不允许夹杂字母）
                        return /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(s);
                    };

                    rawDataMatrix.forEach((row, rowIndex) => {
                        if (rowsToSkip.has(rowIndex)) {
                            return;
                        }

                        // 检查第一列是否是行号（纯数字）
                        const firstCell = (row[0] || '').toString().trim();
                        const isRowNumber = /^\d+$/.test(firstCell);

                        // 如果是行号，跳过第一列
                        let processedRow;
                        if (isRowNumber && row.length > 1) {
                            processedRow = row.slice(1);
                        } else {
                            processedRow = [...row];
                        }

                        // 检查是否是 Sub Total 或 Grand Total 行
                        const rowText = processedRow.join(' ').toUpperCase();
                        const isSubTotal = rowText.includes('SUB TOTAL') || rowText.includes('SUBTOTAL');
                        const isGrandTotal = rowText.includes('GRAND TOTAL') || rowText.includes('GRANDTOTAL');

                        if (isSubTotal || isGrandTotal) {
                            // 先找到所有 Total 行的位置，以便确定合并的边界
                            const totalRowIndices = [];
                            rawDataMatrix.forEach((r, idx) => {
                                if (idx > rowIndex) {
                                    const firstCell = (r[0] || '').toString().trim();
                                    const firstIsNumber = /^\d+$/.test(firstCell);
                                    const processedR = firstIsNumber && r.length > 1 ? r.slice(1) : r;
                                    const processedRText = processedR.join(' ').toUpperCase();
                                    if (processedRText.includes('SUB TOTAL') || processedRText.includes('SUBTOTAL') ||
                                        processedRText.includes('GRAND TOTAL') || processedRText.includes('GRANDTOTAL')) {
                                        totalRowIndices.push(idx);
                                    }
                                }
                            });

                            // 确定合并的边界：下一个 Total 行的位置
                            const nextTotalRowIndex = totalRowIndices.length > 0 ? totalRowIndices[0] : rawDataMatrix.length;

                            console.log(`3.API: 3.1 WBET_API ${isSubTotal ? 'SUB TOTAL' : 'GRAND TOTAL'} at row ${rowIndex}, next Total at row ${nextTotalRowIndex}`);

                            // 合并后续行的所有数据，直到遇到另一个 Total 行
                            let mergeIndex = rowIndex + 1;

                            while (mergeIndex < nextTotalRowIndex && mergeIndex < rawDataMatrix.length) {
                                const nextRow = rawDataMatrix[mergeIndex];
                                if (rowsToSkip.has(mergeIndex)) {
                                    mergeIndex++;
                                    continue;
                                }

                                // 再次检查（双重保险）：确保不是另一个 Total 行
                                const nextFirstCell = (nextRow[0] || '').toString().trim();
                                const nextFirstIsNumber = /^\d+$/.test(nextFirstCell);
                                const nextProcessedRow = nextFirstIsNumber && nextRow.length > 1 ? nextRow.slice(1) : [...nextRow];
                                const nextRowText = nextProcessedRow.join(' ').toUpperCase();
                                const nextIsSubTotal = nextRowText.includes('SUB TOTAL') || nextRowText.includes('SUBTOTAL');
                                const nextIsGrandTotal = nextRowText.includes('GRAND TOTAL') || nextRowText.includes('GRANDTOTAL');

                                // 如果遇到另一个 Total 行，立即停止合并
                                if (nextIsSubTotal || nextIsGrandTotal) {
                                    console.log(`3.API: 3.1 WBET_API Stopping merge at row ${mergeIndex} - found another Total row`);
                                    break;
                                }

                                // 检查下一行是否是新的数据行标识（2-3个字母，如 OB, OC, OD）
                                const nextProcessedFirstCell = (nextProcessedRow[0] || '').toString().trim();

                                // 检查是否是用户名标识（2-3个大写字母）
                                if (/^[A-Z]{2,3}$/.test(nextProcessedFirstCell)) {
                                    console.log(`3.API: 3.1 WBET_API Stopping merge at row ${mergeIndex} - found new data row (${nextProcessedFirstCell})`);
                                    break; // 这是新的数据行，停止合并
                                }

                                // 将下一行的数据追加到当前行（如果是行号，跳过它）
                                const dataToAdd = nextFirstIsNumber && nextRow.length > 1 ? nextRow.slice(1) : nextRow;

                                // 检测并去除重叠数据：如果当前行的最后一个值和下一行的第一个值相同，跳过第一个值
                                let startIndex = 0;
                                if (processedRow.length > 0 && dataToAdd.length > 0) {
                                    const lastValue = processedRow[processedRow.length - 1];
                                    const firstValue = dataToAdd[0];
                                    if (lastValue && firstValue && lastValue.toString().trim() === firstValue.toString().trim()) {
                                        startIndex = 1; // 跳过第一个值（因为它是重复的）
                                        console.log(`3.API: 3.1 WBET_API Text - Detected duplicate value "${firstValue}", skipping first cell of next row`);
                                    }
                                }

                                // 添加数据（跳过重复的第一个值）
                                // 智能去重：检查是否与 processedRow 中的值重复
                                for (let i = startIndex; i < dataToAdd.length; i++) {
                                    const cellValue = (dataToAdd[i] || '').toString().trim();
                                    if (cellValue) {
                                        // 检查是否与 processedRow 的最后一个值重复（避免连续重复）
                                        const lastProcessedValue = processedRow.length > 0 ? processedRow[processedRow.length - 1] : null;
                                        if (lastProcessedValue && lastProcessedValue.toString().trim() === cellValue) {
                                            // ⚠️ WBET_API 总计行允许相邻重复数值（例如 Turnover 与 Valid Turnover 都是 71.00）
                                            // 否则会导致少一列（你反馈的 SUB TOTAL / GRAND TOTAL 少一个 71.00）
                                            const isTotalRow = (isSubTotal || isGrandTotal);
                                            const lastStr = lastProcessedValue.toString().trim();
                                            const canKeepDuplicateNumber = isTotalRow && isStrictNumberToken(lastStr) && isStrictNumberToken(cellValue);
                                            if (!canKeepDuplicateNumber) {
                                                console.log(`3.API: 3.1 WBET_API Text - Skipping duplicate value "${cellValue}" (same as last value)`);
                                                continue;
                                            }
                                        }

                                        // 检查是否与 processedRow 的倒数第二个值也相同（避免 A-B-B 模式变成 A-B-B-B）
                                        if (processedRow.length >= 2) {
                                            const secondLastValue = processedRow[processedRow.length - 2];
                                            if (secondLastValue && secondLastValue.toString().trim() === cellValue) {
                                                // 同上：WBET_API 总计行允许数值重复
                                                const isTotalRow = (isSubTotal || isGrandTotal);
                                                const secondLastStr = secondLastValue.toString().trim();
                                                const canKeepDuplicateNumber = isTotalRow && isStrictNumberToken(secondLastStr) && isStrictNumberToken(cellValue);
                                                if (!canKeepDuplicateNumber) {
                                                    console.log(`3.API: 3.1 WBET_API Text - Skipping duplicate value "${cellValue}" (same as second last value, pattern detected)`);
                                                    continue;
                                                }
                                            }
                                        }

                                        processedRow.push(cellValue);
                                    }
                                }

                                rowsToSkip.add(mergeIndex);
                                mergeIndex++;

                                // 防止合并过多（超过100列可能是误判）
                                if (processedRow.length > 100) {
                                    break;
                                }
                            }
                        }

                        processedMatrix.push(processedRow);
                    });

                    // 后处理：确保 Sub Total 和 Grand Total 完全分开
                    // 查找 Sub Total 和 Grand Total 行的索引
                    let subTotalRowIndex = -1;
                    let grandTotalRowIndex = -1;

                    processedMatrix.forEach((row, idx) => {
                        const rowText = row.join(' ').toUpperCase();
                        if ((rowText.includes('SUB TOTAL') || rowText.includes('SUBTOTAL')) &&
                            !rowText.includes('GRAND TOTAL') && !rowText.includes('GRANDTOTAL')) {
                            if (subTotalRowIndex < 0) subTotalRowIndex = idx;
                        }
                        if ((rowText.includes('GRAND TOTAL') || rowText.includes('GRANDTOTAL')) &&
                            !rowText.includes('SUB TOTAL') && !rowText.includes('SUBTOTAL')) {
                            if (grandTotalRowIndex < 0) grandTotalRowIndex = idx;
                        }
                    });

                    console.log(`3.API: 3.1 WBET_API Found Sub Total at row ${subTotalRowIndex}, Grand Total at row ${grandTotalRowIndex}`);

                    // 如果找到了 Sub Total 和 Grand Total，智能检测并修复数据分配
                    if (subTotalRowIndex >= 0 && grandTotalRowIndex >= 0 && grandTotalRowIndex > subTotalRowIndex) {
                        const subTotalRow = processedMatrix[subTotalRowIndex];
                        const grandTotalRow = processedMatrix[grandTotalRowIndex];

                        // 提取数据单元格（排除标签）
                        const getDataCells = (row) => {
                            return row.filter((cell, idx) => {
                                const cellText = (cell || '').toString().trim().toUpperCase();
                                return idx > 0 && cellText !== '' &&
                                    cellText !== 'SUB TOTAL' &&
                                    cellText !== 'SUBTOTAL' &&
                                    cellText !== 'GRAND TOTAL' &&
                                    cellText !== 'GRANDTOTAL';
                            });
                        };

                        const subTotalDataCells = getDataCells(subTotalRow);
                        const grandTotalDataCells = getDataCells(grandTotalRow);

                        console.log(`3.API: 3.1 WBET_API Sub Total has ${subTotalDataCells.length} data cells, Grand Total has ${grandTotalDataCells.length} data cells`);

                        // 根据用户需求：Sub Total 和 Grand Total 的数据应该是一样的
                        // 如果 Sub Total 行数据为空，而 Grand Total 行有数据，将 Grand Total 的数据复制到 Sub Total
                        if (subTotalDataCells.length === 0 && grandTotalDataCells.length > 0) {
                            console.log('3.API: 3.1 WBET_API Sub Total is empty but Grand Total has data. Copying Grand Total data to Sub Total.');
                            const newSubTotalRow = ['SUB TOTAL', ...grandTotalDataCells];
                            processedMatrix[subTotalRowIndex] = newSubTotalRow;
                        } else if (subTotalDataCells.length > 0 && grandTotalDataCells.length === 0) {
                            console.log('3.API: 3.1 WBET_API Grand Total is empty but Sub Total has data. Copying Sub Total data to Grand Total.');
                            const newGrandTotalRow = ['GRAND TOTAL', ...subTotalDataCells];
                            processedMatrix[grandTotalRowIndex] = newGrandTotalRow;
                        } else if (subTotalDataCells.length > 0 && grandTotalDataCells.length > 0) {
                            // 两者都有数据，使用 Grand Total 的数据作为标准（因为通常 Grand Total 更完整）
                            console.log('3.API: 3.1 WBET_API Both have data. Ensuring Sub Total matches Grand Total.');
                            const newSubTotalRow = ['SUB TOTAL', ...grandTotalDataCells];
                            processedMatrix[subTotalRowIndex] = newSubTotalRow;
                        }
                    }

                    // 使用处理后的矩阵
                    const finalMatrix = [...processedMatrix];

                    // 最终去重：去除所有行中的连续重复值
                    const deduplicatedMatrix = finalMatrix.map((row, rowIdx) => {
                        const rowText = row.join(' ').toUpperCase();
                        const isSubTotal = rowText.includes('SUB TOTAL') || rowText.includes('SUBTOTAL');
                        const isGrandTotal = rowText.includes('GRAND TOTAL') || rowText.includes('GRANDTOTAL');

                        // 只对 Sub Total 和 Grand Total 行进行去重
                        if (isSubTotal || isGrandTotal) {
                            const deduplicatedRow = [];
                            let lastValue = null;

                            row.forEach((cell, cellIdx) => {
                                const cellValue = (cell || '').toString().trim();
                                const cellText = cellValue.toUpperCase();

                                // 保留标签（SUB TOTAL 或 GRAND TOTAL）
                                if (cellIdx === 0 && (cellText.includes('SUB TOTAL') || cellText.includes('SUBTOTAL') ||
                                    cellText.includes('GRAND TOTAL') || cellText.includes('GRANDTOTAL'))) {
                                    deduplicatedRow.push(cell);
                                    lastValue = null; // 重置，因为标签不是数据
                                } else if (cellValue) {
                                    // 检查是否与上一个值重复
                                    // ⚠️ WBET_API 总计行允许相邻重复数值（例如 Turnover/Valid Turnover 同为 71.00）
                                    const lastStr = lastValue === null ? '' : lastValue.toString().trim();
                                    const isTotalRow = (isSubTotal || isGrandTotal);
                                    const canKeepDuplicateNumber = isTotalRow && isStrictNumberToken(lastStr) && isStrictNumberToken(cellValue);
                                    if (lastValue === null || lastStr !== cellValue || canKeepDuplicateNumber) {
                                        deduplicatedRow.push(cell);
                                        lastValue = cell;
                                    } else {
                                        console.log(`3.API: 3.1 WBET_API Removing duplicate value "${cellValue}" at row ${rowIdx}, column ${cellIdx}`);
                                    }
                                } else {
                                    // 空值也添加（保持列对齐）
                                    deduplicatedRow.push(cell);
                                }
                            });

                            console.log(`3.API: 3.1 WBET_API Row ${rowIdx} (${isSubTotal ? 'SUB TOTAL' : 'GRAND TOTAL'}): ${row.length} -> ${deduplicatedRow.length} cells after deduplication`);
                            return deduplicatedRow;
                        }

                        // 普通数据行保持不变
                        return row;
                    });

                    // 使用处理后的矩阵
                    processedMatrix.length = 0;
                    processedMatrix.push(...deduplicatedMatrix);

                    // 确保所有行的列数相同
                    const maxCols = Math.max(...processedMatrix.map(row => row.length), 0);
                    processedMatrix.forEach(row => {
                        while (row.length < maxCols) {
                            row.push('');
                        }
                    });

                    console.log('3.API: 3.1 WBET_API Processed text data:', processedMatrix.length, 'rows x', maxCols, 'cols');
                    console.log('3.API: 3.1 WBET_API First few processed rows:', processedMatrix.slice(0, 5));

                    if (processedMatrix.length > 0) {
                        const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(processedMatrix, startCell, {
                            startColOverride: 0,
                        });

                        if (successCount > 0) {
                            formatDetected = true;
                            console.log('3.API: 3.1 WBET_API Successfully pasted', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                            notifyPasteUser(`3.API: 检测到WBET_API格式 (3.1)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)!`, 'success');
                            recomputeSubmitStateAfterPaste();
                            return true;
                        }
                    }
                }
            }

            // 3.API: 3.1 WBET_API 解析失败，继续尝试其他格式
            if (!formatDetected) {
                console.log('3.API: 3.1 WBET_API parser failed, will continue trying other formats');
            }
        } // end 3.1 WBET_API guard (isLikelyWBET_API)

        // ===== 3.2 INVOICE 格式检测和处理 =====
        // 3.2 INVOICE: 以下代码从 INVOICE 选项复制而来，用于在 3.API 模式下支持 INVOICE 格式的粘贴
        // 目标：完全保持PDF原始格式，粘贴后数据保持行格式
        if (!formatDetected) {
            console.log('3.API: Trying 3.2 INVOICE format...');

            // 优先尝试获取HTML格式的数据（PDF粘贴可能包含HTML格式）
            let invoiceHtmlData = null;
            try {
                invoiceHtmlData = e.clipboardData.getData('text/html');
                if (invoiceHtmlData && invoiceHtmlData.includes('<table')) {
                    console.log('3.API: 3.2 INVOICE HTML table format detected');
                    const filled = parseAndFillHtmlTableForInvoice(invoiceHtmlData, startCell);
                    if (filled) {
                        formatDetected = true;
                        notifyPasteUser('3.API: 检测到INVOICE格式 (3.2)!', 'success');
                        recomputeSubmitStateAfterPaste();
                        return true; // 成功处理，直接返回
                    }
                }
            } catch (err) {
                console.log('3.API: 3.2 INVOICE Could not get HTML data from clipboard:', err);
            }

            // 如果HTML解析失败，尝试使用detectAndParseHTML
            if (!formatDetected) {
                const invoiceHtmlDataFromDetect = detectHtmlTableInClipboard(e);
                if (invoiceHtmlDataFromDetect) {
                    console.log('3.API: 3.2 INVOICE HTML data detected via detectAndParseHTML');
                    const filled = parseAndFillHtmlTableForInvoice(invoiceHtmlDataFromDetect, startCell);
                    if (filled) {
                        formatDetected = true;
                        notifyPasteUser('3.API: 检测到INVOICE格式 (3.2)!', 'success');
                        recomputeSubmitStateAfterPaste();
                        return true; // 成功处理，直接返回
                    }
                }
            }

            // 如果HTML解析都失败，尝试纯文本格式（但尽量保持格式）
            if (!formatDetected) {
                console.log('3.API: 3.2 INVOICE HTML parsing failed, trying text format...');
                const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const lines = normalizedData.split('\n').filter(line => line.trim() !== '');

                console.log('3.API: 3.2 INVOICE Total lines to process:', lines.length);
                console.log('3.API: 3.2 INVOICE First few lines:', lines.slice(0, 5));

                if (lines.length > 0) {
                    const dataMatrix = [];
                    let maxCols = 0;

                    // 智能解析：优先使用制表符，如果没有则使用多个空格或单个空格
                    lines.forEach((line, lineIndex) => {
                        if (line.trim() === '') return;

                        let cells = [];

                        // 方法1: 如果有制表符，使用制表符分割
                        if (line.includes('\t')) {
                            cells = line.split('\t').map(cell => cell.trim());
                            console.log(`3.API: 3.2 INVOICE Line ${lineIndex + 1} split by tab: ${cells.length} columns`);

                            // 后处理：检查并分离 "数字-数字" 格式的单元格
                            const processedCells = [];
                            for (const cell of cells) {
                                if (/[\d,]+\.?\d*-.*[\d,]+\.?\d*/.test(cell)) {
                                    // 找到连字符的位置（跳过开头的负号）
                                    let dashIndex = -1;
                                    if (cell.startsWith('-')) {
                                        dashIndex = cell.indexOf('-', 1);
                                    } else {
                                        dashIndex = cell.indexOf('-', 0);
                                    }

                                    if (dashIndex > 0 && dashIndex < cell.length - 1) {
                                        const firstNum = cell.substring(0, dashIndex).trim();
                                        let secondNum = cell.substring(dashIndex + 1).trim();

                                        // 在PDF数据中，连字符通常表示第二个数字是负数
                                        if (!secondNum.startsWith('-') && /^[\d,]+\.?\d*$/.test(secondNum)) {
                                            secondNum = '-' + secondNum;
                                        }

                                        const numPattern = /^-?[\d,]+\.?\d*$/;
                                        const numPatternWithDecimal = /^-?[\d,]+\.\d+$/;

                                        const firstIsValid = numPattern.test(firstNum) || numPatternWithDecimal.test(firstNum);
                                        let secondIsValid = numPattern.test(secondNum) || numPatternWithDecimal.test(secondNum);

                                        // 如果第二个数字无效，但看起来像数字（只是缺少负号），接受为正数
                                        if (!secondIsValid && /^[\d,]+\.?\d*$/.test(secondNum)) {
                                            secondIsValid = true;
                                        }

                                        if (firstIsValid && secondIsValid) {
                                            processedCells.push(firstNum);
                                            processedCells.push(secondNum);
                                            console.log(`3.API: 3.2 INVOICE Tab/MultiSpace - Separated "${cell}" into "${firstNum}" and "${secondNum}"`);
                                            continue;
                                        }
                                    }
                                }
                                processedCells.push(cell);
                            }
                            cells = processedCells;
                        } else {
                            // 方法2: 尝试使用多个空格（2个或更多）作为分隔符
                            const multiSpaceSplit = line.split(/\s{2,}/);
                            if (multiSpaceSplit.length > 3) {
                                // 如果多个空格分割得到多个列，使用这个
                                cells = multiSpaceSplit.map(cell => cell.trim());
                                console.log(`3.API: 3.2 INVOICE Line ${lineIndex + 1} split by multiple spaces: ${cells.length} columns`);

                                // 后处理：检查并分离 "数字-数字" 格式的单元格
                                const processedCells = [];
                                for (const cell of cells) {
                                    if (/[\d,]+\.?\d*-.*[\d,]+\.?\d*/.test(cell)) {
                                        // 找到连字符的位置（跳过开头的负号）
                                        let dashIndex = -1;
                                        if (cell.startsWith('-')) {
                                            dashIndex = cell.indexOf('-', 1);
                                        } else {
                                            dashIndex = cell.indexOf('-', 0);
                                        }

                                        if (dashIndex > 0 && dashIndex < cell.length - 1) {
                                            const firstNum = cell.substring(0, dashIndex).trim();
                                            let secondNum = cell.substring(dashIndex + 1).trim();

                                            // 在PDF数据中，连字符通常表示第二个数字是负数
                                            if (!secondNum.startsWith('-') && /^[\d,]+\.?\d*$/.test(secondNum)) {
                                                secondNum = '-' + secondNum;
                                            }

                                            const numPattern = /^-?[\d,]+\.?\d*$/;
                                            const numPatternWithDecimal = /^-?[\d,]+\.\d+$/;

                                            const firstIsValid = numPattern.test(firstNum) || numPatternWithDecimal.test(firstNum);
                                            let secondIsValid = numPattern.test(secondNum) || numPatternWithDecimal.test(secondNum);

                                            // 如果第二个数字无效，但看起来像数字（只是缺少负号），接受为正数
                                            if (!secondIsValid && /^[\d,]+\.?\d*$/.test(secondNum)) {
                                                secondIsValid = true;
                                            }

                                            if (firstIsValid && secondIsValid) {
                                                processedCells.push(firstNum);
                                                processedCells.push(secondNum);
                                                console.log(`3.API: 3.2 INVOICE MultiSpace - Separated "${cell}" into "${firstNum}" and "${secondNum}"`);
                                                continue;
                                            }
                                        }
                                    }
                                    processedCells.push(cell);
                                }
                                cells = processedCells;
                            } else {
                                // 方法3: 使用单个空格分割，智能识别列（复制 INVOICE 原逻辑）
                                const trimmedLine = line.trim();
                                const parts = trimmedLine.split(/\s+/);
                                cells = [];

                                let i = 0;
                                while (i < parts.length) {
                                    const part = parts[i];

                                    // 如果是行号（纯数字，且是第一个）
                                    if (cells.length === 0 && /^\d+$/.test(part)) {
                                        cells.push(part);
                                        i++;
                                    }
                                    // 如果是品牌名称（包含冒号，可能跨多个词直到遇到类型代码）
                                    else if (part.includes(':') || (i > 0 && parts[i - 1] && parts[i - 1].includes(':'))) {
                                        let brand = part;
                                        i++;
                                        // 继续收集品牌名称，直到遇到类型代码（2-3个大写字母，如PT）或数字
                                        while (i < parts.length) {
                                            const nextPart = parts[i];
                                            if (/^[A-Z]{2,3}$/.test(nextPart) || /^\d+\.?\d*$/.test(nextPart)) {
                                                break;
                                            }
                                            brand += ' ' + nextPart;
                                            i++;
                                        }
                                        cells.push(brand);
                                    }
                                    // 如果是类型代码（2-3个大写字母）
                                    else if (/^[A-Z]{2,3}$/.test(part)) {
                                        cells.push(part);
                                        i++;
                                    }
                                    // 如果是 "数字-数字" 格式
                                    else if (/[\d,]+\.?\d*-.*[\d,]+\.?\d*/.test(part)) {
                                        let dashIndex = -1;
                                        if (part.startsWith('-')) {
                                            dashIndex = part.indexOf('-', 1);
                                        } else {
                                            dashIndex = part.indexOf('-', 0);
                                        }

                                        if (dashIndex > 0 && dashIndex < part.length - 1) {
                                            const firstNum = part.substring(0, dashIndex).trim();
                                            let secondNum = part.substring(dashIndex + 1).trim();

                                            if (!secondNum.startsWith('-') && /^[\d,]+\.?\d*$/.test(secondNum)) {
                                                secondNum = '-' + secondNum;
                                            }

                                            const numPattern = /^-?[\d,]+\.?\d*$/;
                                            const numPatternWithDecimal = /^-?[\d,]+\.\d+$/;
                                            const firstIsValid = numPattern.test(firstNum) || numPatternWithDecimal.test(firstNum);
                                            let secondIsValid = numPattern.test(secondNum) || numPatternWithDecimal.test(secondNum);
                                            if (!secondIsValid && /^[\d,]+\.?\d*$/.test(secondNum)) {
                                                secondIsValid = true;
                                            }

                                            if (firstIsValid && secondIsValid) {
                                                cells.push(firstNum);
                                                cells.push(secondNum);
                                                console.log(`3.API: 3.2 INVOICE Separated "${part}" into "${firstNum}" and "${secondNum}"`);
                                                i++;
                                            } else {
                                                cells.push(part);
                                                i++;
                                            }
                                        } else {
                                            cells.push(part);
                                            i++;
                                        }
                                    }
                                    // 如果是数字（百分比或金额）
                                    else if (/^-?\d+\.?\d*$/.test(part) || /^-?[\d,]+\.?\d*$/.test(part)) {
                                        cells.push(part);
                                        i++;
                                    }
                                    // 如果是货币代码（括号内的）
                                    else if (/^\([A-Z]{3}\)$/.test(part)) {
                                        cells.push(part);
                                        i++;
                                    }
                                    // DESCRIPTION-AMOUNT 格式（如 "Loyalty-24.79"）
                                    else if (/^[A-Za-z]+-[0-9.,-]+$/i.test(part)) {
                                        const match = part.match(/^([A-Za-z]+)(-[0-9.,-]+)$/i);
                                        if (match) {
                                            cells.push(match[1]);
                                            cells.push(match[2]);
                                            i++;
                                        } else {
                                            cells.push(part);
                                            i++;
                                        }
                                    }
                                    // 其他情况
                                    else {
                                        cells.push(part);
                                        i++;
                                    }
                                }

                                console.log(`3.API: 3.2 INVOICE Line ${lineIndex + 1} split by smart parsing: ${cells.length} columns`, cells);
                            }
                        }

                        // 清理空单元格
                        cells = cells.filter(cell => {
                            const trimmed = (cell || '').trim();
                            return trimmed !== '' && trimmed !== '-';
                        });

                        if (cells.length > 0) {
                            dataMatrix.push(cells);
                            maxCols = Math.max(maxCols, cells.length);
                        }
                    });

                    console.log(`3.API: 3.2 INVOICE Parsed ${dataMatrix.length} rows with max ${maxCols} columns`);

                    // 合并PDF上下排版：货币+数字/数字+数字
                    const mergedDataMatrix = [];
                    let i = 0;
                    while (i < dataMatrix.length) {
                        const currentRow = [...dataMatrix[i]];
                        const nextRow = i + 1 < dataMatrix.length ? dataMatrix[i + 1] : null;

                        const trimmedCurrent = currentRow.map(c => (c || '').trim()).filter(c => c !== '');
                        const lastCell = trimmedCurrent.length > 0 ? trimmedCurrent[trimmedCurrent.length - 1] : '';
                        const isCurrencyCode = /^\([A-Z]{3}\)$/.test(lastCell);
                        const isLastCellNumber = /^-?[\d,]+\.?\d*$/.test(lastCell) || /^-?[\d,]+\.\d+$/.test(lastCell);

                        let isNextRowNumber = false;
                        let nextRowNumber = null;
                        let nextRowNumbers = null;
                        if (nextRow) {
                            const trimmedNext = nextRow.map(c => (c || '').trim()).filter(c => c !== '');
                            if (trimmedNext.length > 0) {
                                const firstNextCell = trimmedNext[0];
                                const numberPattern = /^-?[\d,]+\.?\d*$/;
                                const numberPatternWithDecimal = /^-?[\d,]+\.\d+$/;
                                if (trimmedNext.length >= 2) {
                                    const secondNextCell = trimmedNext[1];
                                    if ((numberPattern.test(firstNextCell) || numberPatternWithDecimal.test(firstNextCell)) &&
                                        (numberPattern.test(secondNextCell) || numberPatternWithDecimal.test(secondNextCell))) {
                                        isNextRowNumber = true;
                                        nextRowNumbers = [firstNextCell, secondNextCell];
                                        nextRowNumber = firstNextCell;
                                    } else if (numberPattern.test(firstNextCell) || numberPatternWithDecimal.test(firstNextCell)) {
                                        isNextRowNumber = true;
                                        nextRowNumber = firstNextCell;
                                    }
                                } else {
                                    const numberDashNumberPattern = /^(-?[\d,]+\.?\d*)-(-?[\d,]+\.?\d*)$/;
                                    const match = firstNextCell.match(numberDashNumberPattern);
                                    if (match) {
                                        isNextRowNumber = true;
                                        nextRowNumbers = [match[1], match[2]];
                                        nextRowNumber = match[1];
                                    } else if (numberPattern.test(firstNextCell) || numberPatternWithDecimal.test(firstNextCell)) {
                                        isNextRowNumber = true;
                                        nextRowNumber = firstNextCell;
                                    } else {
                                        if (/[\d,]+/.test(firstNextCell) && trimmedNext.length === 1) {
                                            isNextRowNumber = true;
                                            nextRowNumber = firstNextCell;
                                        }
                                    }
                                }
                            }
                        }

                        if (i < 20) {
                            console.log(`3.API: 3.2 INVOICE Row ${i + 1} - lastCell: "${lastCell}", isCurrency: ${isCurrencyCode}, isNumber: ${isLastCellNumber}`);
                            if (nextRow) {
                                const trimmedNext = nextRow.map(c => (c || '').trim()).filter(c => c !== '');
                                console.log(`3.API: 3.2 INVOICE Row ${i + 2} - firstCell: "${trimmedNext[0] || ''}", isNumber: ${isNextRowNumber}, cols: ${trimmedNext.length}`);
                            }
                        }

                        // 情况1: 货币代码 + 数字
                        if (isCurrencyCode && isNextRowNumber) {
                            let currencyColIndex = -1;
                            for (let j = currentRow.length - 1; j >= 0; j--) {
                                if ((currentRow[j] || '').trim() === lastCell) {
                                    currencyColIndex = j;
                                    break;
                                }
                            }

                            if (currencyColIndex >= 0) {
                                if (nextRowNumbers && nextRowNumbers.length === 2) {
                                    while (currentRow.length <= currencyColIndex + 2) {
                                        currentRow.push('');
                                    }
                                    currentRow[currencyColIndex + 1] = nextRowNumbers[0];
                                    currentRow[currencyColIndex + 2] = nextRowNumbers[1];
                                    console.log(`3.API: 3.2 INVOICE Merged currency+numbers at row ${i + 1}: "${lastCell}" + "${nextRowNumbers[0]}" + "${nextRowNumbers[1]}"`);
                                } else {
                                    while (currentRow.length <= currencyColIndex + 1) {
                                        currentRow.push('');
                                    }
                                    currentRow[currencyColIndex + 1] = nextRowNumber;
                                    console.log(`3.API: 3.2 INVOICE Merged currency+number at row ${i + 1}: "${lastCell}" + "${nextRowNumber}"`);
                                }
                                i += 2;
                                mergedDataMatrix.push(currentRow);
                                continue;
                            }
                        }

                        // 情况2: 当前行包含货币代码（不一定在最后）
                        if (nextRow && isNextRowNumber) {
                            const trimmedNext = nextRow.map(c => (c || '').trim()).filter(c => c !== '');
                            if (trimmedNext.length === 1) {
                                let currencyColIndex = -1;
                                for (let j = currentRow.length - 1; j >= 0; j--) {
                                    const cellValue = (currentRow[j] || '').trim();
                                    if (/^\([A-Z]{3}\)$/.test(cellValue)) {
                                        currencyColIndex = j;
                                        break;
                                    }
                                }

                                if (currencyColIndex >= 0) {
                                    if (nextRowNumbers && nextRowNumbers.length === 2) {
                                        while (currentRow.length <= currencyColIndex + 2) {
                                            currentRow.push('');
                                        }
                                        currentRow[currencyColIndex + 1] = nextRowNumbers[0];
                                        currentRow[currencyColIndex + 2] = nextRowNumbers[1];
                                        console.log(`3.API: 3.2 INVOICE Merged currency+numbers at row ${i + 1} (found currency at col ${currencyColIndex}): "${currentRow[currencyColIndex]}" + "${nextRowNumbers[0]}" + "${nextRowNumbers[1]}"`);
                                    } else {
                                        while (currentRow.length <= currencyColIndex + 1) {
                                            currentRow.push('');
                                        }
                                        currentRow[currencyColIndex + 1] = nextRowNumber;
                                        console.log(`3.API: 3.2 INVOICE Merged currency+number at row ${i + 1} (found currency at col ${currencyColIndex}): "${currentRow[currencyColIndex]}" + "${nextRowNumber}"`);
                                    }
                                    i += 2;
                                    mergedDataMatrix.push(currentRow);
                                    continue;
                                }

                                if (trimmedCurrent.length > 0) {
                                    let lastColIndex = -1;
                                    for (let j = currentRow.length - 1; j >= 0; j--) {
                                        const cellValue = (currentRow[j] || '').trim();
                                        if (cellValue !== '') {
                                            lastColIndex = j;
                                            break;
                                        }
                                    }

                                    if (lastColIndex >= 0) {
                                        if (nextRowNumbers && nextRowNumbers.length === 2) {
                                            while (currentRow.length <= lastColIndex + 2) {
                                                currentRow.push('');
                                            }
                                            currentRow[lastColIndex + 1] = nextRowNumbers[0];
                                            currentRow[lastColIndex + 2] = nextRowNumbers[1];
                                            console.log(`3.API: 3.2 INVOICE Merged row ${i + 1} + ${i + 2} (last cell at col ${lastColIndex}): "${currentRow[lastColIndex]}" + "${nextRowNumbers[0]}" + "${nextRowNumbers[1]}"`);
                                        } else {
                                            while (currentRow.length <= lastColIndex + 1) {
                                                currentRow.push('');
                                            }
                                            currentRow[lastColIndex + 1] = nextRowNumber;
                                            console.log(`3.API: 3.2 INVOICE Merged row ${i + 1} + ${i + 2} (last cell at col ${lastColIndex}): "${currentRow[lastColIndex]}" + "${nextRowNumber}"`);
                                        }
                                        i += 2;
                                        mergedDataMatrix.push(currentRow);
                                        continue;
                                    }
                                }
                            }
                        }

                        // 情况3: 数字 + 数字
                        if (isLastCellNumber && isNextRowNumber) {
                            const nextRowTrimmed = nextRow.map(c => (c || '').trim()).filter(c => c !== '');
                            const shouldMerge = nextRowTrimmed.length <= 2;
                            if (shouldMerge) {
                                let numberColIndex = -1;
                                for (let j = currentRow.length - 1; j >= 0; j--) {
                                    if ((currentRow[j] || '').trim() === lastCell) {
                                        numberColIndex = j;
                                        break;
                                    }
                                }
                                if (numberColIndex >= 0) {
                                    while (currentRow.length <= numberColIndex + 1) {
                                        currentRow.push('');
                                    }
                                    currentRow[numberColIndex + 1] = nextRowNumber;
                                    console.log(`3.API: 3.2 INVOICE Merged number+number at row ${i + 1}: "${lastCell}" + "${nextRowNumber}"`);
                                    i += 2;
                                    mergedDataMatrix.push(currentRow);
                                    continue;
                                }
                            }
                        }

                        mergedDataMatrix.push(currentRow);
                        i++;
                    }

                    dataMatrix.length = 0;
                    dataMatrix.push(...mergedDataMatrix);
                    maxCols = 0;
                    dataMatrix.forEach(row => {
                        maxCols = Math.max(maxCols, row.length);
                    });

                    console.log(`3.API: 3.2 INVOICE After merging currency+number, ${dataMatrix.length} rows with max ${maxCols} columns`);

                    dataMatrix.forEach(row => {
                        while (row.length < maxCols) {
                            row.push('');
                        }
                    });

                    // 填充到表格，保持原始格式（与 INVOICE 选项一致：从用户点击的列开始）
                    if (dataMatrix.length > 0 && maxCols > 0) {
                        const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                            trimValues: true,
                        });

                        if (successCount > 0) {
                            formatDetected = true;
                            notifyPasteUser(`3.API: 检测到INVOICE格式 (3.2)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持PDF原始格式!`, 'success');
                            recomputeSubmitStateAfterPaste();
                            return true;
                        }
                    }
                }
            }

            console.log('3.API: 3.2 INVOICE All parsing methods failed, will continue trying other formats');
        }
        // 3.2 INVOICE 代码结束
  return false;
}

