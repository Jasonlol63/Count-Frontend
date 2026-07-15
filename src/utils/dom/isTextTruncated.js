/**
 * Detect CSS text-overflow / line-clamp truncation.
 * Uses ceil/floor + Range fallback so non-100% browser zoom does not miss ellipsis.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isTextTruncated(el) {
  if (!el) return false;

  const { clientWidth, clientHeight, scrollWidth, scrollHeight } = el;
  if (clientWidth <= 0 && clientHeight <= 0) return false;

  if (Math.ceil(scrollWidth) > Math.floor(clientWidth)) return true;
  if (Math.ceil(scrollHeight) > Math.floor(clientHeight)) return true;

  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rangeRect = range.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (Math.ceil(rangeRect.width) > Math.floor(elRect.width)) return true;
    if (Math.ceil(rangeRect.height) > Math.floor(elRect.height)) return true;
  } catch {
    // ignore Range errors on empty/detached nodes
  }

  return false;
}
