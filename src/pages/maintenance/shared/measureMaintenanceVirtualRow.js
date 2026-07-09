/**
 * Measure virtual list row height from natural content (height:auto),
 * then the row fills the slot via CSS height:100% on the data row.
 */
export function measureMaintenanceVirtualRow(el, minRowHeight, innerRowSelector) {
  if (!el) return minRowHeight;

  const inner = el.querySelector(innerRowSelector);
  if (!(inner instanceof HTMLElement)) {
    return minRowHeight;
  }

  const prevHeight = inner.style.height;
  const prevMinHeight = inner.style.minHeight;
  inner.style.height = "auto";
  inner.style.minHeight = "0";

  const natural = Math.ceil(inner.getBoundingClientRect().height || inner.scrollHeight || minRowHeight);

  inner.style.height = prevHeight;
  inner.style.minHeight = prevMinHeight;

  // Snap near-min rows to one height so spacing stays even between rows.
  if (natural <= minRowHeight + 2) {
    return minRowHeight;
  }

  return natural;
}
