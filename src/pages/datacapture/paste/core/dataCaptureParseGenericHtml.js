/**
 * Generic HTML table paste fill — extracted from js/datacapture.js parseAndFillHTMLTable.
 * Re-run: node frontend/scripts/extract-parse-generic-html.mjs
 */
import { pushDataCaptureNotification } from "../../lib/dataCaptureNotify.js";
import { formatMoneyDisplay } from "./dataCapturePasteMoneyUtils.js";
import { applyParsedMatrixToGrid } from "./dataCapturePasteApply.js";
import { getActiveCaptureType, runConvertTableOnSubmit } from "../../lib/dataCaptureBridge.js";

function getCaptureType() {
  return getActiveCaptureType();
}

function notifyPaste(message, type) {
  pushDataCaptureNotification(message, type);
}

export function parseAndFillHTMLTable(htmlString, startCell) {
    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        const table = tempDiv.querySelector('table');
        if (!table) {
            return false;
        }

        console.log('Parsing HTML table and filling directly...');

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

        if (dataMatrix.length === 0) {
            return false;
        }

        // 确保所有行的列数相同
        let maxCols = Math.max(...dataMatrix.map(row => row.length));
        dataMatrix.forEach(row => {
            while (row.length < maxCols) {
                row.push('');
            }
        });

        // ===== 专用解析：Downline Payment 报表（忽略 No/Lvl/Minor 行） =====
        try {
            // 在单元格里找是否有 Downline Payment 抬头或典型列名
            const flatCells = dataMatrix.flat().map(v => (v || '').toString().toLowerCase().trim());
            const looksLikeDownlineHeader =
                flatCells.includes('downline payment') &&
                flatCells.includes('username') &&
                flatCells.includes('total profit/loss');

            // 另一种情况：已经是「简化版」表格（第一行是 IPHSP3, IPHSP3, MAJOR 这种；下面有 MG 行）
            let looksLikeSheetDownline = false;
            if (dataMatrix.length >= 2) {
                const r0 = dataMatrix[0].map(c => (c || '').toString().trim());
                const r0a = (r0[0] || '').toString().toUpperCase();
                const r0b = (r0[1] || '').toString().toUpperCase();
                const r0c = (r0[2] || '').toString().toUpperCase();
                const hasMGRow = dataMatrix.some(row => ((row[0] || '').toString().toUpperCase() === 'MG'));
                if (r0a && r0a === r0b && r0c === 'MAJOR' && hasMGRow) {
                    looksLikeSheetDownline = true;
                }
            }

            if (looksLikeDownlineHeader || looksLikeSheetDownline) {
                console.log('Detected Downline Payment report, applying special parser',
                    { looksLikeDownlineHeader, looksLikeSheetDownline });

                // 找到表头行（包含 Username / Type / Total Profit/Loss）
                let headerRowIndex = -1;
                let usernameCol = -1, typeCol = -1,
                    betCol = -1, betTaxCol = -1, eatCol = -1, eatTaxCol = -1,
                    taxCol = -1, plCol = -1, totalTaxCol = -1, totalPLCol = -1;

                for (let i = 0; i < dataMatrix.length; i++) {
                    const row = dataMatrix[i].map(c => (c || '').toString().toLowerCase().trim());
                    if (row.includes('username') && row.includes('type')) {
                        headerRowIndex = i;
                        usernameCol = row.findIndex(c => c === 'username');
                        typeCol = row.findIndex(c => c === 'type');
                        betCol = row.findIndex(c => c === 'bet');
                        betTaxCol = row.findIndex(c => c === 'bet tax');
                        eatCol = row.findIndex(c => c === 'eat');
                        eatTaxCol = row.findIndex(c => c === 'eat tax');
                        taxCol = row.findIndex(c => c === 'tax');
                        plCol = row.findIndex(c => c === 'profit/loss');
                        totalTaxCol = row.findIndex(c => c === 'total tax');
                        totalPLCol = row.findIndex(c => c === 'total profit/loss');
                        break;
                    }
                }

                const hasBasicCols = headerRowIndex >= 0 && usernameCol >= 0 && typeCol >= 0 && plCol >= 0;

                // 情况 1：有完整表头（原始 Downline Payment 报表）
                if (looksLikeDownlineHeader && hasBasicCols) {
                    const newMatrix = [];

                    for (let i = headerRowIndex + 1; i < dataMatrix.length; i++) {
                        const row = dataMatrix[i];
                        const rawType = (row[typeCol] || '').toString().trim();
                        const typeLower = rawType.toLowerCase();

                        // 跳过空行、总计行、没有类型的行
                        const rowTextJoined = row.map(c => (c || '').toString().toLowerCase()).join(' ');
                        if (!rawType || (!typeLower.includes('major') && !typeLower.includes('minor'))) {
                            // 也跳过包含 total 的行
                            if (!rowTextJoined.includes('total')) {
                                continue;
                            }
                        }

                        // 处理 MAJOR 和 MINOR 行
                        if (typeLower !== 'major' && typeLower !== 'minor') {
                            continue;
                        }

                        // 找上一行，取「上级帐号」作为第一栏用户名
                        const prevRow = i > headerRowIndex + 0 ? dataMatrix[i - 1] : null;
                        let parentUser = '';

                        // 当前行 Username 一般是第二栏代码（例如 M06-KZ 或 IPHSP3）
                        const childUser = usernameCol < row.length ? (row[usernameCol] || '').toString().trim() : '';

                        if (i === headerRowIndex + 1) {
                            // 第一条数据行通常是 HSE 自己（例如 IPHSP3 MAJOR），
                            // 业务上希望变成「IPHSP3  IPHSP3  MAJOR ...」，所以父帐号 = 自己
                            parentUser = childUser;
                        } else if (prevRow && usernameCol < prevRow.length) {
                            parentUser = (prevRow[usernameCol] || '').toString().trim();
                        }

                        // 如果上一行拿不到用户名，就用当前行顶上（兜底）
                        if (!parentUser) {
                            parentUser = childUser;
                        }

                        // 组装成你要的 11 个字段：
                        // 1: Parent Username
                        // 2: Child Username / Code
                        // 3: Type (MAJOR)
                        // 4~11: Bet, Bet Tax, Eat, Eat Tax, Tax, Profit/Loss, Total Tax, Total Profit/Loss
                        const getVal = (r, idx) =>
                            (idx >= 0 && idx < r.length && r[idx] != null) ? r[idx].toString().trim() : '';

                        const newRow = [
                            parentUser,
                            childUser,
                            rawType.toUpperCase(),
                            getVal(row, betCol),
                            getVal(row, betTaxCol),
                            getVal(row, eatCol),
                            getVal(row, eatTaxCol),
                            getVal(row, taxCol),
                            getVal(row, plCol),
                            getVal(row, totalTaxCol),
                            getVal(row, totalPLCol)
                        ];

                        // 过滤掉完全空的行
                        if (newRow.some(v => (v || '').toString().trim() !== '')) {
                            newMatrix.push(newRow);
                        }
                    }

                    if (newMatrix.length > 0) {
                        console.log('Downline Payment (header mode) parsed rows:', newMatrix.length);
                        dataMatrix = newMatrix;
                        maxCols = 11;
                    }
                }
                // 情况 2：简化版（从 Google Sheet/Excel 复制出来，第一行 IPHSP3...，下面有 MG + MAJOR 行）
                else if (looksLikeSheetDownline) {
                    const newMatrix = [];

                    // 先处理第一行 owner 总览：形如 IPHSP3 | IPHSP3 | MAJOR | ...
                    // 可能后面还有 IPHSP3 | IPHSP3 | MINOR 行，需要全部处理
                    let startIndex = 1;
                    if (dataMatrix.length > 0) {
                        const row0 = dataMatrix[0].map(c => (c || '').toString().trim());
                        const r0a = (row0[0] || '').toString().toUpperCase();
                        const r0b = (row0[1] || '').toString().toUpperCase();
                        const r0c = (row0[2] || '').toString().toUpperCase();
                        if (r0a && r0a === r0b && r0c === 'MAJOR') {
                            const ownerRow = [];
                            for (let i = 0; i < Math.min(11, row0.length); i++) {
                                ownerRow.push(row0[i] || '');
                            }
                            while (ownerRow.length < 11) ownerRow.push('');
                            newMatrix.push(ownerRow);

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
                                    newMatrix.push(minorRow);
                                    j++;
                                    startIndex = j; // 更新起始索引
                                } else {
                                    break; // 不是相同用户名的 MINOR 行，停止处理
                                }
                            }
                        }
                    }

                    // 之后的部分：处理 MG 行 + 后续的 MAJOR/MINOR 行（可能有多个）
                    for (let i = startIndex; i < dataMatrix.length; i++) {
                        const row = dataMatrix[i].map(c => (c || '').toString().trim());
                        const first = (row[0] || '').toString().toUpperCase();

                        // 识别 "MG  m99m06" 这种行
                        if (first === 'MG' && row.length >= 2) {
                            const parentUser = row[1] || '';      // m99m06

                            // 处理后续的所有 MAJOR 和 MINOR 行，直到遇到下一个 MG 行或数据结束
                            let j = i + 1;
                            while (j < dataMatrix.length) {
                                const next = dataMatrix[j].map(c => (c || '').toString().trim());
                                const nextFirst = (next[0] || '').toString().toUpperCase();

                                // 如果遇到下一个 MG 行，停止处理
                                if (nextFirst === 'MG') {
                                    break;
                                }

                                const nextType = (next[1] || '').toString().toUpperCase(); // 简化表里 type 在第二格

                                // 期望下一行形如 "M06-KZ  MAJOR  340  $2.38 ..." 或 "M06-KZ  MINOR  ..."
                                if (nextType === 'MAJOR' || nextType === 'MINOR') {
                                    const downlineCode = next[0] || '';   // M06-KZ

                                    const getValIdx = (r, idx) =>
                                        (idx >= 0 && idx < r.length && r[idx] != null) ? r[idx].toString().trim() : '';

                                    const newRow = [
                                        parentUser,
                                        downlineCode,
                                        nextType,  // 保留原始类型（MAJOR 或 MINOR）
                                        getValIdx(next, 2),  // Bet
                                        getValIdx(next, 3),  // Bet Tax
                                        getValIdx(next, 4),  // Eat
                                        getValIdx(next, 5),  // Eat Tax
                                        getValIdx(next, 6),  // Tax
                                        getValIdx(next, 7),  // Profit/Loss
                                        getValIdx(next, 8),  // Total Tax
                                        getValIdx(next, 9)   // Total Profit/Loss
                                    ];

                                    if (newRow.some(v => (v || '').toString().trim() !== '')) {
                                        newMatrix.push(newRow);
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
                    }

                    if (newMatrix.length > 0) {
                        console.log('Downline Payment (sheet mode) parsed rows:', newMatrix.length);
                        dataMatrix = newMatrix;
                        maxCols = 11;
                    }
                }
            }
        } catch (dpErr) {
            console.error('Downline Payment special parser error:', dpErr);
        }
        // ===== 专用解析结束 =====

        // ===== VPOWER 专用解析 =====
        if (getCaptureType() === 'VPOWER') {
            try {
                // 检测是否是 VPOWER 格式（包含 #, User Name, profit 列）
                if (dataMatrix.length >= 2) {
                    const firstRow = dataMatrix[0].map(c => (c || '').toString().toLowerCase().trim());
                    const hasHashColumn = firstRow.includes('#') || firstRow[0] === '#';
                    const hasUserName = firstRow.includes('user name') || firstRow.includes('username');
                    const hasProfit = firstRow.includes('profit');

                    if (hasUserName && hasProfit) {
                        console.log('Detected VPOWER format in HTML table');

                        // 找到各列的索引
                        const hashColIndex = firstRow.findIndex(c => c === '#' || c.includes('#'));
                        const userNameColIndex = firstRow.findIndex(c =>
                            c.includes('user name') || c.includes('username'));
                        const profitColIndex = firstRow.findIndex(c =>
                            c.includes('profit'));

                        if (userNameColIndex >= 0 && profitColIndex >= 0) {
                            const newMatrix = [];

                            // 处理数据行（跳过表头）
                            for (let i = 1; i < dataMatrix.length; i++) {
                                const row = dataMatrix[i];
                                const userName = (row[userNameColIndex] || '').toString().trim();
                                const profit = (row[profitColIndex] || '').toString().trim();

                                // 如果 User Name 或 profit 为空，跳过这一行
                                if (!userName && !profit) {
                                    continue;
                                }

                                // 创建新行：User Name 在第一列，profit 在第二列
                                const newRow = [];
                                newRow[0] = userName.toUpperCase(); // Column 1: User Name
                                newRow[1] = profit;                // Column 2: profit
                                newRow[2] = '-';                   // Column 3
                                newRow[3] = '-';                   // Column 4
                                newRow[4] = '-';                   // Column 5
                                newRow[5] = '';                    // Column 6
                                newRow[6] = '';                    // Column 7
                                newRow[7] = '';                    // Column 8
                                newRow[8] = '';                    // Column 9

                                newMatrix.push(newRow);
                            }

                            if (newMatrix.length > 0) {
                                console.log('VPOWER format parsed rows:', newMatrix.length);
                                dataMatrix = newMatrix;
                                maxCols = 9;
                            }
                        }
                    }
                }
            } catch (vpowerErr) {
                console.error('VPOWER special parser error:', vpowerErr);
            }
        }
        // ===== VPOWER 专用解析结束 =====

        // ===== ALIPAY 专用处理：保持原始格式，不做任何转换 =====
        // ALIPAY 格式：直接使用原始数据，不进行任何解析或转换
        // 确保数据保持原始格式，每行数据保持在一行中
        if (getCaptureType() === 'ALIPAY') {
            console.log('ALIPAY mode: Keeping original format, no conversion');
            // ALIPAY 保持原始数据矩阵，不做任何修改
        }
        // ===== ALIPAY 专用处理结束 =====

        // 直接填充到表格
        const captureType = getCaptureType();
        const forceColZero =
            captureType === "VPOWER" ||
            captureType === "AGENT_LINK" ||
            captureType === "ALIPAY" ||
            captureType === "1.Text";

        applyParsedMatrixToGrid(dataMatrix, startCell, {
            startColOverride: forceColZero ? 0 : undefined,
            trimValues: true,
            transformCell: (trimmedData, rowIndex, colIndex) => {
                if (trimmedData === "") return "";
                if (captureType === "VPOWER") {
                    if (colIndex === 0) {
                        return formatMoneyDisplay(trimmedData.toUpperCase());
                    }
                    return formatMoneyDisplay(trimmedData);
                }
                if (captureType === "AGENT_LINK" || captureType === "ALIPAY") {
                    return trimmedData;
                }
                return formatMoneyDisplay(trimmedData.toUpperCase());
            },
        });

        console.log("HTML table filled directly:", dataMatrix.length, "rows x", maxCols, "columns");
        notifyPaste(
            `Successfully pasted HTML table (${dataMatrix.length} rows x ${maxCols} cols)! Press Ctrl+Z to undo`,
            "success",
        );

        // 粘贴完成后立即应用格式转换
        setTimeout(() => {
            runConvertTableOnSubmit();
        }, 100);

        return true;
    } catch (error) {
        console.error('Error parsing HTML table:', error);
        return false;
    }
}
