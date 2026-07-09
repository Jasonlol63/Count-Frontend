/** AGENT_LINK parser. */

export function parseAgentLinkTableFormat(pastedData) {
    if (!pastedData || typeof pastedData !== 'string') return null;

    // 去除可能的引号
    let cleanData = pastedData.trim();
    if ((cleanData.startsWith('"') && cleanData.endsWith('"')) ||
        (cleanData.startsWith("'") && cleanData.endsWith("'"))) {
        cleanData = cleanData.slice(1, -1);
    }

    const normalizedData = cleanData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedData.split('\n').map(line => {
        // 去除每行的引号
        let trimmed = line.trim();
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            trimmed = trimmed.slice(1, -1);
        }
        return trimmed;
    }).filter(line => line !== '');

    console.log('PS3838 parser - lines:', lines.length);
    if (lines.length > 0) {
        console.log('PS3838 parser - first line:', lines[0].substring(0, 200));
        console.log('PS3838 parser - first line has tabs:', lines[0].includes('\t'));
    }

    if (lines.length < 1) return null;

    // 检查是否是"一行一个单元格"格式（每行只有一个值，没有制表符）
    const isOneCellPerLine = lines.every(line => !line.includes('\t') && line.split(/\s{2,}/).length <= 1);

    if (isOneCellPerLine) {
        console.log('PS3838: Detected one-cell-per-line format, will group into rows');

        // 将所有单元格提取出来
        const allCells = lines.map(line => line.trim()).filter(cell => cell !== '');
        console.log('PS3838: Total cells extracted:', allCells.length);

        // 检测行标识符：BCA10A1, BCA10A2, Total 等
        const rowIdentifierIndices = [];
        const rowIdentifierValues = [];
        for (let i = 0; i < allCells.length; i++) {
            const cell = (allCells[i] || '').trim();
            const upperCell = cell.toUpperCase();

            // 检测行标识符：
            // 1. "Total"（不区分大小写）
            // 2. 以字母开头且包含数字的代码（如 BCA10A1, BCA10A2），长度至少6个字符
            // 3. 纯数字（可能是行号，如 "2"）
            let isIdentifier = false;
            if (upperCell === 'TOTAL') {
                isIdentifier = true;
            } else if (cell.match(/^[A-Z]{2,}\d+[A-Z]?\d*$/i) && cell.length >= 6) {
                isIdentifier = true;
            } else if (cell.match(/^\d+$/) && i > 0 && i < allCells.length - 1) {
                // 检查前后是否是标识符，如果是，这个数字可能是行号
                const prevCell = (allCells[i - 1] || '').trim().toUpperCase();
                const nextCell = (allCells[i + 1] || '').trim();
                if (nextCell.match(/^[A-Z]{2,}\d+[A-Z]?\d*$/i) && nextCell.length >= 6) {
                    // 数字后面跟着标识符，这个数字可能是行号，不算标识符
                    isIdentifier = false;
                } else if (prevCell === 'TOTAL' || (prevCell.match(/^[A-Z]{2,}\d+[A-Z]?\d*$/i) && prevCell.length >= 6)) {
                    // 数字前面是标识符，这个数字可能是行号，不算标识符
                    isIdentifier = false;
                }
            }

            if (isIdentifier) {
                rowIdentifierIndices.push(i);
                rowIdentifierValues.push(cell);
                console.log(`PS3838: Found row identifier "${cell}" at index ${i}`);
            }
        }

        // 根据行标识符的位置精确分割每一行
        const dataMatrix = [];
        let maxCols = 0;

        if (rowIdentifierIndices.length >= 2) {
            // 有多个行标识符，根据它们的位置精确分割
            console.log(`PS3838: Splitting rows based on ${rowIdentifierIndices.length} row identifiers`);

            for (let i = 0; i < rowIdentifierIndices.length; i++) {
                const startIndex = rowIdentifierIndices[i];
                const endIndex = (i + 1 < rowIdentifierIndices.length)
                    ? rowIdentifierIndices[i + 1]
                    : allCells.length;

                // 提取这一行的所有单元格
                const rowData = [];
                const identifierValue = rowIdentifierValues[i];
                const isTotalRow = identifierValue.toUpperCase() === 'TOTAL';

                // 如果是 Total 行，第一个单元格是 "Total"，然后需要插入3个空列
                if (isTotalRow && startIndex < allCells.length) {
                    // 添加 "Total" 作为第一列
                    rowData.push(allCells[startIndex]);
                    // 插入3个空列（对应 Username, Name, Level）
                    rowData.push('', '', '');
                    // 添加剩余的数据（从 startIndex + 1 开始，因为 startIndex 已经是 "Total"）
                    for (let j = startIndex + 1; j < endIndex; j++) {
                        rowData.push(allCells[j]);
                    }
                } else {
                    // 普通行：直接提取所有单元格
                    for (let j = startIndex; j < endIndex; j++) {
                        rowData.push(allCells[j]);
                    }
                }

                dataMatrix.push(rowData);
                maxCols = Math.max(maxCols, rowData.length);

                console.log(`PS3838: Row ${i + 1} (${rowIdentifierValues[i]}): ${rowData.length} columns (indices ${startIndex} to ${endIndex - 1})`);
            }
        } else if (rowIdentifierIndices.length === 1) {
            // 只有一个行标识符，假设它是第一行的开始
            const firstRowStart = rowIdentifierIndices[0];

            // 尝试推断其他行的位置
            // 如果标识符在索引0，尝试使用总单元格数除以3来推断每行的列数
            const estimatedCols = Math.ceil(allCells.length / 3);

            if (firstRowStart === 0 && estimatedCols >= 15 && estimatedCols <= 25) {
                // 第一行从索引0开始
                console.log(`PS3838: Single identifier at start, using estimated ${estimatedCols} cols per row`);

                for (let row = 0; row < 3; row++) {
                    const startIndex = row * estimatedCols;
                    const endIndex = Math.min((row + 1) * estimatedCols, allCells.length);
                    const rowData = [];

                    for (let j = startIndex; j < endIndex; j++) {
                        rowData.push(allCells[j]);
                    }

                    dataMatrix.push(rowData);
                    maxCols = Math.max(maxCols, rowData.length);
                }
            } else {
                // 标识符不在开始位置，使用标识符位置作为第一行的列数
                const firstRowCols = firstRowStart;
                console.log(`PS3838: Single identifier at index ${firstRowStart}, using ${firstRowCols} cols for first row`);

                // 第一行：从索引0到标识符位置
                const firstRow = allCells.slice(0, firstRowStart);
                dataMatrix.push(firstRow);
                maxCols = Math.max(maxCols, firstRow.length);

                // 剩余数据按相同列数分组
                const remainingCells = allCells.slice(firstRowStart);
                const remainingCols = Math.ceil(remainingCells.length / 2); // 假设还有2行

                for (let row = 0; row < 2 && remainingCells.length > 0; row++) {
                    const startIndex = row * remainingCols;
                    const endIndex = Math.min((row + 1) * remainingCols, remainingCells.length);
                    const rowData = remainingCells.slice(startIndex, endIndex);
                    dataMatrix.push(rowData);
                    maxCols = Math.max(maxCols, rowData.length);
                }
            }
        } else {
            // 没有找到行标识符，尝试使用总单元格数除以3来推断列数
            const estimatedCols = Math.ceil(allCells.length / 3);
            console.log(`PS3838: No identifiers found, using estimated ${estimatedCols} cols per row`);

            if (estimatedCols >= 15 && estimatedCols <= 25) {
                for (let row = 0; row < 3; row++) {
                    const startIndex = row * estimatedCols;
                    const endIndex = Math.min((row + 1) * estimatedCols, allCells.length);
                    const rowData = allCells.slice(startIndex, endIndex);
                    dataMatrix.push(rowData);
                    maxCols = Math.max(maxCols, rowData.length);
                }
            } else {
                // 使用默认值：3行，20列
                console.log('PS3838: No identifiers found, using default 3 rows x 20 cols');
                for (let row = 0; row < 3; row++) {
                    const startIndex = row * 20;
                    const endIndex = Math.min((row + 1) * 20, allCells.length);
                    const rowData = allCells.slice(startIndex, endIndex);
                    dataMatrix.push(rowData);
                    maxCols = Math.max(maxCols, rowData.length);
                }
            }
        }

        // 确保所有行的列数相同（用空字符串填充）
        dataMatrix.forEach(row => {
            while (row.length < maxCols) {
                row.push('');
            }
        });

        const columnCount = maxCols;

        console.log('PS3838: Grouped into', dataMatrix.length, 'rows x', maxCols, 'cols');
        if (dataMatrix.length > 0) {
            console.log('PS3838: First row sample:', dataMatrix[0].slice(0, 5));
            if (dataMatrix.length > 1) {
                console.log('PS3838: Second row sample:', dataMatrix[1].slice(0, 5));
            }
            if (dataMatrix.length > 2) {
                console.log('PS3838: Third row sample:', dataMatrix[2].slice(0, 5));
            }
        }

        return {
            dataMatrix: dataMatrix,
            maxRows: dataMatrix.length,
            maxCols: maxCols
        };
    } else {
        // 标准格式：每行包含多个单元格（用制表符或空格分隔）
        console.log('PS3838: Standard format detected (multiple cells per line)');

        const dataMatrix = [];
        lines.forEach((line, lineIndex) => {
            if (!line.trim()) return;

            let cells = [];

            // 优先尝试按制表符分割
            if (line.includes('\t')) {
                cells = line.split('\t').map(c => c.trim());
            } else {
                // 尝试按多个空格分割
                const multiSpaceSplit = line.split(/\s{2,}/).map(c => c.trim());
                if (multiSpaceSplit.length >= 5) {
                    cells = multiSpaceSplit;
                } else {
                    // 按单个空格分割（可能不准确）
                    cells = line.split(/\s+/).filter(p => p.trim());
                }
            }

            if (cells.length > 0) {
                dataMatrix.push(cells);
            }
        });

        if (dataMatrix.length === 0) {
            return null;
        }

        // 确保所有行的列数相同
        let maxCols = Math.max(...dataMatrix.map(row => row.length));
        dataMatrix.forEach(row => {
            while (row.length < maxCols) {
                row.push('');
            }
        });

        console.log('PS3838: Parsed standard format:', dataMatrix.length, 'rows x', maxCols, 'cols');

        return {
            dataMatrix: dataMatrix,
            maxRows: dataMatrix.length,
            maxCols: maxCols
        };
    }
}
