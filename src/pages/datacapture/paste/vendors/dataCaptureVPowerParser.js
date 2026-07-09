/** VPOWER parser. */

export function parseVPowerTableFormat(pastedData) {
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

    console.log('VPOWER parser - lines:', lines);

    if (lines.length < 2) return null; // 至少需要表头和数据行

    // 检测表头是否包含 VPOWER 格式的特征列
    const firstLine = lines[0].toLowerCase();
    const hasHashColumn = firstLine.includes('#') || /^\s*#\s*/.test(firstLine);
    const hasUserName = firstLine.includes('user name') || firstLine.includes('username');
    const hasProfit = firstLine.includes('profit');

    // 情况1：有表头的格式
    if (hasUserName && hasProfit) {
        console.log('Detected VPOWER table format with header');

        // 解析表头，找到各列的索引
        const headerLine = lines[0];
        const headerCells = headerLine.split(/\t+/).map(c => c.trim());

        // 如果制表符分割失败，尝试按多个空格分割
        let headerCols = headerCells;
        if (headerCells.length < 3) {
            headerCols = headerLine.split(/\s{2,}/).map(c => c.trim());
        }

        // 查找各列的索引
        const hashColIndex = headerCols.findIndex(c => c.toLowerCase().includes('#') || c === '#');
        const userNameColIndex = headerCols.findIndex(c =>
            c.toLowerCase().includes('user name') || c.toLowerCase().includes('username'));
        const profitColIndex = headerCols.findIndex(c =>
            c.toLowerCase().includes('profit'));
        const nameColIndex = headerCols.findIndex(c =>
            c.toLowerCase() === 'name' || c.toLowerCase().includes('name'));
        const telColIndex = headerCols.findIndex(c =>
            c.toLowerCase() === 'tel' || c.toLowerCase().includes('tel'));
        const remarksColIndex = headerCols.findIndex(c =>
            c.toLowerCase().includes('remark'));

        if (userNameColIndex === -1 || profitColIndex === -1) {
            return null;
        }

        console.log('Column indices:', {
            hash: hashColIndex,
            userName: userNameColIndex,
            profit: profitColIndex,
            name: nameColIndex,
            tel: telColIndex,
            remarks: remarksColIndex
        });

        // 解析数据行
        const dataMatrix = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            // 尝试按制表符分割
            let cells = line.split(/\t+/).map(c => c.trim());

            // 如果制表符分割失败，尝试按多个空格分割
            if (cells.length < 3) {
                cells = line.split(/\s{2,}/).map(c => c.trim());
            }

            // 如果还是不够，尝试按单个空格分割（但需要更智能的处理）
            if (cells.length < 3) {
                // 对于这种格式，可能需要更智能的分割
                // 但先尝试简单分割
                const parts = line.split(/\s+/).filter(p => p.trim());
                if (parts.length >= 2) {
                    cells = parts;
                }
            }

            // 提取需要的列（忽略 # 列）
            const userName = cells[userNameColIndex] || '';
            const profit = cells[profitColIndex] || '';

            // 如果 User Name 或 profit 为空，跳过这一行
            if (!userName.trim() && !profit.trim()) {
                continue;
            }

            // 创建数据行：User Name 在第一列，profit 在第二列，其他列留空或设为 "-"
            const row = [];
            row[0] = userName.toUpperCase(); // Column 1: User Name
            row[1] = profit;                // Column 2: profit
            // Column 3-5 可以设为 "-" 或留空（根据第二张图片，它们显示为 "-"）
            row[2] = '-';
            row[3] = '-';
            row[4] = '-';
            // Column 6-9 留空（根据第二张图片，有些行有数据，有些没有）
            row[5] = '';
            row[6] = '';
            row[7] = '';
            row[8] = '';

            dataMatrix.push(row);
        }

        if (dataMatrix.length === 0) {
            return null;
        }

        console.log('Parsed VPOWER data (with header):', dataMatrix);

        return {
            dataMatrix: dataMatrix,
            maxRows: dataMatrix.length,
            maxCols: 9
        };
    }

    // 情况1.5：无表头，但每行是 tab/多空格分隔的 username + profit（常见“复制两列”格式）
    // 例如：
    //   easywin126\t1,866.29
    //   teruskaya777\t552.3
    // 或者用多个空格分隔
    const maybeRowSeparated = lines.length >= 1 && lines.some(l => l.includes('\t') || /\s{2,}/.test(l));
    if (maybeRowSeparated) {
        const dataMatrix = [];

        for (let i = 0; i < lines.length; i++) {
            const line = (lines[i] || '').trim();
            if (!line) continue;

            let cells = line.split(/\t+/).map(c => c.trim());
            if (cells.length < 2) {
                cells = line.split(/\s{2,}/).map(c => c.trim());
            }
            if (cells.length < 2) continue;

            const userName = (cells[0] || '').trim();
            const profit = (cells[1] || '').trim();

            // 基础校验：用户名必须像账号，profit 必须像数字（允许逗号与小数）
            if (!/^[a-z0-9]+$/i.test(userName)) continue;
            if (!/^-?[\d,]+(\.\d+)?$/.test(profit)) continue;

            const row = [];
            row[0] = userName.toUpperCase(); // Column 1: User Name
            row[1] = profit;                // Column 2: profit
            row[2] = '-';
            row[3] = '-';
            row[4] = '-';
            row[5] = '';
            row[6] = '';
            row[7] = '';
            row[8] = '';

            dataMatrix.push(row);
        }

        if (dataMatrix.length > 0) {
            console.log('Detected VPOWER tab/space-separated rows (no header):', dataMatrix.length);
            return {
                dataMatrix,
                maxRows: dataMatrix.length,
                maxCols: 9
            };
        }
    }

    // 情况2：无表头的纯数据格式
    // 支持两种格式：
    // 格式A：有#列 - 每3-6行为一组（#, User Name, profit, -, -, -）
    // 格式B：无#列 - 每2-5行为一组（User Name, profit, -, -, -）

    // 工具：判断“像数字”的字符串（允许逗号与小数）
    const isNumericLike = (v) => {
        const s = (v || '').toString().trim();
        return /^-?[\d,]+(\.\d+)?$/.test(s);
    };

    // 检测格式A：第一行是数字，第二行是用户名，第三行是profit
    const formatA_firstLineIsNumber = /^\d+$/.test(lines[0]);
    const formatA_secondLineIsUsername = lines.length > 1 && /^[a-z0-9]+$/i.test(lines[1]);
    const formatA_thirdLineIsNumber = lines.length > 2 && isNumericLike(lines[2]);

    // 检测格式B：第一行是用户名，第二行是profit
    const formatB_firstLineIsUsername = lines.length > 0 && /^[a-z0-9]+$/i.test(lines[0]);
    const formatB_secondLineIsNumber = lines.length > 1 && isNumericLike(lines[1]);

    console.log('VPOWER format detection:', {
        formatA: { firstLineIsNumber: formatA_firstLineIsNumber, secondLineIsUsername: formatA_secondLineIsUsername, thirdLineIsNumber: formatA_thirdLineIsNumber },
        formatB: { firstLineIsUsername: formatB_firstLineIsUsername, secondLineIsNumber: formatB_secondLineIsNumber },
        firstLine: lines[0],
        secondLine: lines[1],
        thirdLine: lines[2]
    });

    const isFormatA = formatA_firstLineIsNumber && formatA_secondLineIsUsername && formatA_thirdLineIsNumber;
    const isFormatB = formatB_firstLineIsUsername && formatB_secondLineIsNumber;

    if (isFormatA || isFormatB) {
        console.log(`Detected VPOWER pure data format (no header) - Format: ${isFormatA ? 'A (with #)' : 'B (without #)'}`);

        const dataMatrix = [];
        let i = 0;
        const hasHashColumn = isFormatA; // 是否有#列

        while (i < lines.length) {
            let userName, profit, name, tel, remarks;
            let offset = 0;

            if (hasHashColumn) {
                // 格式A：#, User Name, profit, Name, Tel, Remarks
                if (i >= lines.length) break;

                const hashValue = lines[i];      // 第1行：#列（忽略）
                if (i + 1 >= lines.length) break; // 至少需要 User Name
                userName = lines[i + 1];         // 第2行：User Name

                // 第3行：profit（可能不存在或不是数字）
                const maybeProfit = (i + 2 < lines.length) ? lines[i + 2] : '';
                profit = isNumericLike(maybeProfit) ? maybeProfit : '';

                // 第4行：Name（如果存在且不是"-"）
                const maybeName = (i + 3 < lines.length) ? lines[i + 3] : '';
                name = (maybeName && maybeName !== '-') ? maybeName : '-';

                // 第5行：Tel（如果存在，否则设为"-"）
                const maybeTel = (i + 4 < lines.length) ? lines[i + 4] : '';
                tel = (maybeTel && maybeTel !== '') ? maybeTel : '-';

                // 第6行：Remarks（如果存在，否则设为"-"）
                const maybeRemarks = (i + 5 < lines.length) ? lines[i + 5] : '';
                remarks = (maybeRemarks && maybeRemarks !== '') ? maybeRemarks : '-';

                // 计算offset：对于格式A，每组数据最多6行（#, User Name, profit, Name, Tel, Remarks）
                // 如果 profit 存在，至少消耗3行；然后检查后续行是否存在（即使值为"-"也要跳过）
                offset = 2; // # + username（至少）
                if (profit) {
                    offset = 3; // + profit
                    // 检查后续行是否存在（即使值为"-"也要计入offset）
                    if (i + 3 < lines.length) offset = 4; // + Name（即使为"-"）
                    if (i + 4 < lines.length) offset = 5; // + Tel（即使为"-"）
                    if (i + 5 < lines.length) offset = 6; // + Remarks（即使为"-"）
                }

                // 验证第一行是数字（#列）
                if (!/^\d+$/.test(hashValue)) {
                    console.log(`Skipping: hashValue "${hashValue}" is not a number`);
                    i++;
                    continue;
                }
            } else {
                // 格式B：User Name, profit, Name, Tel, Remarks
                if (i >= lines.length) break;

                userName = lines[i];            // 第1行：User Name

                const maybeProfit = (i + 1 < lines.length) ? lines[i + 1] : '';
                profit = isNumericLike(maybeProfit) ? maybeProfit : '';

                // 第3行：Name（如果存在且不是"-"）
                const maybeName = (i + 2 < lines.length) ? lines[i + 2] : '';
                name = (maybeName && maybeName !== '-') ? maybeName : '-';

                // 第4行：Tel（如果存在，否则设为"-"）
                const maybeTel = (i + 3 < lines.length) ? lines[i + 3] : '';
                tel = (maybeTel && maybeTel !== '') ? maybeTel : '-';

                // 第5行：Remarks（如果存在，否则设为"-"）
                const maybeRemarks = (i + 4 < lines.length) ? lines[i + 4] : '';
                remarks = (maybeRemarks && maybeRemarks !== '') ? maybeRemarks : '-';

                // 计算offset：对于格式B，每组数据最多5行（User Name, profit, Name, Tel, Remarks）
                offset = 1; // username（至少）
                if (profit) {
                    offset = 2; // + profit
                    // 检查后续行是否存在（即使值为"-"也要计入offset）
                    if (i + 2 < lines.length) offset = 3; // + Name（即使为"-"）
                    if (i + 3 < lines.length) offset = 4; // + Tel（即使为"-"）
                    if (i + 4 < lines.length) offset = 5; // + Remarks（即使为"-"）
                }
            }

            console.log(`Processing group at index ${i}:`, { userName, profit, name, tel, remarks, hasHashColumn });

            // 验证用户名格式
            if (!/^[a-z0-9]+$/i.test(userName)) {
                console.log(`Skipping: userName "${userName}" is not valid`);
                i++;
                continue;
            }

            // 验证 profit 格式（允许为空：用户可能只复制到 username）
            if (profit && !isNumericLike(profit)) {
                console.log(`Skipping: profit "${profit}" is not a number`);
                i++;
                continue;
            }

            // 创建数据行
            const row = [];
            row[0] = userName.toUpperCase(); // Column 1: User Name
            row[1] = profit || '';            // Column 2: profit（允许空）
            row[2] = name || '-';             // Column 3: Name
            row[3] = tel || '-';              // Column 4: Tel
            row[4] = remarks || '-';         // Column 5: Remarks
            row[5] = '';                      // Column 6
            row[6] = '';                      // Column 7
            row[7] = '';                      // Column 8
            row[8] = '';                      // Column 9

            dataMatrix.push(row);

            // 跳过已处理的行
            i += offset;

            // 如果还有数据，检查是否是下一组的开始
            if (i >= lines.length) break;

            // 跳过可能的额外列（Name, Tel, Remarks 等）
            // 对于格式A（有#列），跳过所有非数字行，直到找到下一个数字（下一组的#）
            // 对于格式B（无#列），跳过所有非用户名行，直到找到下一个用户名
            if (hasHashColumn) {
                // 格式A：跳过所有行直到找到下一个数字（下一组的#列）
                while (i < lines.length && !/^\d+$/.test(lines[i])) {
                    i++;
                }
                // 检查是否找到了下一组
                if (i >= lines.length) break;
                // 验证确实是下一组的开始
                if (!/^\d+$/.test(lines[i])) {
                    console.log(`No more data groups found at index ${i} (expected number)`);
                    break;
                }
            } else {
                // 格式B：跳过所有行直到找到下一个用户名
                // 跳过 "-" 行、空行、以及行号分隔符（2/3/...）
                while (
                    i < lines.length &&
                    (lines[i] === '-' || lines[i] === '' || /^\d+$/.test(lines[i]) || !/^[a-z0-9]+$/i.test(lines[i]))
                ) {
                    i++;
                }
                // 检查是否找到了下一组
                if (i >= lines.length) break;
                // 验证确实是下一组的开始
                if (!/^[a-z0-9]+$/i.test(lines[i])) {
                    console.log(`No more data groups found at index ${i} (expected username)`);
                    break;
                }
            }

            console.log(`Found next group starting at index ${i}: ${lines[i]}`);
        }

        if (dataMatrix.length === 0) {
            return null;
        }

        console.log('Parsed VPOWER data (no header):', dataMatrix);

        return {
            dataMatrix: dataMatrix,
            maxRows: dataMatrix.length,
            maxCols: 9
        };
    }

    // 情况3：列式格式（每个条目占据一列，单元格内包含多行数据）
    // 格式特征：
    // - 每行以数字开头（如 14, 15, 16），后跟游戏平台标识（CQ:, CY:, DG: 等）
    // - 包含货币信息（MYR, SGD 等）
    // - 数据按行排列，但需要按列组织（每列一个条目）
    // - 每个条目可能有多行，新条目以数字+游戏平台标识开始
    // 检测模式：数字开头 + 游戏平台标识（CQ:, CY:, DG: 等，不区分大小写）
    const isColumnFormat = lines.length > 0 &&
        lines.some(line => {
            const trimmed = line.trim();
            // 检测：数字开头 + 游戏平台标识（CQ:, CY:, DG: 等，不区分大小写）
            // 模式1: "14 CQ:CQ9 - KAYA86MYR" 或 "14 Cq:Cq9 - KAYA86MYR"
            // 模式2: "17 CY:AWC RCB988" 或 "17 Cy:Awc Rcb988"
            // 模式3: "18 DG:DREAM GAMING" 或 "18 Dg:Dream Gaming"
            return /^\d+\s+[A-Za-z]{1,3}:[A-Za-z]/i.test(trimmed) ||
                /^\d+\s+[A-Za-z]{2,}\s+[A-Za-z]/i.test(trimmed);
        });

    if (isColumnFormat) {
        console.log('Detected VPOWER column format (each entry in a column with multi-line cells)');

        // 检测条目分隔：每行以数字开头，后跟游戏平台标识
        const entries = [];
        let currentEntry = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // 检查是否是新的条目开始（以数字开头，后跟游戏平台标识，不区分大小写）
            // 模式1: "14 CQ:CQ9 - KAYA86MYR" 或 "14 Cq:Cq9 - KAYA86MYR"
            // 模式2: "17 CY:AWC RCB988 - ALLBET950GM" 或 "17 Cy:Awc Rcb988 - Allbet95ogm"
            // 模式3: "18 DG:DREAM GAMING - I70M" 或 "18 Dg:Dream Gaming - I70M"
            const isNewEntry = /^\d+\s+[A-Za-z]{1,3}:[A-Za-z]/i.test(line) ||
                /^\d+\s+[A-Za-z]{2,}\s+[A-Za-z]/i.test(line);

            if (isNewEntry && currentEntry.length > 0) {
                // 保存前一个条目
                entries.push([...currentEntry]);
                currentEntry = [];
            }

            // 添加到当前条目
            currentEntry.push(line);
        }

        // 保存最后一个条目
        if (currentEntry.length > 0) {
            entries.push(currentEntry);
        }

        if (entries.length === 0) {
            return null;
        }

        console.log('VPOWER column format - found', entries.length, 'entries');
        console.log('VPOWER column format - first entry:', entries[0]);

        // 将每个条目转换为一个单元格（多行数据用换行符连接）
        // 数据矩阵：1行 x N列（每列一个条目）
        const dataMatrix = [];
        const row = [];

        entries.forEach((entry, idx) => {
            // 将条目的所有行用换行符连接
            const cellContent = entry.join('\n');
            row.push(cellContent);
            console.log(`VPOWER column format - entry ${idx + 1}:`, entry.length, 'lines');
        });

        dataMatrix.push(row);

        console.log('VPOWER column format - dataMatrix:', dataMatrix.length, 'rows x', row.length, 'cols');

        return {
            dataMatrix: dataMatrix,
            maxRows: 1,
            maxCols: row.length
        };
    }

    return null;
}
