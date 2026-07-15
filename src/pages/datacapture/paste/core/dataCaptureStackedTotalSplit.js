/**
 * 1.TEXT helper: split a matrix row whose cells stack SUB TOTAL + GRAND TOTAL
 * (webpage often collapses these into one Excel row). Format must not import
 * this unless intentionally opted in — keeps 2.FORMAT paths unchanged.
 */

function normalizeLabel(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isSubTotalLabel(text) {
  const upper = normalizeLabel(text).replace(/:$/, "");
  return upper === "SUB TOTAL" || upper === "SUBTOTAL";
}

function isGrandTotalLabel(text) {
  const upper = normalizeLabel(text).replace(/:$/, "");
  return upper === "GRAND TOTAL" || upper === "GRANDTOTAL";
}

function cellPlainValue(cell) {
  if (cell == null) return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell);
  return String(cell.value ?? "");
}

function cellHtml(cell) {
  if (cell == null || typeof cell !== "object") return "";
  return String(cell.html ?? "");
}

/** Split a cell into stack lines from html (<br> / block kids) or plain value. */
export function cellStackLines(cell) {
  const html = cellHtml(cell);
  if (html && /<[^>]+>/.test(html)) {
    try {
      const root = document.createElement("div");
      root.innerHTML = html
        .replace(/<br\s+[^>]*>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n");

      let scan = root;
      for (let depth = 0; depth < 4; depth += 1) {
        const kids = Array.from(scan.children || []).filter((el) =>
          String(el.textContent || "")
            .replace(/\s+/g, " ")
            .trim(),
        );
        if (kids.length === 1) {
          scan = kids[0];
          continue;
        }
        if (kids.length >= 2) {
          return kids.map((el) =>
            String(el.textContent || "")
              .replace(/\u00a0/g, " ")
              .replace(/\s+/g, " ")
              .trim(),
          );
        }
        break;
      }

      const fromHtml = String(scan.textContent || root.textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (fromHtml.length >= 2) return fromHtml;
    } catch {
      /* fall through to plain */
    }
  }

  const raw = cellPlainValue(cell)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines;

  // Glued labels after textContent drops block newlines: SUBTOTALGRANDTOTAL.
  const glued = normalizeLabel(raw).replace(/\s+/g, "");
  if (/^SUBTOTALGRANDTOTAL$/i.test(glued)) return ["SUB TOTAL", "GRAND TOTAL"];

  const spaced = normalizeLabel(raw).split(/\s+/).filter(Boolean);
  if (spaced.length >= 2) {
    const joined = [];
    for (let i = 0; i < spaced.length; ) {
      if (spaced[i] === "SUB" && spaced[i + 1] === "TOTAL") {
        joined.push("SUB TOTAL");
        i += 2;
        continue;
      }
      if (spaced[i] === "GRAND" && spaced[i + 1] === "TOTAL") {
        joined.push("GRAND TOTAL");
        i += 2;
        continue;
      }
      joined.push(spaced[i]);
      i += 1;
    }
    if (joined.length >= 2) return joined;
  }

  return lines;
}

/** @returns {{ labelCol: number, labels: [string, string] } | null} */
function findStackedTotalLabels(row) {
  if (!Array.isArray(row) || !row.length) return null;
  for (let col = 0; col < row.length; col += 1) {
    const lines = cellStackLines(row[col]);
    if (lines.length < 2) continue;
    if (isSubTotalLabel(lines[0]) && isGrandTotalLabel(lines[1])) {
      return { labelCol: col, labels: [lines[0].trim(), lines[1].trim()] };
    }
    const sub = lines.find((line) => isSubTotalLabel(line));
    const grand = lines.find((line) => isGrandTotalLabel(line));
    if (sub && grand && lines.length <= 3) {
      return { labelCol: col, labels: [sub.trim(), grand.trim()] };
    }
  }
  return null;
}

function withPlainLine(cell, text) {
  const value = String(text ?? "");
  if (cell != null && typeof cell === "object") {
    return {
      ...cell,
      value,
      // Drop stacked HTML so each grid row shows a single line.
      html: undefined,
    };
  }
  return value;
}

function lineForRow(cell, lineIndex) {
  const lines = cellStackLines(cell);
  if (lines.length >= 2) return lines[lineIndex] ?? "";
  // Single value shared by both total rows (older collapse shape).
  if (lines.length === 1) return lines[0];
  return "";
}

/**
 * @param {Array<Array<any>>} matrix
 * @returns {Array<Array<any>>}
 */
export function splitStackedSubtotalGrandTotalRows(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return matrix || [];

  const out = [];
  matrix.forEach((row) => {
    const found = findStackedTotalLabels(row);
    if (!found) {
      out.push(row);
      return;
    }

    const { labelCol, labels } = found;
    const [subLabel, grandLabel] = labels;

    const subRow = row.map((cell, index) => {
      if (index === labelCol) return withPlainLine(cell, subLabel);
      return withPlainLine(cell, lineForRow(cell, 0));
    });
    const grandRow = row.map((cell, index) => {
      if (index === labelCol) return withPlainLine(cell, grandLabel);
      return withPlainLine(cell, lineForRow(cell, 1));
    });
    out.push(subRow, grandRow);
  });

  return out;
}
