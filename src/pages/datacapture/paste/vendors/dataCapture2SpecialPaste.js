/** 2.SPECIAL auto-detect paste. */
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";
import {
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
} from "./dataCaptureCitibetParsers.js";
import { parseVPowerTableFormat } from "./dataCaptureVPowerParser.js";
import { parseAgentLinkTableFormat } from "./dataCaptureAgentLinkParser.js";
import { parseAndFillHtmlTableForWbet, parseAndFillHtmlTableForWbetApi } from "./dataCaptureWbetHtmlPaste.js";
import { formatNumberToTwoDecimals, formatMoneyDisplay } from "../core/dataCapturePasteMoneyUtils.js";



import { applyParsedMatrixToGrid, parseGenericHtmlTable } from "../core/dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

/** @returns {boolean} */
export function handle2SpecialPaste(e, pastedData) {
        console.log('2.SPECIAL mode detected, attempting to auto-detect format...');
        console.log('Pasted data length:', pastedData.length);
        console.log('Pasted data raw (first 500 chars):', pastedData.substring(0, 500));

        let formatDetected = false;
        const startCell = e.target;

        // ===== 2.1 CITIBET 格式检测和处理 =====
        if (!formatDetected) {
            console.log('2.SPECIAL: Trying 2.1 CITIBET format...');
            let citibetParsed = parseCitibetMajorPaymentReport(pastedData) || parseCitibetPaymentReport(pastedData);
            if (citibetParsed) {
                console.log('2.SPECIAL: Detected CITIBET format (2.1)');
                formatDetected = true;
                const { dataMatrix } = citibetParsed;

                const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                    uppercaseValues: true,
                });

                if (successCount > 0) {
                    notifyPasteUser(`2.SPECIAL: 检测到CITIBET格式 (2.1)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)!`, 'success');
                    recomputeSubmitStateAfterPaste();
                    return true;
                }
            }
        }

        // ===== 2.2 VPOWER 格式检测和处理 =====
        // 2.2 VPOWER: 以下代码从 VPOWER 选项复制而来，用于在 2.SPECIAL 模式下支持 VPOWER 格式的粘贴
        if (!formatDetected) {
            console.log('2.SPECIAL: Trying 2.2 VPOWER format...');
            console.log('2.SPECIAL: VPOWER raw data sample (first 200 chars):', pastedData.substring(0, 200));
            let vpowerParsed = parseVPowerTableFormat(pastedData);

            // 兜底：如果纯文本解析失败，但剪贴板里有 HTML 表格（网页表格复制常见），先转成文本再解析
            if (!vpowerParsed) {
                let htmlDataForVpower = getClipboardData('text/html');
                if (!htmlDataForVpower) {
                    const htmlFromDetect = detectHtmlTableInClipboard(e);
                    if (htmlFromDetect) htmlDataForVpower = htmlFromDetect;
                }
                if (htmlDataForVpower) {
                    const convertedText = parseHTMLTable(htmlDataForVpower);
                    if (convertedText) {
                        vpowerParsed = parseVPowerTableFormat(convertedText);
                    }
                }
            }
            console.log('2.SPECIAL: VPOWER parse result:', vpowerParsed);

            if (vpowerParsed) {
                const { dataMatrix } = vpowerParsed;

                const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                    startColOverride: 0,
                    trimValues: true,
                    transformCell: (raw, row, col) => col === 0 ? String(raw).trim().toUpperCase() : String(raw).trim(),
                });

                if (successCount > 0) {
                    formatDetected = true;
                    notifyPasteUser(`2.SPECIAL: 检测到VPOWER格式 (2.2)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)!`, 'success');
                    recomputeSubmitStateAfterPaste();
                    return true;
                }
            } else {
                console.log('2.SPECIAL: VPOWER parser returned null, will continue trying other formats');
            }
        }

        // ===== 2.3 MAXBET 格式检测和处理（优先于 ALIPAY） =====
        // 2.3 MAXBET: 以下代码从 MAXBET 选项复制而来，用于在 2.SPECIAL 模式下支持 MAXBET 格式的粘贴
        if (!formatDetected) {
            // MAXBET 特征检测：检查数据是否包含 MAXBET 格式的特征
            // 特征1: 数据以 "Super" 开头
            // 特征2: 包含 "RM" 或 "MYR" 货币代码
            // 特征3: 数据格式符合每3行合并成一行（Super, 用户名, 数据行）
            const normalizedDataForCheck = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const linesForCheck = normalizedDataForCheck.split('\n').map(line => line.trim()).filter(line => line !== '');
            const hasSuperKeyword = pastedData.toLowerCase().includes('super');
            const hasCurrencyCode = /(RM|MYR)/i.test(pastedData);
            const hasMaxbetPattern = hasSuperKeyword && hasCurrencyCode && linesForCheck.length >= 3 && linesForCheck.length % 3 === 0;

            // 如果不符合 MAXBET 特征，跳过检测
            if (!hasMaxbetPattern && !hasSuperKeyword) {
                console.log('2.SPECIAL: MAXBET format check failed, skipping...');
            } else {
                console.log('2.SPECIAL: Trying 2.3 MAXBET format...');
                console.log('2.SPECIAL: MAXBET raw data sample (first 500 chars):', pastedData.substring(0, 500));

                // 优先尝试获取HTML格式的数据（Excel/网页粘贴通常包含HTML格式）
                let htmlData = null;
                try {
                    htmlData = e.clipboardData.getData('text/html');
                    console.log('2.SPECIAL: MAXBET HTML data available:', htmlData ? 'Yes (length: ' + htmlData.length + ')' : 'No');
                    if (htmlData && htmlData.includes('<table')) {
                        console.log('2.SPECIAL: MAXBET HTML table format detected');

                        try {
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = htmlData;

                            const table = tempDiv.querySelector('table');
                            if (table) {
                                console.log('2.SPECIAL: MAXBET HTML table found');
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

                                    console.log('2.SPECIAL: MAXBET HTML parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');

                                    const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell);

                                    if (successCount > 0) {
                                        formatDetected = true;
                                        console.log('2.SPECIAL: MAXBET HTML paste successful -', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                                        notifyPasteUser(`2.SPECIAL: 检测到MAXBET格式 (2.3)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                                        recomputeSubmitStateAfterPaste();
                                        return true;
                                    }
                                }
                            }
                        } catch (htmlErr) {
                            console.error('2.SPECIAL: MAXBET HTML parser error:', htmlErr);
                        }
                    }
                } catch (err) {
                    console.log('2.SPECIAL: MAXBET Could not get HTML data from clipboard:', err);
                }

                // 如果HTML解析失败，尝试使用detectAndParseHTML
                const htmlDataFromDetect = detectHtmlTableInClipboard(e);
                if (htmlDataFromDetect) {
                    console.log('2.SPECIAL: MAXBET HTML data detected via detectAndParseHTML');
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

                                const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell);

                                if (successCount > 0) {
                                    formatDetected = true;
                                    console.log('2.SPECIAL: MAXBET detectAndParseHTML paste successful -', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                                    notifyPasteUser(`2.SPECIAL: 检测到MAXBET格式 (2.3)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                                    recomputeSubmitStateAfterPaste();
                                    return true;
                                }
                            }
                        }
                    } catch (err) {
                        console.log('2.SPECIAL: MAXBET detectAndParseHTML processing failed:', err);
                    }
                }

                // 如果HTML解析都失败，尝试纯文本格式（制表符分隔的表格数据）
                console.log('2.SPECIAL: MAXBET HTML parsing failed, trying text format...');
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

                    // 填充到表格，从用户点击的单元格开始
                    if (dataMatrix.length > 0 && maxCols > 0) {
                        const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell);

                        if (successCount > 0) {
                            formatDetected = true;
                            console.log('2.SPECIAL: MAXBET Text format paste successful -', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                            notifyPasteUser(`2.SPECIAL: 检测到MAXBET格式 (2.3)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                            recomputeSubmitStateAfterPaste();
                            return true;
                        }
                    }
                }

                // 如果所有解析都失败，继续尝试其他格式
                console.log('2.SPECIAL: MAXBET All parsing methods failed, will continue trying other formats');
            }
        }
        // 2.3 MAXBET 代码结束

        // ===== 2.4 C8PLAY 格式检测和处理（优先于 AWC、S88、ALIPAY） =====
        // 2.4 C8PLAY: 以下代码从 C8PLAY 选项复制而来，用于在 2.SPECIAL 模式下支持 C8PLAY 格式的粘贴
        if (!formatDetected) {
            // C8PLAY 特征检测：检查数据是否包含 C8PLAY 格式的特征
            // 特征1: 包含CKZ开头的标识符（如CKZ03, CKZ16）- 这是C8PLAY特有的标识符模式
            // 特征2: 包含"Agent"关键词（但可能在同一行，也可能在下一行）
            // 特征3: 标识符行是独立的（不包含空格、逗号、点号、连字符），长度为2-10个字符
            const normalizedDataForCheck = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const linesForCheck = normalizedDataForCheck.split('\n').map(line => line.trim()).filter(line => line !== '');

            // 检测 CKZ 开头的标识符（C8PLAY 特有）
            // ⚠️ 以前这里用过 /^[A-Z]{2,5}\d{1,5}$/ 会把 GT45/GT451 这类 ALIPAY 标识符误判为 C8PLAY
            // 因此这里收紧：只认 CKZ 系列；其它 C8PLAY 情况交给 hasStandaloneIdentifier（...C8 / ...C8A 等）判断
            const hasCKZIdentifier = linesForCheck.some(line => {
                return /^CKZ[A-Z0-9]{1,7}$/i.test(line);
            });

            // 检测独立的标识符行（不包含空格、逗号、点号等）
            const hasStandaloneIdentifier = linesForCheck.some(line => {
                const v = (line || '').trim();
                // 允许：CKZxx 或以 C8 结尾的 Player（例如 225C8 / 22LGC8 / KLGC8），可能数字开头
                const isCkz = /^CKZ\d{1,6}$/i.test(v) || /^CKZ[A-Z0-9]{1,7}$/i.test(v);
                // 允许 C8 后面带后缀（例如：M9KLGCC8A），避免无法对齐导致“右移”
                const isPlayer = /^[A-Z0-9]{2,20}$/i.test(v) && /C8[A-Z0-9]{0,2}$/i.test(v);
                return (isCkz || isPlayer) &&
                    !v.includes(' ') &&
                    !v.includes(',') &&
                    !v.includes('.') &&
                    !v.includes('-');
            });

            // 检测Agent关键词
            const hasAgentKeyword = /Agent/i.test(pastedData);

            // 排除 AWC 格式：AWC 有独特的特征，不应该被 C8PLAY 误判
            // AWC 特征：用户ID（小写字母开头）、平台名（全大写）、类型标识（LIVE/TABLE/SLOT/SPORTS）、Sub Total[
            const hasAWCUserID = linesForCheck.some(line => {
                const trimmed = line.trim();
                return /^[a-z][a-z0-9]{2,14}$/i.test(trimmed) && !/^\d+$/.test(trimmed);
            });
            const knownAWCPlatforms = ['SEXYBCRT', 'KINGMIDAS', 'SV388', 'KINGMASTER', 'KINGGAME', 'ALLBET', 'PP88'];
            const hasAWCPlatform = linesForCheck.some(line => {
                const trimmed = line.trim().toUpperCase();
                return /^[A-Z]{4,20}$/.test(trimmed) || knownAWCPlatforms.includes(trimmed);
            });
            const hasAWCTypeIdentifier = /(LIVE|TABLE|SLOT|SPORTS)/i.test(pastedData);
            const hasAWCSubTotal = /SUB\s*TOTAL\[/i.test(pastedData);
            const isLikelyAWC = (hasAWCUserID && hasAWCPlatform) || (hasAWCUserID && hasAWCTypeIdentifier) || hasAWCSubTotal;

            // 如果符合 C8PLAY 特征，且不是 AWC 格式，进行解析
            // 收紧规则：仅在确实出现 CKZ 或 ...C8（含后缀）标识符时才命中，避免抢走 ALIPAY 等格式
            const isC8PLAYFormat = !isLikelyAWC && (hasCKZIdentifier || hasStandaloneIdentifier);

            if (isC8PLAYFormat) {
                console.log('2.SPECIAL: Trying 2.4 C8PLAY format...');
                console.log('2.SPECIAL: C8PLAY format pattern detected');
                console.log('2.SPECIAL: C8PLAY raw data sample (first 500 chars):', pastedData.substring(0, 500));

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
                    // 允许 C8 后面带后缀（例如：...C8A），避免树状表复制时行对齐失败
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
                    console.log('2.SPECIAL: C8PLAY HTML data available:', htmlData ? 'Yes (length: ' + htmlData.length + ')' : 'No');
                    if (htmlData && htmlData.includes('<table')) {
                        console.log('2.SPECIAL: C8PLAY HTML table format detected');

                        try {
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = htmlData;

                            const table = tempDiv.querySelector('table');
                            if (table) {
                                console.log('2.SPECIAL: C8PLAY HTML table found');
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

                                    console.log('2.SPECIAL: C8PLAY HTML parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');

                                    // 填充到表格
                                    // C8PLAY 格式：强制从第一列（Column 1）开始粘贴
                                    const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                                        startColOverride: 0,
                                    });

                                    if (successCount > 0) {
                                        formatDetected = true;
                                        console.log('2.SPECIAL: C8PLAY HTML paste successful -', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                                        notifyPasteUser(`2.SPECIAL: 检测到C8PLAY格式 (2.4)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                                        recomputeSubmitStateAfterPaste();
                                        return true;
                                    }
                                }
                            }
                        } catch (htmlErr) {
                            console.error('2.SPECIAL: C8PLAY HTML parser error:', htmlErr);
                        }
                    }
                } catch (err) {
                    console.log('2.SPECIAL: C8PLAY Could not get HTML data from clipboard:', err);
                }

                // 如果HTML解析失败，尝试使用detectAndParseHTML
                if (!formatDetected) {
                    const htmlDataFromDetect = detectHtmlTableInClipboard(e);
                    if (htmlDataFromDetect) {
                        console.log('2.SPECIAL: C8PLAY HTML data detected via detectAndParseHTML');
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

                                    // C8PLAY 格式：强制从第一列（Column 1）开始粘贴
                                    const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                                        startColOverride: 0,
                                    });

                                    if (successCount > 0) {
                                        formatDetected = true;
                                        console.log('2.SPECIAL: C8PLAY detectAndParseHTML paste successful -', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                                        notifyPasteUser(`2.SPECIAL: 检测到C8PLAY格式 (2.4)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                                        recomputeSubmitStateAfterPaste();
                                        return true;
                                    }
                                }
                            }
                        } catch (err) {
                            console.log('2.SPECIAL: C8PLAY detectAndParseHTML processing failed:', err);
                        }
                    }
                }

                // 如果HTML解析都失败，尝试纯文本格式（C8PLAY特殊格式：数据块合并为行）
                if (!formatDetected) {
                    console.log('2.SPECIAL: C8PLAY HTML parsing failed, trying text format...');
                    const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    const allLines = normalizedData.split('\n');

                    console.log('2.SPECIAL: C8PLAY Text format - Total lines:', allLines.length);

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

                    console.log('2.SPECIAL: C8PLAY DataMatrix rows:', dataMatrix.map((row, idx) => {
                        return `Row ${idx}: [${row.slice(0, 5).join(', ')}...] (length: ${row.length})`;
                    }));

                    console.log('2.SPECIAL: C8PLAY Parsed dataMatrix:', dataMatrix.length, 'rows x', maxCols, 'cols');
                    console.log('2.SPECIAL: C8PLAY First row sample:', dataMatrix[0] ? dataMatrix[0].slice(0, 10) : 'empty');

                    // 确保所有行都有相同的列数
                    dataMatrix.forEach(row => {
                        while (row.length < maxCols) {
                            row.push('');
                        }
                    });

                    // 填充到表格，保持行格式
                    // C8PLAY 格式：强制从第一列（Column 1）开始粘贴，每行数据都从第一列开始
                    if (dataMatrix.length > 0 && maxCols > 0) {
                        const startRow = Array.from(startCell.parentNode.parentNode.children).indexOf(startCell.parentNode);
                        console.log('2.SPECIAL: C8PLAY Starting paste at row', startRow, 'col', 0);

                        const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                            startColOverride: 0,
                        });

                        if (successCount > 0) {
                            formatDetected = true;
                            console.log('2.SPECIAL: C8PLAY Successfully pasted', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                            notifyPasteUser(`2.SPECIAL: 检测到C8PLAY格式 (2.4)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                            recomputeSubmitStateAfterPaste();
                            return true;
                        }
                    }
                }

                // 如果所有解析都失败，继续尝试其他格式
                console.log('2.SPECIAL: C8PLAY All parsing methods failed, will continue trying other formats');
            } else {
                console.log('2.SPECIAL: C8PLAY format check failed, skipping...');
            }
        }
        // 2.4 C8PLAY 代码结束

        // ===== 2.5 AWC 格式检测和处理（优先于 S88、ALIPAY） =====
        // 2.5 AWC: 以下代码从 AWC 选项复制而来，用于在 2.SPECIAL 模式下支持 AWC 格式的粘贴
        if (!formatDetected) {
            // 先检查是否是 ALIPAY 格式（排除 ALIPAY，避免误判）
            // ALIPAY 格式特征：标识符行（2-10个大写字母/数字组合，如 JDW01, JDW02）
            const normalizedDataForCheck = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const linesForCheck = normalizedDataForCheck.split('\n').map(line => line.trim()).filter(line => line !== '');

            // 检测 ALIPAY 格式的标识符行（2-10个大写字母/数字组合，如 JDW01, JDW02）
            let hasAlipayIdentifier = false;
            let alipayIdentifierCount = 0;
            for (let i = 0; i < Math.min(linesForCheck.length, 20); i++) {
                const testLine = linesForCheck[i].trim();
                // ALIPAY 标识符特征：2-10个字符，包含字母和数字，不包含空格、逗号、小数点、负号
                const isAlipayIdentifier = /^[A-Z0-9]{2,10}$/.test(testLine) &&
                    !testLine.includes(' ') &&
                    !testLine.includes(',') &&
                    !testLine.includes('.') &&
                    !testLine.includes('-') &&
                    !/^\d+$/.test(testLine); // 不是纯数字

                if (isAlipayIdentifier) {
                    alipayIdentifierCount++;
                    // 如果找到至少2个 ALIPAY 标识符，认为是 ALIPAY 格式，跳过 AWC
                    if (alipayIdentifierCount >= 2) {
                        hasAlipayIdentifier = true;
                        break;
                    }
                }
            }

            if (hasAlipayIdentifier) {
                console.log('2.SPECIAL: AWC format check skipped - detected ALIPAY identifiers (', alipayIdentifierCount, 'found)');
            } else {
                // AWC 特征检测：检查数据是否包含 AWC 格式的特征
                // 特征1: 包含用户ID（以小写字母开头，3-15个字符，如 op7a, tr8, victorbetvtb）
                // 特征2: 包含平台名（全大写，4-20个字符，如 SEXYBCRT, SV388, KINGMIDAS等）
                // 特征3: 包含类型标识（LIVE, TABLE, SLOT, SPORTS）
                // 特征4: 可能包含 Sub Total[ xxx ] 格式

                // 检测用户ID模式（以小写字母开头）
                const hasUserID = linesForCheck.some(line => {
                    const trimmed = line.trim();
                    return /^[a-z][a-z0-9]{2,14}$/i.test(trimmed) && !/^\d+$/.test(trimmed);
                });

                // 检测平台名模式（全大写，4-20个字符）
                const knownPlatforms = ['SEXYBCRT', 'KINGMIDAS', 'SV388', 'KINGMASTER', 'KINGGAME', 'ALLBET', 'PP88'];
                const hasPlatformName = linesForCheck.some(line => {
                    const trimmed = line.trim().toUpperCase();
                    return /^[A-Z]{4,20}$/.test(trimmed) || knownPlatforms.includes(trimmed);
                });

                // 检测类型标识
                const hasTypeIdentifier = /(LIVE|TABLE|SLOT|SPORTS)/i.test(pastedData);

                // 检测 Sub Total 格式
                const hasSubTotal = /SUB\s*TOTAL\[/i.test(pastedData);

                // 如果符合 AWC 特征，进行解析
                const isAWCFormat = (hasUserID && hasPlatformName) || (hasUserID && hasTypeIdentifier) || hasSubTotal;

                if (isAWCFormat) {
                    console.log('2.SPECIAL: Trying 2.5 AWC format...');
                    console.log('2.SPECIAL: AWC format pattern detected');
                    console.log('2.SPECIAL: AWC raw data sample (first 500 chars):', pastedData.substring(0, 500));

                    // 方法1：优先尝试HTML表格格式（从网页复制的内容通常是HTML格式）
                    try {
                        let htmlData = e.clipboardData.getData('text/html');
                        if (htmlData && htmlData.includes('<table')) {
                            console.log('2.SPECIAL: AWC HTML table format detected');
                            const filled = parseAndFillHtmlTableForAwc(htmlData, startCell);
                            if (filled) {
                                formatDetected = true;
                                notifyPasteUser('2.SPECIAL: 检测到AWC格式 (2.5)!', 'success');
                                recomputeSubmitStateAfterPaste();
                                return true;
                            }
                        }
                    } catch (err) {
                        console.log('2.SPECIAL: AWC Could not get HTML data from clipboard:', err);
                    }

                    // 方法2：如果HTML解析失败，尝试使用detectAndParseHTML
                    if (!formatDetected) {
                        const htmlDataFromDetect = detectHtmlTableInClipboard(e);
                        if (htmlDataFromDetect) {
                            console.log('2.SPECIAL: AWC HTML data detected via detectAndParseHTML');
                            const filled = parseAndFillHtmlTableForAwc(htmlDataFromDetect, startCell);
                            if (filled) {
                                formatDetected = true;
                                notifyPasteUser('2.SPECIAL: 检测到AWC格式 (2.5)!', 'success');
                                recomputeSubmitStateAfterPaste();
                                return true;
                            }
                        }
                    }

                    // 方法3：如果HTML解析都失败，尝试制表符分隔格式（Excel格式）
                    if (!formatDetected) {
                        console.log('2.SPECIAL: AWC HTML parsing failed, trying tab-separated format...');
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
                                        formatDetected = true;
                                        notifyPasteUser(`2.SPECIAL: 检测到AWC格式 (2.5)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持表格行格式!`, 'success');
                                        recomputeSubmitStateAfterPaste();
                                        return true;
                                    }
                                }
                            } else {
                                // 方法3.5：纯文本格式（换行符分隔），尝试根据数据模式智能分组成行
                                console.log('2.SPECIAL: AWC No tab separator found, trying pattern-based row grouping...');
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
                                        formatDetected = true;
                                        notifyPasteUser(`2.SPECIAL: 检测到AWC格式 (2.5)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已根据数据模式智能分组!`, 'success');
                                        recomputeSubmitStateAfterPaste();
                                        return true;
                                    }
                                }
                            }
                        }
                    }

                    // 如果所有解析都失败，继续尝试其他格式
                    console.log('2.SPECIAL: AWC All parsing methods failed, will continue trying other formats');
                } else {
                    console.log('2.SPECIAL: AWC format check failed, skipping...');
                }
            }
        }
        // 2.5 AWC 代码结束

        // ===== 2.5 S88 格式检测和处理（优先于 ALIPAY） =====
        // 2.5 S88: 多行数据格式，每行数据包含标识符、Agent和多个数值
        if (!formatDetected) {
            console.log('2.SPECIAL: Trying 2.5 S88 format...');
            console.log('2.SPECIAL: S88 raw data sample (first 500 chars):', pastedData.substring(0, 500));

            // S88 格式特征检测：数据包含标识符、Agent和多个数值，每个数值占一行
            const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const allLines = normalizedData.split('\n');

            // 检测是否符合 S88 格式：包含 "Agent" 关键字，且数据格式为标识符+Agent+多行数值
            // 更严格的检测：必须有多行，且每行以标识符+Agent开头，后面跟着数值行
            const hasAgentKeyword = /Agent/i.test(pastedData);
            const linesWithAgent = allLines.filter(line => /Agent/i.test(line.trim()));
            const hasMultipleAgentLines = linesWithAgent.length >= 2; // 至少2个标识符+Agent行
            const hasIdentifierPattern = /[A-Z0-9]{6,12}[\s\t]+Agent/i.test(pastedData);

            if (hasAgentKeyword && hasIdentifierPattern && hasMultipleAgentLines) {
                console.log('2.SPECIAL: S88 format pattern detected');

                const dataMatrix = [];
                let currentRow = null;
                let maxCols = 0;

                for (let i = 0; i < allLines.length; i++) {
                    const line = allLines[i];
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue; // 跳过空行

                    // 检测是否是标识符行（格式：标识符 + 制表符/空格 + Agent）
                    // 匹配模式：6-12个字母数字，后面跟着空格或制表符，然后是 Agent
                    const identifierMatch = trimmedLine.match(/^([A-Z0-9]{6,12})[\s\t]+Agent/i);

                    if (identifierMatch) {
                        // 如果之前有未完成的行，先保存它
                        if (currentRow !== null && currentRow.length > 0) {
                            dataMatrix.push(currentRow);
                            maxCols = Math.max(maxCols, currentRow.length);
                        }

                        // 开始新行：标识符 + Agent
                        const identifier = identifierMatch[1];
                        currentRow = [identifier, 'Agent'];
                    } else {
                        // 这是数值行，添加到当前行
                        if (currentRow === null) {
                            // 如果没有标识符行，从第一行开始
                            currentRow = [];
                        }

                        // 检查是否是数值（可能是负数、带逗号的数字等）
                        const trimmedValue = trimmedLine;
                        if (trimmedValue !== '') {
                            // 移除千位分隔符（逗号）用于检测，但保留原值
                            const cleanedValue = trimmedValue.replace(/,/g, '');
                            const isNumber = /^-?\d+\.?\d*$/.test(cleanedValue);

                            if (isNumber || trimmedValue === '0.00' || trimmedValue === '0') {
                                // 是数值，添加到当前行
                                currentRow.push(trimmedValue);
                            } else {
                                // 不是数值，可能是其他数据，也添加
                                currentRow.push(trimmedValue);
                            }
                        }
                    }
                }

                // 保存最后一行
                if (currentRow !== null && currentRow.length > 0) {
                    dataMatrix.push(currentRow);
                    maxCols = Math.max(maxCols, currentRow.length);
                }

                // 确保所有行的列数相同
                if (maxCols > 0) {
                    dataMatrix.forEach(row => {
                        while (row.length < maxCols) {
                            row.push('');
                        }
                    });
                }

                if (dataMatrix.length > 0 && maxCols > 0) {
                    const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                        trimValues: true,
                    });

                    console.log('2.SPECIAL: S88 parsing successful -', maxRows, 'rows x', cols, 'cols');

                    if (successCount > 0) {
                        formatDetected = true;
                        console.log('2.SPECIAL: S88 paste successful -', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                        notifyPasteUser(`2.SPECIAL: 检测到S88格式 (2.6)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)!`, 'success');
                        recomputeSubmitStateAfterPaste();
                        return true;
                    }
                } else {
                    console.log('2.SPECIAL: S88 parsing failed, no data extracted');
                }
            } else {
                console.log('2.SPECIAL: S88 format check failed, skipping...');
            }
        }
        // 2.6 S88 代码结束

        // ===== 2.7 ALIPAY 格式检测和处理（优先于 PS3838、WBET） =====
        // 2.7 ALIPAY: 以下代码从 ALIPAY 选项复制而来，用于在 2.SPECIAL 模式下支持 ALIPAY 格式的粘贴
        if (!formatDetected) {
            // ALIPAY 特征检测：先检查是否有 ALIPAY 格式的特征（标识符行，如 JDW01, JDW02）
            // ALIPAY 格式特征：标识符行（2-10个大写字母/数字组合，如 JDW01, JDW02）
            const normalizedDataForCheck = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const linesForCheck = normalizedDataForCheck.split('\n').map(line => line.trim()).filter(line => line !== '');

            // 检测 ALIPAY 格式的标识符行（2-10个大写字母/数字组合，如 JDW01, JDW02）
            // 这些标识符通常不包含空格、逗号、小数点、负号，且不以纯数字开头
            let hasAlipayIdentifier = false;
            let alipayIdentifierCount = 0;
            for (let i = 0; i < Math.min(linesForCheck.length, 20); i++) {
                const testLine = linesForCheck[i].trim();
                // ALIPAY 标识符特征：2-10个字符，包含字母和数字，不包含空格、逗号、小数点、负号
                const isAlipayIdentifier = /^[A-Z0-9]{2,10}$/.test(testLine) &&
                    !testLine.includes(' ') &&
                    !testLine.includes(',') &&
                    !testLine.includes('.') &&
                    !testLine.includes('-') &&
                    !/^\d+$/.test(testLine); // 不是纯数字

                if (isAlipayIdentifier) {
                    alipayIdentifierCount++;
                    // 如果找到至少2个 ALIPAY 标识符，认为是 ALIPAY 格式
                    if (alipayIdentifierCount >= 2) {
                        hasAlipayIdentifier = true;
                        break;
                    }
                }
            }

            // 检测 WBET 格式标记（SUB TOTAL/GRAND TOTAL）
            const hasSubTotal = /SUB\s*TOTAL|SUBTOTAL/i.test(pastedData);
            const hasGrandTotal = /GRAND\s*TOTAL|GRANDTOTAL/i.test(pastedData);
            const isLikelyWBET = hasSubTotal || hasGrandTotal;

            // 如果检测到 ALIPAY 标识符，即使有 Grand Total 也尝试 ALIPAY 格式
            // 因为 ALIPAY 格式也可能包含 Grand Total
            if (!hasAlipayIdentifier && isLikelyWBET) {
                console.log('2.SPECIAL: ALIPAY format check skipped - detected WBET format markers (SUB TOTAL/GRAND TOTAL) and no ALIPAY identifiers found');
            } else {
                if (hasAlipayIdentifier) {
                    console.log('2.SPECIAL: ALIPAY identifiers detected (', alipayIdentifierCount, 'found), trying ALIPAY format even if Grand Total exists');
                }
                console.log('2.SPECIAL: Trying 2.7 ALIPAY format...');
                console.log('Pasted data length:', pastedData.length);
                console.log('Pasted data sample (first 500 chars):', pastedData.substring(0, 500));

                // 优先使用 HTML 表格解析（从网页复制的内容通常是 HTML 格式）
                const htmlDataFromDetect = detectHtmlTableInClipboard(e);
                let alipayParsed = null;

                if (htmlDataFromDetect) {
                    console.log('2.SPECIAL: ALIPAY HTML data detected via detectAndParseHTML');
                    const filled = parseGenericHtmlTable(htmlDataFromDetect, startCell);
                    if (filled) {
                        console.log('2.SPECIAL: ALIPAY Successfully filled using parseAndFillHTMLTable');
                        formatDetected = true;
                        notifyPasteUser('2.SPECIAL: 检测到ALIPAY格式 (2.7)!', 'success');
                        recomputeSubmitStateAfterPaste();
                        return true;
                    } else {
                        console.log('2.SPECIAL: ALIPAY parseAndFillHTMLTable returned false, trying manual HTML parsing');
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
                    console.log('2.SPECIAL: ALIPAY Could not get HTML data from clipboard:', err);
                }

                if (htmlData) {
                    console.log('2.SPECIAL: ALIPAY HTML data detected, length:', htmlData.length);
                    // 解析 HTML 表格，保持原始格式
                    try {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = htmlData;

                        const table = tempDiv.querySelector('table');
                        if (table) {
                            console.log('2.SPECIAL: ALIPAY HTML table found');
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

                            // 处理表体，保持原始格式
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

                                console.log('2.SPECIAL: ALIPAY HTML parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');

                                alipayParsed = {
                                    dataMatrix: dataMatrix,
                                    maxRows: dataMatrix.length,
                                    maxCols: maxCols
                                };
                            } else {
                                console.log('2.SPECIAL: ALIPAY HTML table found but no data rows extracted');
                            }
                        } else {
                            console.log('2.SPECIAL: ALIPAY HTML data exists but no table element found');
                        }
                    } catch (htmlErr) {
                        console.error('2.SPECIAL: ALIPAY HTML parser error:', htmlErr);
                    }
                } else {
                    console.log('2.SPECIAL: ALIPAY No HTML data detected, will try text parsing');
                }

                // 如果 HTML 解析失败，尝试纯文本解析
                if (!alipayParsed) {
                    console.log('2.SPECIAL: ALIPAY Attempting text format parsing...');
                    const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    const lines = normalizedData.split('\n').map(line => line.trim()).filter(line => line !== '');

                    if (lines.length > 0) {
                        const dataMatrix = [];
                        let maxCols = 0;

                        // 首先检测是否包含 Name 列的格式（标识符 -> Name -> 数值数据）
                        // 检测模式：标识符行后面跟着一个可能是 Name 的行（空或短文本，不包含数值），然后才是数值数据
                        let hasNameColumnFormat = false;
                        if (lines.length >= 3) {
                            let identifierCount = 0;
                            let nameLikeLineCount = 0;
                            for (let i = 0; i < Math.min(lines.length, 30); i++) {
                                const testLine = lines[i].trim();
                                const isShortId = /^[A-Z0-9]{2,10}$/.test(testLine) &&
                                    !testLine.includes(' ') &&
                                    !testLine.includes(',') &&
                                    !testLine.includes('.') &&
                                    !testLine.includes('-') &&
                                    !/^\d/.test(testLine);

                                if (isShortId) {
                                    identifierCount++;
                                    // 检查下一行是否是 Name 行（空或短文本，不包含数值）
                                    if (i + 1 < lines.length) {
                                        const nextLine = lines[i + 1].trim();
                                        // Name 行特征：空行，或短文本（通常不超过50字符），不包含逗号分隔的数字
                                        // 也不应该包含多个空格分隔的数值
                                        const hasNumericPattern = nextLine.match(/^-?\d+[.,]\d+/) ||
                                            nextLine.match(/^-?\d{1,3}(,\d{3})+\.\d{2}/) ||
                                            nextLine.split(/\s+/).filter(c => {
                                                const trimmed = c.trim();
                                                return trimmed !== '' &&
                                                    (/^-?\d+[.,]\d+/.test(trimmed) ||
                                                        /^-?\d{1,3}(,\d{3})+\.\d{2}/.test(trimmed));
                                            }).length >= 2; // 至少2个数值

                                        const isNameLike = (nextLine === '' ||
                                            (nextLine.length < 50 && !hasNumericPattern));

                                        if (isNameLike && i + 2 < lines.length) {
                                            // 检查第三行是否包含数值数据
                                            const thirdLine = lines[i + 2].trim();
                                            const hasNumbers = thirdLine.match(/^-?\d+[.,]\d+/) ||
                                                thirdLine.match(/^-?\d{1,3}(,\d{3})+\.\d{2}/) ||
                                                thirdLine.split(/\s+/).filter(c => {
                                                    const trimmed = c.trim();
                                                    return trimmed !== '' &&
                                                        (/^-?\d+[.,]\d+/.test(trimmed) ||
                                                            /^-?\d{1,3}(,\d{3})+\.\d{2}/.test(trimmed));
                                                }).length >= 2; // 至少2个数值

                                            if (hasNumbers) {
                                                nameLikeLineCount++;
                                            }
                                        }
                                    }
                                }
                            }
                            // 如果至少有一半的标识符后面跟着 Name 行，则认为是 Name 列格式
                            if (identifierCount >= 2 && nameLikeLineCount >= identifierCount * 0.5) {
                                hasNameColumnFormat = true;
                                console.log('2.SPECIAL: ALIPAY Detected Name column format (', nameLikeLineCount, 'out of', identifierCount, 'identifiers)');
                            }
                        }

                        // ALIPAY 专用解析：识别标识符行（2-10个大写字母）并合并后续数据行
                        let currentRow = null;

                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            const trimmedLine = line.trim();

                            // 检查是否是标识符行
                            // 1. 短标识符（2-10个大写字母，可能包含数字，如BWGMA、BWWAY、BWWS、AW9966、BSAM2424）
                            // 2. Grand Total 或 Total 这样的特殊标识符
                            const isShortIdentifier = /^[A-Z0-9]{2,10}$/.test(trimmedLine) &&
                                !trimmedLine.includes(' ') &&
                                !trimmedLine.includes(',') &&
                                !trimmedLine.includes('.') &&
                                !trimmedLine.includes('-') &&
                                !/^\d/.test(trimmedLine); // 不以数字开头

                            // 检查是否是 Grand Total 或 Total 行（不区分大小写）
                            const upperTrimmedLine = trimmedLine.toUpperCase();
                            const isTotalIdentifier = upperTrimmedLine === 'GRAND TOTAL' ||
                                upperTrimmedLine === 'TOTAL' ||
                                upperTrimmedLine.startsWith('GRAND TOTAL') ||
                                upperTrimmedLine.startsWith('TOTAL ');

                            const isIdentifier = isShortIdentifier || isTotalIdentifier;

                            if (isIdentifier) {
                                // 如果之前有未完成的行，先保存它
                                if (currentRow !== null) {
                                    dataMatrix.push(currentRow);
                                    maxCols = Math.max(maxCols, currentRow.length);
                                }

                                // 开始新行
                                // 如果是 Total 标识符，检查这一行是否包含其他数据
                                if (isTotalIdentifier) {
                                    // 解析整行数据（Grand Total 行可能在同一行包含多个数据）
                                    let cells = [];
                                    if (line.includes('\t')) {
                                        // 制表符分隔
                                        cells = line.split('\t').map(c => c.trim()).filter(c => c !== '');
                                    } else {
                                        // 使用空格分割，但要确保 "Grand Total" 作为一个整体
                                        // 先检查是否以 "Grand Total" 或 "Total" 开头
                                        let remainingLine = trimmedLine;
                                        if (upperTrimmedLine.startsWith('GRAND TOTAL')) {
                                            // 提取 "Grand Total" 和剩余部分
                                            const match = trimmedLine.match(/^(Grand\s+Total)\s+(.*)$/i);
                                            if (match) {
                                                cells.push(match[1]); // "Grand Total"
                                                if (match[2]) {
                                                    // 解析剩余部分的数据
                                                    const remainingCells = match[2].split(/\s+/).map(c => c.trim()).filter(c => c !== '');
                                                    cells.push(...remainingCells);
                                                }
                                            } else {
                                                // 如果匹配失败，使用原始分割
                                                cells = trimmedLine.split(/\s+/).map(c => c.trim()).filter(c => c !== '');
                                            }
                                        } else if (upperTrimmedLine.startsWith('TOTAL ')) {
                                            // 提取 "Total" 和剩余部分
                                            const match = trimmedLine.match(/^(Total)\s+(.*)$/i);
                                            if (match) {
                                                cells.push(match[1]); // "Total"
                                                if (match[2]) {
                                                    // 解析剩余部分的数据
                                                    const remainingCells = match[2].split(/\s+/).map(c => c.trim()).filter(c => c !== '');
                                                    cells.push(...remainingCells);
                                                }
                                            } else {
                                                // 如果匹配失败，使用原始分割
                                                cells = trimmedLine.split(/\s+/).map(c => c.trim()).filter(c => c !== '');
                                            }
                                        } else {
                                            // 完全匹配 "Grand Total" 或 "Total"
                                            cells = [trimmedLine];
                                        }
                                    }

                                    // 如果解析出多个单元格，使用所有单元格；否则只使用标识符
                                    if (cells.length > 1) {
                                        currentRow = cells;
                                    } else {
                                        currentRow = [trimmedLine];
                                    }
                                } else {
                                    // 短标识符（如AW07, AW9966），检查该行是否包含其他数据
                                    // 如果标识符后面还有数据（在同一行），需要解析整行
                                    let cells = [];
                                    if (line.includes('\t')) {
                                        // 制表符分隔
                                        cells = line.split('\t').map(c => c.trim()).filter(c => c !== '');
                                    } else {
                                        // 使用空格分割
                                        // 检查标识符后面是否还有内容
                                        // 匹配 2-10 个字符的标识符，后面跟着空格和数据
                                        const identifierMatch = trimmedLine.match(/^([A-Z0-9]{2,10})\s+(.*)$/);
                                        if (identifierMatch && identifierMatch[2]) {
                                            // 标识符后面有数据，解析整行
                                            cells.push(identifierMatch[1]); // 标识符
                                            // 解析剩余部分的数据
                                            const remainingCells = identifierMatch[2].split(/\s+/).map(c => c.trim()).filter(c => c !== '');
                                            cells.push(...remainingCells);
                                        } else {
                                            // 只有标识符，没有其他数据
                                            cells = [trimmedLine];

                                            // 如果检测到 Name 列格式，且下一行可能是 Name 行，则将其作为第二列
                                            if (hasNameColumnFormat && i + 1 < lines.length) {
                                                const nextLine = lines[i + 1].trim();
                                                // 检查下一行是否是 Name 行（空或短文本，不包含数值）
                                                const hasNumericPattern = nextLine.match(/^-?\d+[.,]\d+/) ||
                                                    nextLine.match(/^-?\d{1,3}(,\d{3})+\.\d{2}/) ||
                                                    nextLine.split(/\s+/).filter(c => {
                                                        const trimmed = c.trim();
                                                        return trimmed !== '' &&
                                                            (/^-?\d+[.,]\d+/.test(trimmed) ||
                                                                /^-?\d{1,3}(,\d{3})+\.\d{2}/.test(trimmed));
                                                    }).length >= 2; // 至少2个数值

                                                const isNameLike = (nextLine === '' ||
                                                    (nextLine.length < 50 && !hasNumericPattern));

                                                if (isNameLike) {
                                                    // 检查第三行是否包含数值数据，如果是，则将第二行作为 Name 列
                                                    if (i + 2 < lines.length) {
                                                        const thirdLine = lines[i + 2].trim();
                                                        const hasNumbers = thirdLine.match(/^-?\d+[.,]\d+/) ||
                                                            thirdLine.match(/^-?\d{1,3}(,\d{3})+\.\d{2}/) ||
                                                            thirdLine.split(/\s+/).filter(c => {
                                                                const trimmed = c.trim();
                                                                return trimmed !== '' &&
                                                                    (/^-?\d+[.,]\d+/.test(trimmed) ||
                                                                        /^-?\d{1,3}(,\d{3})+\.\d{2}/.test(trimmed));
                                                            }).length >= 2; // 至少2个数值

                                                        if (hasNumbers) {
                                                            // 将 Name 值作为第二列插入（在标识符之后）
                                                            const nameValue = nextLine === '' ? '' : nextLine;
                                                            cells.splice(1, 0, nameValue); // 在标识符后插入 Name
                                                            // 跳过 Name 行的处理
                                                            i++; // 跳过下一行（Name 行）
                                                            console.log('2.SPECIAL: ALIPAY Detected Name column value:', nameValue, 'for identifier:', trimmedLine);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // 使用解析后的单元格
                                    currentRow = cells;
                                }
                            } else {
                                // 这是数据行，需要合并到当前行
                                if (currentRow === null) {
                                    // 如果没有标识符，从第一行开始
                                    currentRow = [];
                                }

                                // 解析数据行（支持制表符或空格分隔）
                                let cells = [];
                                if (line.includes('\t')) {
                                    cells = line.split('\t').map(c => c.trim()).filter(c => c !== '');
                                } else {
                                    // 使用空格分割（包括单个空格和多个空格）
                                    // 但要注意负数（如-37.44）和带逗号的数字（如-53,616.16）
                                    cells = line.split(/\s+/).map(c => c.trim()).filter(c => c !== '');
                                }

                                // 将数据单元格添加到当前行
                                currentRow.push(...cells);
                            }
                        }

                        // 保存最后一行
                        if (currentRow !== null && currentRow.length > 0) {
                            dataMatrix.push(currentRow);
                            maxCols = Math.max(maxCols, currentRow.length);
                        }

                        // 确保所有行的列数相同
                        dataMatrix.forEach(row => {
                            while (row.length < maxCols) {
                                row.push('');
                            }
                        });

                        if (dataMatrix.length > 0) {
                            console.log('2.SPECIAL: ALIPAY Text parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');
                            console.log('2.SPECIAL: ALIPAY First row sample:', dataMatrix[0] ? dataMatrix[0].slice(0, 10) : 'empty');
                            alipayParsed = {
                                dataMatrix: dataMatrix,
                                maxRows: dataMatrix.length,
                                maxCols: maxCols
                            };
                        }
                    }
                }

                if (alipayParsed) {
                    const { dataMatrix } = alipayParsed;

                    const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                        startColOverride: 0,
                        trimValues: true,
                    });

                    if (successCount > 0) {
                        formatDetected = true;
                        notifyPasteUser(`2.SPECIAL: 检测到ALIPAY格式 (2.7)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)!`, 'success');
                        recomputeSubmitStateAfterPaste();
                        return true;
                    }
                }
            }
        }
        // 2.7 ALIPAY 代码结束

        // ===== 2.8 PS3838 格式检测和处理 =====
        if (!formatDetected) {
            // PS3838 特征检测：排除 WBET 格式（WBET 有 SUB TOTAL/GRAND TOTAL 特征）
            // 如果数据包含 SUB TOTAL 或 GRAND TOTAL，很可能是 WBET 格式，跳过 PS3838
            const hasSubTotal = /SUB\s*TOTAL|SUBTOTAL/i.test(pastedData);
            const hasGrandTotal = /GRAND\s*TOTAL|GRANDTOTAL/i.test(pastedData);
            const isLikelyWBET = hasSubTotal || hasGrandTotal;

            if (isLikelyWBET) {
                console.log('2.SPECIAL: PS3838 format check skipped - detected WBET format markers (SUB TOTAL/GRAND TOTAL)');
            } else {
                console.log('2.SPECIAL: Trying 2.8 PS3838 format...');
                const htmlDataFromDetect = detectHtmlTableInClipboard(e);
                let agentLinkParsed = null;

                if (htmlDataFromDetect) {
                    const filled = parseGenericHtmlTable(htmlDataFromDetect, startCell);
                    if (filled) {
                        console.log('2.SPECIAL: Detected PS3838 format (2.4) - HTML');
                        formatDetected = true;
                        notifyPasteUser('2.SPECIAL: 检测到PS3838格式 (2.8)!', 'success');
                        recomputeSubmitStateAfterPaste();
                        return true;
                    }
                }

                let htmlData = null;
                try {
                    htmlData = e.clipboardData.getData('text/html');
                    if (!htmlData || !htmlData.toLowerCase().includes('<table')) {
                        htmlData = null;
                    }
                } catch (err) {
                    console.log('2.SPECIAL: Could not get HTML data from clipboard:', err);
                }

                if (htmlData && !formatDetected) {
                    try {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = htmlData;
                        const table = tempDiv.querySelector('table');
                        if (table) {
                            let dataMatrix = [];
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

                            let bodyContainer = table.querySelector('tbody');
                            if (!bodyContainer) {
                                bodyContainer = table;
                            }

                            const bodyRows = bodyContainer.querySelectorAll('tr');
                            bodyRows.forEach((tr) => {
                                if (thead && tr.closest('thead')) {
                                    return;
                                }

                                const row = [];
                                const cells = tr.querySelectorAll('td, th');
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

                            if (dataMatrix.length > 0) {
                                let maxCols = Math.max(...dataMatrix.map(row => row.length));
                                dataMatrix.forEach(row => {
                                    while (row.length < maxCols) {
                                        row.push('');
                                    }
                                });
                                agentLinkParsed = {
                                    dataMatrix: dataMatrix,
                                    maxRows: dataMatrix.length,
                                    maxCols: maxCols
                                };
                            }
                        }
                    } catch (htmlErr) {
                        console.error('2.SPECIAL: HTML parser error:', htmlErr);
                    }
                }

                if (!agentLinkParsed) {
                    agentLinkParsed = parseAgentLinkTableFormat(pastedData);
                }

                if (agentLinkParsed) {
                    console.log('2.SPECIAL: Detected PS3838 format (2.4)');
                    formatDetected = true;
                    const { dataMatrix } = agentLinkParsed;

                    const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                        startColOverride: 0,
                        trimValues: true,
                    });

                    if (successCount > 0) {
                        notifyPasteUser(`2.SPECIAL: 检测到PS3838格式 (2.8)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)!`, 'success');
                        recomputeSubmitStateAfterPaste();
                        return true;
                    }
                }
            }
        }

        // ===== 2.9 WBET 格式检测和处理 =====
        // 2.9 WBET: 以下代码从 WBET 选项复制而来，用于在 2.SPECIAL 模式下支持 WBET 格式的粘贴
        if (!formatDetected) {
            // WBET 特征检测：检查数据是否包含 WBET 格式的特征
            // 特征1: 包含 "SUB TOTAL" 或 "SUBTOTAL" 关键词
            // 特征2: 包含 "GRAND TOTAL" 或 "GRANDTOTAL" 关键词
            // 特征3: 数据行通常以2-3个大写字母开头（如 OB, OC, OD, RS等）
            // 特征4: 可能包含行号（纯数字的第一列）
            const normalizedDataForCheck = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const linesForCheck = normalizedDataForCheck.split('\n').map(line => line.trim()).filter(line => line !== '');

            // 检测 SUB TOTAL 或 SUBTOTAL
            const hasSubTotal = /SUB\s*TOTAL|SUBTOTAL/i.test(pastedData);

            // 检测 GRAND TOTAL 或 GRANDTOTAL
            const hasGrandTotal = /GRAND\s*TOTAL|GRANDTOTAL/i.test(pastedData);

            // 检测数据行标识（2-3个大写字母，如 OB, OC, OD, RS）
            // 支持两种情况：
            // 1. 直接以2-3个大写字母开头（如 "OB RS 9403..."）
            // 2. 以数字开头，后跟2-3个大写字母（如 "1 OB RS 9403..." 或 "1\tOB\tRS..."）
            const hasDataRowIdentifier = linesForCheck.some(line => {
                const trimmed = line.trim();
                // 情况1: 检查是否是2-3个大写字母开头（可能后面跟着空格/制表符和数字）
                if (/^[A-Z]{2,3}(\s|$|\t)/.test(trimmed) || /^[A-Z]{2,3}[\s\t]+\d+/.test(trimmed)) {
                    return true;
                }
                // 情况2: 检查是否以数字开头，后跟2-3个大写字母（支持制表符或空格分隔）
                // 匹配模式：一个或多个数字 + 一个或多个空格/制表符 + 2-3个大写字母
                // 例如："1 OB RS..." 或 "1\tOB\tRS..." 或 "1 OB RS 9403..." 或 "1  OB  RS..."
                if (/^\d+[\s\t]+[A-Z]{2,3}/.test(trimmed)) {
                    return true;
                }
                return false;
            });

            // 如果符合 WBET 特征，进行解析
            const isWBETFormat = (hasSubTotal || hasGrandTotal) && hasDataRowIdentifier;

            if (isWBETFormat) {
                console.log('2.SPECIAL: Trying 2.9 WBET format...');
                console.log('2.SPECIAL: WBET format pattern detected');
                console.log('2.SPECIAL: WBET Pasted data length:', pastedData.length);
                console.log('2.SPECIAL: WBET Pasted data raw (first 500 chars):', pastedData.substring(0, 500));

                // 优先使用 HTML 表格解析（从网页复制的内容通常是 HTML 格式）
                const htmlDataFromDetect = detectHtmlTableInClipboard(e);

                if (htmlDataFromDetect) {
                    console.log('2.SPECIAL: WBET HTML data detected via detectAndParseHTML');
                    const filled = parseAndFillHtmlTableForWbet(htmlDataFromDetect, startCell);
                    if (filled) {
                        console.log('2.SPECIAL: WBET Successfully filled using parseAndFillHTMLTableForWBET');
                        formatDetected = true;
                        notifyPasteUser('2.SPECIAL: 检测到WBET格式 (2.9)!', 'success');
                        recomputeSubmitStateAfterPaste();
                        return true;
                    } else {
                        console.log('2.SPECIAL: WBET parseAndFillHTMLTableForWBET returned false, trying standard HTML parsing');
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
                    console.log('2.SPECIAL: WBET Could not get HTML data from clipboard:', err);
                }

                if (htmlData && !formatDetected) {
                    console.log('2.SPECIAL: WBET HTML data detected, length:', htmlData.length);
                    const filled = parseAndFillHtmlTableForWbet(htmlData, startCell);
                    if (filled) {
                        formatDetected = true;
                        notifyPasteUser('2.SPECIAL: 检测到WBET格式 (2.9)!', 'success');
                        recomputeSubmitStateAfterPaste();
                        return true;
                    }
                }

                // 如果 HTML 解析失败，尝试纯文本解析
                if (!formatDetected) {
                    console.log('2.SPECIAL: WBET Trying text-based parsing...');
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

                        console.log('2.SPECIAL: WBET Raw parsed data:', rawDataMatrix.length, 'rows');

                        // 第二步：处理数据 - 移除行号、合并 Sub Total 和 Grand Total 的数据
                        const processedMatrix = [];
                        const rowsToSkip = new Set();

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

                                console.log(`2.SPECIAL: WBET ${isSubTotal ? 'SUB TOTAL' : 'GRAND TOTAL'} at row ${rowIndex}, next Total at row ${nextTotalRowIndex}`);

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
                                        console.log(`2.SPECIAL: WBET Stopping merge at row ${mergeIndex} - found another Total row`);
                                        break;
                                    }

                                    // 检查下一行是否是新的数据行标识（2-3个字母，如 OB, OC, OD）
                                    const nextProcessedFirstCell = (nextProcessedRow[0] || '').toString().trim();

                                    // 检查是否是用户名标识（2-3个大写字母）
                                    if (/^[A-Z]{2,3}$/.test(nextProcessedFirstCell)) {
                                        console.log(`2.SPECIAL: WBET Stopping merge at row ${mergeIndex} - found new data row (${nextProcessedFirstCell})`);
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
                                            console.log(`2.SPECIAL: WBET Text - Detected duplicate value "${firstValue}", skipping first cell of next row`);
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
                                                // 如果与最后一个值相同，跳过（避免重复）
                                                console.log(`2.SPECIAL: WBET Text - Skipping duplicate value "${cellValue}" (same as last value)`);
                                                continue;
                                            }

                                            // 检查是否与 processedRow 的倒数第二个值也相同（避免 A-B-B 模式变成 A-B-B-B）
                                            if (processedRow.length >= 2) {
                                                const secondLastValue = processedRow[processedRow.length - 2];
                                                if (secondLastValue && secondLastValue.toString().trim() === cellValue) {
                                                    console.log(`2.SPECIAL: WBET Text - Skipping duplicate value "${cellValue}" (same as second last value, pattern detected)`);
                                                    continue;
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

                        console.log(`2.SPECIAL: WBET Found Sub Total at row ${subTotalRowIndex}, Grand Total at row ${grandTotalRowIndex}`);

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

                            console.log(`2.SPECIAL: WBET Sub Total has ${subTotalDataCells.length} data cells, Grand Total has ${grandTotalDataCells.length} data cells`);

                            // 根据用户需求：Sub Total 和 Grand Total 的数据应该是一样的
                            // 如果 Sub Total 行数据为空，而 Grand Total 行有数据，将 Grand Total 的数据复制到 Sub Total
                            if (subTotalDataCells.length === 0 && grandTotalDataCells.length > 0) {
                                console.log('2.SPECIAL: WBET Sub Total is empty but Grand Total has data. Copying Grand Total data to Sub Total.');
                                const newSubTotalRow = ['SUB TOTAL', ...grandTotalDataCells];
                                processedMatrix[subTotalRowIndex] = newSubTotalRow;
                            } else if (subTotalDataCells.length > 0 && grandTotalDataCells.length === 0) {
                                console.log('2.SPECIAL: WBET Grand Total is empty but Sub Total has data. Copying Sub Total data to Grand Total.');
                                const newGrandTotalRow = ['GRAND TOTAL', ...subTotalDataCells];
                                processedMatrix[grandTotalRowIndex] = newGrandTotalRow;
                            } else if (subTotalDataCells.length > 0 && grandTotalDataCells.length > 0) {
                                // 两者都有数据，使用 Grand Total 的数据作为标准（因为通常 Grand Total 更完整）
                                console.log('2.SPECIAL: WBET Both have data. Ensuring Sub Total matches Grand Total.');
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
                                        if (lastValue === null || lastValue.toString().trim() !== cellValue) {
                                            deduplicatedRow.push(cell);
                                            lastValue = cell;
                                        } else {
                                            console.log(`2.SPECIAL: WBET Removing duplicate value "${cellValue}" at row ${rowIdx}, column ${cellIdx}`);
                                        }
                                    } else {
                                        // 空值也添加（保持列对齐）
                                        deduplicatedRow.push(cell);
                                    }
                                });

                                console.log(`2.SPECIAL: WBET Row ${rowIdx} (${isSubTotal ? 'SUB TOTAL' : 'GRAND TOTAL'}): ${row.length} -> ${deduplicatedRow.length} cells after deduplication`);
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

                        console.log('2.SPECIAL: WBET Processed text data:', processedMatrix.length, 'rows x', maxCols, 'cols');
                        console.log('2.SPECIAL: WBET First few processed rows:', processedMatrix.slice(0, 5));

                        if (processedMatrix.length > 0) {
                            const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(processedMatrix, startCell, {
                                startColOverride: 0,
                            });

                            if (successCount > 0) {
                                formatDetected = true;
                                console.log('2.SPECIAL: WBET Successfully pasted', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                                notifyPasteUser(`2.SPECIAL: 检测到WBET格式 (2.9)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)!`, 'success');
                                recomputeSubmitStateAfterPaste();
                                return true;
                            }
                        }
                    }
                }

                // WBET 解析失败，继续尝试其他格式
                console.log('2.SPECIAL: WBET parser failed, will continue trying other formats');
            } else {
                console.log('2.SPECIAL: WBET format check failed, skipping...');
            }
        }
        // 2.9 WBET 代码结束

        // ===== 2.10 PEGASUS 格式检测和处理 =====
        // 2.10 PEGASUS: 以下代码从 PEGASUS 选项复制而来，用于在 2.SPECIAL 模式下支持 PEGASUS 格式的粘贴
        if (!formatDetected) {
            console.log('2.SPECIAL: Trying 2.10 PEGASUS format...');
            console.log('2.SPECIAL: PEGASUS raw data length:', pastedData.length);
            console.log('2.SPECIAL: PEGASUS raw data sample (first 500 chars):', pastedData.substring(0, 500));

            let dataMatrix = [];
            let allCells = [];

            // 优先尝试 HTML 表格解析（从网页复制的内容通常是 HTML 格式）
            const htmlDataFromDetect = detectHtmlTableInClipboard(e);

            if (htmlDataFromDetect) {
                console.log('2.SPECIAL: PEGASUS HTML data detected via detectAndParseHTML');
                dataMatrix = htmlDataFromDetect;
            } else {
                // 如果 HTML 解析失败，尝试手动解析 HTML
                let htmlData = null;
                try {
                    htmlData = e.clipboardData.getData('text/html');
                    if (htmlData && htmlData.toLowerCase().includes('<table')) {
                        console.log('2.SPECIAL: PEGASUS HTML data detected, parsing manually...');
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = htmlData;

                        const table = tempDiv.querySelector('table');
                        if (table) {
                            // 处理表头（如果有）
                            const thead = table.querySelector('thead');
                            if (thead) {
                                const headerRows = thead.querySelectorAll('tr');
                                headerRows.forEach(tr => {
                                    const cells = tr.querySelectorAll('th, td');
                                    cells.forEach(cell => {
                                        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                                        let text = cell.textContent || cell.innerText || '';
                                        text = text.replace(/\s+/g, ' ').trim();
                                        if (text) allCells.push(text);
                                        for (let i = 1; i < colspan; i++) {
                                            allCells.push('');
                                        }
                                    });
                                });
                            }

                            // 处理表体
                            let bodyContainer = table.querySelector('tbody');
                            if (!bodyContainer) {
                                bodyContainer = table;
                            }

                            const bodyRows = bodyContainer.querySelectorAll('tr');
                            bodyRows.forEach((tr) => {
                                if (thead && tr.closest('thead')) {
                                    return;
                                }

                                const cells = tr.querySelectorAll('td, th');
                                cells.forEach(cell => {
                                    const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                                    let text = cell.textContent || cell.innerText || '';
                                    text = text.replace(/\s+/g, ' ').trim();
                                    if (text) allCells.push(text);
                                    for (let i = 1; i < colspan; i++) {
                                        allCells.push('');
                                    }
                                });
                            });
                        }
                    }
                } catch (err) {
                    console.log('2.SPECIAL: PEGASUS Could not get HTML data from clipboard:', err);
                }
            }

            // 如果 HTML 解析成功，从 dataMatrix 提取所有单元格
            if (dataMatrix && dataMatrix.length > 0) {
                console.log('2.SPECIAL: PEGASUS Extracting cells from HTML data matrix...');
                dataMatrix.forEach(row => {
                    if (Array.isArray(row)) {
                        row.forEach(cell => {
                            const trimmed = (cell || '').toString().trim();
                            if (trimmed) allCells.push(trimmed);
                        });
                    }
                });
            }

            // 如果 HTML 解析失败或没有数据，尝试纯文本解析
            if (allCells.length === 0) {
                console.log('2.SPECIAL: PEGASUS Trying text-based parsing...');
                const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const lines = normalizedData.split('\n').map(line => line.trim()).filter(line => line !== '');

                lines.forEach(line => {
                    if (line.includes('\t')) {
                        // 制表符分隔
                        const cells = line.split('\t').map(c => c.trim()).filter(c => c !== '');
                        allCells.push(...cells);
                    } else {
                        // 空格分隔（多个空格或单个空格）
                        const cells = line.split(/\s+/).map(c => c.trim()).filter(c => c !== '');
                        allCells.push(...cells);
                    }
                });
            }

            // 合并所有单元格成一行
            if (allCells.length > 0) {
                console.log('2.SPECIAL: PEGASUS Merged all data into single row with', allCells.length, 'cells');
                console.log('2.SPECIAL: PEGASUS First 10 cells:', allCells.slice(0, 10));

                const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid([allCells], startCell, {
                    startColOverride: 0,
                    trimValues: true,
                });

                if (successCount > 0) {
                    formatDetected = true;
                    notifyPasteUser(`2.SPECIAL: 检测到PEGASUS格式 (2.10)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)!`, 'success');
                    recomputeSubmitStateAfterPaste();
                    return true;
                }
            } else {
                console.log('2.SPECIAL: PEGASUS No data extracted, will continue trying other formats');
            }
        }
        // 2.10 PEGASUS 代码结束

        if (!formatDetected) {
            console.log('2.SPECIAL: No format detected, continuing with default logic');
        }

        if (!formatDetected) {
            console.log('2.SPECIAL: No format detected, continuing with default logic');
        }
        function normalizeC8PlayRow(rawRow, expectedCols) {
            if (!Array.isArray(rawRow) || rawRow.length === 0) return null;

            const row = rawRow.map(v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim());
            const nonEmpty = row.filter(v => v !== '');

            if (nonEmpty.length === 1 && /\bCount\s*:\s*\d+\b/i.test(nonEmpty[0])) {
                return null;
            }

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
            if (startIdx === 0 && !isPlayer(row[0])) {
                const firstPlayerIdx = row.findIndex(isPlayer);
                if (firstPlayerIdx > 0) {
                    aligned = row.slice(firstPlayerIdx);
                }
            }

            const cols = Number.isFinite(expectedCols) && expectedCols > 0 ? expectedCols : aligned.length;
            aligned = aligned.slice(0, cols);
            while (aligned.length < cols) aligned.push('');
            return aligned;
        }

        // 优先尝试获取HTML格式的数据（Excel/网页粘贴通常包含HTML格式）
        let htmlData = null;
        try {
            htmlData = e.clipboardData.getData('text/html');
            console.log('2.SPECIAL: C8PLAY HTML data available:', htmlData ? 'Yes (length: ' + htmlData.length + ')' : 'No');
            if (htmlData && htmlData.includes('<table')) {
                console.log('2.SPECIAL: C8PLAY HTML table format detected');

                try {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlData;

                    const table = tempDiv.querySelector('table');
                    if (table) {
                        console.log('2.SPECIAL: C8PLAY HTML table found');
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

                            console.log('2.SPECIAL: C8PLAY HTML parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');

                            // 填充到表格
                            // C8PLAY 格式：强制从第一列（Column 1）开始粘贴
                            const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                                        startColOverride: 0,
                                    });

                            if (successCount > 0) {
                                formatDetected = true;
                                console.log('2.SPECIAL: C8PLAY HTML paste successful -', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                                notifyPasteUser(`2.SPECIAL: 检测到C8PLAY格式 (2.10)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                                recomputeSubmitStateAfterPaste();
                                return true;
                            }
                        }
                    }
                } catch (htmlErr) {
                    console.error('2.SPECIAL: C8PLAY HTML parser error:', htmlErr);
                }
            }
        } catch (err) {
            console.log('2.SPECIAL: C8PLAY Could not get HTML data from clipboard:', err);
        }

        // 如果HTML解析失败，尝试使用detectAndParseHTML
        if (!formatDetected) {
            const htmlDataFromDetect = detectHtmlTableInClipboard(e);
            if (htmlDataFromDetect) {
                console.log('2.SPECIAL: C8PLAY HTML data detected via detectAndParseHTML');
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

                            // C8PLAY 格式：强制从第一列（Column 1）开始粘贴
                            const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                                        startColOverride: 0,
                                    });

                            if (successCount > 0) {
                                formatDetected = true;
                                console.log('2.SPECIAL: C8PLAY detectAndParseHTML paste successful -', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                                notifyPasteUser(`2.SPECIAL: 检测到C8PLAY格式 (2.10)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                                recomputeSubmitStateAfterPaste();
                                return true;
                            }
                        }
                    }
                } catch (err) {
                    console.log('2.SPECIAL: C8PLAY detectAndParseHTML processing failed:', err);
                }
            }
        }

        // 如果HTML解析都失败，尝试纯文本格式（C8PLAY特殊格式：数据块合并为行）
        if (!formatDetected) {
            console.log('2.SPECIAL: C8PLAY HTML parsing failed, trying text format...');
            const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const allLines = normalizedData.split('\n');

            console.log('2.SPECIAL: C8PLAY Text format - Total lines:', allLines.length);

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

                // 检查是否是标识符行（如CKZ03, CKZ16）- 通常是大写字母+数字，长度2-10
                if (/\bCount\s*:\s*\d+\b/i.test(trimmedLine)) {
                    if (currentRow !== null && currentRow.length > 0) {
                        dataMatrix.push(currentRow);
                        maxCols = Math.max(maxCols, currentRow.length);
                        currentRow = null;
                        isTotalRow = false;
                    }
                    continue;
                }

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

            console.log('2.SPECIAL: C8PLAY DataMatrix rows:', dataMatrix.map((row, idx) => {
                return `Row ${idx}: [${row.slice(0, 5).join(', ')}...] (length: ${row.length})`;
            }));

            console.log('2.SPECIAL: C8PLAY Parsed dataMatrix:', dataMatrix.length, 'rows x', maxCols, 'cols');
            console.log('2.SPECIAL: C8PLAY First row sample:', dataMatrix[0] ? dataMatrix[0].slice(0, 10) : 'empty');

            // 确保所有行都有相同的列数
            dataMatrix.forEach(row => {
                while (row.length < maxCols) {
                    row.push('');
                }
            });

            // 填充到表格，保持行格式
            // C8PLAY 格式：强制从第一列（Column 1）开始粘贴，每行数据都从第一列开始
            if (dataMatrix.length > 0 && maxCols > 0) {
                const startRow = Array.from(startCell.parentNode.parentNode.children).indexOf(startCell.parentNode);
                        console.log('2.SPECIAL: C8PLAY Starting paste at row', startRow, 'col', 0);

                        const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, startCell, {
                            startColOverride: 0,
                        });

                if (successCount > 0) {
                    formatDetected = true;
                    console.log('2.SPECIAL: C8PLAY Successfully pasted', successCount, 'cells in', maxRows, 'rows x', cols, 'cols');
                    notifyPasteUser(`2.SPECIAL: 检测到C8PLAY格式 (2.10)，成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持行格式并格式化数值为2位小数!`, 'success');
                    recomputeSubmitStateAfterPaste();
                    return true;
                }
            }
        }

  return false;
}

