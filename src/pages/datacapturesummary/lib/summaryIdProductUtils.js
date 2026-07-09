/** Id Product text normalization for Summary rows. */
export function normalizeSummaryIdProductText(text) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.indexOf(" - ") >= 0) {
    return trimmed.replace(/\s+$/, "").trim();
  }
  const match = trimmed.match(/^([^(]+)/);
  if (match) {
    return match[1].replace(/\s+$/, "").trim();
  }
  return trimmed.replace(/\s+$/, "").trim();
}

export function getSummaryProductValuesFromCell(cell) {
  if (!cell) return { main: "", sub: "" };
  const main = cell.getAttribute("data-main-product") || "";
  const sub = cell.getAttribute("data-sub-product") || "";
  const text = cell.textContent.trim();
  if (!main && !sub && text) {
    const parts = text.split(" / ");
    return { main: parts[0] || "", sub: parts[1] || "" };
  }
  return { main, sub };
}
