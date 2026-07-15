const ESSENTIAL_CELL_CLASSES = new Set(["selected", "multi-selected"]);

/** Apply grid model fields onto a live table cell element (restore / version bump). */
export function applyCellModelToElement(el, cell) {
  if (!el) return;

  if (cell?.colspan && cell.colspan > 1) {
    el.setAttribute("colspan", String(cell.colspan));
  } else {
    el.removeAttribute("colspan");
  }

  if (cell?.className) {
    el.className = cell.className;
  } else {
    // Drop pasted report classes on clear/reset; keep selection chrome only.
    Array.from(el.classList).forEach((cls) => {
      if (!ESSENTIAL_CELL_CLASSES.has(cls)) el.classList.remove(cls);
    });
  }

  const nextValue = cell?.value != null ? String(cell.value) : "";
  if (cell?.html) {
    if (el.innerHTML !== cell.html) {
      el.innerHTML = cell.html;
    }
  } else if ((el.textContent || "") !== nextValue || el.children.length > 0) {
    // Always wipe child nodes (e.g. pasted action buttons/icons) when model has no html.
    el.textContent = nextValue;
  }

  if (cell?.styleCssText) {
    el.style.cssText = cell.styleCssText;
  } else if (cell?.style && typeof cell.style === "object") {
    el.removeAttribute("style");
    Object.assign(el.style, cell.style);
  } else {
    el.removeAttribute("style");
  }

  if (cell?.hidden) {
    el.style.display = "none";
  } else if (el.style.display === "none") {
    el.style.display = "";
  }
}
