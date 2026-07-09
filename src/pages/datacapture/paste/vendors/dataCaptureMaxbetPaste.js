/** MAXBET paste. */
import { notifyPasteUser } from "../../lib/dataCaptureBridge.js";
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";
import { formatNumberToTwoDecimals } from "../core/dataCapturePasteMoneyUtils.js";



import { applyParsedMatrixToGrid } from "../core/dataCapturePasteApply.js";

/** @returns {boolean} */
export function handleMaxbetPaste(e, pastedData) {
        console.log('MAXBET mode detected, preserving row format with 2 decimal places...');
        console.log('MAXBET: Pasted data sample (first 500 chars):', pastedData.substring(0, 500));

        // 优先尝试获取HTML格式的数据（Excel/网页粘贴通常包含HTML格式）
        let htmlData = null;
        try {
            htmlData = e.clipboardData.getData('text/html');
            console.log('MAXBET: HTML data available:', htmlData ? 'Yes (length: ' + htmlData.length + ')' : 'No');
            if (htmlData && htmlData.includes('<table')) {
                console.log('MAXBET: HTML table format detected');

                try {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlData;

                    const table = tempDiv.querySelector('table');
                    if (table) {
                        console.log('MAXBET: HTML table found');
                        let dataMatrix = [];

                        // 处理表头（如果有）
                        const thead = table.querySelector('thead');
                        if (thead) {
                            const headerRows = thead.querySelectorAll('tr');
                            headerRows.forEach(tr => {
                                const row = [];
                                const cells = tr.querySelectorAll('th, td');
                                cells.forEach(cell => {
                                    const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                                    let text = cell.textContent || cell.innerText || '';
                                    text = text.replace(/\s+/g, ' ').trim();
                                    row.push(text);
                                    for (let i = 1; i < colspan; i++) {
                                        row.push('');
                                    }
                                });
                                if (row.length > 0) {
                                    dataMatrix.push(row);
                                }
                            });
                        }

                        // 处理表体，保持行格式
                        let bodyContainer = table.querySelector('tbody');
                        if (!bodyContainer) {
                            bodyContainer = table;
                        }

                        const bodyRows = bodyContainer.querySelectorAll('tr');
                        bodyRows.forEach((tr) => {
                            // 跳过已经在 thead 中处理过的行
                            if (thead && tr.closest('thead')) {
                                return;
                            }

                            const row = [];
                            const cells = tr.querySelectorAll('td, th');
                            cells.forEach(cell => {
                                const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                                let text = cell.textContent || cell.innerText || '';
                                text = text.replace(/\s+/g, ' ').trim();

                                // 格式化数值为2位小数
                                text = formatNumberToTwoDecimals(text);

                                row.push(text);
                                for (let i = 1; i < colspan; i++) {
                                    row.push('');
                                }
                            });
                            if (row.length > 0) {
                                dataMatrix.push(row);
                            }
                        });

                        if (dataMatrix.length > 0) {
                            // 确保所有行的列数相同
                            let maxCols = Math.max(...dataMatrix.map(row => row.length));
                            dataMatrix.forEach(row => {
                                while (row.length < maxCols) {
                                    row.push('');
                                }
                            });

                            console.log('MAXBET: HTML parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');

                            const { successCount, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, e.target, {});
                            if (successCount > 0) {
                                console.log('MAXBET: HTML paste successful -', successCount, 'cells in', dataMatrix.length, 'rows x', cols, 'cols');
                                notifyPasteUser(`MAXBET: 成功粘贴 ${successCount} 个单元格 (${dataMatrix.length} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                                return true;
                            }
                        }
                    }
                } catch (htmlErr) {
                    console.error('MAXBET: HTML parser error:', htmlErr);
                }
            }
        } catch (err) {
            console.log('MAXBET: Could not get HTML data from clipboard:', err);
        }

        // 如果HTML解析失败，尝试使用detectAndParseHTML
        const htmlDataFromDetect = detectHtmlTableInClipboard(e);
        if (htmlDataFromDetect) {
            console.log('MAXBET: HTML data detected via detectAndParseHTML');
            try {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlDataFromDetect;

                const table = tempDiv.querySelector('table');
                if (table) {
                    let dataMatrix = [];
                    const bodyRows = table.querySelectorAll('tr');

                    bodyRows.forEach((tr) => {
                        const row = [];
                        const cells = tr.querySelectorAll('td, th');
                        cells.forEach(cell => {
                            let text = cell.textContent || cell.innerText || '';
                            text = text.replace(/\s+/g, ' ').trim();

                            // 格式化数值为2位小数
                            text = formatNumberToTwoDecimals(text);

                            row.push(text);
                        });
                        if (row.length > 0) {
                            dataMatrix.push(row);
                        }
                    });

                    if (dataMatrix.length > 0) {
                        let maxCols = Math.max(...dataMatrix.map(row => row.length));
                        dataMatrix.forEach(row => {
                            while (row.length < maxCols) {
                                row.push('');
                            }
                        });

                        const { successCount, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, e.target, {});
                        if (successCount > 0) {
                            console.log('MAXBET: detectAndParseHTML paste successful -', successCount, 'cells in', dataMatrix.length, 'rows x', cols, 'cols');
                            notifyPasteUser(`MAXBET: 成功粘贴 ${successCount} 个单元格 (${dataMatrix.length} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                            return true;
                        }
                    }
                }
            } catch (err) {
                console.log('MAXBET: detectAndParseHTML processing failed:', err);
            }
        }

        // 如果HTML解析都失败，尝试纯文本格式（制表符分隔的表格数据）
        console.log('MAXBET: HTML parsing failed, trying text format...');
        const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // 保留所有行，包括空行（但空行会被跳过）
        const allLines = normalizedData.split('\n');

        if (allLines.length > 0) {
            const dataMatrix = [];
            let maxCols = 0;

            // MAXBET 特殊格式：每3行合并成一行
            // 格式：行1="Super", 行2="LMK1", 行3="RM\t6,000.00\t..."
            // 需要将这3行合并成表格的一行
            const nonEmptyLines = allLines.filter(line => line.trim() !== '');

            // 每3行合并成一行
            for (let i = 0; i < nonEmptyLines.length; i += 3) {
                const row1 = nonEmptyLines[i] || '';
                const row2 = nonEmptyLines[i + 1] || '';
                const row3 = nonEmptyLines[i + 2] || '';

                const mergedRow = [];

                // 第一行（通常是"Super"）
                if (row1.trim()) {
                    mergedRow.push(formatNumberToTwoDecimals(row1.trim()));
                }

                // 第二行（通常是用户名如"LMK1"）
                if (row2.trim()) {
                    mergedRow.push(formatNumberToTwoDecimals(row2.trim()));
                }

                // 第三行（包含制表符分隔的数据）
                if (row3.trim()) {
                    if (row3.includes('\t')) {
                        // 按制表符分割，格式化数值
                        const cells = row3.split('\t').map(c => {
                            const cellTrimmed = c.trim();
                            return formatNumberToTwoDecimals(cellTrimmed);
                        });
                        mergedRow.push(...cells);
                    } else {
                        // 没有制表符，作为单个单元格
                        mergedRow.push(formatNumberToTwoDecimals(row3.trim()));
                    }
                }

                if (mergedRow.length > 0) {
                    dataMatrix.push(mergedRow);
                    maxCols = Math.max(maxCols, mergedRow.length);
                }
            }

            // 确保所有行都有相同的列数（对齐到最大列数）
            if (maxCols > 0) {
                dataMatrix.forEach(row => {
                    while (row.length < maxCols) {
                        row.push('');
                    }
                });
            }

            if (dataMatrix.length > 0 && maxCols > 0) {
                const { successCount, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, e.target, {});
                if (successCount > 0) {
                    console.log('MAXBET: Text format paste successful -', successCount, 'cells in', dataMatrix.length, 'rows x', cols, 'cols');
                    notifyPasteUser(`MAXBET: 成功粘贴 ${successCount} 个单元格 (${dataMatrix.length} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                    return true;
                }
            }
        }

        // 如果所有解析都失败，继续使用默认处理逻辑
        console.log('MAXBET: All parsing methods failed, continuing with default logic');
  return false;
}

