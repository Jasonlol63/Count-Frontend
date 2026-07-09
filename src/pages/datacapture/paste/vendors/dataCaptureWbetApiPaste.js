/** WBET_API paste. */
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";
import { parseAndFillHtmlTableForWbetApi } from "./dataCaptureWbetHtmlPaste.js";



import { applyParsedMatrixToGrid } from "../core/dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

/** @returns {boolean} */
export function handleWbetApiPaste(e, pastedData) {
        console.log('2.11 WBET_API mode detected, attempting to parse...');
        console.log('2.11 WBET_API: Pasted data length:', pastedData.length);
        console.log('2.11 WBET_API: Pasted data raw (first 500 chars):', pastedData.substring(0, 500));

        // 优先使用 HTML 表格解析（从网页复制的内容通常是 HTML 格式）
        const htmlDataFromDetect = detectHtmlTableInClipboard(e);

        if (htmlDataFromDetect) {
            console.log('2.11 WBET_API: HTML data detected via detectAndParseHTML');
            const startCell = e.target;
            const filled = parseAndFillHtmlTableForWbetApi(htmlDataFromDetect, startCell);
            if (filled) {
                console.log('2.11 WBET_API: Successfully filled using parseAndFillHTMLTableForWBET_API');
                recomputeSubmitStateAfterPaste();
                return true;
            } else {
                console.log('2.11 WBET_API: parseAndFillHTMLTableForWBET_API returned false, trying standard HTML parsing');
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
            console.log('2.11 WBET_API: Could not get HTML data from clipboard:', err);
        }

        if (htmlData) {
            console.log('2.11 WBET_API: HTML data detected, length:', htmlData.length);
            const filled = parseAndFillHtmlTableForWbetApi(htmlData, e.target);
            if (filled) {
                recomputeSubmitStateAfterPaste();
                return true;
            }
        }

        // 如果 HTML 解析失败，尝试纯文本解析
        console.log('2.11 WBET_API: Trying text-based parsing...');
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

            console.log('2.11 WBET_API: Raw parsed data:', rawDataMatrix.length, 'rows');

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

                    console.log(`2.11 WBET_API: ${isSubTotal ? 'SUB TOTAL' : 'GRAND TOTAL'} at row ${rowIndex}, next Total at row ${nextTotalRowIndex}`);

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
                            console.log(`2.11 WBET_API: Stopping merge at row ${mergeIndex} - found another Total row`);
                            break;
                        }

                        // 检查下一行是否是新的数据行标识（2-3个字母，如 OB, OC, OD）
                        const nextProcessedFirstCell = (nextProcessedRow[0] || '').toString().trim();

                        // 检查是否是用户名标识（2-3个大写字母）
                        if (/^[A-Z]{2,3}$/.test(nextProcessedFirstCell)) {
                            console.log(`2.11 WBET_API: Stopping merge at row ${mergeIndex} - found new data row (${nextProcessedFirstCell})`);
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
                                console.log(`2.11 WBET_API: Text - Detected duplicate value "${firstValue}", skipping first cell of next row`);
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
                                    const isTotalRow = (isSubTotal || isGrandTotal);
                                    const lastStr = lastProcessedValue.toString().trim();
                                    const canKeepDuplicateNumber = isTotalRow && isStrictNumberToken(lastStr) && isStrictNumberToken(cellValue);
                                    if (!canKeepDuplicateNumber) {
                                        console.log(`2.11 WBET_API: Text - Skipping duplicate value "${cellValue}" (same as last value)`);
                                        continue;
                                    }
                                }

                                // 检查是否与 processedRow 的倒数第二个值也相同（避免 A-B-B 模式变成 A-B-B-B）
                                if (processedRow.length >= 2) {
                                    const secondLastValue = processedRow[processedRow.length - 2];
                                    if (secondLastValue && secondLastValue.toString().trim() === cellValue) {
                                        const isTotalRow = (isSubTotal || isGrandTotal);
                                        const secondLastStr = secondLastValue.toString().trim();
                                        const canKeepDuplicateNumber = isTotalRow && isStrictNumberToken(secondLastStr) && isStrictNumberToken(cellValue);
                                        if (!canKeepDuplicateNumber) {
                                            console.log(`2.11 WBET_API: Text - Skipping duplicate value "${cellValue}" (same as second last value, pattern detected)`);
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

            console.log(`2.11 WBET_API: Found Sub Total at row ${subTotalRowIndex}, Grand Total at row ${grandTotalRowIndex}`);

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

                console.log(`2.11 WBET_API: Sub Total has ${subTotalDataCells.length} data cells, Grand Total has ${grandTotalDataCells.length} data cells`);

                // 根据用户需求：Sub Total 和 Grand Total 的数据应该是一样的
                // 如果 Sub Total 行数据为空，而 Grand Total 行有数据，将 Grand Total 的数据复制到 Sub Total
                if (subTotalDataCells.length === 0 && grandTotalDataCells.length > 0) {
                    console.log('2.11 WBET_API: Sub Total is empty but Grand Total has data. Copying Grand Total data to Sub Total.');
                    const newSubTotalRow = ['SUB TOTAL', ...grandTotalDataCells];
                    processedMatrix[subTotalRowIndex] = newSubTotalRow;
                } else if (subTotalDataCells.length > 0 && grandTotalDataCells.length === 0) {
                    console.log('2.11 WBET_API: Grand Total is empty but Sub Total has data. Copying Sub Total data to Grand Total.');
                    const newGrandTotalRow = ['GRAND TOTAL', ...subTotalDataCells];
                    processedMatrix[grandTotalRowIndex] = newGrandTotalRow;
                } else if (subTotalDataCells.length > 0 && grandTotalDataCells.length > 0) {
                    // 两者都有数据，使用 Grand Total 的数据作为标准（因为通常 Grand Total 更完整）
                    console.log('2.11 WBET_API: Both have data. Ensuring Sub Total matches Grand Total.');
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
                                console.log(`2.11 WBET_API: Removing duplicate value "${cellValue}" at row ${rowIdx}, column ${cellIdx}`);
                            }
                        } else {
                            // 空值也添加（保持列对齐）
                            deduplicatedRow.push(cell);
                        }
                    });

                    console.log(`2.11 WBET_API: Row ${rowIdx} (${isSubTotal ? 'SUB TOTAL' : 'GRAND TOTAL'}): ${row.length} -> ${deduplicatedRow.length} cells after deduplication`);
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

            console.log('2.11 WBET_API: Processed text data:', processedMatrix.length, 'rows x', maxCols, 'cols');
            console.log('2.11 WBET_API: First few processed rows:', processedMatrix.slice(0, 5));

            if (processedMatrix.length > 0) {
                const { successCount } = applyParsedMatrixToGrid(processedMatrix, e.target, {
                    startColOverride: 0,
                });

                if (successCount > 0) {
                    notifyPasteUser(`2.11 WBET_API: 成功粘贴 ${processedMatrix.length} 行 x ${maxCols} 列数据!`, 'success');
                } else {
                    notifyPasteUser('2.11 WBET_API: 没有粘贴任何数据。', 'danger');
                }

                return true;
            }
        }

        // 2.11 WBET_API 解析失败，继续尝试其他解析器
        console.log('2.11 WBET_API parser failed, continuing with other parsers');
  return false;
}

