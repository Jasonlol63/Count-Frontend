/** API_RETURN & 4.RETURN paste. */
import {
  extractReturnExpressionTokens,
  isReturnFormulaLikeCell,
  parseApiReturnFormat,
  parseApiReturnTableFormat,
  smartSplitPreservingDates,
} from "../core/dataCaptureApiReturnParsers.js";


import { applyParsedMatrixToGrid } from "../core/dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

function fillReturnDataMatrix(dataMatrix, anchorCell) {
  return applyParsedMatrixToGrid(dataMatrix, anchorCell, { trimValues: true });
}

/** @returns {boolean} */
export function handleApiReturnPaste(e, pastedData) {
        // 检查是否是多行数据
        const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedData.split('\n').map(line => line.trim()).filter(line => line !== '');

        // 如果是多行数据，逐行处理
        if (lines.length > 1) {
            // 检查是否包含制表符（标准表格格式）
            const hasTabSeparator = lines.some(line => line.includes('\t'));

            const dataMatrix = [];
            let maxCols = 0;
            let hasValidRow = false;

            if (hasTabSeparator) {
                // 如果包含制表符，按制表符分割，检查所有列是否包含公式
                console.log('API-RETURN: Processing', lines.length, 'rows with tab separator');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.includes('\t')) {
                        const cells = line.split('\t').map(c => c.trim());
                        console.log('API-RETURN: Row', i, 'has', cells.length, 'columns');

                        // 处理所有列：去掉标签后的冒号（如 "abc:" -> "abc"）
                        // 注意：不要去掉包含公式的列的冒号
                        for (let colIndex = 0; colIndex < cells.length; colIndex++) {
                            if (cells[colIndex] && cells[colIndex].endsWith(':') && !cells[colIndex].includes('(') &&
                                !cells[colIndex].includes('+') && !cells[colIndex].includes('-') &&
                                !cells[colIndex].includes('*') && !cells[colIndex].includes('/')) {
                                // 如果单元格以冒号结尾且不包含公式，去掉冒号
                                cells[colIndex] = cells[colIndex].slice(0, -1);
                            }
                        }

                        // 检查所有列，找到包含公式的列（有括号和运算符）
                        let formulaFound = false;
                        for (let colIndex = 0; colIndex < cells.length; colIndex++) {
                            const cell = cells[colIndex] || '';

                            // 检查是否包含公式特征
                            // 公式必须满足以下条件：
                            // 1. 包含括号 ( 或 )，或者
                            // 2. 包含冒号和运算符（如 SPORT : (...)
                            // 排除日期格式（如 05-01-2026）
                            // 排除纯文本描述（如 CONTRA ACCOUNT-SPORT- / !-CAPITAL MYR-!）
                            const isDatePattern = /^\d{2}-\d{2}-\d{4}$/.test(cell.trim());
                            const hasParentheses = cell.includes('(') || cell.includes(')');
                            const hasColon = cell.includes(':');
                            const hasMathOperators = cell.includes('+') || cell.includes('*') || cell.includes('/');
                            // 只有包含括号，或者包含冒号和运算符的才认为是公式
                            const hasColonAndOperators = hasColon && (hasParentheses || hasMathOperators);

                            const hasFormula = !isDatePattern &&
                                cell.match(/\d/) && // 包含数字
                                (hasParentheses || hasColonAndOperators);

                            if (hasFormula) {
                                formulaFound = true;
                                console.log('API-RETURN: Row', i, 'Column', colIndex, 'contains formula:', cell);
                                // 解析公式列
                                let parsedFormula = null;

                                // 如果有冒号，先尝试使用parseApiReturnFormat
                                if (cell.includes(':')) {
                                    parsedFormula = parseApiReturnFormat(cell);
                                }

                                // 如果parseApiReturnFormat返回null，或者没有冒号，使用内联解析方法
                                if (!parsedFormula || !parsedFormula.columns || parsedFormula.columns.length === 0) {
                                    // 直接提取数字（包括负数）
                                    let numbers = [];
                                    // 先移除所有括号和空格
                                    let cleanFormula = cell.replace(/[()\s]/g, '');

                                    // 如果有冒号，提取冒号后的部分
                                    if (cell.includes(':')) {
                                        const colonIndex = cell.indexOf(':');
                                        const expression = cell.substring(colonIndex + 1).trim();
                                        cleanFormula = expression.replace(/[()\s]/g, '');
                                    }

                                    // 使用正则表达式匹配所有数字（包括负数）
                                    const numberPattern = /(?:^|[+\-*/])(-?\d+\.?\d*)/g;
                                    let match;

                                    while ((match = numberPattern.exec(cleanFormula)) !== null) {
                                        const num = match[1]; // 获取捕获组（数字部分）
                                        if (num) {
                                            numbers.push(num);
                                        }
                                    }

                                    // 如果正则匹配失败，使用备用方法：按运算符分割
                                    if (numbers.length === 0) {
                                        const parts = cleanFormula.split(/([+\-*/])/);

                                        for (let i = 0; i < parts.length; i++) {
                                            const part = parts[i];
                                            if (part && part !== '+' && part !== '-' && part !== '*' && part !== '/') {
                                                // 检查前一个token是否是单独的-运算符（表示负数）
                                                if (i > 0 && parts[i - 1] === '-' &&
                                                    (i === 1 || parts[i - 2] === '' || /[+\-*/]/.test(parts[i - 2] || ''))) {
                                                    // 这是负数
                                                    const num = '-' + part;
                                                    const numMatch = num.match(/^-?\d+\.?\d*$/);
                                                    if (numMatch) {
                                                        numbers.push(numMatch[0]);
                                                    }
                                                } else {
                                                    // 这是正数或本身就是负数（如 -8700）
                                                    const numMatch = part.match(/^-?\d+\.?\d*$/);
                                                    if (numMatch) {
                                                        numbers.push(numMatch[0]);
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    if (numbers.length > 0) {
                                        // 如果有冒号，添加标签
                                        let label = '';
                                        if (cell.includes(':')) {
                                            const colonIndex = cell.indexOf(':');
                                            label = cell.substring(0, colonIndex).trim();
                                        }
                                        parsedFormula = {
                                            columns: label ? [label, ...numbers] : numbers
                                        };
                                        console.log('API-RETURN: Row', i, 'inline parsing result:', parsedFormula);
                                    }
                                }

                                if (parsedFormula && parsedFormula.columns && parsedFormula.columns.length > 0) {
                                    console.log('API-RETURN: Row', i, 'Column', colIndex, 'parsed formula:', parsedFormula.columns);
                                    const parsedColumns = parsedFormula.columns;

                                    // 如果有标签（第一个元素可能是标签），保留标签但去掉冒号
                                    let label = '';
                                    let numbersToInsert = [];

                                    if (parsedColumns.length > 0) {
                                        // 检查第一个元素是否是标签（包含非数字字符）
                                        const firstElement = parsedColumns[0];
                                        if (firstElement && !/^-?\d+\.?\d*$/.test(firstElement)) {
                                            // 是标签，去掉冒号
                                            label = firstElement.replace(':', '');
                                            numbersToInsert = parsedColumns.slice(1);
                                        } else {
                                            // 不是标签，都是数字
                                            numbersToInsert = parsedColumns;
                                        }
                                    }

                                    console.log('API-RETURN: Row', i, 'label:', label, 'numbers to insert:', numbersToInsert);

                                    // 替换公式列为标签（如果有）
                                    if (label) {
                                        cells[colIndex] = label;
                                    } else {
                                        // 如果没有标签，移除公式列（后面会用数字替换）
                                        cells[colIndex] = '';
                                    }

                                    // 将解析后的数字插入到公式列之后
                                    if (numbersToInsert.length > 0) {
                                        // 如果公式列被清空，直接替换；否则插入
                                        if (!label) {
                                            cells.splice(colIndex, 1, ...numbersToInsert);
                                        } else {
                                            cells.splice(colIndex + 1, 0, ...numbersToInsert);
                                        }
                                    }

                                    console.log('API-RETURN: Row', i, 'final cells after split:', cells);

                                    // 处理完一个公式列后，跳出循环（一次只处理一个公式列）
                                    break;
                                } else {
                                    console.log('API-RETURN: Row', i, 'Column', colIndex, 'formula parsing failed');
                                }
                            }
                        }

                        if (!formulaFound) {
                            console.log('API-RETURN: Row', i, 'no formula column found');
                        }

                        dataMatrix.push(cells);
                        maxCols = Math.max(maxCols, cells.length);
                        hasValidRow = true;
                    } else if (line !== '') {
                        // 没有制表符但非空，作为单列数据
                        dataMatrix.push([line]);
                        maxCols = Math.max(maxCols, 1);
                        hasValidRow = true;
                    }
                }
            } else {
                // 没有制表符，尝试使用 API-RETURN 格式解析每一行
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    // 先尝试表格格式解析（单行）
                    let apiReturnParsed = parseApiReturnTableFormat(line);

                    // 如果表格格式解析失败，尝试单行格式解析
                    if (!apiReturnParsed) {
                        apiReturnParsed = parseApiReturnFormat(line);
                    }

                    if (apiReturnParsed) {
                        const { columns } = apiReturnParsed;
                        dataMatrix.push(columns);
                        maxCols = Math.max(maxCols, columns.length);
                        hasValidRow = true;
                    } else if (line !== '') {
                        // 无法解析的行，作为单列数据
                        dataMatrix.push([line]);
                        maxCols = Math.max(maxCols, 1);
                        hasValidRow = true;
                    }
                }
            }

            // 确保所有行都有相同的列数
            dataMatrix.forEach(row => {
                while (row.length < maxCols) {
                    row.push('');
                }
            });

            if (hasValidRow && dataMatrix.length > 0 && maxCols > 0) {
                const { successCount, maxRows, maxCols: cols } = fillReturnDataMatrix(dataMatrix, e.target);

                if (successCount > 0) {
                    notifyPasteUser(`成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)! 按 Ctrl+Z 可撤销`, 'success');
                } else {
                    notifyPasteUser('No cells were pasted from API-RETURN format.', 'danger');
                }

                recomputeSubmitStateAfterPaste();
                return true;
            }
        } else {
            // 单行数据处理：保留所有列，只解析公式列
            // 先尝试表格格式解析（多列数据，包含 Description 列）
            let apiReturnParsed = parseApiReturnTableFormat(pastedData);

            if (!apiReturnParsed) {
                // 如果表格格式解析失败，尝试通用单行处理：按空格分割，保留所有列，只解析公式列
                const trimmed = pastedData.trim();
                if (trimmed) {
                    // 按空格分割所有列
                    const columns = trimmed.split(/\s+/).filter(c => c.trim() !== '');

                    if (columns.length > 0) {
                        // 处理所有列：去掉标签后的冒号
                        for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                            if (columns[colIndex] && columns[colIndex].endsWith(':') && !columns[colIndex].includes('(')) {
                                columns[colIndex] = columns[colIndex].slice(0, -1);
                            }
                        }

                        // 检查所有列，找到包含公式的列
                        let hasFormula = false;
                        for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                            const cell = columns[colIndex] || '';

                            // 检查是否包含公式特征：括号和运算符
                            const isFormula = (cell.includes('(') || cell.includes('+') ||
                                cell.includes('-') || cell.includes('*') ||
                                cell.includes('/')) &&
                                (cell.includes('(') || cell.match(/\d/));

                            if (isFormula) {
                                hasFormula = true;
                                // 解析公式列
                                let numbers = [];
                                // 先移除所有括号和空格
                                let cleanFormula = cell.replace(/[()\s]/g, '');
                                // 按运算符分割
                                const parts = cleanFormula.split(/([+\-*/])/);

                                parts.forEach(part => {
                                    if (part && part !== '+' && part !== '-' && part !== '*' && part !== '/') {
                                        const numMatch = part.match(/^\d+\.?\d*$/);
                                        if (numMatch) {
                                            numbers.push(numMatch[0]);
                                        }
                                    }
                                });

                                if (numbers.length > 0) {
                                    // 用数字替换公式列
                                    columns.splice(colIndex, 1, ...numbers);
                                }
                                // 处理完一个公式列后，跳出循环（一次只处理一个公式列）
                                break;
                            }
                        }

                        if (hasFormula || columns.length > 0) {
                            apiReturnParsed = {
                                columns: columns,
                                columnCount: columns.length
                            };
                        }
                    }
                }
            }

            if (apiReturnParsed) {
                const { columns, columnCount } = apiReturnParsed;

                const { successCount } = fillReturnDataMatrix([columns], e.target);

                if (successCount > 0) {
                    notifyPasteUser(`Successfully pasted ${successCount} cells in ${columnCount} columns!`, 'success');
                } else {
                    notifyPasteUser('No cells were pasted from API-RETURN format.', 'danger');
                }

                recomputeSubmitStateAfterPaste();
                return true;
            }
        }
  return false;
}

/** @returns {boolean} */
export function handle4ReturnPaste(e, pastedData) {
        console.log('4.RETURN format detected, processing paste data...');
        console.log('Pasted data sample (first 500 chars):', pastedData.substring(0, 500));

        // 4.RETURN 专用：提取公式中的 token（见 extractReturnExpressionTokens）
        const extractReturnTokens = extractReturnExpressionTokens;

        // 4.RETURN：一行内已由 Tab 分列后的单元格数组（就地修改）：去尾冒号、按需展开公式列
        function processReturnRowTabCells(cells, lineNo) {
            const lineTag = `Line ${lineNo}`;
            for (let colIndex = 0; colIndex < cells.length; colIndex++) {
                if (cells[colIndex] && cells[colIndex].endsWith(':') && !cells[colIndex].includes('(')) {
                    cells[colIndex] = cells[colIndex].slice(0, -1);
                }
            }
            for (let colIndex = 0; colIndex < cells.length; colIndex++) {
                const cell = cells[colIndex] || '';
                const isDate = /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(cell) ||
                    /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(cell);
                if (isDate) {
                    continue;
                }

                const hasFormula = isReturnFormulaLikeCell(cell);

                if (hasFormula) {
                    console.log(`4.RETURN: ${lineTag}, Column ${colIndex} contains formula:`, cell);
                    let parsedFormula = null;

                    if (cell.includes(':')) {
                        console.log(`4.RETURN: ${lineTag}, Column ${colIndex} has colon, calling parseApiReturnFormat...`);
                        parsedFormula = parseApiReturnFormat(cell);
                        console.log('4.RETURN: parseApiReturnFormat result:', parsedFormula);
                    } else {
                        console.log(`4.RETURN: ${lineTag}, Column ${colIndex} no colon, extracting numbers directly...`);
                        const numbers = extractReturnTokens(cell);
                        if (numbers.length > 0) parsedFormula = { columns: numbers };
                    }

                    if (parsedFormula && parsedFormula.columns && parsedFormula.columns.length > 0) {
                        console.log(`4.RETURN: ${lineTag}, Column ${colIndex} formula parsed successfully:`, parsedFormula.columns);
                        const parsedColumns = parsedFormula.columns;

                        let label = '';
                        let numbersToInsert = [];

                        if (parsedColumns.length > 0) {
                            const firstElement = parsedColumns[0];
                            if (firstElement && !/^-?\d+\.?\d*$/.test(firstElement)) {
                                label = firstElement.replace(':', '');
                                numbersToInsert = parsedColumns.slice(1);
                                console.log(`4.RETURN: ${lineTag}, Column ${colIndex} has label:`, label, 'numbers:', numbersToInsert);
                            } else {
                                numbersToInsert = parsedColumns;
                                console.log(`4.RETURN: ${lineTag}, Column ${colIndex} no label, numbers:`, numbersToInsert);
                            }
                        }

                        if (label) {
                            cells[colIndex] = label;
                        } else {
                            cells[colIndex] = '';
                        }

                        if (numbersToInsert.length > 0) {
                            console.log(`4.RETURN: ${lineTag}, Inserting ${numbersToInsert.length} numbers after column ${colIndex}`);
                            if (!label) {
                                cells.splice(colIndex, 1, ...numbersToInsert);
                            } else {
                                cells.splice(colIndex + 1, 0, ...numbersToInsert);
                            }
                            console.log(`4.RETURN: ${lineTag}, After insertion, cells:`, cells);
                        }

                        break;
                    } else {
                        console.log(`4.RETURN: ${lineTag}, Column ${colIndex} formula parsing failed or returned empty`);
                    }
                }
            }
        }

        // 检查是否是多行数据
        const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedData.split('\n').map(line => line.trim()).filter(line => line !== '');
        console.log('4.RETURN: Number of lines:', lines.length);

        // 如果是多行数据，逐行处理
        if (lines.length > 1) {
            // 检查是否包含制表符（标准表格格式）
            const hasTabSeparator = lines.some(line => line.includes('\t'));

            const dataMatrix = [];
            let maxCols = 0;
            let hasValidRow = false;

            if (hasTabSeparator) {
                console.log('4.RETURN: Processing with tab separator...');
                // 如果包含制表符，按制表符分割，检查所有列是否包含公式
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.includes('\t')) {
                        const cells = line.split('\t').map(c => c.trim());
                        console.log(`4.RETURN: Line ${i + 1} split into ${cells.length} columns`);

                        processReturnRowTabCells(cells, i + 1);

                        dataMatrix.push(cells);
                        maxCols = Math.max(maxCols, cells.length);
                        hasValidRow = true;
                    } else if (line !== '') {
                        // 没有制表符但非空，作为单列数据
                        dataMatrix.push([line]);
                        maxCols = Math.max(maxCols, 1);
                        hasValidRow = true;
                    }
                }
            } else {
                console.log('4.RETURN: Processing without tab separator, using smart split...');
                // 没有制表符，对每一行使用智能分割并检测公式列
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    console.log(`4.RETURN: Processing line ${i + 1}:`, line.substring(0, 100));

                    // 先尝试表格格式解析（单行，包含完整的表格结构）
                    let apiReturnParsed = parseApiReturnTableFormat(line);

                    if (apiReturnParsed) {
                        console.log(`4.RETURN: Line ${i + 1} parsed by parseApiReturnTableFormat`);
                        const { columns } = apiReturnParsed;
                        dataMatrix.push(columns);
                        maxCols = Math.max(maxCols, columns.length);
                        hasValidRow = true;
                    } else {
                        console.log(`4.RETURN: Line ${i + 1} not parsed by parseApiReturnTableFormat, trying smart split...`);
                        // 如果表格格式解析失败，使用智能分割并检测公式列（类似单行处理）
                        const trimmed = line.trim();
                        if (trimmed) {
                            // 使用智能分割函数，保留日期格式
                            let columns = smartSplitPreservingDates(trimmed);
                            console.log(`4.RETURN: Line ${i + 1} smart split result:`, columns.length, 'columns');

                            if (columns.length > 0) {
                                // 处理所有列：去掉标签后的冒号
                                for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                                    if (columns[colIndex] && columns[colIndex].endsWith(':') && !columns[colIndex].includes('(')) {
                                        columns[colIndex] = columns[colIndex].slice(0, -1);
                                    }
                                }

                                // 检查所有列，找到包含公式的列
                                let hasFormula = false;
                                for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                                    const cell = columns[colIndex] || '';

                                    // 先检查是否是日期格式，如果是日期，跳过公式检测
                                    const isDate = /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(cell) ||
                                        /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(cell);
                                    if (isDate) {
                                        continue; // 跳过日期列
                                    }

                                    // 检查是否包含公式特征：括号和运算符
                                    // 公式应该包含括号或运算符，并且不是简单的数字或日期
                                    const isFormula = isReturnFormulaLikeCell(cell);

                                    if (isFormula) {
                                        console.log(`4.RETURN: Line ${i + 1}, Column ${colIndex} contains formula:`, cell);
                                        hasFormula = true;
                                        // 解析公式列
                                        let parsedFormula = null;

                                        // 如果有冒号，使用parseApiReturnFormat
                                        if (cell.includes(':')) {
                                            parsedFormula = parseApiReturnFormat(cell);
                                        } else {
                                            // 如果没有冒号，直接提取数字（支持 .11 / [1] 等 RETURN 特殊写法）
                                            const numbers = extractReturnTokens(cell);
                                            if (numbers.length > 0) {
                                                parsedFormula = { columns: numbers };
                                            }
                                        }

                                        if (parsedFormula && parsedFormula.columns && parsedFormula.columns.length > 0) {
                                            const parsedColumns = parsedFormula.columns;

                                            // 如果有标签（第一个元素可能是标签），保留标签但去掉冒号
                                            let label = '';
                                            let numbersToInsert = [];

                                            if (parsedColumns.length > 0) {
                                                // 检查第一个元素是否是标签（包含非数字字符）
                                                const firstElement = parsedColumns[0];
                                                if (firstElement && !/^-?\d+\.?\d*$/.test(firstElement)) {
                                                    // 是标签，去掉冒号
                                                    label = firstElement.replace(':', '');
                                                    numbersToInsert = parsedColumns.slice(1);
                                                } else {
                                                    // 不是标签，都是数字
                                                    numbersToInsert = parsedColumns;
                                                }
                                            }

                                            // 替换公式列为标签（如果有）
                                            if (label) {
                                                columns[colIndex] = label;
                                            } else {
                                                // 如果没有标签，移除公式列（后面会用数字替换）
                                                columns[colIndex] = '';
                                            }

                                            // 将解析后的数字插入到公式列之后
                                            if (numbersToInsert.length > 0) {
                                                // 如果公式列被清空，直接替换；否则插入
                                                if (!label) {
                                                    columns.splice(colIndex, 1, ...numbersToInsert);
                                                } else {
                                                    columns.splice(colIndex + 1, 0, ...numbersToInsert);
                                                }
                                            }
                                        }
                                        // 处理完一个公式列后，跳出循环（一次只处理一个公式列）
                                        break;
                                    }
                                }

                                dataMatrix.push(columns);
                                maxCols = Math.max(maxCols, columns.length);
                                hasValidRow = true;
                            } else if (line !== '') {
                                // 无法解析的行，作为单列数据
                                dataMatrix.push([line]);
                                maxCols = Math.max(maxCols, 1);
                                hasValidRow = true;
                            }
                        } else if (line !== '') {
                            // 空行但非空，作为单列数据
                            dataMatrix.push([line]);
                            maxCols = Math.max(maxCols, 1);
                            hasValidRow = true;
                        }
                    }
                }
            }

            // 确保所有行都有相同的列数
            dataMatrix.forEach(row => {
                while (row.length < maxCols) {
                    row.push('');
                }
            });

            if (hasValidRow && dataMatrix.length > 0 && maxCols > 0) {
                const { successCount, maxRows, maxCols: cols } = fillReturnDataMatrix(dataMatrix, e.target);

                console.log('4.RETURN: Multi-line processing completed. Success count:', successCount, 'Rows:', maxRows, 'Cols:', cols);
                if (successCount > 0) {
                    notifyPasteUser(`成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)! 按 Ctrl+Z 可撤销`, 'success');
                } else {
                    console.log('4.RETURN: No cells were pasted from multi-line format.');
                    notifyPasteUser('No cells were pasted from 4.RETURN format.', 'danger');
                }

                recomputeSubmitStateAfterPaste();
                return true;
            }
        } else {
            console.log('4.RETURN: Single-line data detected');
            const singleNormalized = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
            let apiReturnParsed = null;

            // Excel/报表单行复制：列间为 Tab；若先走 smartSplit 会把 01/04/2026 按 / 拆成多列
            if (singleNormalized.includes('\t')) {
                const cells = singleNormalized.split('\t').map(c => c.trim());
                console.log('4.RETURN: Single-line tab split into', cells.length, 'columns');
                processReturnRowTabCells(cells, 1);
                apiReturnParsed = {
                    columns: cells,
                    columnCount: cells.length
                };
            }

            if (!apiReturnParsed) {
                apiReturnParsed = parseApiReturnTableFormat(pastedData);
            }

            if (!apiReturnParsed) {
                console.log('4.RETURN: parseApiReturnTableFormat failed, trying smart split...');
                // 如果表格格式解析失败，尝试通用单行处理：使用智能分割保留日期，只解析公式列
                const trimmed = pastedData.trim();
                if (trimmed) {
                    // 使用智能分割函数，保留日期格式
                    const columns = smartSplitPreservingDates(trimmed);
                    console.log('4.RETURN: Smart split result:', columns.length, 'columns');

                    if (columns.length > 0) {
                        // 处理所有列：去掉标签后的冒号
                        for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                            if (columns[colIndex] && columns[colIndex].endsWith(':') && !columns[colIndex].includes('(')) {
                                columns[colIndex] = columns[colIndex].slice(0, -1);
                            }
                        }

                        processReturnRowTabCells(columns, 1);

                        if (columns.length > 0) {
                            apiReturnParsed = {
                                columns: columns,
                                columnCount: columns.length
                            };
                        }
                    }
                }
            }

            if (apiReturnParsed) {
                const { columns, columnCount } = apiReturnParsed;

                const { successCount } = fillReturnDataMatrix([columns], e.target);

                if (successCount > 0) {
                    notifyPasteUser(`Successfully pasted ${successCount} cells in ${columnCount} columns!`, 'success');
                } else {
                    notifyPasteUser('No cells were pasted from 4.RETURN format.', 'danger');
                }

                recomputeSubmitStateAfterPaste();
                return true;
            }
        }
  return false;
}

