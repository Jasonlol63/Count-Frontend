/** C8PLAY paste. */
import { notifyPasteUser } from "../../lib/dataCaptureBridge.js";
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";
import { formatNumberToTwoDecimals } from "../core/dataCapturePasteMoneyUtils.js";



import { applyParsedMatrixToGrid } from "../core/dataCapturePasteApply.js";

/** @returns {boolean} */
export function handleC8PlayPaste(e, pastedData) {
        console.log('C8PLAY mode detected, preserving row format with 2 decimal places...');
        console.log('C8PLAY: Pasted data sample (first 500 chars):', pastedData.substring(0, 500));

        // 辅助函数：仅在“严格为数字”时格式化为2位小数（避免把 225C8 误判为 225.00）
        // C8PLAY 报表复制：可能包含树状缩排/群组列，导致每行前导空白 <td> 数量不一致
        // 这里尝试把每行对齐到真正的 Player（通常以 C8 结尾）并跳过群组标题行
        function normalizeC8PlayRow(rawRow, expectedCols) {
            if (!Array.isArray(rawRow) || rawRow.length === 0) return null;

            const row = rawRow.map(v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim());
            const nonEmpty = row.filter(v => v !== '');

            // 跳过类似 "Agent (Count: 4)" / "Member (Count: 2)" 的群组标题行
            if (nonEmpty.length === 1 && /\bCount\s*:\s*\d+\b/i.test(nonEmpty[0])) {
                return null;
            }

            // 寻找 Player 起点：...C8 且下一个是 Name，再下一个是 User Type
            // 允许 C8 后面带后缀（例如：...C8A），避免无法对齐导致“右移”
            const isPlayer = (v) => /C8[A-Z0-9]{0,2}$/i.test(v) && !/\s/.test(v);
            const isUserType = (v) => /^(AGENT|MEMBER)$/i.test(v);

            let startIdx = 0;
            for (let i = 0; i <= row.length - 3; i++) {
                if (isPlayer(row[i]) && row[i + 1] !== '' && isUserType(row[i + 2])) {
                    startIdx = i;
                    break;
                }
            }

            let aligned = row.slice(startIdx);

            // 如果还没找到（例如 User Type 不在第3格），至少对齐到第一个 ...C8
            if (startIdx === 0 && !isPlayer(row[0])) {
                const firstPlayerIdx = row.findIndex(isPlayer);
                if (firstPlayerIdx > 0) {
                    aligned = row.slice(firstPlayerIdx);
                }
            }

            // 裁切/补齐到当前 Data Capture Table 的列数
            const cols = Number.isFinite(expectedCols) && expectedCols > 0 ? expectedCols : aligned.length;
            aligned = aligned.slice(0, cols);
            while (aligned.length < cols) aligned.push('');
            return aligned;
        }

        // 优先尝试获取HTML格式的数据（Excel/网页粘贴通常包含HTML格式）
        let htmlData = null;
        try {
            htmlData = e.clipboardData.getData('text/html');
            console.log('C8PLAY: HTML data available:', htmlData ? 'Yes (length: ' + htmlData.length + ')' : 'No');
            if (htmlData && htmlData.includes('<table')) {
                console.log('C8PLAY: HTML table format detected');

                try {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlData;

                    const table = tempDiv.querySelector('table');
                    if (table) {
                        console.log('C8PLAY: HTML table found');
                        let dataMatrix = [];

                        // 处理表头（如果有）：C8PLAY 粘贴只需要数据本体，跳过 thead 避免把表头贴进表格
                        const thead = table.querySelector('thead');

                        // 处理表体，保持行格式
                        let bodyContainer = table.querySelector('tbody');
                        if (!bodyContainer) {
                            bodyContainer = table;
                        }

                        const expectedCols = document.querySelectorAll('#tableHeader th').length - 1;
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
                            const normalizedRow = normalizeC8PlayRow(row, expectedCols);
                            if (normalizedRow && normalizedRow.length > 0) {
                                dataMatrix.push(normalizedRow);
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

                            console.log('C8PLAY: HTML parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');

                            const { successCount, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, e.target, {
                                startColOverride: 0,
                            });
                            if (successCount > 0) {
                                console.log('C8PLAY: HTML paste successful -', successCount, 'cells in', dataMatrix.length, 'rows x', cols, 'cols');
                                notifyPasteUser(`C8PLAY: 成功粘贴 ${successCount} 个单元格 (${dataMatrix.length} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                                return true;
                            }
                        }
                    }
                } catch (htmlErr) {
                    console.error('C8PLAY: HTML parser error:', htmlErr);
                }
            }
        } catch (err) {
            console.log('C8PLAY: Could not get HTML data from clipboard:', err);
        }

        // 如果HTML解析失败，尝试使用detectAndParseHTML
        const htmlDataFromDetect = detectHtmlTableInClipboard(e);
        if (htmlDataFromDetect) {
            console.log('C8PLAY: HTML data detected via detectAndParseHTML');
            try {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlDataFromDetect;

                const table = tempDiv.querySelector('table');
                if (table) {
                    let dataMatrix = [];
                    const bodyRows = table.querySelectorAll('tr');
                    const expectedCols = document.querySelectorAll('#tableHeader th').length - 1;

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
                        const normalizedRow = normalizeC8PlayRow(row, expectedCols);
                        if (normalizedRow && normalizedRow.length > 0) {
                            dataMatrix.push(normalizedRow);
                        }
                    });

                    if (dataMatrix.length > 0) {
                        let maxCols = Math.max(...dataMatrix.map(row => row.length));
                        dataMatrix.forEach(row => {
                            while (row.length < maxCols) {
                                row.push('');
                            }
                        });

                        const { successCount, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, e.target, {
                            startColOverride: 0,
                        });
                        if (successCount > 0) {
                            console.log('C8PLAY: detectAndParseHTML paste successful -', successCount, 'cells in', dataMatrix.length, 'rows x', cols, 'cols');
                            notifyPasteUser(`C8PLAY: 成功粘贴 ${successCount} 个单元格 (${dataMatrix.length} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                            return true;
                        }
                    }
                }
            } catch (err) {
                console.log('C8PLAY: detectAndParseHTML processing failed:', err);
            }
        }

        // 如果HTML解析都失败，尝试纯文本格式（C8PLAY特殊格式：数据块合并为行）
        console.log('C8PLAY: HTML parsing failed, trying text format...');
        const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const allLines = normalizedData.split('\n');

        console.log('C8PLAY: Text format - Total lines:', allLines.length);

        // C8PLAY特殊格式解析：将数据块合并为行
        // 格式：标识符行（如CKZ03）-> 数字+Agent行 -> 多个数字行 -> 空行或下一个标识符
        // 总计行（没有标识符的行）应该从第4列开始，前面留3个空列
        const dataMatrix = [];
        let currentRow = null;
        let maxCols = 0;
        let isTotalRow = false; // 标记是否是总计行

        for (let i = 0; i < allLines.length; i++) {
            const line = allLines[i];
            const trimmedLine = line.trim();

            // 跳过空行
            if (trimmedLine === '') {
                // 如果当前有未完成的行，保存它
                if (currentRow !== null && currentRow.length > 0) {
                    dataMatrix.push(currentRow);
                    maxCols = Math.max(maxCols, currentRow.length);
                    currentRow = null;
                    isTotalRow = false;
                }
                continue;
            }

            // 跳过群组标题行（从报表复制常见）：如 "Agent (Count: 4)" / "Member (Count: 2)"
            // 避免被当成总计行从第4列开始，导致列位移
            if (/\bCount\s*:\s*\d+\b/i.test(trimmedLine)) {
                if (currentRow !== null && currentRow.length > 0) {
                    dataMatrix.push(currentRow);
                    maxCols = Math.max(maxCols, currentRow.length);
                    currentRow = null;
                    isTotalRow = false;
                }
                continue;
            }

            // 检查是否是标识符行
            // - CKZxx (历史C8PLAY格式)
            // - 或者以 C8 结尾的 Player（例如 225C8, 22LGC8, KLGC8），可能以数字开头
            const isCkzIdentifier = /^CKZ\d{1,6}$/i.test(trimmedLine);
            const isPlayerIdentifier = /^[A-Z0-9]{2,20}$/i.test(trimmedLine) &&
                !trimmedLine.includes(' ') &&
                !trimmedLine.includes(',') &&
                !trimmedLine.includes('.') &&
                !trimmedLine.includes('-') &&
                /C8[A-Z0-9]{0,2}$/i.test(trimmedLine);
            const isIdentifier = isCkzIdentifier || isPlayerIdentifier;

            if (isIdentifier) {
                // 如果之前有未完成的行，先保存它
                if (currentRow !== null && currentRow.length > 0) {
                    dataMatrix.push(currentRow);
                    maxCols = Math.max(maxCols, currentRow.length);
                }
                // 开始新行，标识符作为第一列
                currentRow = [trimmedLine];
                isTotalRow = false;
            } else if (currentRow === null) {
                // 如果没有标识符，从第一行开始（可能是总计行）
                // 总计行应该从第4列开始，前面留3个空列
                isTotalRow = true;
                currentRow = ['', '', '']; // 前3列为空
                // 检查这一行是否包含制表符
                if (line.includes('\t')) {
                    const cells = line.split('\t').map(c => {
                        const trimmed = c.trim();
                        return formatNumberToTwoDecimals(trimmed);
                    }).filter(c => c !== '');
                    currentRow.push(...cells);
                } else {
                    // 单行数据
                    const formatted = formatNumberToTwoDecimals(trimmedLine);
                    currentRow.push(formatted);
                }
            } else {
                // 这是数据行，需要添加到当前行
                if (line.includes('\t')) {
                    // 制表符分隔（如 "87	Agent	"）
                    const cells = line.split('\t').map(c => {
                        const trimmed = c.trim();
                        return formatNumberToTwoDecimals(trimmed);
                    }).filter(c => c !== '');
                    currentRow.push(...cells);
                } else {
                    // 单行数字
                    const formatted = formatNumberToTwoDecimals(trimmedLine);
                    currentRow.push(formatted);
                }
            }
        }

        // 保存最后一行
        if (currentRow !== null && currentRow.length > 0) {
            // 检查最后一行是否是总计行：
            // 1. 如果 isTotalRow 标记为 true，说明是总计行
            // 2. 或者如果第一列不是标识符格式（不是以大写字母开头的短标识符）
            const firstCell = currentRow[0] || '';
            const isIdentifierFormat = (/^CKZ\d{1,6}$/i.test(firstCell)) ||
                (/^[A-Z0-9]{2,20}$/i.test(firstCell) &&
                    !firstCell.includes(' ') &&
                    !firstCell.includes(',') &&
                    !firstCell.includes('.') &&
                    !firstCell.includes('-') &&
                    /C8[A-Z0-9]{0,2}$/i.test(firstCell));
            const isLastRowTotal = isTotalRow || (!isIdentifierFormat && firstCell !== '');

            // 如果最后一行是总计行，确保前3列为空
            if (isLastRowTotal) {
                // 检查前3列是否为空，如果不是，重新构建
                const firstThreeEmpty = currentRow.slice(0, 3).every(c => c === '');
                if (!firstThreeEmpty) {
                    // 如果前3列不是空的，说明需要添加3个空列
                    currentRow = ['', '', '', ...currentRow];
                }
            }
            dataMatrix.push(currentRow);
            maxCols = Math.max(maxCols, currentRow.length);
        }

        console.log('C8PLAY: DataMatrix rows:', dataMatrix.map((row, idx) => {
            return `Row ${idx}: [${row.slice(0, 5).join(', ')}...] (length: ${row.length})`;
        }));

        console.log('C8PLAY: Parsed dataMatrix:', dataMatrix.length, 'rows x', maxCols, 'cols');
        console.log('C8PLAY: First row sample:', dataMatrix[0] ? dataMatrix[0].slice(0, 10) : 'empty');

        // 确保所有行都有相同的列数
        dataMatrix.forEach(row => {
            while (row.length < maxCols) {
                row.push('');
            }
        });

        if (dataMatrix.length > 0 && maxCols > 0) {
            const { successCount, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, e.target, {
                startColOverride: 0,
            });
            if (successCount > 0) {
                console.log('C8PLAY: Successfully pasted', successCount, 'cells in', dataMatrix.length, 'rows x', cols, 'cols');
                notifyPasteUser(`C8PLAY: 成功粘贴 ${successCount} 个单元格 (${dataMatrix.length} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                return true;
            }
        }

        // 如果所有解析都失败，继续使用默认处理逻辑
        console.log('C8PLAY: All parsing methods failed, continuing with default logic');
  return false;
}

