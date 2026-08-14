/**
 * Detect CSS text-overflow / line-clamp truncation.
 * Uses a small pixel tolerance (not ceil/floor on both sides, which widens the gap
 * and falsely flags fully-visible text as truncated on sub-pixel layouts, e.g.
 * -webkit-line-clamp rows that fit in 2 lines) so short/fully-shown text never
 * triggers the tooltip, while genuinely clipped text still does.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isTextTruncated(el) {
  if (!el) return false;

  const { clientWidth, clientHeight, scrollWidth, scrollHeight } = el;
  if (clientWidth <= 0 && clientHeight <= 0) return false;

  const TOLERANCE_PX = 1;

  if (scrollWidth - clientWidth > TOLERANCE_PX) return true;
  if (scrollHeight - clientHeight > TOLERANCE_PX) return true;

  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rangeRect = range.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (rangeRect.width - elRect.width > TOLERANCE_PX) return true;
    if (rangeRect.height - elRect.height > TOLERANCE_PX) return true;
  } catch {
    // ignore Range errors on empty/detached nodes
  }

  return false;
}
