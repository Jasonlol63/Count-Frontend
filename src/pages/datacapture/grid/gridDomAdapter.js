/** Apply grid model fields onto a live table cell element (restore / version bump). */
export function applyCellModelToElement(el, cell) {
  if (!el) return;

  if (cell?.colspan && cell.colspan > 1) {
    el.setAttribute("colspan", String(cell.colspan));
  } else {
    el.removeAttribute("colspan");
  }

  if (cell?.hidden) {
    el.style.display = "none";
  } else {
    el.style.display = "";
  }

  if (cell?.className) {
    el.className = cell.className;
  }

  if (cell?.style && typeof cell.style === "object") {
    Object.assign(el.style, cell.style);
  }

  const nextValue = cell?.value != null ? String(cell.value) : "";
  if (cell?.html) {
    if (el.innerHTML !== cell.html) {
      el.innerHTML = cell.html;
    }
  } else if ((el.textContent || "") !== nextValue) {
    el.textContent = nextValue;
  }

  if (cell?.styleCssText) {
    el.style.cssText = cell.styleCssText;
  }
}
