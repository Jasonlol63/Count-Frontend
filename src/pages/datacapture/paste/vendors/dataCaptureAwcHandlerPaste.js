/** AWC paste handler. */
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";
import { parseAWCPatternBasedData, parseAndFillHtmlTableForAwc } from "./dataCaptureAwcPaste.js";



import { applyParsedMatrixToGrid, parseGenericHtmlTable } from "../core/dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

/** @returns {boolean} */
export function handleAwcPaste(e, pastedData) {
        console.log('AWC mode detected (2.7), attempting to preserve table row format...');
        console.log('Pasted data length:', pastedData.length);
        console.log('Pasted data raw (first 500 chars):', pastedData.substring(0, 500));

        const startCell = e.target;
        let formatDetected = false;

        // 方法1：优先尝试HTML表格格式（从网页复制的内容通常是HTML格式）
        try {
            let htmlData = e.clipboardData.getData('text/html');
            if (htmlData && htmlData.includes('<table')) {
                console.log('AWC (2.7): HTML table format detected');
                const filled = parseAndFillHtmlTableForAwc(htmlData, startCell);
                if (filled) {
                    formatDetected = true;
                    return; // 成功处理，直接返回
                }
            }
        } catch (err) {
            console.log('AWC (2.7): Could not get HTML data from clipboard:', err);
        }

        // 方法2：如果HTML解析失败，尝试使用detectAndParseHTML
        if (!formatDetected) {
            const htmlDataFromDetect = detectHtmlTableInClipboard(e);
            if (htmlDataFromDetect) {
                console.log('AWC (2.7): HTML data detected via detectAndParseHTML');
                const filled = parseAndFillHtmlTableForAwc(htmlDataFromDetect, startCell);
                if (filled) {
                    formatDetected = true;
                    return; // 成功处理，直接返回
                }
            }
        }

        // 方法3：如果HTML解析都失败，尝试制表符分隔格式（Excel格式）
        if (!formatDetected) {
            console.log('AWC (2.7): HTML parsing failed, trying tab-separated format...');
            const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const lines = normalizedData.split('\n').filter(line => line.trim() !== '');

            if (lines.length > 0) {
                // 检查是否是多行制表符分隔的数据（标准Excel格式）
                const hasTabSeparator = lines.some(line => line.includes('\t'));

                if (hasTabSeparator) {
                    const dataMatrix = [];
                    let maxCols = 0;

                    lines.forEach(line => {
                        if (line.includes('\t')) {
                            // 制表符分隔，保持原始格式（包括空白单元格）
                            // split('\t') 会保留空白单元格（空字符串）
                            const cells = line.split('\t').map(cell => cell || ''); // 确保空单元格是空字符串，不是undefined
                            dataMatrix.push(cells);
                            maxCols = Math.max(maxCols, cells.length);
                        } else if (line !== '') {
                            dataMatrix.push([line]);
                            maxCols = Math.max(maxCols, 1);
                        }
                    });

                    // 确保所有行都有相同的列数（填充空白单元格以保持列位置）
                    dataMatrix.forEach(row => {
                        while (row.length < maxCols) {
                            row.push(''); // 填充空字符串以保持列位置
                        }
                    });

                    // 填充到表格（包括空白单元格）
                    if (dataMatrix.length > 0 && maxCols > 0) {
                        const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                            trimValues: true,
                        });

                        if (successCount > 0) {
                            notifyPasteUser(`AWC (2.7): 成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持表格行格式!`, 'success');
                            recomputeSubmitStateAfterPaste();
                            return true; // 成功处理，直接返回
                        }
                    }
                } else {
                    // 方法3.5：纯文本格式（换行符分隔），尝试根据数据模式智能分组成行
                    console.log('AWC (2.7): No tab separator found, trying pattern-based row grouping...');
                    const dataMatrix = parseAWCPatternBasedData(lines);

                    if (dataMatrix && dataMatrix.length > 0) {
                        const maxCols = Math.max(...dataMatrix.map(row => row.length));

                        // 确保所有行都有相同的列数
                        dataMatrix.forEach(row => {
                            while (row.length < maxCols) {
                                row.push('');
                            }
                        });

                        // 填充到表格
                        const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                            trimValues: true,
                        });

                        if (successCount > 0) {
                            notifyPasteUser(`AWC (2.7): 成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已根据数据模式智能分组!`, 'success');
                            recomputeSubmitStateAfterPaste();
                            return true; // 成功处理，直接返回
                        }
                    }
                }
            }
        }

        // 方法4：如果所有解析都失败，继续使用默认处理逻辑（但会智能检测列数，不会强制1列）
        console.log('AWC (2.7): All parsing methods failed, continuing with default logic (will auto-detect columns)');
  return false;
}

