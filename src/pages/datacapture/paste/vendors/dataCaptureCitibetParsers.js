/** Ported from js/datacapture.js — Phase 4 CITIBET paste parsers. */

export function parseCitibetFormatBasedPaste(pastedData) {
    if (!pastedData || typeof pastedData !== 'string') return null;
    const norm = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawLines = norm.split('\n');
    const rows = [];
    let maxCols = 11;

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].trim();
        if (line === '') continue;

        const cells = line.split('\t').map(c => (c || '').trim());
        const lowerLine = line.toLowerCase();

        // 排除：Downline Payment 标题行
        if (lowerLine === 'downline payment' || lowerLine.startsWith('downline payment\t')) continue;
        // 排除：Downline 表头行（No.	Lvl	Username	Type	...）
        if (cells[0] === 'No.' && (lowerLine.includes('lvl') || lowerLine.includes('username') || lowerLine.includes('type'))) continue;
        // 排除：任一单元格为 Minor 的行
        if (cells.some(c => (c || '').toLowerCase() === 'minor')) continue;

        rows.push(cells);
        if (cells.length > maxCols) maxCols = cells.length;
    }

    if (rows.length === 0) return null;
    const padded = rows.map(row => {
        const r = [...row];
        while (r.length < maxCols) r.push('');
        return r;
    });

    console.log('Using CITIBET format-based paste:', padded.length, 'rows x', maxCols, 'cols');
    return {
        dataMatrix: padded,
        maxRows: padded.length,
        maxCols: maxCols
    };
}

export function parseCitibetPaymentReport(pastedData) {
    if (!pastedData || typeof pastedData !== 'string') return null;

    const lowerAll = pastedData.toLowerCase();
    const hasOverall = lowerAll.includes('overall');
    const hasMyEarnings = lowerAll.includes('my earnings');
    const hasUplineHeader = lowerAll.includes('upline payment');
    const hasDownlineHeader = lowerAll.includes('downline payment');
    if (!hasOverall || !hasMyEarnings) return null;

    console.log('Using Citibet payment parser');

    const norm = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawLines = norm.split('\n');

    const splitLine = (line) => {
        if (line.includes('\t')) {
            return line.split('\t').map(c => (c || '').trim()).filter(c => c !== '');
        }
        const byDoubleSpace = line.split(/\s{2,}/).map(c => (c || '').trim()).filter(c => c !== '');
        if (byDoubleSpace.length > 1) return byDoubleSpace;
        return line.split(/\s+/).map(c => (c || '').trim()).filter(c => c !== '');
    };
    // 从代码（如 m35-A-L）推导经理 ID（m99m35），用于 Upline/Downline 仅复制到代码时保留 m99m35
    const deriveManagerIdFromCode = (s) => {
        const t = (s || '').trim();
        if (!t || !/^m\d+-/i.test(t) || /^m99/i.test(t)) return t;
        const m = t.match(/^m(\d+)/i);
        return m ? ('m99' + 'm' + m[1]) : t;
    };

    const rows = [];
    const colCount = 12;
    let section = hasUplineHeader ? '' : 'upline';
    let afterMyEarnings = false;
    let lastDownlineUsername = '';
    // 当 Username 单元格在源表里是两行（如 raymond + ray）时，复制后会变成两行；上一行仅 Lvl+完整名，下一行是缩写+Major+数据。用此变量保留完整名，下一行用完整名还原。
    let lastUplineParent = '';

    const pushRow = (arr) => {
        const row = [...arr];
        while (row.length < colCount) row.push('');
        rows.push(row);
    };

    rawLines.forEach(raw => {
        const line = raw.trim();
        if (line === '') return;

        const lower = line.toLowerCase();
        if (lower.includes('upline payment')) {
            section = 'upline';
            lastUplineParent = '';
            return;
        }
        if (lower.includes('downline payment')) {
            section = 'downline';
            afterMyEarnings = true;
            lastUplineParent = '';
            return;
        }
        if (!hasDownlineHeader && afterMyEarnings && (/^no\.\t/i.test(line) || /^\d+\t(mg|pl)\t/i.test(line))) {
            section = 'downline';
        }
        if (lower.includes('username') && lower.includes('type')) return;

        // My Earnings 行（金额固定放在第 11 列）
        if (lower.includes('my earnings')) {
            afterMyEarnings = true;
            const tokens = splitLine(line);
            if (tokens.length >= 2) {
                const label = tokens.slice(0, -1).join(' ').toUpperCase();
                const amount = tokens[tokens.length - 1];
                const row = new Array(colCount).fill('');
                row[0] = label;
                row[10] = amount;
                pushRow(row);
            }
            return;
        }

        // Total : (Ringgit Malaysia (RM)) 行（金额固定放在第 11 列）
        if (lower.includes('total :') || lower.startsWith('total')) {
            const tokens = splitLine(line);
            if (tokens.length >= 1) {
                const label = tokens.slice(0, -1).join(' ').toUpperCase();
                const amount = tokens[tokens.length - 1];
                const row = new Array(colCount).fill('');
                row[0] = label;
                row[10] = amount;
                pushRow(row);
            }
            return;
        }

        const cells = splitLine(line);
        // 源表 Username 单元格若为两行（如 raymond / ray），复制后第一行只有 Lvl+完整名（2 列），第二行是缩写+Major+数据。保留完整名供下一行还原。
        if (cells.length < 3) {
            const looksLikeNumberCell = (s) => /^[\d,.$()-]+$/.test((s || '').trim());
            if (section === 'upline' && cells.length === 2 && /^[a-z]{2,4}$/i.test((cells[0] || '').trim()) && !looksLikeNumberCell(cells[1])) {
                lastUplineParent = (cells[1] || '').trim();
            } else if (section === 'downline' && cells.length === 2 && /^[a-z]{2,4}$/i.test((cells[0] || '').trim()) && !/^\d+$/.test((cells[0] || '').trim())) {
                lastDownlineUsername = (cells[1] || '').trim();
            }
            return;
        }

        if (section === 'upline') {
            const overallIdx = cells.findIndex(c => c.toLowerCase() === 'overall');
            if (overallIdx >= 0) {
                const data = cells.slice(overallIdx + 1);
                const row = ['OVERALL', '', '', ...data.slice(0, 8)];
                pushRow(row);
                return;
            }

            // Minor 整行不要：第二列或第三列为 Minor 即跳过
            const col1 = (cells[1] || '').toLowerCase();
            const col2 = (cells[2] || '').toLowerCase();
            if (col1 === 'minor' || col2 === 'minor') return;

            // Upline minor 数据：前两列为数字、第三列为金额（非 MAJOR），整行跳过不清除进表
            const looksLikeNumberUpline = (s) => /^[\d,.$()-]+$/.test((s || '').trim());
            const looksLikeAmountUpline = (s) => /^[$]?[\d,.()\-]+$/.test((s || '').trim());
            if (cells.length >= 3 && looksLikeNumberUpline(cells[0]) && looksLikeNumberUpline(cells[1]) && looksLikeAmountUpline(cells[2])) return;

            // 支持两种格式：(Lvl, Username, Type, Bet...) 或 (Username, Type, Bet...)；Username 可能多词（如 raymond 或 ray mond），先找 Major/Minor 列再取完整
            let parent = '';
            let type = '';
            let numbers = [];
            let uplineCol2Override = null;
            const looksLikeNumber = (s) => /^[\d,.$()-]+$/.test((s || '').trim());
            const typeColUpline = cells.findIndex((c, i) => i >= 1 && ((c || '').toLowerCase() === 'major' || (c || '').toLowerCase() === 'minor'));
            if (typeColUpline >= 1 && typeColUpline < cells.length - 1 && looksLikeNumber(cells[typeColUpline + 1])) {
                parent = typeColUpline === 1 ? (cells[0] || '') : cells.slice(1, typeColUpline).join(' ').trim();
                type = cells[typeColUpline] || '';
                numbers = cells.slice(typeColUpline + 1);
                if (lastUplineParent && typeColUpline === 1) {
                    uplineCol2Override = (cells[0] || '').trim();
                    parent = lastUplineParent;
                    lastUplineParent = '';
                }
            } else if ((col1 === 'major') && cells.length >= 3 && looksLikeNumber(cells[2])) {
                parent = cells[0] || '';
                type = cells[1] || '';
                numbers = cells.slice(2);
            } else if ((col2 === 'major') && cells.length >= 4 && looksLikeNumber(cells[3])) {
                parent = cells[1] || '';
                type = cells[2] || '';
                numbers = cells.slice(3);
            } else if (cells.length >= 5 && (cells[3] || '').toLowerCase() === 'major' && looksLikeNumber(cells[4])) {
                // (Lvl, ID, Code, Major, Bet...) 如 MG  m99m35  m35-A-L  Major  163  ...
                parent = cells[1] || '';
                type = cells[3] || '';
                numbers = cells.slice(4);
            } else {
                parent = cells[1] || '';
                type = cells[2] || '';
                numbers = cells.slice(3);
            }
            // 若上一行是「Lvl + 完整用户名」（如 MA raymond）或「Lvl + 父ID」（如 PL m35002），当前行是「子Code + Major + 数据」（如 Motor2 Major ...），第一列用父ID、第二列用子Code
            const originalParentFromLine = parent;
            if (lastUplineParent && (lastUplineParent === parent || lastUplineParent.toLowerCase().startsWith(parent.toLowerCase()))) {
                parent = lastUplineParent;
                lastUplineParent = '';
            }
            if (!parent && !type) return;
            const displayParent = deriveManagerIdFromCode(parent);
            const col2Value = uplineCol2Override !== null ? uplineCol2Override : ((parent !== originalParentFromLine) ? originalParentFromLine : parent);
            const row = [displayParent, col2Value, type, ...numbers.slice(0, 8)];
            pushRow(row);
            return;
        }

        if (section === 'downline') {
            if (cells[0] === 'No.' && lower.includes('username')) return;
            // Minor 整行不要：任一处为 Minor 且整行无 Major -> 跳过
            const hasMinor = cells.some(c => (c || '').toLowerCase() === 'minor');
            const hasMajor = cells.some(c => (c || '').toLowerCase() === 'major');
            if (hasMinor && !hasMajor) return;
            // 第二列为 Minor 也跳过（兼容列顺序）
            if ((cells[1] || '').toLowerCase() === 'minor') return;
            if ((cells[0] || '').toLowerCase() === 'minor') return;
            // 无 "Minor" 标签的 Minor 行（纯数字/金额）：整行无 Major 且前两列像数字/金额 -> 跳过
            const looksLikeNumber = (s) => /^[\d,.]+$/.test((s || '').trim());
            const looksLikeAmount = (s) => /^[$]?[\d,.()\-]+$/.test((s || '').trim());
            if (!hasMajor && cells.length >= 2 && looksLikeNumber(cells[0]) && looksLikeAmount(cells[1])) return;
            if (!hasMajor && cells.length >= 3 && looksLikeAmount(cells[0]) && looksLikeNumber(cells[1]) && looksLikeAmount(cells[2])) return;
            // Downline minor 数据：前两列为数字、第三列为金额（非 MAJOR），整行跳过（仅无 Major 的行）
            const looksLikeBetOrAmountForMinor = (s) => /^[\d,.$()-]+$/.test((s || '').trim());
            if (!hasMajor && cells.length >= 3 && looksLikeBetOrAmountForMinor(cells[0]) && looksLikeBetOrAmountForMinor(cells[1]) && looksLikeAmount(cells[2]) && (cells[2] || '').toLowerCase() !== 'major') return;

            // 同一行同时含 No. + Lvl + 用户名 + Major + 数据（如 "1  AG  gaosheng  gaosheng  Major  9344  ..."）：直接输出该行，避免 gaosheng 等下线数据丢失
            const looksLikeBetOrAmountDownline = (s) => /^[\d,.$()-]+$/.test((s || '').trim());
            if (cells.length >= 6 && /^\d+$/.test((cells[0] || '').trim()) && /^[a-z]{2,4}$/i.test((cells[1] || '').trim()) && /^major$/i.test((cells[4] || '').trim()) && looksLikeBetOrAmountDownline(cells[5])) {
                const parent = (cells[2] || '').trim();
                const child = (cells[3] || '').trim() || parent;
                const row = [deriveManagerIdFromCode(parent), child, 'Major', ...cells.slice(5).slice(0, 8)];
                pushRow(row);
                return;
            }
            if (cells.length >= 5 && /^\d+$/.test((cells[0] || '').trim()) && /^[a-z]{2,4}$/i.test((cells[1] || '').trim()) && /^major$/i.test((cells[3] || '').trim()) && looksLikeBetOrAmountDownline(cells[4])) {
                const parent = (cells[2] || '').trim();
                const row = [deriveManagerIdFromCode(parent), parent, 'Major', ...cells.slice(4).slice(0, 8)];
                pushRow(row);
                return;
            }

            // No.  Lvl  Username(可能多词，如 raymond 或 ray mond)：先找 Major/Minor 列，再取中间完整 Username，避免只显示 ray
            const typeColDownline = cells.findIndex((c, i) => i >= 2 && ((c || '').toLowerCase() === 'major' || (c || '').toLowerCase() === 'minor'));
            if (cells.length >= 4 && /^\d+$/.test((cells[0] || '').trim()) && /^[a-z]{2,4}$/i.test((cells[1] || '').trim()) && typeColDownline >= 2 && typeColDownline < cells.length - 1 && looksLikeBetOrAmountDownline(cells[typeColDownline + 1])) {
                const parent = typeColDownline === 2 ? (cells[1] || '').trim() : cells.slice(2, typeColDownline).join(' ').trim();
                const typeVal = (cells[typeColDownline] || '').trim();
                const row = [deriveManagerIdFromCode(parent), parent, typeVal, ...cells.slice(typeColDownline + 1).slice(0, 8)];
                pushRow(row);
                return;
            }

            // 表头行 "1\tMG\tm99m06" 或 "1\tAG\tgaosheng"：No. + Lvl(MG/PL/AG/…) + Username，记 username 下一行再输出
            if (cells.length >= 3 && /^\d+$/.test(cells[0]) && /^[a-z]{2,4}$/i.test((cells[1] || '').trim())) {
                lastDownlineUsername = (cells[2] || '').trim();
                return;
            }
            // 数据行 "M06-KZ\tMajor\t45\t..."：与上一行 username 合并为 [username, code, Major, Bet, ...]
            if (lastDownlineUsername && cells.length >= 3 && /^major$/i.test((cells[1] || '').trim())) {
                const row = [lastDownlineUsername, cells[0] || '', cells[1] || '', ...cells.slice(2).slice(0, 8)];
                pushRow(row);
                lastDownlineUsername = '';
                return;
            }
            // 数据行 "gaosheng\tgaosheng\tMajor\t9344\t..."（两列 username）：与上一行 username 合并
            if (lastDownlineUsername && cells.length >= 4 && /^major$/i.test((cells[2] || '').trim()) &&
                ((cells[0] || '').trim() === lastDownlineUsername || (cells[1] || '').trim() === lastDownlineUsername)) {
                const code = (cells[0] || '').trim() === lastDownlineUsername ? (cells[1] || '') : (cells[0] || '');
                const row = [lastDownlineUsername, code, 'Major', ...cells.slice(3).slice(0, 8)];
                pushRow(row);
                lastDownlineUsername = '';
                return;
            }
            lastDownlineUsername = '';

            // 无 "No. MG" 的数据行（如 MG m35-A-L Major 0 ...）：(Lvl/User, Type, Bet...) -> [User, User, Type, Bet...]，代码型用 deriveManagerIdFromCode
            const looksLikeBetOrAmount = (s) => /^[\d,.$()-]+$/.test((s || '').trim());
            if (cells.length >= 3 && (cells[1] || '').toLowerCase() === 'major' && looksLikeBetOrAmount(cells[2])) {
                const p0 = cells[0] || '';
                const row = [deriveManagerIdFromCode(p0), p0, cells[1] || '', ...cells.slice(2).slice(0, 8)];
                pushRow(row);
                return;
            }

            let idx = 0;
            if (/^\d+$/.test(cells[0])) idx = 1;

            // 先找 Major/Minor 列，Username 为 Lvl 与 Type 之间的全部 token，保证完整显示（如 raymond 不被拆成 ray）
            const typeColGen = cells.findIndex((c, i) => i >= idx + 1 && ((c || '').toLowerCase() === 'major' || (c || '').toLowerCase() === 'minor'));
            let parent = '';
            let type = '';
            let child;
            let dataStart = idx + 3;
            if (typeColGen >= idx + 1 && typeColGen < cells.length) {
                parent = typeColGen === idx + 1 ? (cells[idx] || '') : cells.slice(idx + 1, typeColGen).join(' ').trim();
                child = parent;
                type = cells[typeColGen] || '';
                dataStart = typeColGen + 1;
            } else {
                parent = cells[idx + 1] || '';
                child = parent;
                type = cells[idx + 2] || '';
                const typeLower = (type || '').toLowerCase();
                if (typeLower !== 'major' && typeLower !== 'minor' && cells.length > idx + 3) {
                    child = cells[idx + 2] || '';
                    type = cells[idx + 3] || '';
                    dataStart = idx + 4;
                }
            }

            if ((cells[idx + 1] || '').toLowerCase() === 'minor' || (type || '').toLowerCase() === 'minor') return;

            const numbers = cells.slice(dataStart);
            const row = [deriveManagerIdFromCode(parent), child, type, ...numbers.slice(0, 8)];
            // 第三列应为 MAJOR；若为数字则视为 Minor 行（错位数据）不贴
            if ((row[2] || '').toLowerCase() !== 'major' && looksLikeNumber((row[2] || '').toString())) return;
            pushRow(row);
        }
    });

    if (rows.length === 0) return null;

    return {
        dataMatrix: rows,
        maxRows: rows.length,
        maxCols: colCount
    };
}

export function parseCitibetMajorPaymentReport(pastedData) {
    if (!pastedData || typeof pastedData !== 'string') return null;

    const norm = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawLines = norm.split('\n').map(l => l.trim());

    // 允许用户从 "Overall" 开始复制（不包含 "Upline Payment" 标题）
    // 但为了避免误判，仍然要求包含 Downline Payment，并且能找到 Overall / My Earnings 关键行
    // Total 行是可选的，即使没有也能正常解析
    const hasDownline = rawLines.some(l => l.toLowerCase().includes('downline payment'));
    const hasOverall = rawLines.some(l => /^overall\b/i.test(l));
    const hasMyEarnings = rawLines.some(l => l.toLowerCase().includes('my earnings'));
    const hasTotal = rawLines.some(l => l.toLowerCase().startsWith('total :') || l.toLowerCase().startsWith('totals'));
    if (!hasDownline || !hasOverall || !hasMyEarnings) {
        return null;
    }

    const colCount = 11;
    const makeRow = () => new Array(colCount).fill('');

    const nonEmpty = rawLines.filter(l => l !== '');

    // 工具：按制表符或多个空格/单空格拆列
    const splitLine = (line) => {
        if (line.includes('\t')) {
            return line.split('\t').map(c => (c || '').trim()).filter(c => c !== '');
        }
        const byDoubleSpace = line.split(/\s{2,}/).map(c => (c || '').trim()).filter(c => c !== '');
        if (byDoubleSpace.length > 1) return byDoubleSpace;
        return line.split(/\s+/).map(c => (c || '').trim()).filter(c => c !== '');
    };

    // 1) Upline 部分：Overall / MG / My Earnings
    const overallIdx = nonEmpty.findIndex(l => /^overall\b/i.test(l));
    if (overallIdx === -1) return null;

    const overallTokens = splitLine(nonEmpty[overallIdx]); // Overall 740 $5.18 518 $13.47 ... $18.65 ($947.69)
    if (overallTokens.length < 3) return null;

    const rows = [];

    // Row1: OVERALL 行
    const row1 = makeRow();
    row1[0] = 'OVERALL';
    // 目标结构：Overall | | | | 740 | $5.18 | 518 | $13.47 |  |  | $18.65 | -$947.69
    const oNums = overallTokens.slice(1); // [740, 5.18, 518, 13.47, 18.65, -947.69]
    row1[4] = oNums[0] || ''; // Bet
    row1[5] = oNums[1] || ''; // Bet Tax
    row1[6] = oNums[2] || ''; // Eat
    row1[7] = oNums[3] || ''; // Eat Tax
    // Tax & Profit/Loss 空
    row1[8] = '';            // Tax (empty)
    row1[9] = '';            // Profit/Loss (empty)
    // Total Tax & Total Profit/Loss
    row1[10] = oNums[4] || ''; // Total Tax
    row1[11] = oNums[5] || ''; // Total Profit/Loss
    rows.push(row1);

    // 找 My Earnings 行
    const myEarnIdx = nonEmpty.findIndex(l => l.toLowerCase().includes('my earnings'));
    if (myEarnIdx === -1) return null;
    const myEarnTokens = splitLine(nonEmpty[myEarnIdx]);
    if (myEarnTokens.length < 2) return null;

    const myAmount = myEarnTokens[myEarnTokens.length - 1];
    const myLabel = myEarnTokens.slice(0, -1).join(' ').toUpperCase();

    // Row2: Upline MG 汇总行
    // 目标结构：m99m06 | m06-KZ | MG | WIN/PLC | 740 | $14.80 | 518 | $13.47 | $28.27 | -$957.31 | $28.27 | -$957.31
    // 从 Upline MG 区块提取用户名 + 详细数据
    const mgHeaderIdx = nonEmpty.findIndex(l => /^mg\b/i.test(l));
    const row2 = makeRow();
    if (mgHeaderIdx !== -1) {
        const mgHeaderTokens = splitLine(nonEmpty[mgHeaderIdx]); // MG m99m06
        let parentUser = '';
        if (mgHeaderTokens.length >= 2) {
            parentUser = mgHeaderTokens[1] || '';
        }

        // Upline MG 明细行在 MG 标题行之后
        let uplineMgDataIdx = mgHeaderIdx + 1;
        while (uplineMgDataIdx < nonEmpty.length && nonEmpty[uplineMgDataIdx] === '') uplineMgDataIdx++;
        if (uplineMgDataIdx < nonEmpty.length) {
            const uplineMgTokens = splitLine(nonEmpty[uplineMgDataIdx]); // m06-KZ Major 740 $14.80 518 $13.47 $28.27 ($957.31) $28.27 ($957.31)
            if (uplineMgTokens.length >= 8) {
                row2[0] = (parentUser || '').toUpperCase(); // Username m99m06
                row2[1] = uplineMgTokens[0] || '';          // Code m06-KZ
                row2[2] = (uplineMgTokens[1] || '').toUpperCase(); // MG
                row2[3] = 'WIN/PLC';
                row2[4] = uplineMgTokens[2] || ''; // Bet 740
                row2[5] = uplineMgTokens[3] || ''; // Bet Tax $14.80
                row2[6] = uplineMgTokens[4] || ''; // Eat 518
                row2[7] = uplineMgTokens[5] || ''; // Eat Tax $13.47
                row2[8] = uplineMgTokens[6] || ''; // Tax $28.27
                row2[9] = uplineMgTokens[7] || ''; // Profit/Loss -$957.31
                row2[10] = uplineMgTokens[8] || ''; // Total Tax $28.27
                row2[11] = uplineMgTokens[9] || ''; // Total Profit/Loss -$957.31
            } else if (parentUser) {
                // 兜底：至少把用户名放在第一列
                row2[0] = parentUser.toUpperCase();
            }
        } else if (parentUser) {
            row2[0] = parentUser.toUpperCase();
        }
    }
    rows.push(row2);

    // Row3: MY EARNINGS
    const row3 = makeRow();
    row3[0] = myLabel;
    // 目标：金额在第 12 列，其余为空
    row3[11] = myAmount;
    rows.push(row3);

    // 2) Downline MG / PL 两行
    const downlineStart = nonEmpty.findIndex(l => /^downline payment/i.test(l));
    if (downlineStart === -1) return null;

    // 若 Downline 段内有多个下线块（如 MG + MA/AG/PL 等），交给 parseCitibetPaymentReport 处理以保留所有下线（如 raymond ray）
    const downlineSection = nonEmpty.slice(downlineStart + 1);
    const blockHeaderRe = /^(\d+\s+)?(mg|pl|ag|ma)\s+/i;
    const downlineBlockCount = downlineSection.filter(l => blockHeaderRe.test((l || '').trim())).length;
    if (downlineBlockCount >= 2) return null;

    // MG 区块
    const mgIdx2 = nonEmpty.findIndex((l, idx) => idx > downlineStart && /^mg\b/i.test(l));
    if (mgIdx2 === -1) return null;
    const mgIdTokens = splitLine(nonEmpty[mgIdx2]); // MG m99m06

    let mgDataIdx = mgIdx2 + 1;
    while (mgDataIdx < nonEmpty.length && nonEmpty[mgDataIdx] === '') mgDataIdx++;
    if (mgDataIdx >= nonEmpty.length) return null;
    const mgDataTokens = splitLine(nonEmpty[mgDataIdx]); // m06-KZ Major 0 $0.00 ...
    if (mgDataTokens.length < 10) return null;

    const row4 = makeRow();
    row4[0] = (mgIdTokens[1] || '').toUpperCase(); // Username
    row4[1] = mgDataTokens[0] || '';               // Code (m06-KZ)
    row4[2] = (mgDataTokens[1] || '').toUpperCase(); // MG
    row4[3] = 'WIN/PLC';
    // 目标：m99m06 | m06-KZ | MG | WIN/PLC | 0 | $0.00 | 518 | $13.47 | $13.47 | $2,154.30 | $13.47 | $2,154.30
    row4[4] = mgDataTokens[2] || ''; // Bet
    row4[5] = mgDataTokens[3] || ''; // Bet Tax
    row4[6] = mgDataTokens[4] || ''; // Eat
    row4[7] = mgDataTokens[5] || ''; // Eat Tax
    row4[8] = mgDataTokens[6] || ''; // Tax
    row4[9] = mgDataTokens[7] || ''; // Profit/Loss
    row4[10] = mgDataTokens[8] || ''; // Total Tax
    row4[11] = mgDataTokens[9] || ''; // Total Profit/Loss
    rows.push(row4);

    // PL 区块（可选）
    const plHeaderIdx = nonEmpty.findIndex((l, idx) => idx > downlineStart && /\bpl\b/i.test(l));
    if (plHeaderIdx !== -1) {
        const plHeaderTokens = splitLine(nonEmpty[plHeaderIdx]); // 1 PL yong

        let plDataIdx = plHeaderIdx + 1;
        while (plDataIdx < nonEmpty.length && nonEmpty[plDataIdx] === '') plDataIdx++;
        if (plDataIdx < nonEmpty.length) {
            const plDataTokens = splitLine(nonEmpty[plDataIdx]); // yong Major 740 ...
            if (plDataTokens.length >= 10) {
                const row5 = makeRow();
                row5[0] = (plHeaderTokens[2] || '').toUpperCase(); // Username yong
                row5[1] = plDataTokens[0] || '';                   // Code yong
                row5[2] = (plDataTokens[1] || '').toUpperCase();   // PL
                row5[3] = 'WIN/PLC';
                // 目标：yong | yong | PL | WIN/PLC | 740 | $14.80 | 0 | $0.00 | $14.80 | -$3,111.62 | $14.80 | -$3,111.62
                row5[4] = plDataTokens[2] || ''; // Bet
                row5[5] = plDataTokens[3] || ''; // Bet Tax
                row5[6] = plDataTokens[4] || ''; // Eat
                row5[7] = plDataTokens[5] || ''; // Eat Tax
                row5[8] = plDataTokens[6] || ''; // Tax
                row5[9] = plDataTokens[7] || ''; // Profit/Loss
                row5[10] = plDataTokens[8] || ''; // Total Tax
                row5[11] = plDataTokens[9] || ''; // Total Profit/Loss
                rows.push(row5);
            }
        }
    }

    // 3) Total 行
    const totalIdx = nonEmpty.findIndex(l => l.toLowerCase().startsWith('total :'));
    if (totalIdx !== -1) {
        const totalTokens = splitLine(nonEmpty[totalIdx]);
        if (totalTokens.length >= 2) {
            const totalAmount = totalTokens[totalTokens.length - 1];
            const totalLabel = totalTokens.slice(0, -1).join(' ').toUpperCase();
            const row6 = makeRow();
            row6[0] = totalLabel;
            // 金额在第 12 列
            row6[11] = totalAmount;
            rows.push(row6);
        }
    }

    if (rows.length === 0) return null;

    return {
        dataMatrix: rows,
        maxRows: rows.length,
        maxCols: colCount
    };
}
