/** Read clipboard payloads from a paste event; HTML table detect/parse helpers. */

export function resolvePasteCell(target) {
  if (!target) return null;
  return target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
}

export function isTypingModeCell(cell) {
  return Boolean(cell && document.activeElement === cell);
}

/** True when paste should stay on form fields, not the capture grid. */
export function isGridPasteBlockedTarget(el) {
  if (!el) return false;
  if (el.closest("#dataTable")) return false;
  if (el.id === "pasteAreaFormat") return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export function clipboardLooksLikeGridPaste(clipboard) {
  if (!clipboard) return false;
  try {
    const types = clipboard.types ? Array.from(clipboard.types) : [];
    if (types.length > 0 && !types.includes("text/plain") && !types.includes("text/html")) {
      return false;
    }
  } catch {
    /* ignore */
  }
  try {
    const html = clipboard.getData?.("text/html") || "";
    if (html && /<table\b/i.test(html)) return true;
  } catch {
    /* ignore */
  }
  try {
    const text = clipboard.getData?.("text/plain") || "";
    if (!text || !text.trim()) return false;
    // Excel 单行复制也带 Tab；多行 TSV 同样支持
    if (text.includes("\t")) return true;
    if (text.includes("\n") || text.includes("\r")) return true;
    // 单个值也可贴入选中格
    return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Read clipboard for programmatic paste (Ctrl+V on selected cells). */
export async function readClipboardForPaste() {
  if (navigator.clipboard?.read) {
    try {
      const items = await navigator.clipboard.read();
      let text = "";
      let html = "";
      for (const item of items) {
        for (const type of item.types) {
          if (type === "text/plain") {
            text = await (await item.getType(type)).text();
          } else if (type === "text/html") {
            html = await (await item.getType(type)).text();
          }
        }
      }
      if (text || html) return { text, html };
    } catch (err) {
      console.warn("clipboard.read failed, falling back to readText:", err);
    }
  }

  if (navigator.clipboard?.readText) {
    const text = await navigator.clipboard.readText();
    return { text, html: "" };
  }

  throw new Error("clipboard unavailable");
}

/** Synthetic paste event with text/html payloads (for Ctrl+V / context menu paste). */
export function buildSyntheticPasteEvent(target, { text = "", html = "" } = {}) {
  const types = [];
  if (html) types.push("text/html");
  if (text || !html) types.push("text/plain");

  return {
    preventDefault() {},
    stopPropagation() {},
    clipboardData: {
      types,
      getData(type) {
        if (type === "text/html") return html || "";
        if (type === "text/plain" || type === "text" || type === "Text") return text || "";
        return "";
      },
    },
    target,
    currentTarget: target,
  };
}

export function getClipboardPlainText(e) {
  const clipboard = e.clipboardData || window.clipboardData;
  const getData = (type) => {
    try {
      if (!clipboard || typeof clipboard.getData !== "function") return "";
      return clipboard.getData(type) || "";
    } catch {
      return "";
    }
  };
  return getData("text/plain") || getData("text") || getData("Text") || "";
}

export function getClipboardHtml(e) {
  try {
    return e.clipboardData?.getData("text/html") || "";
  } catch {
    return "";
  }
}

export function detectHtmlTableInClipboard(e) {
  try {
    const clipboard = e.clipboardData || window.clipboardData;
    if (!clipboard?.getData) return null;

    const htmlData = clipboard.getData("text/html");
    if (htmlData && /<table\b/i.test(htmlData)) {
      return htmlData;
    }

    const textData = clipboard.getData("text/plain");
    if (textData && /<table\b/i.test(textData)) {
      return textData;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Rich table HTML used by 1.Text format-merge mode.
 * Only treat as rich when it's a table and carries format/span hints.
 */
export function isFormatRichHtmlTable(html) {
  if (!html || !/<table\b/i.test(html)) return false;
  return /rowspan\s*=|colspan\s*=|style\s*=|<font\b|<strong\b|<b\b|<span\b/i.test(html);
}

/**
 * Form controls that must never land in the grid as live widgets.
 * Intentionally does NOT strip button / svg / img / role=button — 1.TEXT and
 * 2.FORMAT paste keep report action icons for visual 1:1 (handlers already
 * stripped by sanitizePastedCellHtml).
 */
const PASTED_FORM_CONTROL_SELECTOR = "input, select, textarea";

/**
 * Remove live form controls from pasted HTML while keeping text, formatting,
 * and decorative icons (button / svg / img).
 */
export function stripInteractiveUiFromHtml(html) {
  if (!html || !html.includes("<")) return html || "";
  try {
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll(PASTED_FORM_CONTROL_SELECTOR).forEach((el) => {
      const text = (el.textContent || "").trim();
      if (text) {
        el.replaceWith(document.createTextNode(text));
      } else {
        el.remove();
      }
    });
    return div.innerHTML;
  } catch {
    return html;
  }
}

/** Plain text from sanitized HTML (after UI elements are stripped). */
export function plainTextFromSanitizedHtml(html) {
  if (!html) return "";
  if (!html.includes("<")) return String(html).replace(/\u00a0/g, " ").trim();
  try {
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent ?? "").replace(/\u00a0/g, " ").trim();
  } catch {
    return "";
  }
}

export function sanitizePastedCellHtml(cellContent) {
  if (!cellContent) return "";
  const stripped = cellContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
  return stripInteractiveUiFromHtml(stripped);
}

/** Reorder columns when No./User appear at the end (common Excel copy quirk). */
export function detectColumnReorder(allRows) {
  const numCols = countRowCols(allRows[0]);
  if (numCols < 3) return null;

  for (let hi = 0; hi < Math.min(3, allRows.length); hi += 1) {
    const headerCells = allRows[hi].querySelectorAll("td, th");
    const headerTexts = Array.from(headerCells).map((c) => (c.textContent || "").trim());
    const noIdx = headerTexts.findIndex((t) => /^no\.?$/i.test(t));
    const userIdx = headerTexts.findIndex((t) => /^user$/i.test(t));
    if (noIdx >= 0 && userIdx >= 0 && (noIdx !== 0 || userIdx !== 1)) {
      const otherIndices = headerTexts.map((_, i) => i).filter((i) => i !== noIdx && i !== userIdx);
      return [noIdx, userIdx, ...otherIndices];
    }
    if (noIdx >= 0 && userIdx >= 0) break;
  }

  const looksLikeRowNo = (s) => {
    const t = (s || "").trim();
    return /^\d+$/.test(t) && t.length <= 6;
  };
  const looksLikeUserId = (s) => {
    const t = (s || "").trim();
    return t.length >= 2 && /^[a-zA-Z0-9_]+$/.test(t) && /[a-zA-Z]/.test(t) && /\d/.test(t);
  };

  let matchCount = 0;
  const checkRows = Math.min(5, allRows.length);
  for (let ri = 0; ri < checkRows; ri += 1) {
    const cells = allRows[ri].querySelectorAll("td, th");
    const n = cells.length;
    if (n < 3) continue;
    const secondLast = (cells[n - 2].textContent || "").trim();
    const last = (cells[n - 1].textContent || "").trim();
    if (looksLikeRowNo(secondLast) && looksLikeUserId(last)) matchCount += 1;
  }

  if (matchCount >= 2) {
    const n = allRows[0].querySelectorAll("td, th").length;
    return [n - 2, n - 1, ...Array.from({ length: n - 2 }, (_, i) => i)];
  }

  return null;
}

function countRowCols(row) {
  if (!row) return 0;
  const cells = row.querySelectorAll("td, th");
  let c = 0;
  cells.forEach((cell) => {
    c += Number.parseInt(cell.getAttribute("colspan") || "1", 10);
  });
  return c;
}

export function measureHtmlTable(table) {
  const allRows = table.querySelectorAll("tr");
  if (!allRows.length) return null;

  let maxCols = 0;
  allRows.forEach((tr) => {
    maxCols = Math.max(maxCols, countRowCols(tr));
  });

  if (maxCols === 0) return null;
  return { allRows: Array.from(allRows), maxCols };
}

/** Top-level tables only (ignore tables nested inside a cell). */
export function getTopLevelTables(root) {
  return Array.from(root.querySelectorAll("table")).filter((t) => {
    const parentTable = t.parentElement ? t.parentElement.closest("table") : null;
    return !parentTable;
  });
}

/** Count only a table's OWN cells (cells not belonging to a nested table). */
function ownCellCount(table) {
  let count = 0;
  table.querySelectorAll("td, th").forEach((cell) => {
    if (cell.closest("table") === table) count += 1;
  });
  return count;
}

/**
 * The table with the most of its OWN td/th cells (the real data table).
 *
 * Counting own cells (not nested descendants) is what lets us drill into a
 * report that wraps the real data grid inside a single cell of an outer layout
 * table: the outer wrapper has few own cells, the inner data grid has many, so
 * the inner grid wins instead of dumping the whole grid into one cell.
 */
function pickLargestTable(tables) {
  let best = null;
  let bestScore = -1;
  tables.forEach((t) => {
    const score = ownCellCount(t);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  });
  return best;
}

/** Widest row's column count (colspan-aware). */
function tableColCount(table) {
  let maxCols = 0;
  table.querySelectorAll("tr").forEach((tr) => {
    maxCols = Math.max(maxCols, countRowCols(tr));
  });
  return maxCols;
}

/**
 * Pick the real data table and the rows to paste.
 *
 * - The largest table (most cells) is the data table. When a report wraps the
 *   real table inside a single cell of an outer layout table (e.g. the M8BET
 *   Win-Lose report), this drills into the nested table instead of dumping the
 *   whole table into one cell.
 * - Only when the data table is itself top-level do we also stack sibling
 *   top-level tables that have the SAME column count — this keeps the MarioClub
 *   report's separate TOTAL footer table while ignoring unrelated side tables
 *   (which have a different column count).
 */
export function measureTopLevelTables(root) {
  const allTables = Array.from(root.querySelectorAll("table"));
  if (!allTables.length) return null;

  const primary = pickLargestTable(allTables);
  if (!primary) return null;

  const topTables = getTopLevelTables(root);
  const primaryIsTopLevel = topTables.includes(primary);

  let tablesToStack;
  if (primaryIsTopLevel) {
    const primaryCols = tableColCount(primary);
    tablesToStack = topTables.filter((t) => tableColCount(t) === primaryCols);
    if (!tablesToStack.includes(primary)) tablesToStack.push(primary);
  } else {
    tablesToStack = [primary];
  }

  const allRows = [];
  let maxCols = 0;
  tablesToStack.forEach((table) => {
    table.querySelectorAll("tr").forEach((tr) => {
      allRows.push(tr);
      maxCols = Math.max(maxCols, countRowCols(tr));
    });
  });

  if (!allRows.length || maxCols === 0) return null;
  return { allRows, maxCols };
}
