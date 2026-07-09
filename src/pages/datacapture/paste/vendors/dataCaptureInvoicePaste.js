/** INVOICE paste. */
import { notifyPasteUser } from "../../lib/dataCaptureBridge.js";
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";
import { parseAndFillHtmlTableForInvoice } from "./dataCaptureInvoiceHtmlPaste.js";



import { applyParsedMatrixToGrid } from "../core/dataCapturePasteApply.js";

/** @returns {boolean} */
export function handleInvoicePaste(e, pastedData) {
        console.log('2.10 INVOICE mode detected, preserving PDF format...');

        // 优先尝试获取HTML格式的数据（PDF粘贴可能包含HTML格式）
        let htmlData = null;
        try {
            htmlData = e.clipboardData.getData('text/html');
            if (htmlData && htmlData.includes('<table')) {
                console.log('2.10 INVOICE: HTML table format detected');
                const startCell = e.target;
                const filled = parseAndFillHtmlTableForInvoice(htmlData, startCell);
                if (filled) {
                    return; // 成功处理，直接返回
                }
            }
        } catch (err) {
            console.log('2.10 INVOICE: Could not get HTML data from clipboard:', err);
        }

        // 如果HTML解析失败，尝试使用detectAndParseHTML
        const htmlDataFromDetect = detectHtmlTableInClipboard(e);
        if (htmlDataFromDetect) {
            console.log('2.10 INVOICE: HTML data detected via detectAndParseHTML');
            const startCell = e.target;
            const filled = parseAndFillHtmlTableForInvoice(htmlDataFromDetect, startCell);
            if (filled) {
                return; // 成功处理，直接返回
            }
        }

        // 如果HTML解析都失败，尝试纯文本格式（但尽量保持格式）
        console.log('2.10 INVOICE: HTML parsing failed, trying text format...');
        const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedData.split('\n').filter(line => line.trim() !== '');

        console.log('2.10 INVOICE: Total lines to process:', lines.length);
        console.log('2.10 INVOICE: First few lines:', lines.slice(0, 5));

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
                    console.log(`2.10 INVOICE: Line ${lineIndex + 1} split by tab: ${cells.length} columns`);

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
                                // 例如: "2,693.95-188.58" 应该分离为 "2,693.95" 和 "-188.58"
                                // 或者: "-25.00-1.50" 应该分离为 "-25.00" 和 "-1.50"
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
                                    console.log(`2.10 INVOICE: Tab/MultiSpace - Separated "${cell}" into "${firstNum}" and "${secondNum}"`);
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
                        console.log(`2.10 INVOICE: Line ${lineIndex + 1} split by multiple spaces: ${cells.length} columns`);

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
                                    // 例如: "2,693.95-188.58" 应该分离为 "2,693.95" 和 "-188.58"
                                    // 或者: "-25.00-1.50" 应该分离为 "-25.00" 和 "-1.50"
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
                                        console.log(`2.10 INVOICE: MultiSpace - Separated "${cell}" into "${firstNum}" and "${secondNum}"`);
                                        continue;
                                    }
                                }
                            }
                            processedCells.push(cell);
                        }
                        cells = processedCells;
                    } else {
                        // 方法3: 使用单个空格分割，智能识别列
                        // 对于PDF表格，通常格式是：数字 品牌 类型 百分比 金额等
                        // 例如: "1 AG:ASIAGAMING - GSC LC - K69M PT 7.50 (MYR) 25.00 1.88"
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
                                    // 如果遇到类型代码（2-3个大写字母）或数字（百分比），停止
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
                            // 如果是数字（百分比或金额）
                            // 先检查是否是 "数字-数字" 格式（如 "-25.00-1.50" 或 "2,693.95-188.58"）
                            // 这种格式通常表示两个数字应该分开到不同的列
                            // 使用更宽松的检测：包含至少一个连字符，且连字符前后都是数字模式
                            else if (/[\d,]+\.?\d*-.*[\d,]+\.?\d*/.test(part)) {
                                // 从第二个字符开始查找连字符（跳过开头的负号）
                                let dashIndex = -1;
                                if (part.startsWith('-')) {
                                    // 如果以负号开头，从第二个字符开始找连字符
                                    dashIndex = part.indexOf('-', 1);
                                } else {
                                    // 否则从第一个字符开始找
                                    dashIndex = part.indexOf('-', 0);
                                }

                                // 确保找到了连字符，且连字符前后都有内容
                                if (dashIndex > 0 && dashIndex < part.length - 1) {
                                    const firstNum = part.substring(0, dashIndex).trim();
                                    let secondNum = part.substring(dashIndex + 1).trim();

                                    // 在PDF数据中，连字符通常表示第二个数字是负数
                                    // 例如: "2,693.95-188.58" 应该分离为 "2,693.95" 和 "-188.58"
                                    // 或者: "-25.00-1.50" 应该分离为 "-25.00" 和 "-1.50"
                                    if (!secondNum.startsWith('-') && /^[\d,]+\.?\d*$/.test(secondNum)) {
                                        secondNum = '-' + secondNum;
                                    }

                                    // 验证两部分都像数字（可能包含逗号、小数点、负号）
                                    const numPattern = /^-?[\d,]+\.?\d*$/;
                                    const numPatternWithDecimal = /^-?[\d,]+\.\d+$/;

                                    // 检查第一个数字是否有效
                                    const firstIsValid = numPattern.test(firstNum) || numPatternWithDecimal.test(firstNum);

                                    // 检查第二个数字是否有效（可能没有负号，需要检查）
                                    let secondIsValid = numPattern.test(secondNum) || numPatternWithDecimal.test(secondNum);

                                    // 如果第二个数字无效，但看起来像数字（只是缺少负号），尝试添加负号
                                    // 注意：这只是一个启发式方法，因为无法确定第二个数字是否应该是负数
                                    // 但如果第一个数字是负数，且第二个数字看起来像正数，可能需要检查上下文
                                    if (!secondIsValid && /^[\d,]+\.?\d*$/.test(secondNum)) {
                                        // 第二个数字看起来像正数，但可能应该是负数
                                        // 为了安全起见，我们保持原样，不自动添加负号
                                        // 但如果用户期望是负数，可能需要手动处理
                                        secondIsValid = true; // 接受为正数
                                    }

                                    if (firstIsValid && secondIsValid) {
                                        cells.push(firstNum); // 第一个数字 (如 "-25.00" 或 "2,693.95")
                                        cells.push(secondNum); // 第二个数字 (如 "-1.50" 或 "-188.58")
                                        console.log(`2.10 INVOICE: Separated "${part}" into "${firstNum}" and "${secondNum}"`);
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
                            else if (/^-?\d+\.?\d*$/.test(part) || /^-?[\d,]+\.?\d*$/.test(part)) {
                                cells.push(part);
                                i++;
                            }
                            // 如果是货币代码（括号内的）
                            else if (/^\([A-Z]{3}\)$/.test(part)) {
                                cells.push(part);
                                i++;
                            }
                            // 检查是否是 DESCRIPTION-AMOUNT 格式（如 "Loyalty-24.79"）
                            // 匹配：字母开头的文本，连字符，然后是数字（可能包含负号和逗号）
                            else if (/^[A-Za-z]+-[0-9.,-]+$/i.test(part)) {
                                const match = part.match(/^([A-Za-z]+)(-[0-9.,-]+)$/i);
                                if (match) {
                                    // 分离 DESCRIPTION 和 AMOUNT
                                    cells.push(match[1]); // DESCRIPTION (如 "Loyalty")
                                    cells.push(match[2]); // AMOUNT (如 "-24.79")
                                    i++;
                                } else {
                                    cells.push(part);
                                    i++;
                                }
                            }
                            // 其他情况，作为单独的列
                            else {
                                cells.push(part);
                                i++;
                            }
                        }

                        console.log(`2.10 INVOICE: Line ${lineIndex + 1} split by smart parsing: ${cells.length} columns`, cells);
                    }
                }

                // 清理空单元格（但保留只包含负号的单元格，因为它可能是负数的一部分）
                cells = cells.filter(cell => {
                    const trimmed = (cell || '').trim();
                    // 保留非空单元格，但也要注意：如果单元格只有 "-"，可能是负数的一部分，不应该被过滤
                    // 不过这种情况应该很少，因为数字通常不会单独分离出负号
                    return trimmed !== '' && trimmed !== '-';
                });

                if (cells.length > 0) {
                    dataMatrix.push(cells);
                    maxCols = Math.max(maxCols, cells.length);
                }
            });

            console.log(`2.10 INVOICE: Parsed ${dataMatrix.length} rows with max ${maxCols} columns`);

            // 修复PDF上下排版问题：合并货币代码和数字、数字和数字到同一行
            // 例如: 第N行是"(MYR)"，第N+1行是"2,693.95"，应该合并到同一行
            // 例如: 第N行是"2,693.95"，第N+1行是"-188.58"，应该合并到同一行
            const mergedDataMatrix = [];
            let i = 0;
            while (i < dataMatrix.length) {
                const currentRow = [...dataMatrix[i]];
                const nextRow = i + 1 < dataMatrix.length ? dataMatrix[i + 1] : null;

                // 检查当前行的最后一个非空单元格
                const trimmedCurrent = currentRow.map(c => (c || '').trim()).filter(c => c !== '');
                const lastCell = trimmedCurrent.length > 0 ? trimmedCurrent[trimmedCurrent.length - 1] : '';
                const isCurrencyCode = /^\([A-Z]{3}\)$/.test(lastCell);
                const isLastCellNumber = /^-?[\d,]+\.?\d*$/.test(lastCell) || /^-?[\d,]+\.\d+$/.test(lastCell);

                // 检查下一行的第一个非空单元格是否是数字（如 "2,693.95" 或 "-188.58"）
                // 或者包含数字的字符串（如 "2,693.95-188.58"）
                let isNextRowNumber = false;
                let nextRowNumber = null;
                let nextRowNumbers = null; // 用于存储多个数字（如果被连字符分隔或已经分离）
                if (nextRow) {
                    const trimmedNext = nextRow.map(c => (c || '').trim()).filter(c => c !== '');
                    if (trimmedNext.length > 0) {
                        const firstNextCell = trimmedNext[0];

                        // 检查是否已经分离成两个数字单元格（如 ["2,693.95", "-188.58"]）
                        const numberPattern = /^-?[\d,]+\.?\d*$/;
                        const numberPatternWithDecimal = /^-?[\d,]+\.\d+$/;
                        if (trimmedNext.length >= 2) {
                            const secondNextCell = trimmedNext[1];
                            // 如果第一个和第二个单元格都是数字，说明已经分离了
                            if ((numberPattern.test(firstNextCell) || numberPatternWithDecimal.test(firstNextCell)) &&
                                (numberPattern.test(secondNextCell) || numberPatternWithDecimal.test(secondNextCell))) {
                                isNextRowNumber = true;
                                nextRowNumbers = [firstNextCell, secondNextCell];
                                nextRowNumber = firstNextCell;
                            } else if (numberPattern.test(firstNextCell) || numberPatternWithDecimal.test(firstNextCell)) {
                                // 只有第一个是数字
                                isNextRowNumber = true;
                                nextRowNumber = firstNextCell;
                            }
                        } else {
                            // 只有一个单元格，检查是否是 "数字-数字" 格式（如 "2,693.95-188.58"）
                            // 改进正则以支持负号：/^(-?[\d,]+\.?\d*)-(-?[\d,]+\.?\d*)$/
                            const numberDashNumberPattern = /^(-?[\d,]+\.?\d*)-(-?[\d,]+\.?\d*)$/;
                            const match = firstNextCell.match(numberDashNumberPattern);
                            if (match) {
                                // 分离成两个数字
                                isNextRowNumber = true;
                                nextRowNumbers = [match[1], match[2]];
                                nextRowNumber = match[1]; // 第一个数字作为主要数字
                            } else if (numberPattern.test(firstNextCell) || numberPatternWithDecimal.test(firstNextCell)) {
                                // 单个数字格式
                                isNextRowNumber = true;
                                nextRowNumber = firstNextCell;
                            } else {
                                // 更宽松的检测：如果字符串包含数字字符，也认为是数字行
                                // 这种情况可能发生在上下排版时，数字被合并成一个字符串
                                if (/[\d,]+/.test(firstNextCell) && trimmedNext.length === 1) {
                                    isNextRowNumber = true;
                                    nextRowNumber = firstNextCell;
                                }
                            }
                        }
                    }
                }

                // 调试日志
                if (i < 20) { // 只记录前20行，避免日志过多
                    console.log(`2.10 INVOICE: Row ${i + 1} - lastCell: "${lastCell}", isCurrency: ${isCurrencyCode}, isNumber: ${isLastCellNumber}`);
                    if (nextRow) {
                        const trimmedNext = nextRow.map(c => (c || '').trim()).filter(c => c !== '');
                        console.log(`2.10 INVOICE: Row ${i + 2} - firstCell: "${trimmedNext[0] || ''}", isNumber: ${isNextRowNumber}, cols: ${trimmedNext.length}`);
                    }
                }

                // 情况1: 货币代码 + 数字（如 "(MYR)" + "2,693.95" 或 "(MYR)" + "2,693.95-188.58"）
                if (isCurrencyCode && isNextRowNumber) {
                    // 找到货币代码在当前行中的位置（最后一个非空单元格的位置）
                    let currencyColIndex = -1;
                    for (let j = currentRow.length - 1; j >= 0; j--) {
                        if ((currentRow[j] || '').trim() === lastCell) {
                            currencyColIndex = j;
                            break;
                        }
                    }

                    if (currencyColIndex >= 0) {
                        // 如果下一行有多个数字（如 "2,693.95-188.58"），分别添加到不同列
                        if (nextRowNumbers && nextRowNumbers.length === 2) {
                            // 确保行有足够的列
                            while (currentRow.length <= currencyColIndex + 2) {
                                currentRow.push('');
                            }
                            // 将第一个数字添加到货币代码的下一列
                            currentRow[currencyColIndex + 1] = nextRowNumbers[0];
                            // 将第二个数字添加到再下一列
                            currentRow[currencyColIndex + 2] = nextRowNumbers[1];
                            console.log(`2.10 INVOICE: Merged currency+numbers at row ${i + 1}: "${lastCell}" + "${nextRowNumbers[0]}" + "${nextRowNumbers[1]}"`);
                        } else {
                            // 单个数字，添加到货币代码的下一列
                            while (currentRow.length <= currencyColIndex + 1) {
                                currentRow.push('');
                            }
                            currentRow[currencyColIndex + 1] = nextRowNumber;
                            console.log(`2.10 INVOICE: Merged currency+number at row ${i + 1}: "${lastCell}" + "${nextRowNumber}"`);
                        }
                        // 跳过下一行（因为它已经被合并到当前行）
                        i += 2; // 跳过当前行和下一行（因为已经合并）
                        mergedDataMatrix.push(currentRow);
                        continue; // 继续处理下一行
                    }
                }

                // 情况2: 检查当前行是否包含货币代码（不一定是最后一个单元格）
                // 如果当前行有货币代码，且下一行只有数字，也应该合并
                if (nextRow && isNextRowNumber) {
                    const trimmedNext = nextRow.map(c => (c || '').trim()).filter(c => c !== '');
                    // 如果下一行只有1列，且是数字，很可能是上下排版
                    if (trimmedNext.length === 1) {
                        // 在当前行中查找货币代码（从后往前找，优先找后面的）
                        let currencyColIndex = -1;
                        for (let j = currentRow.length - 1; j >= 0; j--) {
                            const cellValue = (currentRow[j] || '').trim();
                            if (/^\([A-Z]{3}\)$/.test(cellValue)) {
                                currencyColIndex = j;
                                break;
                            }
                        }

                        // 如果找到货币代码，将数字添加到货币代码的下一列
                        if (currencyColIndex >= 0) {
                            // 如果下一行有多个数字（如 "2,693.95-188.58"），分别添加到不同列
                            if (nextRowNumbers && nextRowNumbers.length === 2) {
                                // 确保行有足够的列
                                while (currentRow.length <= currencyColIndex + 2) {
                                    currentRow.push('');
                                }
                                // 将第一个数字添加到货币代码的下一列
                                currentRow[currencyColIndex + 1] = nextRowNumbers[0];
                                // 将第二个数字添加到再下一列
                                currentRow[currencyColIndex + 2] = nextRowNumbers[1];
                                console.log(`2.10 INVOICE: Merged currency+numbers at row ${i + 1} (found currency at col ${currencyColIndex}): "${currentRow[currencyColIndex]}" + "${nextRowNumbers[0]}" + "${nextRowNumbers[1]}"`);
                            } else {
                                // 单个数字，添加到货币代码的下一列
                                while (currentRow.length <= currencyColIndex + 1) {
                                    currentRow.push('');
                                }
                                currentRow[currencyColIndex + 1] = nextRowNumber;
                                console.log(`2.10 INVOICE: Merged currency+number at row ${i + 1} (found currency at col ${currencyColIndex}): "${currentRow[currencyColIndex]}" + "${nextRowNumber}"`);
                            }
                            i += 2; // 跳过当前行和下一行（因为已经合并）
                            mergedDataMatrix.push(currentRow);
                            continue; // 继续处理下一行
                        }

                        // 如果没找到货币代码，但当前行的最后一个非空单元格存在，也尝试合并
                        // 这适用于数字+数字的情况，或者货币代码不在预期位置的情况
                        if (trimmedCurrent.length > 0) {
                            // 找到当前行最后一个非空单元格的位置
                            let lastColIndex = -1;
                            for (let j = currentRow.length - 1; j >= 0; j--) {
                                const cellValue = (currentRow[j] || '').trim();
                                if (cellValue !== '') {
                                    lastColIndex = j;
                                    break;
                                }
                            }

                            if (lastColIndex >= 0) {
                                // 如果下一行有多个数字，分别添加到不同列
                                if (nextRowNumbers && nextRowNumbers.length === 2) {
                                    // 确保行有足够的列
                                    while (currentRow.length <= lastColIndex + 2) {
                                        currentRow.push('');
                                    }
                                    // 将第一个数字添加到最后一个非空单元格的下一列
                                    currentRow[lastColIndex + 1] = nextRowNumbers[0];
                                    // 将第二个数字添加到再下一列
                                    currentRow[lastColIndex + 2] = nextRowNumbers[1];
                                    console.log(`2.10 INVOICE: Merged row ${i + 1} + ${i + 2} (last cell at col ${lastColIndex}): "${currentRow[lastColIndex]}" + "${nextRowNumbers[0]}" + "${nextRowNumbers[1]}"`);
                                } else {
                                    // 单个数字，添加到最后一个非空单元格的下一列
                                    while (currentRow.length <= lastColIndex + 1) {
                                        currentRow.push('');
                                    }
                                    currentRow[lastColIndex + 1] = nextRowNumber;
                                    console.log(`2.10 INVOICE: Merged row ${i + 1} + ${i + 2} (last cell at col ${lastColIndex}): "${currentRow[lastColIndex]}" + "${nextRowNumber}"`);
                                }
                                i += 2; // 跳过当前行和下一行（因为已经合并）
                                mergedDataMatrix.push(currentRow);
                                continue; // 继续处理下一行
                            }
                        }
                    }
                }

                // 情况3: 数字 + 数字（如 "2,693.95" + "-188.58"）
                // 当前行的最后一个非空单元格是数字，且下一行的第一个非空单元格也是数字
                // 这种情况通常发生在PDF上下排版时，数字被分到两行
                if (isLastCellNumber && isNextRowNumber) {
                    const nextRowTrimmed = nextRow.map(c => (c || '').trim()).filter(c => c !== '');

                    // 判断是否是上下排版：下一行列数很少（通常只有1-2列），且第一个就是数字
                    const shouldMerge = nextRowTrimmed.length <= 2;

                    if (shouldMerge) {
                        // 找到当前行最后一个非空单元格的位置
                        let numberColIndex = -1;
                        for (let j = currentRow.length - 1; j >= 0; j--) {
                            if ((currentRow[j] || '').trim() === lastCell) {
                                numberColIndex = j;
                                break;
                            }
                        }

                        if (numberColIndex >= 0) {
                            // 确保行有足够的列
                            while (currentRow.length <= numberColIndex + 1) {
                                currentRow.push('');
                            }
                            // 将下一个数字添加到当前数字的下一列
                            currentRow[numberColIndex + 1] = nextRowNumber;
                            console.log(`2.10 INVOICE: Merged number+number at row ${i + 1}: "${lastCell}" + "${nextRowNumber}"`);
                            // 跳过下一行（因为它已经被合并到当前行）
                            i += 2; // 跳过当前行和下一行（因为已经合并）
                            mergedDataMatrix.push(currentRow);
                            continue; // 继续处理下一行
                        }
                    }
                }

                // 不需要合并，正常添加当前行
                mergedDataMatrix.push(currentRow);
                i++;
            }

            // 更新 dataMatrix 和 maxCols
            dataMatrix.length = 0;
            dataMatrix.push(...mergedDataMatrix);
            maxCols = 0;
            dataMatrix.forEach(row => {
                maxCols = Math.max(maxCols, row.length);
            });

            console.log(`2.10 INVOICE: After merging currency+number, ${dataMatrix.length} rows with max ${maxCols} columns`);

            // 确保所有行都有相同的列数
            dataMatrix.forEach(row => {
                while (row.length < maxCols) {
                    row.push('');
                }
            });

            if (dataMatrix.length > 0 && maxCols > 0) {
                const { successCount, maxRows, maxCols: cols } = applyParsedMatrixToGrid(dataMatrix, e.target, {
                    trimValues: true,
                });

                if (successCount > 0) {
                    notifyPasteUser(`2.10 INVOICE: 成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持PDF原始格式!`, 'success');
                    return true;
                }
            }
        }

        // 如果所有解析都失败，继续使用默认处理逻辑
        console.log('2.10 INVOICE: All parsing methods failed, continuing with default logic');
  return false;
}

