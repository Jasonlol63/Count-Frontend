/**
 * WOS agent Win/Loss Detail (winLossDetailSetting.jsp) clipboard helper — scoped only.
 *
 * Source: https://agent.wos777966612sports.com/page/agent/report/winLossDetailSetting.jsp
 *
 * Unique to this report:
 * - First data cell is flex (`setFlex-alignCenter`) with a "+" expand control
 *   plus `#titleUserID`; Chrome copies that as two lines and Format HTML splits
 *   the agent onto a second row (User ID alone, then Name + money).
 * - Hidden `display:none` site cell (`WOS`) must not become a column.
 * - Some jackpot `<td>`s are HTML comments, so occupancy must skip them.
 *
 * Other Data Capture pastes must not enter this path.
 */

import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";

const TOTAL_N_RE = /^TOTAL\s*\(\d+\)$/i;
const USER_ID_RE = /^\d{4,12}$/;
const PLUS_RE = /^\+$/;

function normalizeClipboardText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ");
}

function cellText(cell) {
  return String(cell ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMoney(text) {
  const cleaned = cellText(text)
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function looksLikeForeignReport(text) {
  if (/PRODUCT BRAND/i.test(text) || /EXTRA FEE/i.test(text)) return true;
  if (/BET\s*COUNTS/i.test(text) && /VALID\s*BET/i.test(text) && /\bSENIOR\b/i.test(text)) {
    return true;
  }
  if (/USERNAME/i.test(text) && /TURNOVER/i.test(text) && /GROSS COMM/i.test(text)) return true;
  return false;
}

function normalizeUserId(text) {
  return cellText(text)
    .replace(/^\++\s*/, "")
    .trim();
}

function canonicalUserId(text) {
  const t = normalizeUserId(text);
  if (USER_ID_RE.test(t) || /^[A-Za-z]\d{4,12}$/.test(t)) return t;
  const fromQuery = t.match(/[?&#/](?:user(?:_?id)?|memberId|titleUserID)=(\d{4,12})\b/i);
  if (fromQuery) return fromQuery[1];
  const letterPrefixed = t.match(/\b([A-Za-z]\d{4,12})\b/);
  if (letterPrefixed) return letterPrefixed[1];
  return t;
}

function looksLikeUserIdToken(text) {
  const t = canonicalUserId(text);
  return USER_ID_RE.test(t) || /^[A-Za-z]\d{4,12}$/.test(t);
}

function looksLikeNameToken(text) {
  const t = cellText(text);
  if (!t || isMoney(t) || TOTAL_N_RE.test(t) || PLUS_RE.test(t)) return false;
  return /[A-Za-z]/.test(t);
}

function looksLikeSplitIdThenNameMoney(text) {
  const lines = normalizeClipboardText(text)
    .split("\n")
    .map((line) => line.split("\t").map(cellText))
    .filter((row) => row.some(Boolean));
  if (lines.length < 2) return false;
  const hasTotal = lines.some((row) => row.some((cell) => TOTAL_N_RE.test(cell)));
  for (let i = 0; i < lines.length - 1; i += 1) {
    const filled = lines[i].filter(Boolean);
    const next = lines[i + 1];
    const nextMoney = next.filter(isMoney).length;
    if (
      filled.length === 1 &&
      looksLikeUserIdToken(filled[0]) &&
      looksLikeNameToken(next[0]) &&
      nextMoney >= 4
    ) {
      return hasTotal || nextMoney >= 8;
    }
  }
  return false;
}

export function looksLikeWosWinLossDetailPlain(pastedData) {
  const text = normalizeClipboardText(pastedData);
  if (looksLikeForeignReport(text)) return false;
  // Split paste (id-only first line, then name+money) can be the only text/plain
  // payload — check before the length gate so HTML-heavy copies still match.
  if (looksLikeSplitIdThenNameMoney(text)) return true;
  if (text.length < 40) return false;

  if (
    /titleUserID/i.test(text) ||
    /userTotalName/i.test(text) ||
    /winLossDetailSetting/i.test(text) ||
    /data-type\s*=\s*["']member["']/i.test(text) ||
    /setFlex-alignCenter/i.test(text)
  ) {
    return true;
  }
  if (/有效投注额/.test(text) && /总佣金/.test(text)) return true;

  const hasTotalN = /TOTAL\s*\(\d+\)/i.test(text);
  const hasPlus = /(^|\n)\+\s*(\n|\t)/.test(text);
  const hasUserId = /(^|\n|\t)\d{4,12}(\n|\t)/.test(text);
  return hasTotalN && hasPlus && hasUserId;
}

function rowLooksLikeHeader(row) {
  const joined = row.map(cellText).join(" ");
  if (/使用者代号|有效投注额|总佣金/.test(joined)) return true;
  if (/USER\s*ID/i.test(joined) && /VALID\s*BET/i.test(joined) && /COMM/i.test(joined)) return true;
  return false;
}

function rowLooksLikeChrome(row) {
  const joined = row.map(cellText).join(" ");
  if (!joined.trim()) return true;
  return /PageSize|搜寻|^<<|Showing\s+\d+\s+to/i.test(joined);
}

function isTdHidden(td) {
  const style = `${td.getAttribute?.("style") || ""} ${td.className || ""}`.toLowerCase();
  if (/\bdisplay\s*:\s*none\b/.test(style)) return true;
  if (td.classList?.contains?.("site") && /\bnone\b/.test(style)) return true;
  return false;
}

function tdPlain(td) {
  if (!td || isTdHidden(td)) return null;
  const userLink =
    td.querySelector?.("#titleUserID") ||
    td.querySelector?.("a.textBtn") ||
    td.querySelector?.("a[id='titleUserID']");
  if (userLink) return canonicalUserId(userLink.textContent);
  const raw = cellText(td.textContent);
  if (PLUS_RE.test(raw)) return "";
  return canonicalUserId(raw.replace(/^\+\s+/, "").trim());
}

function htmlRowToCells(tr) {
  return Array.from(tr.querySelectorAll("td, th"))
    .map((td) => tdPlain(td))
    .filter((value) => value != null)
    .map((value) => cellText(value));
}

function parseHtmlMatrix(html, { force = false } = {}) {
  if (!html || typeof document === "undefined") return null;
  if (
    !force &&
    !/titleUserID|userTotalName|winLossDetailSetting|data-type\s*=\s*["']member["']|setFlex-alignCenter|btnOpen/i.test(
      html,
    )
  ) {
    return null;
  }
  try {
    const root = document.createElement("div");
    root.innerHTML = String(html);
    const tables = Array.from(root.querySelectorAll("table"));
    let best = null;
    let bestScore = -1;
    tables.forEach((table) => {
      const rows = Array.from(table.querySelectorAll(":scope > tbody > tr, :scope > tr")).map(htmlRowToCells);
      const data = rows.filter((row) => row.some((cell) => cellText(cell) !== ""));
      if (!data.length) return;
      const merged = mergePlusUserId(data);
      const score = htmlTableScore(merged);
      if (score > bestScore) {
        best = data;
        bestScore = score;
      }
    });
    return best;
  } catch {
    return null;
  }
}

function parseTabOrLines(pastedData) {
  const lines = normalizeClipboardText(pastedData)
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => String(line).trim() !== "");
  if (!lines.length) return [];
  const tabby = lines.filter((line) => line.includes("\t")).length;
  if (tabby >= 1) return lines.map((line) => line.split("\t").map(cellText));
  return lines.map((line) => [cellText(line)]);
}

function mergePlusUserId(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map(cellText);
    const filled = row.filter(Boolean);
    if (filled.length === 1 && PLUS_RE.test(filled[0])) {
      continue;
    }
    if (PLUS_RE.test(row[0] || "") && looksLikeUserIdToken(row[1] || "")) {
      out.push([canonicalUserId(row[1]), ...row.slice(2)]);
      continue;
    }
    if (PLUS_RE.test(row[0] || "") && row.length === 1 && looksLikeUserIdToken(cellText(rows[i + 1]?.[0]))) {
      const next = rows[i + 1].map(cellText);
      next[0] = canonicalUserId(next[0]);
      out.push(next);
      i += 1;
      continue;
    }
    const next = rows[i + 1];
    if (
      filled.length === 1 &&
      looksLikeUserIdToken(filled[0]) &&
      Array.isArray(next) &&
      looksLikeNameToken(next[0]) &&
      next.filter(isMoney).length >= 4
    ) {
      out.push([canonicalUserId(filled[0]), ...next.map(cellText)]);
      i += 1;
      continue;
    }
    if (looksLikeUserIdToken(row[0] || "") && row.length === 1) {
      row[0] = canonicalUserId(row[0]);
    }
    out.push(row);
  }
  return out;
}

function reshapeVerticalDump(rows) {
  if (!rows.length) return null;
  const wide = rows.filter((row) => row.filter(Boolean).length >= 3).length;
  if (wide >= 1) return null;
  const tokens = rows.flatMap((row) => row.map(cellText).filter(Boolean)).filter((t) => !PLUS_RE.test(t));
  const totalIdx = tokens.findIndex((t) => TOTAL_N_RE.test(t));
  if (totalIdx < 3 || !looksLikeUserIdToken(tokens[0])) return null;
  if (isMoney(tokens[1])) return null;
  const userId = canonicalUserId(tokens[0]);
  const name = tokens[1];
  const agentMoney = tokens.slice(2, totalIdx).filter(isMoney);
  const totalLabel = tokens[totalIdx];
  const totalMoney = tokens.slice(totalIdx + 1).filter(isMoney);
  if (agentMoney.length < 4) return null;
  return [
    [userId, name, ...agentMoney],
    [totalLabel, "", ...totalMoney],
  ];
}

function alignTotalRows(rows) {
  const dataRows = rows.filter((row) => !rowLooksLikeHeader(row) && !rowLooksLikeChrome(row));
  const agent = dataRows.find(
    (row) => looksLikeUserIdToken(cellText(row[0])) && !TOTAL_N_RE.test(cellText(row[0])),
  );
  const width = Math.max(4, ...dataRows.map((row) => row.length), agent?.length || 0);
  const moneyStart = agent && cellText(agent[1]) && !isMoney(agent[1]) ? 2 : 1;

  return dataRows
    .map((row) => {
      const cells = row.map(cellText);
      const labelIdx = cells.findIndex((cell) => TOTAL_N_RE.test(cell));
      if (labelIdx < 0) {
        const next = [...cells];
        while (next.length < width) next.push("");
        return next;
      }
      const label = cells[labelIdx];
      const amounts = cells.slice(labelIdx + 1).filter(isMoney);
      const next = Array.from({ length: width }, () => "");
      next[0] = label;
      amounts.forEach((token, index) => {
        const dest = moneyStart + index;
        if (dest < width) next[dest] = token;
      });
      return next;
    })
    .filter((row) => row.some((cell) => cellText(cell) !== ""));
}

function htmlTableScore(matrix) {
  const pair = candidateScore(matrix);
  const maxCols = Math.max(0, ...(matrix || []).map((row) => row.filter(Boolean).length));
  const money = (matrix || []).reduce((count, row) => count + row.filter(isMoney).length, 0);
  return pair * 10 + maxCols * 100 + money;
}

function candidateScore(matrix) {
  const agent = (matrix || []).find(
    (row) => looksLikeUserIdToken(cellText(row[0])) && looksLikeNameToken(cellText(row[1])),
  );
  if (!agent) return 0;
  return agent.filter(Boolean).length * 100 + matrix.length;
}

/**
 * @returns {string[][] | null}
 */
export function tryBuildWosWinLossDetailMatrix(pastedData, html) {
  const textLooks =
    looksLikeWosWinLossDetailPlain(pastedData) || looksLikeSplitIdThenNameMoney(pastedData);
  const fromHtml = parseHtmlMatrix(html, { force: textLooks });
  const fromText = textLooks ? parseTabOrLines(pastedData) : null;

  const candidates = [];
  if (fromHtml?.length) candidates.push(alignTotalRows(mergePlusUserId(fromHtml)));
  if (fromText?.length) {
    const merged = mergePlusUserId(fromText);
    const vertical = reshapeVerticalDump(merged);
    candidates.push(alignTotalRows(vertical || merged));
  }

  const matrix = candidates
    .filter((item) => item?.length && candidateScore(item) > 0)
    .sort((a, b) => candidateScore(b) - candidateScore(a))[0];
  if (!matrix?.length) return null;

  const agentRow = matrix.find(
    (row) => looksLikeUserIdToken(cellText(row[0])) && looksLikeNameToken(cellText(row[1])),
  );
  if (!agentRow) return null;
  return matrix;
}

export function tryHandleWosWinLossDetailPaste(html, pastedData, applyOptions = {}) {
  const matrix = tryBuildWosWinLossDetailMatrix(pastedData, html);
  if (!matrix?.length) return false;

  const { successCount, maxRows, maxCols } = applyDataMatrixToGrid(
    matrix,
    applyOptions.anchorCell || null,
    {
      alignTotalRows: false,
      uppercaseValues: false,
      trimValues: false,
      startRowOverride: applyOptions.startRowOverride,
      startColOverride: applyOptions.startColOverride,
    },
  );
  if (successCount <= 0) return false;
  notifyPasteSuccess(`成功粘贴 WOS Win/Loss ${maxRows} 行 x ${maxCols} 列`);
  return true;
}
