/**
 * C8Play Win Loss Detail (cswinlossdetail) clipboard helper — scoped only.
 *
 * Other report pastes must NOT go through this. Callers check
 * {@link tryReshapeC8WinLossPlainMatrix} which returns null when the clipboard
 * is not a Win Loss agent-grid dump.
 *
 * Fixes unique to this source:
 * - sparse tab "87\tAGENT" must stay two columns (not "87 AGENT")
 * - money-only Subtotal footer (empty Player/Name/Type) must left-pad
 */

import {
  isVerticalDumpMoneyToken,
  isVerticalDumpSummaryLabel,
  normalizeVerticalDumpToken,
} from "./dataCaptureVerticalDumpDetect.js";

function isUserTypeToken(token) {
  return /^(AGENT|MEMBER)$/i.test(normalizeVerticalDumpToken(token));
}

function isPlayerCodeToken(token) {
  const t = normalizeVerticalDumpToken(token);
  if (!t || isVerticalDumpMoneyToken(t) || isVerticalDumpSummaryLabel(t)) return false;
  if (isUserTypeToken(t)) return false;
  return /^[A-Z0-9][A-Z0-9_-]{2,}$/i.test(t) && /[A-Za-z]/.test(t) && /\d/.test(t);
}

function looksLikeMoneyOnlyFooter(chunk, width) {
  if (!Array.isArray(chunk) || chunk.length < 3) return false;
  if (!isVerticalDumpMoneyToken(chunk[0])) return false;
  const moneyCount = chunk.filter((t) => isVerticalDumpMoneyToken(t)).length;
  if (moneyCount < Math.max(3, Math.ceil(chunk.length * 0.75))) return false;
  if (width && chunk.length > width) return false;
  return true;
}

/** Expand tabs before whitespace normalize so "87\\tAGENT" stays two fields. */
export function expandC8WinLossClipboardTokens(pastedData) {
  const lines = String(pastedData ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => String(line ?? "").replace(/\u00a0/g, " ").trim() !== "");

  const tokens = [];
  lines.forEach((line) => {
    const raw = String(line ?? "").replace(/\u00a0/g, " ");
    if (raw.includes("\t")) {
      raw.split("\t").forEach((part) => {
        const token = normalizeVerticalDumpToken(part);
        if (token) tokens.push(token);
      });
      return;
    }
    const normalized = normalizeVerticalDumpToken(raw);
    if (normalized) tokens.push(normalized);
  });
  return tokens;
}

/**
 * Strict gate: wide Win Loss rows with Player + Name + AGENT/MEMBER + amounts.
 * Rejects agent_period / OB / other mat-row dumps (no User Type column / narrower).
 */
export function looksLikeC8WinLossPlain(pastedData) {
  const tokens = expandC8WinLossClipboardTokens(pastedData);
  if (tokens.length < 20) return false;
  if (!tokens.some(isUserTypeToken)) return false;

  const agentIdx = [];
  tokens.forEach((token, index) => {
    if (isPlayerCodeToken(token)) agentIdx.push(index);
  });
  if (agentIdx.length < 2) return false;

  const width = agentIdx[1] - agentIdx[0];
  // Win Loss Detail is wide (Turn Over + Downline + Company blocks). Keep
  // narrower statement pastes on the shared vertical-dump path.
  if (width < 12 || width > 24) return false;
  for (let i = 1; i < agentIdx.length; i += 1) {
    if (agentIdx[i] - agentIdx[i - 1] !== width) return false;
  }
  if (agentIdx[0] > 2) return false;

  // Each agent row: Player, Name, AGENT|MEMBER, then mostly money.
  for (const idx of agentIdx) {
    if (!isUserTypeToken(tokens[idx + 2] || "")) return false;
    const row = tokens.slice(idx, idx + width);
    if (row.length < width) return false;
    const moneyCount = row.filter((t) => isVerticalDumpMoneyToken(t)).length;
    if (moneyCount < Math.ceil(width * 0.5)) return false;
  }

  return true;
}

function leftPadMoneyFooter(row, width) {
  const next = Array.isArray(row) ? [...row] : [];
  const lead = Math.max(0, width - next.length);
  const padded = [...Array(lead).fill(""), ...next];
  while (padded.length < width) padded.push("");
  return padded.slice(0, width);
}

function rightPadRow(row, width) {
  const next = Array.isArray(row) ? [...row] : [];
  while (next.length < width) next.push("");
  return next.slice(0, width);
}

/**
 * Reshape C8 Win Loss plain clipboard into a horizontal matrix.
 * Callers should skip this when clipboard is already aligned TSV.
 * @returns {string[][] | null}
 */
export function tryReshapeC8WinLossPlainMatrix(pastedData) {
  const text = String(pastedData ?? "");
  // Dense TSV keeps empty Player/Name/Type cells — do not flatten via tokens.
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const tabHeavy =
    lines.length >= 2 &&
    lines.filter((line) => line.includes("\t")).length >= Math.ceil(lines.length * 0.6);
  if (tabHeavy) return null;

  if (!looksLikeC8WinLossPlain(pastedData)) return null;

  const tokens = expandC8WinLossClipboardTokens(pastedData);
  const agentIdx = [];
  tokens.forEach((token, index) => {
    if (isPlayerCodeToken(token)) agentIdx.push(index);
  });
  const width = agentIdx[1] - agentIdx[0];
  const start = agentIdx[0];
  const dataTokens = tokens.slice(start);

  const rows = [];
  for (let i = 0; i < dataTokens.length; i += width) {
    const chunk = dataTokens.slice(i, i + width);
    if (chunk.length === width) {
      rows.push(chunk);
      continue;
    }
    if (!chunk.length) break;
    if (isVerticalDumpSummaryLabel(chunk[0])) {
      rows.push(rightPadRow(chunk, width));
      break;
    }
    if (looksLikeMoneyOnlyFooter(chunk, width)) {
      rows.push(leftPadMoneyFooter(chunk, width));
      break;
    }
    // Incomplete trailing junk — drop.
    break;
  }

  if (rows.length < 2) return null;
  return rows.map((row) => rightPadRow(row, width));
}
