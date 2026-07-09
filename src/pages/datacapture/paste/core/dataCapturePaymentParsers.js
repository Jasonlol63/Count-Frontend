/** Payment report parsers (generic paste). */

export function parseSimplePaymentReport(pastedData) {
    if (!pastedData || typeof pastedData !== 'string') return null;

    const lower = pastedData.toLowerCase();
    // 同时包含这些关键字，基本可以确认是这类付款报表
    if (!lower.includes('overall') ||
        !lower.includes('downline payment') ||
        !lower.includes('profit/loss')) {
        return null;
    }

    console.log('Using structured payment parser for Overall/Downline report');

    // 标准化换行
    let lines = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // 去掉首尾全空行
    while (lines.length && lines[0].trim() === '') lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

    // 小工具：把行按“制表符或多个空格”拆成单元格
    const splitLine = (line) => {
        if (line.includes('\t')) {
            return line.split('\t').map(c => (c || '').trim()).filter(c => c !== '');
        }
        const cells = line.split(/\s{2,}/).map(c => (c || '').trim());
        return cells.filter(c => c !== '');
    };

    // 1) 找 Overall 那一行
    const overallIndex = lines.findIndex(l => l.toLowerCase().includes('overall'));
    if (overallIndex === -1) return null;
    const overallTokens = splitLine(lines[overallIndex]);
    // 期望形如：Overall 1030 $7.21 721 $18.75 ... $25.96 ($619.96)
    if (overallTokens.length < 7) return null;

    // 2) 找 My Earnings 那一行（如果有的话）
    const myEarningsIndex = lines.findIndex(l => l.toLowerCase().includes('my earnings'));
    let myEarningsTokens = null;
    if (myEarningsIndex !== -1) {
        myEarningsTokens = splitLine(lines[myEarningsIndex]);
    }

    // 3) 找 Downline Payment 段落
    const downlineIndex = lines.findIndex(l => l.toLowerCase().includes('downline payment'));
    if (downlineIndex === -1) return null;

    // 4) 找 MG / PL 段落
    const mgIdIndex = lines.findIndex((l, idx) => idx > downlineIndex && /^mg\b/i.test(l.trim()));
    const plIdIndex = lines.findIndex((l, idx) => idx > downlineIndex && /\bpl\b/i.test(l.trim()));
    if (mgIdIndex === -1 || plIdIndex === -1) return null;

    // 取 MG 资料行（紧接着 MG 那行之后第一行非空）
    let mgDataIndex = mgIdIndex + 1;
    while (mgDataIndex < lines.length && lines[mgDataIndex].trim() === '') mgDataIndex++;
    const mgIdTokens = splitLine(lines[mgIdIndex]);      // e.g. ["MG","m99m06"]
    const mgDataTokens = splitLine(lines[mgDataIndex]);  // e.g. ["m06-KZ","Major","0","$0.00",...]
    if (mgIdTokens.length < 2 || mgDataTokens.length < 10) return null;

    // 取 PL 资料行
    let plDataIndex = plIdIndex + 1;
    while (plDataIndex < lines.length && lines[plDataIndex].trim() === '') plDataIndex++;
    const plIdTokens = splitLine(lines[plIdIndex]);      // e.g. ["1","PL","yong"]
    const plDataTokens = splitLine(lines[plDataIndex]);  // e.g. ["yong","Major","1030","$20.60",...]
    if (plIdTokens.length < 3 || plDataTokens.length < 10) return null;

    // 4) 组装成固定 10 列矩阵，对应你 Excel 模板 A~J
    const colCount = 10;
    const dataMatrix = [];

    // Row1：Overall 摆在 A~G（从第一个 column 开始）
    const overallRow = new Array(colCount).fill('');
    overallRow[0] = (overallTokens[0] || '').toUpperCase(); // A: OVERALL
    overallRow[1] = overallTokens[1] || '';                 // B: Bet
    overallRow[2] = overallTokens[2] || '';                 // C: Bet Tax
    overallRow[3] = overallTokens[3] || '';                 // D: Eat
    overallRow[4] = overallTokens[4] || '';                 // E: Eat Tax
    overallRow[5] = overallTokens[5] || '';                 // F: Tax / Total
    overallRow[6] = overallTokens[6] || '';                 // G: Profit/Loss
    dataMatrix.push(overallRow);

    // Row2：My Earnings（如果报表里有这一行，否则保持为空行）
    const row2 = new Array(colCount).fill('');
    if (myEarningsTokens && myEarningsTokens.length >= 2) {
        // 把整句描述塞到 A 列，把最后一个 token（一般是金额）放到 B 列
        const label = myEarningsTokens.slice(0, -1).join(' ');
        const amount = myEarningsTokens[myEarningsTokens.length - 1];
        row2[0] = label.toUpperCase(); // A: MY EARNINGS : (RINGGIT MALAYSIA (RM))
        row2[1] = amount;              // B: 金额，如 $13.39
    }
    dataMatrix.push(row2);

    // Row3：MG 上线
    const mgRow = new Array(colCount).fill('');
    mgRow[0] = mgIdTokens[1] || '';          // A: Username m99m06
    mgRow[1] = mgDataTokens[0] || '';        // B: Code m06-KZ
    mgRow[2] = (mgIdTokens[0] || '').toUpperCase(); // C: LVL / MG
    mgRow[3] = 'WIN/PLC';                    // D: Type（原系统里就是这个文案，直接写死）
    mgRow[4] = mgDataTokens[2] || '';        // E: Bet
    mgRow[5] = mgDataTokens[3] || '';        // F: Bet Tax
    mgRow[6] = mgDataTokens[4] || '';        // G: Eat
    mgRow[7] = mgDataTokens[5] || '';        // H: Eat Tax
    mgRow[8] = mgDataTokens[6] || '';        // I: Tax
    mgRow[9] = mgDataTokens[7] || '';        // J: Profit/Loss
    dataMatrix.push(mgRow);

    // Row4：PL 下线
    const plRow = new Array(colCount).fill('');
    plRow[0] = plIdTokens[2] || '';          // A: Username yong
    plRow[1] = plDataTokens[0] || '';        // B: Code yong
    plRow[2] = (plIdTokens[1] || '').toUpperCase(); // C: PL
    plRow[3] = 'WIN/PLC';                    // D: Type
    plRow[4] = plDataTokens[2] || '';        // E: Bet
    plRow[5] = plDataTokens[3] || '';        // F: Bet Tax
    plRow[6] = plDataTokens[4] || '';        // G: Eat
    plRow[7] = plDataTokens[5] || '';        // H: Eat Tax
    plRow[8] = plDataTokens[6] || '';        // I: Tax
    plRow[9] = plDataTokens[7] || '';        // J: Profit/Loss
    dataMatrix.push(plRow);

    return {
        dataMatrix,
        maxRows: dataMatrix.length,
        maxCols: colCount
    };
}

export function parseFullPaymentReport(pastedData) {
    if (!pastedData || typeof pastedData !== 'string') return null;

    const norm = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawLines = norm.split('\n');
    const lines = rawLines.map(l => l.trim()).filter(l => l !== '');

    if (lines.length === 0) return null;

    const lowerAll = lines.map(l => l.toLowerCase());
    const hasOverall = lowerAll.some(l => l.startsWith('overall'));
    const hasDownline = lowerAll.some(l => l.startsWith('downline payment'));
    if (!hasOverall || !hasDownline) return null;

    const matrix = [];

    // 1) Overall 行：将 "OVERALL" 移到第一列，其他数据保持原位置
    const overallIdx = lowerAll.findIndex(l => l.startsWith('overall'));
    if (overallIdx >= 0) {
        const t = rawLines[overallIdx].split('\t').map(s => s.trim());
        if (t.some(x => x !== '')) {
            // 找到 "OVERALL" 的位置
            let overallTextIndex = -1;
            for (let i = 0; i < t.length; i++) {
                if ((t[i] || '').toUpperCase().includes('OVERALL')) {
                    overallTextIndex = i;
                    break;
                }
            }

            // 创建新行，将 "OVERALL" 放在第一列，其他数据保持原位置
            const overallRow = new Array(11).fill('');
            if (overallTextIndex >= 0) {
                overallRow[0] = t[overallTextIndex].toUpperCase(); // 第一列：OVERALL
                // 其他数据保持原列位置（不移动）
                for (let i = 0; i < t.length; i++) {
                    if (i !== overallTextIndex && t[i] && i < 11) {
                        // 保持原列位置，但跳过 OVERALL 文本所在列
                        overallRow[i] = t[i];
                    }
                }
            } else {
                // 如果没找到 OVERALL 文本，保持原样
                for (let i = 0; i < Math.min(11, t.length); i++) {
                    overallRow[i] = t[i] || '';
                }
            }
            matrix.push(overallRow);
        }

        // 检查 Overall 行之后是否有 IPHSP3 数据（Upline Payment 部分）
        // 从 Overall 行之后开始，直到遇到 My Earnings 或 Downline Payment
        for (let i = overallIdx + 1; i < rawLines.length; i++) {
            const line = rawLines[i].trim();
            if (line === '') continue;
            const tokens = line.split('\t').map(s => s.trim());
            if (tokens.length === 0) continue;

            const first = (tokens[0] || '').toUpperCase();

            // 如果遇到 My Earnings 或 Downline Payment，停止处理
            if (first.includes('MY EARNINGS') || first.includes('DOWNLINE PAYMENT')) {
                break;
            }

            // 检查是否是 IPHSP3 IPHSP3 MAJOR/MINOR 格式（Upline Payment 部分的 IPHSP3）
            if (tokens.length >= 3) {
                const second = (tokens[1] || '').toUpperCase();
                const third = (tokens[2] || '').toUpperCase();
                // 如果第一列和第二列相同，且第三列是 MAJOR 或 MINOR，这是 Upline Payment 部分的 IPHSP3 数据
                if (first === second && (third === 'MAJOR' || third === 'MINOR')) {
                    // 直接添加这一行
                    const row = [];
                    for (let k = 0; k < Math.min(11, tokens.length); k++) {
                        row.push(tokens[k] || '');
                    }
                    while (row.length < 11) row.push('');
                    if (row.some(v => (v || '').toString().trim() !== '')) {
                        matrix.push(row);
                    }
                    // 检查后面是否还有相同用户名的 MINOR/MAJOR 行
                    let j = i + 1;
                    while (j < rawLines.length) {
                        const nextLine = rawLines[j].trim();
                        if (nextLine === '') {
                            j++;
                            continue;
                        }
                        const nextTokens = nextLine.split('\t').map(s => s.trim());
                        if (nextTokens.length === 0) {
                            j++;
                            continue;
                        }
                        const nextFirst = (nextTokens[0] || '').toUpperCase();
                        // 如果遇到 My Earnings 或 Downline Payment，停止处理
                        if (nextFirst.includes('MY EARNINGS') || nextFirst.includes('DOWNLINE PAYMENT')) {
                            break;
                        }
                        const nextSecond = (nextTokens[1] || '').toUpperCase();
                        const nextThird = (nextTokens[2] || '').toUpperCase();
                        // 如果是相同用户名且是 MAJOR 或 MINOR 行，也处理
                        if (nextFirst === first && nextSecond === second && (nextThird === 'MAJOR' || nextThird === 'MINOR')) {
                            const nextRow = [];
                            for (let k = 0; k < Math.min(11, nextTokens.length); k++) {
                                nextRow.push(nextTokens[k] || '');
                            }
                            while (nextRow.length < 11) nextRow.push('');
                            if (nextRow.some(v => (v || '').toString().trim() !== '')) {
                                matrix.push(nextRow);
                            }
                            j++;
                        } else {
                            break;
                        }
                    }
                    i = j - 1;
                    continue;
                }
            }

            // 检查是否是 HSE 格式
            if (first === 'HSE' && tokens[1]) {
                const parent = tokens[1];
                // 处理后续的所有 MAJOR 和 MINOR 行
                let j = i + 1;
                while (j < rawLines.length) {
                    const nextLine = rawLines[j].trim();
                    if (nextLine === '') {
                        j++;
                        continue;
                    }
                    const nextTokens = nextLine.split('\t').map(s => s.trim());
                    if (nextTokens.length === 0) {
                        j++;
                        continue;
                    }
                    const nextFirst = (nextTokens[0] || '').toUpperCase();
                    // 如果遇到 My Earnings 或 Downline Payment，停止处理
                    if (nextFirst.includes('MY EARNINGS') || nextFirst.includes('DOWNLINE PAYMENT')) {
                        break;
                    }
                    // 检查是否是 MAJOR 或 MINOR 行
                    const nextType1 = (nextTokens[1] || '').toUpperCase();
                    const nextType2 = (nextTokens[2] || '').toUpperCase();
                    if (nextType1 === 'MAJOR' || nextType1 === 'MINOR' || nextType2 === 'MAJOR' || nextType2 === 'MINOR') {
                        addMajor(parent, nextLine);
                        j++;
                    } else {
                        j++;
                    }
                }
                i = j - 1;
                continue;
            }
        }
    }

    // 2) My Earnings 行：将标签放在第1列，金额放在第10列
    const myIdx = lowerAll.findIndex(l => l.startsWith('my earnings'));
    if (myIdx >= 0) {
        const line = rawLines[myIdx];
        // 先尝试用制表符分割
        let tokens = line.split('\t').map(s => s.trim()).filter(s => s !== '');
        // 如果没有制表符，尝试用多个空格分割
        if (tokens.length <= 1) {
            tokens = line.split(/\s{2,}/).map(s => s.trim()).filter(s => s !== '');
        }
        // 如果还是只有一个，尝试分割出金额（最后一个类似 $0.00 的部分）
        if (tokens.length <= 1) {
            const fullText = tokens[0] || line.trim();
            // 尝试匹配金额模式（如 $0.00, ($123.45), -$50.00 等）
            const amountMatch = fullText.match(/([\(]?[-]?\$?[\d,]+\.?\d*[\)]?)$/);
            if (amountMatch) {
                const amount = amountMatch[1];
                const label = fullText.substring(0, amountMatch.index).trim();
                tokens = [label, amount];
            }
        }

        if (tokens.length >= 2) {
            // 标签部分是除了最后一个 token 之外的所有内容
            const label = tokens.slice(0, -1).join(' ').toUpperCase();
            // 金额是最后一个 token
            const amount = tokens[tokens.length - 1];
            // 创建11列的行（索引0-10，对应列1-11）
            const myEarningsRow = new Array(11).fill('');
            myEarningsRow[0] = label;   // 列1（索引0）：MY EARNINGS : (RINGGIT MALAYSIA (RM))
            myEarningsRow[10] = amount;  // 列11（索引10）：金额如 $0.00
            matrix.push(myEarningsRow);
        } else if (tokens.length === 1 && tokens[0]) {
            // 如果只有一个token，尝试分割出金额
            const fullText = tokens[0];
            // 匹配金额模式：$0.00, ($123.45), -$50.00 等
            const amountMatch = fullText.match(/([\(]?[-]?\$?[\d,]+\.?\d*[\)]?)$/);
            if (amountMatch) {
                const amount = amountMatch[1];
                const label = fullText.substring(0, amountMatch.index).trim();
                const myEarningsRow = new Array(11).fill('');
                myEarningsRow[0] = label.toUpperCase(); // 列1
                myEarningsRow[10] = amount;              // 列11
                matrix.push(myEarningsRow);
            } else {
                // 如果无法分割，放在第一列
                const myEarningsRow = new Array(11).fill('');
                myEarningsRow[0] = tokens[0].toUpperCase();
                matrix.push(myEarningsRow);
            }
        }
    }

    // 小工具：收集 MAJOR 和 MINOR 行，并按「父帐号 + 子帐号 + 类型 + 数字列」输出
    function addMajor(parentUser, detailLine) {
        if (!parentUser || !detailLine) return;
        const tokens = detailLine.split('\t').map(s => s.trim());
        if (tokens.length < 3) return;

        // 检查多种可能的格式：
        // 格式1: Type在第二列 (tokens[1]) - 例如: "iphsp3 \t Major \t 13 ..."
        // 格式2: Type在第三列 (tokens[2]) - 例如: "iphsp3 \t iphsp3 \t Major \t 13 ..."
        let type = '';
        let dataStartIndex = 2;

        const type1 = (tokens[1] || '').toUpperCase();
        const type2 = (tokens[2] || '').toUpperCase();

        if (type1 === 'MAJOR' || type1 === 'MINOR') {
            type = type1;
            dataStartIndex = 2;
        } else if (type2 === 'MAJOR' || type2 === 'MINOR') {
            type = type2;
            dataStartIndex = 3;
        } else {
            return; // 不是MAJOR或MINOR行
        }

        const row = [];
        row.push(parentUser);        // 父帐号
        row.push(tokens[0] || '');   // 子帐号 / 代码
        row.push(type);              // 类型（MAJOR 或 MINOR）
        for (let i = dataStartIndex; i < tokens.length; i++) {
            row.push(tokens[i] || '');
        }
        // 过滤全空
        if (row.some(v => (v || '').toString().trim() !== '')) {
            matrix.push(row);
        }
    }

    // 3) 处理 Upline Payment 段（如果存在）
    const upIdx = lowerAll.findIndex(l => l.startsWith('upline payment'));
    if (upIdx >= 0) {
        // 从 Upline Payment 下一行开始，直到遇到 My Earnings 或 Downline Payment
        for (let i = upIdx + 1; i < rawLines.length; i++) {
            const line = rawLines[i].trim();
            if (line === '') continue;
            const tokens = line.split('\t').map(s => s.trim());
            if (tokens.length === 0) continue;

            const first = (tokens[0] || '').toUpperCase();

            // 如果遇到 My Earnings 或 Downline Payment，停止处理 Upline 部分
            if (first.includes('MY EARNINGS') || first.includes('DOWNLINE PAYMENT')) {
                break;
            }

            // HSE 汇总：HSE \t iphsp3
            // 可能后面跟着多行（MAJOR 和 MINOR），需要全部处理
            if (first === 'HSE' && tokens[1]) {
                const parent = tokens[1];
                // 处理后续的所有 MAJOR 和 MINOR 行，直到遇到下一个 HSE 行或 My Earnings/Downline Payment
                let j = i + 1;
                while (j < rawLines.length) {
                    const nextLine = rawLines[j].trim();
                    if (nextLine === '') {
                        j++;
                        continue;
                    }
                    const nextTokens = nextLine.split('\t').map(s => s.trim());
                    if (nextTokens.length === 0) {
                        j++;
                        continue;
                    }
                    const nextFirst = (nextTokens[0] || '').toUpperCase();
                    // 如果遇到下一个 HSE 行、My Earnings 或 Downline Payment，停止处理
                    if (nextFirst === 'HSE' || nextFirst.includes('MY EARNINGS') || nextFirst.includes('DOWNLINE PAYMENT')) {
                        break;
                    }
                    // 检查是否是 MAJOR 或 MINOR 行（支持多种格式）
                    const nextType1 = (nextTokens[1] || '').toUpperCase();
                    const nextType2 = (nextTokens[2] || '').toUpperCase();
                    if (nextType1 === 'MAJOR' || nextType1 === 'MINOR' || nextType2 === 'MAJOR' || nextType2 === 'MINOR') {
                        addMajor(parent, nextLine);
                        j++;
                    } else {
                        j++;
                    }
                }
                i = j - 1;
                continue;
            }

            // 检查是否是简化格式的第一行（IPHSP3 | IPHSP3 | MAJOR）
            if (tokens.length >= 3) {
                const second = (tokens[1] || '').toUpperCase();
                const third = (tokens[2] || '').toUpperCase();
                // 如果第一列和第二列相同，且第三列是 MAJOR 或 MINOR，这是 owner 总览行
                if (first === second && (third === 'MAJOR' || third === 'MINOR')) {
                    // 直接添加这一行
                    const row = [];
                    for (let k = 0; k < Math.min(11, tokens.length); k++) {
                        row.push(tokens[k] || '');
                    }
                    while (row.length < 11) row.push('');
                    if (row.some(v => (v || '').toString().trim() !== '')) {
                        matrix.push(row);
                    }
                    // 检查后面是否还有相同用户名的 MINOR/MAJOR 行
                    let j = i + 1;
                    while (j < rawLines.length) {
                        const nextLine = rawLines[j].trim();
                        if (nextLine === '') {
                            j++;
                            continue;
                        }
                        const nextTokens = nextLine.split('\t').map(s => s.trim());
                        if (nextTokens.length === 0) {
                            j++;
                            continue;
                        }
                        const nextFirst = (nextTokens[0] || '').toUpperCase();
                        // 如果遇到 My Earnings 或 Downline Payment，停止处理
                        if (nextFirst.includes('MY EARNINGS') || nextFirst.includes('DOWNLINE PAYMENT')) {
                            break;
                        }
                        const nextSecond = (nextTokens[1] || '').toUpperCase();
                        const nextThird = (nextTokens[2] || '').toUpperCase();
                        // 如果是相同用户名且是 MAJOR 或 MINOR 行，也处理
                        if (nextFirst === first && nextSecond === second && (nextThird === 'MAJOR' || nextThird === 'MINOR')) {
                            const nextRow = [];
                            for (let k = 0; k < Math.min(11, nextTokens.length); k++) {
                                nextRow.push(nextTokens[k] || '');
                            }
                            while (nextRow.length < 11) nextRow.push('');
                            if (nextRow.some(v => (v || '').toString().trim() !== '')) {
                                matrix.push(nextRow);
                            }
                            j++;
                        } else {
                            break;
                        }
                    }
                    i = j - 1;
                    continue;
                }
            }
        }
    }

    // 4) Downline Payment 段
    const downIdx = lowerAll.findIndex(l => l.startsWith('downline payment'));
    if (downIdx >= 0) {
        // 从 Downline Payment 下一行往后扫（包括最后一行）
        for (let i = downIdx + 1; i < rawLines.length; i++) {
            const line = rawLines[i].trim();
            if (line === '') continue;
            const tokens = line.split('\t').map(s => s.trim());
            if (tokens.length === 0) continue;

            const first = (tokens[0] || '').toUpperCase();

            // HSE 汇总：HSE \t iphsp3
            // 可能后面跟着多行（MAJOR 和 MINOR），需要全部处理
            if (first === 'HSE' && tokens[1]) {
                const parent = tokens[1];
                // 处理后续的所有 MAJOR 和 MINOR 行，直到遇到下一个 HSE 或 MG 行
                let j = i + 1;
                while (j < rawLines.length) {
                    const nextLine = rawLines[j].trim();
                    if (nextLine === '') {
                        j++;
                        continue;
                    }
                    const nextTokens = nextLine.split('\t').map(s => s.trim());
                    if (nextTokens.length === 0) {
                        j++;
                        continue;
                    }
                    const nextFirst = (nextTokens[0] || '').toUpperCase();

                    // 检查是否是 Total 行
                    const nextLineLower = nextLine.toLowerCase();
                    const nextHasTotal = nextLineLower.includes('total');
                    const nextHasRinggit = nextLineLower.includes('ringgit') || nextLineLower.includes('rm') || nextLineLower.includes('malaysia');
                    const nextHasAmount = nextTokens.some(t => (t || '').includes('$') || (t || '').includes('(') || (t || '').includes(')'));

                    if (nextHasTotal && (nextHasRinggit || nextHasAmount)) {
                        // 处理 Total 行
                        const totalRow = [];
                        for (let k = 0; k < Math.min(11, nextTokens.length); k++) {
                            totalRow.push(nextTokens[k] || '');
                        }
                        while (totalRow.length < 11) totalRow.push('');
                        if (totalRow.some(v => (v || '').toString().trim() !== '')) {
                            matrix.push(totalRow);
                        }
                        j++;
                        break; // Total 行通常是最后一行
                    }

                    // 如果遇到下一个 HSE 或 MG 行，停止处理
                    if (nextFirst === 'HSE' || (nextTokens.length >= 3 && nextTokens[1].toUpperCase() === 'MG')) {
                        break;
                    }
                    // 检查是否是 MAJOR 或 MINOR 行（支持多种格式）
                    const nextType1 = (nextTokens[1] || '').toUpperCase();
                    const nextType2 = (nextTokens[2] || '').toUpperCase();
                    if (nextType1 === 'MAJOR' || nextType1 === 'MINOR' || nextType2 === 'MAJOR' || nextType2 === 'MINOR') {
                        addMajor(parent, nextLine);
                        j++;
                    } else {
                        // 如果不是 MAJOR/MINOR，可能是其他数据，也尝试处理
                        j++;
                    }
                }
                i = j - 1; // 更新 i，因为 j 已经指向下一个需要处理的行
                continue;
            }

            // MG 下线：1\tMG\tm99m06
            // 可能后面跟着多行（MAJOR 和 MINOR），需要全部处理
            if (tokens.length >= 3 && tokens[1].toUpperCase() === 'MG') {
                const parent = tokens[2]; // m99m06
                // 处理后续的所有 MAJOR 和 MINOR 行，直到遇到下一个 HSE 或 MG 行
                let j = i + 1;
                while (j < rawLines.length) {
                    const nextLine = rawLines[j].trim();
                    if (nextLine === '') {
                        j++;
                        continue;
                    }
                    const nextTokens = nextLine.split('\t').map(s => s.trim());
                    if (nextTokens.length === 0) {
                        j++;
                        continue;
                    }
                    const nextFirst = (nextTokens[0] || '').toUpperCase();
                    // 检查是否是 Total 行
                    const nextLineLower = nextLine.toLowerCase();
                    const nextHasTotal = nextLineLower.includes('total');
                    const nextHasRinggit = nextLineLower.includes('ringgit') || nextLineLower.includes('rm') || nextLineLower.includes('malaysia');
                    const nextHasAmount = nextTokens.some(t => (t || '').includes('$') || (t || '').includes('(') || (t || '').includes(')'));

                    if (nextHasTotal && (nextHasRinggit || nextHasAmount)) {
                        // 处理 Total 行
                        const totalRow = [];
                        for (let k = 0; k < Math.min(11, nextTokens.length); k++) {
                            totalRow.push(nextTokens[k] || '');
                        }
                        while (totalRow.length < 11) totalRow.push('');
                        if (totalRow.some(v => (v || '').toString().trim() !== '')) {
                            matrix.push(totalRow);
                        }
                        j++;
                        break; // Total 行通常是最后一行
                    }

                    // 如果遇到下一个 HSE 或 MG 行，停止处理
                    if (nextFirst === 'HSE' || (nextTokens.length >= 3 && nextTokens[1].toUpperCase() === 'MG')) {
                        break;
                    }
                    // 检查是否是 MAJOR 或 MINOR 行（支持多种格式）
                    const nextType1 = (nextTokens[1] || '').toUpperCase();
                    const nextType2 = (nextTokens[2] || '').toUpperCase();
                    if (nextType1 === 'MAJOR' || nextType1 === 'MINOR' || nextType2 === 'MAJOR' || nextType2 === 'MINOR') {
                        addMajor(parent, nextLine);
                        j++;
                    } else {
                        // 如果不是 MAJOR/MINOR，可能是其他数据，也尝试处理
                        j++;
                    }
                }
                i = j - 1; // 更新 i，因为 j 已经指向下一个需要处理的行
                continue;
            }

            // 检查是否是简化格式的第一行（IPHSP3 | IPHSP3 | MAJOR）
            // 这种格式通常出现在从 Excel/Google Sheet 复制的数据中
            if (tokens.length >= 3) {
                const second = (tokens[1] || '').toUpperCase();
                const third = (tokens[2] || '').toUpperCase();
                // 如果第一列和第二列相同，且第三列是 MAJOR 或 MINOR，这是 owner 总览行
                if (first === second && (third === 'MAJOR' || third === 'MINOR')) {
                    // 直接添加这一行
                    const row = [];
                    for (let k = 0; k < Math.min(11, tokens.length); k++) {
                        row.push(tokens[k] || '');
                    }
                    while (row.length < 11) row.push('');
                    if (row.some(v => (v || '').toString().trim() !== '')) {
                        matrix.push(row);
                    }
                    // 检查后面是否还有相同用户名的 MINOR/MAJOR 行
                    let j = i + 1;
                    while (j < rawLines.length) {
                        const nextLine = rawLines[j].trim();
                        if (nextLine === '') {
                            j++;
                            continue;
                        }
                        const nextTokens = nextLine.split('\t').map(s => s.trim());
                        if (nextTokens.length === 0) {
                            j++;
                            continue;
                        }
                        const nextFirst = (nextTokens[0] || '').toUpperCase();

                        // 检查是否是 Total 行
                        const nextLineLower = nextLine.toLowerCase();
                        const nextHasTotal = nextLineLower.includes('total');
                        const nextHasRinggit = nextLineLower.includes('ringgit') || nextLineLower.includes('rm') || nextLineLower.includes('malaysia');
                        const nextHasAmount = nextTokens.some(t => (t || '').includes('$') || (t || '').includes('(') || (t || '').includes(')'));

                        if (nextHasTotal && (nextHasRinggit || nextHasAmount)) {
                            // 处理 Total 行
                            const totalRow = [];
                            for (let k = 0; k < Math.min(11, nextTokens.length); k++) {
                                totalRow.push(nextTokens[k] || '');
                            }
                            while (totalRow.length < 11) totalRow.push('');
                            if (totalRow.some(v => (v || '').toString().trim() !== '')) {
                                matrix.push(totalRow);
                            }
                            j++;
                            break; // Total 行通常是最后一行
                        }

                        const nextSecond = (nextTokens[1] || '').toUpperCase();
                        const nextThird = (nextTokens[2] || '').toUpperCase();
                        // 如果是相同用户名且是 MAJOR 或 MINOR 行，也处理
                        if (nextFirst === first && nextSecond === second && (nextThird === 'MAJOR' || nextThird === 'MINOR')) {
                            const nextRow = [];
                            for (let k = 0; k < Math.min(11, nextTokens.length); k++) {
                                nextRow.push(nextTokens[k] || '');
                            }
                            while (nextRow.length < 11) nextRow.push('');
                            if (nextRow.some(v => (v || '').toString().trim() !== '')) {
                                matrix.push(nextRow);
                            }
                            j++;
                        } else {
                            break; // 不是相同用户名的行，停止处理
                        }
                    }
                    i = j - 1; // 更新 i
                    continue;
                }
            }

            // 检查是否是 Total 行（Total : (Ringgit Malaysia (RM)) 或类似格式）
            // 可能格式：Total : (Ringgit Malaysia (RM)) \t ($473.84)
            // 或者：Total \t (Ringgit Malaysia (RM)) \t ($473.84)
            // 或者：Total : (Ringgit Malaysia (RM)) 在多个列中，金额在最后一列
            const lineLower = line.toLowerCase();
            const hasTotal = lineLower.includes('total');
            const hasRinggit = lineLower.includes('ringgit') || lineLower.includes('rm') || lineLower.includes('malaysia');
            const hasAmount = tokens.some(t => (t || '').includes('$') || (t || '').includes('(') || (t || '').includes(')'));

            // 如果包含 Total 和 (Ringgit/RM/Malaysia 或金额)，则认为是 Total 行
            if (hasTotal && (hasRinggit || hasAmount)) {
                // 处理 Total 行：标签在列1，金额在列11
                const totalRow = new Array(11).fill('');

                // 尝试分离标签和金额
                let label = '';
                let amount = '';

                // 查找包含 TOTAL 和 RINGGIT 的 token
                let labelTokenIndex = -1;
                for (let k = 0; k < tokens.length; k++) {
                    const token = (tokens[k] || '').toLowerCase();
                    if (token.includes('total') && (token.includes('ringgit') || token.includes('rm') || token.includes('malaysia'))) {
                        labelTokenIndex = k;
                        break;
                    }
                }

                if (labelTokenIndex >= 0) {
                    // 从标签 token 中分离标签和金额
                    const labelToken = tokens[labelTokenIndex];
                    const labelAmountMatch = labelToken.match(/^(.+?)\s+([\(]?[-]?\$?[\d,]+\.?\d*[\)]?)$/);
                    if (labelAmountMatch) {
                        label = labelAmountMatch[1].trim();
                        amount = labelAmountMatch[2];
                    } else {
                        label = labelToken;
                        // 从其他 token 找金额
                        for (let k = tokens.length - 1; k >= 0; k--) {
                            if (k !== labelTokenIndex) {
                                const token = tokens[k] || '';
                                if (token && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(token)) {
                                    amount = token;
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    // 如果没找到包含 TOTAL 和 RINGGIT 的 token，尝试从第一个 token 分离
                    if (tokens.length > 0) {
                        const firstToken = tokens[0];
                        const labelAmountMatch = firstToken.match(/^(.+?)\s+([\(]?[-]?\$?[\d,]+\.?\d*[\)]?)$/);
                        if (labelAmountMatch) {
                            label = labelAmountMatch[1].trim();
                            amount = labelAmountMatch[2];
                        } else {
                            // 组合所有包含 TOTAL 和 RINGGIT 的 tokens 作为标签
                            const labelTokens = [];
                            for (let k = 0; k < tokens.length; k++) {
                                const token = tokens[k] || '';
                                if (token.toLowerCase().includes('total') || token.toLowerCase().includes('ringgit') || token.toLowerCase().includes('rm') || token.toLowerCase().includes('malaysia')) {
                                    labelTokens.push(token);
                                } else if (token && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(token)) {
                                    amount = token;
                                }
                            }
                            label = labelTokens.join(' ');
                        }
                    }
                }

                totalRow[0] = label.toUpperCase();  // 列1：TOTAL : (RINGGIT MALAYSIA (RM))
                totalRow[10] = amount;               // 列11：金额

                if (totalRow.some(v => (v || '').toString().trim() !== '')) {
                    matrix.push(totalRow);
                }
                continue;
            }

            // 也检查是否是简单的 Total 行（只有 Total 和金额，没有 Ringgit 等关键词）
            // 格式可能是：Total \t ($473.84) 或 Total : ($473.84)
            // 或者第一列包含 Total，后面有金额
            if (hasTotal && tokens.length >= 2) {
                // 检查是否有金额格式（包含 $ 或括号）
                if (hasAmount) {
                    const totalRow = new Array(11).fill('');
                    // 尝试分离标签和金额
                    let label = '';
                    let amount = '';

                    // 查找包含 TOTAL 的 token
                    let labelTokens = [];
                    for (let k = 0; k < tokens.length; k++) {
                        const token = tokens[k] || '';
                        if (token.toLowerCase().includes('total')) {
                            labelTokens.push(token);
                        } else if (token && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(token)) {
                            amount = token;
                        }
                    }

                    if (labelTokens.length > 0) {
                        label = labelTokens.join(' ');
                    } else if (tokens.length > 0) {
                        label = tokens[0];
                    }

                    totalRow[0] = label.toUpperCase();  // 列1
                    totalRow[10] = amount;               // 列11

                    if (totalRow.some(v => (v || '').toString().trim() !== '')) {
                        matrix.push(totalRow);
                    }
                    continue;
                }
            }

            // 其他行都忽略
        }
    }

    if (matrix.length === 0) return null;

    const maxCols = Math.max(...matrix.map(r => r.length));
    return {
        dataMatrix: matrix,
        maxRows: matrix.length,
        maxCols
    };
}

// 新增：处理Excel导出格式（MY EARNINGS金额在列10）
// 这个函数专门处理从Excel下载后粘贴的格式
export function parseExcelFormatPaymentReport(pastedData) {
    if (!pastedData || typeof pastedData !== 'string') return null;

    const norm = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawLines = norm.split('\n');
    const lines = rawLines.map(l => l.trim()).filter(l => l !== '');

    if (lines.length === 0) return null;

    const lowerAll = lines.map(l => l.toLowerCase());
    const hasOverall = lowerAll.some(l => l.startsWith('overall'));
    const hasMyEarnings = lowerAll.some(l => l.includes('my earnings'));

    // Excel格式特征：有Overall和My Earnings，且My Earnings的金额在列10
    if (!hasOverall || !hasMyEarnings) return null;

    // 检查My Earnings行的格式：标签在列1，金额在列10（不是列11）
    const myEarningsIndex = lowerAll.findIndex(l => l.includes('my earnings'));
    if (myEarningsIndex === -1) return null;

    const myEarningsLine = rawLines[myEarningsIndex];
    const myEarningsTokens = myEarningsLine.split('\t').map(s => s.trim());

    // Excel格式：My Earnings标签在列1，金额在列10（索引9）
    // 检查是否有10列或11列，且第10列（索引9）有金额
    if (myEarningsTokens.length >= 10) {
        const col10Value = (myEarningsTokens[9] || '').trim();
        const col11Value = (myEarningsTokens[10] || '').trim();

        // 如果列10有金额格式，且列11为空或不是金额，这是Excel格式
        const col10HasAmount = col10Value && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(col10Value);
        const col11HasAmount = col11Value && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(col11Value);

        // Excel格式：金额在列10，不在列11
        if (col10HasAmount && !col11HasAmount) {
            console.log('Detected Excel format: MY EARNINGS amount in column 10');

            const matrix = [];
            const colCount = 11; // 输出11列

            // 处理所有行
            rawLines.forEach(raw => {
                const line = raw.trim();
                if (line === '') return;

                const tokens = line.split('\t').map(s => s.trim());
                const first = (tokens[0] || '').toUpperCase();
                const lower = line.toLowerCase();

                // 处理Overall行
                if (lower.startsWith('overall')) {
                    const row = new Array(colCount).fill('');
                    for (let i = 0; i < Math.min(colCount, tokens.length); i++) {
                        row[i] = tokens[i] || '';
                    }
                    matrix.push(row);
                    return;
                }

                // 处理My Earnings行：标签在列1，金额从列10移到列11
                if (lower.includes('my earnings')) {
                    const row = new Array(colCount).fill('');
                    const label = (tokens[0] || '').trim();
                    const amount = (tokens[9] || '').trim(); // Excel格式：金额在列10（索引9）

                    // 如果标签和金额混在一起，尝试分离
                    let finalLabel = label;
                    let finalAmount = amount;

                    if (label && !amount) {
                        // 标签可能在列1，但金额可能在标签文本中
                        const labelAmountMatch = label.match(/^(.+?)\s+([\(]?[-]?\$?[\d,]+\.?\d*[\)]?)$/);
                        if (labelAmountMatch) {
                            finalLabel = labelAmountMatch[1].trim();
                            finalAmount = labelAmountMatch[2];
                        }
                    }

                    row[0] = finalLabel.toUpperCase();  // 列1：标签
                    row[10] = finalAmount;              // 列11：金额（从列10移过来）
                    matrix.push(row);
                    return;
                }

                // 处理Total行：标签在列1，金额在列10或列11
                if (lower.includes('total') && (lower.includes('ringgit') || lower.includes('rm') || lower.includes('malaysia'))) {
                    const row = new Array(colCount).fill('');
                    let label = '';
                    let amount = '';

                    // 查找标签和金额
                    for (let i = 0; i < tokens.length; i++) {
                        const token = tokens[i] || '';
                        const tokenLower = token.toLowerCase();
                        if (tokenLower.includes('total') && (tokenLower.includes('ringgit') || tokenLower.includes('rm') || tokenLower.includes('malaysia'))) {
                            const labelAmountMatch = token.match(/^(.+?)\s+([\(]?[-]?\$?[\d,]+\.?\d*[\)]?)$/);
                            if (labelAmountMatch) {
                                label = labelAmountMatch[1].trim();
                                amount = labelAmountMatch[2];
                            } else {
                                label = token;
                            }
                        } else if (token && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(token)) {
                            if (!amount) {
                                amount = token;
                            }
                        }
                    }

                    // 如果金额在列10，移到列11
                    if (tokens.length > 9 && tokens[9] && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(tokens[9])) {
                        amount = tokens[9];
                    } else if (tokens.length > 10 && tokens[10] && /[\(]?[-]?\$?[\d,]+\.?\d*[\)]?/.test(tokens[10])) {
                        amount = tokens[10];
                    }

                    row[0] = label.toUpperCase();  // 列1：标签
                    row[10] = amount;              // 列11：金额
                    matrix.push(row);
                    return;
                }

                // 处理其他数据行（IPHSP3, m99m06等）
                if (tokens.length >= 3) {
                    const row = new Array(colCount).fill('');
                    for (let i = 0; i < Math.min(colCount, tokens.length); i++) {
                        row[i] = tokens[i] || '';
                    }
                    matrix.push(row);
                }
            });

            if (matrix.length === 0) return null;

            const maxCols = Math.max(...matrix.map(r => r.length));
            return {
                dataMatrix: matrix,
                maxRows: matrix.length,
                maxCols
            };
        }
    }

    return null; // 不是Excel格式
}

// API-RETURN 表格格式解析函数
// 解析表格格式：29/12/2025  C2BT200  MYR  -  -  -2,953.02  0.00  -5,206.22  KING855 : (11860.00+138790.00*0.008+138790.00*0.001/0.90)*(0.225)  -  ZERO
// 输出：['29/12/2025', 'C2BT200', 'MYR', '-', '-', '-2,953.02', '0.00', '-5,206.22', 'KING855:', '11860.00', '138790.00', '0.008', '138790.00', '0.001', '0.90', '0.225', '-', 'ZERO']
// 智能分割函数：保留日期格式和公式列，只拆分其他列
