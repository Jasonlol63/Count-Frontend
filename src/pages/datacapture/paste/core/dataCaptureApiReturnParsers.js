/** API-RETURN / 4.RETURN parsers. */

/**
 * Whether a cell should be split as a RETURN formula/description column.
 * Supports `LABEL : (expr)` from Transaction Payment (label may contain letters)
 * and pure numeric expressions without a label.
 */
export function isReturnFormulaLikeCell(raw) {
    if (raw === null || raw === undefined) return false;
    const cell = String(raw).trim();
    if (!cell) return false;

    const isDatePattern =
        /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(cell) || /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(cell);
    if (isDatePattern) return false;

    if (!/\d/.test(cell)) return false;

    const hasParentheses = cell.includes("(") || cell.includes(")");
    const hasColon = cell.includes(":");
    const hasMathOperators =
        cell.includes("+") || cell.includes("-") || cell.includes("*") || cell.includes("/");
    const hasColonAndOperators = hasColon && (hasParentheses || hasMathOperators);

    if (hasParentheses || hasColonAndOperators) return true;

    // LABEL : 2427.51 — simple label + value after colon
    if (hasColon) {
        const afterColon = cell.substring(cell.indexOf(":") + 1).trim();
        if (afterColon && /\d/.test(afterColon)) {
            return true;
        }
    }

    // Pure numeric formula (no label letters), e.g. 681.19*.11*[1]
    if (/[A-Za-z]/.test(cell)) return false;
    const numericOnly = cell.replace(/,/g, "");
    if (/^-?\d+(?:\.\d+)?$/.test(numericOnly)) return false;
    return /[+\-*/()[\]]/.test(cell);
}

/** Extract numeric tokens from a RETURN expression (handles .11, [1], unary minus). */
export function extractReturnExpressionTokens(cell) {
    if (!cell) return [];
    const s = String(cell)
        .replace(/\s+/g, "")
        .replace(/,/g, "")
        .replace(/\[([^\]]+)\]/g, "$1");

    const tokens = [];
    const isDigit = (c) => c >= "0" && c <= "9";
    const isOp = (c) => c === "+" || c === "-" || c === "*" || c === "/";

    const normalizeDotDecimalToPercent = (numStr) => {
        if (numStr.startsWith(".")) {
            const n = Number("0" + numStr);
            if (Number.isFinite(n)) {
                const pct = n * 100;
                const rounded = Math.round(pct * 1000000) / 1000000;
                return Number.isInteger(rounded) ? String(rounded) : String(rounded);
            }
        }
        return numStr;
    };

    let i = 0;
    while (i < s.length) {
        let sign = "";

        if ((s[i] === "+" || s[i] === "-") && i + 1 < s.length && (isDigit(s[i + 1]) || s[i + 1] === ".")) {
            const prev = i === 0 ? "" : s[i - 1];
            const isUnary = i === 0 || prev === "(" || prev === "[" || isOp(prev);
            if (isUnary) {
                sign = s[i];
                i++;
            }
        }

        if (i < s.length && (isDigit(s[i]) || s[i] === ".")) {
            const start = i;
            if (isDigit(s[i])) {
                while (i < s.length && isDigit(s[i])) i++;
            }
            if (i < s.length && s[i] === ".") {
                i++;
                while (i < s.length && isDigit(s[i])) i++;
            }

            let numStr = s.slice(start, i);
            if (numStr) {
                numStr = normalizeDotDecimalToPercent(numStr);
                tokens.push((sign === "-" ? "-" : "") + numStr);
            }
            continue;
        }

        i++;
    }

    return tokens;
}

export function smartSplitPreservingDates(text) {
    if (!text || typeof text !== 'string') return [];

    // 首先尝试按多个空格（2个或更多）分割
    const multiSpaceSplit = text.split(/\s{2,}/).map(part => part.trim()).filter(part => part !== '');
    if (multiSpaceSplit.length >= 8) {
        return multiSpaceSplit;
    }

    // 如果多个空格分割不够，使用智能单空格分割，但要合并日期部分和公式列
    const words = text.split(/\s+/).filter(w => w.trim() !== '');
    if (words.length < 8) {
        return words;
    }

    // 合并日期部分和公式列：检测日期模式和公式模式并合并
    // 日期模式：DD-MM-YYYY, DD/MM/YYYY, 或 DD MM YYYY
    // 公式模式：包含冒号和括号/运算符的列（如 "ALIPAY95 : (-4934.32)" 或 "ROLLEX : 0*0.20+0-0"）
    const result = [];
    let i = 0;
    while (i < words.length) {
        const word = words[i];

        // 检查是否是日期的一部分（DD格式，后面跟着MM和YYYY）
        // 日期模式：DD-MM-YYYY 或 DD/MM/YYYY (已经是一个词)
        if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(word)) {
            // 已经是完整日期格式（带-或/）
            result.push(word);
            i++;
        } else if (/^\d{2}$/.test(word) && i + 2 < words.length) {
            // 可能是 DD MM YYYY 格式的开始
            const next1 = words[i + 1];
            const next2 = words[i + 2];

            // 检查是否是日期模式：DD MM YYYY
            if (/^\d{2}$/.test(next1) && /^\d{4}$/.test(next2)) {
                // 合并为日期
                result.push(`${word}-${next1}-${next2}`);
                i += 3;
            } else {
                result.push(word);
                i++;
            }
        } else if (word.includes(':') && (() => {
            const afterColon = word.substring(word.indexOf(':') + 1).trim();
            return afterColon && (afterColon.includes('(') || /[+\-*/]/.test(afterColon) || /\d/.test(afterColon));
        })()) {
            // 检测到公式列的开始（包含冒号和运算符）
            // 尝试合并后续的词，直到找到完整的公式或遇到明显的列分隔
            let formulaCol = word;
            let j = i + 1;

            // 检查下一个词是否应该合并到公式列中
            while (j < words.length) {
                const nextWord = words[j];

                // 如果下一个词包含运算符或括号，可能是公式的一部分
                const labelValueComplete = /^[A-Za-z][A-Za-z0-9]*\s*:\s*[\d,.+-]+$/.test(formulaCol.trim()) &&
                    !formulaCol.includes('(');
                if (labelValueComplete) {
                    break;
                }

                if (nextWord.includes('(') || nextWord.includes(')') ||
                    nextWord.includes('+') || nextWord.includes('-') ||
                    nextWord.includes('*') || nextWord.includes('/') ||
                    /^[-\d.]+$/.test(nextWord)) {
                    // 可能是公式的一部分，合并
                    formulaCol += ' ' + nextWord;
                    j++;

                    // 如果已经包含完整的括号对，可能是公式的结束
                    const openParens = (formulaCol.match(/\(/g) || []).length;
                    const closeParens = (formulaCol.match(/\)/g) || []).length;
                    if (openParens > 0 && openParens === closeParens && !nextWord.includes('(')) {
                        // 括号已平衡，可能是公式结束
                        break;
                    }
                } else {
                    // 不是公式的一部分，停止合并
                    break;
                }
            }

            result.push(formulaCol);
            i = j;
        } else {
            result.push(word);
            i++;
        }
    }

    return result;
}

export function parseApiReturnTableFormat(pastedData) {
    if (!pastedData || typeof pastedData !== 'string') return null;

    const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedData.split('\n').map(line => line.trim()).filter(line => line !== '');

    // 只处理单行数据
    if (lines.length !== 1) return null;

    const singleLine = lines[0];

    // 使用智能分割函数，保留日期格式
    const columns = smartSplitPreservingDates(singleLine);

    if (columns.length < 8) {
        return null;
    }

    // 查找 Description 列（包含冒号和运算符的列，通常是第9列）
    // 如果 Description 列被多个空格分割成多部分，需要合并
    let descriptionIndex = -1;
    let descriptionCol = '';

    // 首先尝试找到 Description 列（冒号 + 数字/公式）
    for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (!col.includes(':')) continue;
        const afterColon = col.substring(col.indexOf(':') + 1).trim();
        if (!afterColon || !/\d/.test(afterColon)) continue;
        descriptionIndex = i;
        descriptionCol = col;
        break;
    }

    // 如果找不到完整的 Description 列，尝试合并相邻的列
    // 例如："KING855" 和 ":(11860.00+...)" 需要合并
    if (descriptionIndex === -1) {
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            if (col.includes(':')) {
                // 找到包含冒号的列，检查是否需要合并下一列
                let mergedCol = col;
                let mergeCount = 0;

                // 尝试合并后续列，直到找到运算符
                for (let j = i + 1; j < columns.length && j < i + 3; j++) {
                    mergedCol += ' ' + columns[j];
                    mergeCount++;
                    if (mergedCol.includes('(') || mergedCol.includes('+') || mergedCol.includes('-') ||
                        mergedCol.includes('*') || mergedCol.includes('/')) {
                        descriptionIndex = i;
                        descriptionCol = mergedCol;
                        // 更新 columns 数组：替换当前列为合并后的列，移除已合并的后续列
                        columns[i] = mergedCol;
                        for (let k = 0; k < mergeCount; k++) {
                            columns.splice(i + 1, 1);
                        }
                        break;
                    }
                }

                if (descriptionIndex !== -1) break;
            }
        }
    }

    // 如果还是找不到 Description 列，返回 null
    if (descriptionIndex === -1 || !descriptionCol) return null;

    // 确保 columns 数组中 descriptionIndex 位置的值是正确的
    if (columns[descriptionIndex] !== descriptionCol) {
        columns[descriptionIndex] = descriptionCol;
    }

    console.log('Using API-RETURN table format parser');
    console.log('Input columns:', columns);
    console.log('Description column index:', descriptionIndex);
    console.log('Description column:', descriptionCol);

    // 解析 Description 列
    const parsedDescription = parseApiReturnDescription(descriptionCol);

    if (!parsedDescription || parsedDescription.length === 0) {
        return null;
    }

    // 构建新的列数组：保留 Description 列之前的所有列，插入解析后的 Description 列，保留 Description 列之后的所有列
    const newColumns = [];

    // 添加 Description 列之前的所有列
    for (let i = 0; i < descriptionIndex; i++) {
        newColumns.push(columns[i]);
    }

    // 添加解析后的 Description 列
    parsedDescription.forEach(col => {
        newColumns.push(col);
    });

    // 添加 Description 列之后的所有列
    for (let i = descriptionIndex + 1; i < columns.length; i++) {
        newColumns.push(columns[i]);
    }

    console.log('Parsed result columns:', newColumns);

    return {
        columns: newColumns,
        columnCount: newColumns.length
    };
}

// 解析 Description 列内容
// 输入：KING855 : (11860.00+138790.00*0.008+138790.00*0.001/0.90)*(0.225)
// 输出：['KING855:', '11860.00', '138790.00', '0.008', '138790.00', '0.001', '0.90', '0.225']
export function parseApiReturnDescription(description) {
    if (!description || typeof description !== 'string') return null;

    const trimmed = description.trim();
    if (!trimmed) return null;

    const result = [];

    // 1. 提取冒号前的标签（如 KING855）
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
        const label = trimmed.substring(0, colonIndex).trim();
        if (label) {
            result.push(label + ':');
        }
    }

    // 2. 提取表达式部分（冒号后的内容）
    const expression = colonIndex >= 0 ? trimmed.substring(colonIndex + 1).trim() : trimmed;

    // 3. 按运算符分割提取数字（包括负数）
    // 先移除所有括号和空格
    let cleanFormula = expression.replace(/[()\s]/g, '');

    // 使用正则表达式匹配所有数字（包括负数）
    // 匹配模式：数字可以以-开头（负数），后面跟着数字和小数点
    // 使用单词边界或运算符来确保正确匹配
    const numberPattern = /(?:^|[+\-*/])(-?\d+\.?\d*)/g;
    const numbers = [];
    let match;

    while ((match = numberPattern.exec(cleanFormula)) !== null) {
        const num = match[1]; // 获取捕获组（数字部分）
        if (num) {
            numbers.push(num);
        }
    }

    // 如果正则匹配失败，使用备用方法：按运算符分割
    if (numbers.length === 0) {
        // 按运算符分割，但保留运算符
        const tokens = cleanFormula.split(/([+\-*/])/);

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token && token !== '+' && token !== '-' && token !== '*' && token !== '/') {
                // 检查前一个token是否是单独的-运算符（表示负数）
                if (i > 0 && tokens[i - 1] === '-' &&
                    (i === 1 || tokens[i - 2] === '' || /[+\-*/]/.test(tokens[i - 2] || ''))) {
                    // 这是负数
                    const num = '-' + token;
                    const numMatch = num.match(/^-?\d+\.?\d*$/);
                    if (numMatch) {
                        numbers.push(numMatch[0]);
                    }
                } else {
                    // 这是正数
                    const numMatch = token.match(/^\d+\.?\d*$/);
                    if (numMatch) {
                        numbers.push(numMatch[0]);
                    }
                }
            }
        }
    }

    // 将提取的数字添加到结果中
    numbers.forEach(num => {
        result.push(num);
    });

    // 如果上面的方法没有提取到数字，回退到原来的正则表达式方法
    if (result.length === (colonIndex > 0 ? 1 : 0)) {
        const numberPattern = /-?\d+\.\d+|-?\d+/g;
        const numbers = expression.match(numberPattern);

        if (numbers && numbers.length > 0) {
            // 清空之前的结果（只保留标签）
            const labelOnly = colonIndex > 0 ? [result[0]] : [];
            result.length = 0;
            result.push(...labelOnly);

            // 将提取的数字添加到结果中
            numbers.forEach(num => {
                result.push(num);
            });
        }
    }

    return result.length > 0 ? result : null;
}

// API-RETURN 格式解析函数（单行格式，保持向后兼容）
// 解析格式：KING855: (11860.00+138790.00*0.008+138790.00*0.001/0.90)*(0.225)
// 输出：['KING855', '11860.00', '138790.00', '0.008', '138790.00', '0.001', '0.90', '0.225']
export function parseApiReturnFormat(pastedData) {
    if (!pastedData || typeof pastedData !== 'string') return null;

    // 去除首尾空白
    const trimmed = pastedData.trim();
    if (!trimmed) return null;

    const hasColon = trimmed.includes(':');
    const hasOperators = trimmed.includes('(') || trimmed.includes('+') || trimmed.includes('-') ||
        trimmed.includes('*') || trimmed.includes('/');

    if (!hasOperators && !hasColon) {
        return null;
    }

    console.log('Using API-RETURN format parser');
    console.log('Input:', trimmed);

    const result = [];

    // 1. 提取冒号前的标签（如 KING855）
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
        const label = trimmed.substring(0, colonIndex).trim();
        if (label) {
            result.push(label);
        }
    }

    // 2. 提取表达式部分（冒号后的内容，如果没有冒号就是整个字符串）
    const expression = colonIndex >= 0 ? trimmed.substring(colonIndex + 1).trim() : trimmed;

    // 3. 提取数字
    // 如果表达式包含括号，说明是公式，需要正确处理减号（减号可能是负数符号或运算符）
    let numbers = [];
    if (expression.includes('(') || expression.includes(')')) {
        // 公式格式：按运算符分割提取数字（包括负数）
        let cleanFormula = expression.replace(/[()\s]/g, '');

        // 使用正则表达式匹配所有数字（包括负数）
        // 匹配模式：数字可以以-开头（负数），后面跟着数字和小数点
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
    } else {
        numbers = extractReturnExpressionTokens(expression);
        if (numbers.length === 0) {
            const numberPattern = /-?\d+\.\d+|-?\d+/g;
            const matchedNumbers = expression.match(numberPattern);
            if (matchedNumbers) {
                numbers = matchedNumbers;
            }
        }
    }

    if (numbers.length > 0) {
        // 将提取的数字添加到结果中
        numbers.forEach(num => {
            result.push(num);
        });
    }

    // 如果至少提取到了标签或数字，返回结果
    if (result.length > 0) {
        console.log('Parsed result:', result);
        return {
            columns: result,
            columnCount: result.length
        };
    }

    return null;
}
