/** ALIPAY paste. */
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";



import { applyParsedMatrixToGrid, parseGenericHtmlTable } from "../core/dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

/** @returns {boolean} */
export function handleAlipayPaste(e, pastedData) {
        console.log('ALIPAY mode detected, attempting to parse...');
        console.log('Pasted data length:', pastedData.length);
        console.log('Pasted data sample (first 500 chars):', pastedData.substring(0, 500));

        // 优先使用 HTML 表格解析（从网页复制的内容通常是 HTML 格式）
        const htmlDataFromDetect = detectHtmlTableInClipboard(e);
        let alipayParsed = null;

        if (htmlDataFromDetect) {
            console.log('ALIPAY: HTML data detected via detectAndParseHTML');
            const startCell = e.target;
            const filled = parseGenericHtmlTable(htmlDataFromDetect, startCell);
            if (filled) {
                console.log('ALIPAY: Successfully filled using parseAndFillHTMLTable');
                recomputeSubmitStateAfterPaste();
                return true;
            } else {
                console.log('ALIPAY: parseAndFillHTMLTable returned false, trying manual HTML parsing');
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
            console.log('ALIPAY: Could not get HTML data from clipboard:', err);
        }

        if (htmlData) {
            console.log('ALIPAY: HTML data detected, length:', htmlData.length);
            // 解析 HTML 表格，保持原始格式
            try {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlData;

                const table = tempDiv.querySelector('table');
                if (table) {
                    console.log('ALIPAY: HTML table found');
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

                        console.log('ALIPAY: HTML parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');

                        alipayParsed = {
                            dataMatrix: dataMatrix,
                            maxRows: dataMatrix.length,
                            maxCols: maxCols
                        };
                    } else {
                        console.log('ALIPAY: HTML table found but no data rows extracted');
                    }
                } else {
                    console.log('ALIPAY: HTML data exists but no table element found');
                }
            } catch (htmlErr) {
                console.error('ALIPAY HTML parser error:', htmlErr);
            }
        } else {
            console.log('ALIPAY: No HTML data detected, will try text parsing');
        }

        // 如果 HTML 解析失败，尝试纯文本解析
        if (!alipayParsed) {
            console.log('ALIPAY: Attempting text format parsing...');
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
                        console.log('ALIPAY: Detected Name column format (', nameLikeLineCount, 'out of', identifierCount, 'identifiers)');
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
                                                    console.log('ALIPAY: Detected Name column value:', nameValue, 'for identifier:', trimmedLine);
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
                    console.log('ALIPAY: Text parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');
                    console.log('ALIPAY: First row sample:', dataMatrix[0] ? dataMatrix[0].slice(0, 10) : 'empty');
                    alipayParsed = {
                        dataMatrix: dataMatrix,
                        maxRows: dataMatrix.length,
                        maxCols: maxCols
                    };
                }
            }
        }

        if (alipayParsed) {
            const { dataMatrix, maxRows, maxCols } = alipayParsed;
            const { successCount } = applyParsedMatrixToGrid(dataMatrix, e.target, {
                startColOverride: 0,
                trimValues: true,
            });

            if (successCount > 0) {
                notifyPasteUser(`Successfully pasted ALIPAY data (${maxRows} rows x ${maxCols} cols)!`, 'success');
            } else {
                notifyPasteUser('No cells were pasted from ALIPAY format.', 'danger');
            }

            return true;
        } else {
            // ALIPAY 模式下解析失败，给出提示但不阻止（让用户知道）
            console.log('ALIPAY parser returned null, data may not match expected format');
            // 不 return，继续尝试其他解析器
        }
  return false;
}

