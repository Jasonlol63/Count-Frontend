import { useCallback, useLayoutEffect, useRef, useState } from "react";

function readPrimaryGap(primaryEl) {
  const style = getComputedStyle(primaryEl);
  const gap = parseFloat(style.columnGap || style.gap);
  return Number.isFinite(gap) ? gap : 0;
}

function readRowGap(rowEl) {
  const style = getComputedStyle(rowEl);
  const gap = parseFloat(style.columnGap || style.gap);
  return Number.isFinite(gap) ? gap : 0;
}

/**
 * Collapse Bank Process status filter chips into the funnel icon only when
 * inline chips would not fit beside Add / Date / Search without pushing Delete.
 */
export function useBankProcessFilterCollapse({ remeasureDeps = [] }) {
  const toolbarTopRowRef = useRef(null);
  const toolbarPrimaryRef = useRef(null);
  const deleteActionsRef = useRef(null);
  const filterMeasureRef = useRef(null);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);

  const measure = useCallback(() => {
    const row = toolbarTopRowRef.current;
    const primary = toolbarPrimaryRef.current;
    const deleteEl = deleteActionsRef.current;
    const filterMeasure = filterMeasureRef.current;
    if (!row || !primary || !deleteEl || !filterMeasure) return;

    const filterInlineWidth = filterMeasure.offsetWidth;
    if (filterInlineWidth <= 0) return;

    const availablePrimary =
      row.clientWidth - deleteEl.getBoundingClientRect().width - readRowGap(row);

    let siblingsWidth = 0;
    let hasFilterSlot = false;
    let visibleChildCount = 0;

    for (const child of primary.children) {
      if (child.classList?.contains("bank-process-filter-measure")) continue;
      visibleChildCount += 1;
      if (child.classList?.contains("bank-process-filter-toolbar-slot")) {
        hasFilterSlot = true;
        continue;
      }
      siblingsWidth += child.getBoundingClientRect().width;
    }

    if (!hasFilterSlot) return;

    const primaryGap = readPrimaryGap(primary);
    const gapsWidth = Math.max(0, visibleChildCount - 1) * primaryGap;
    const inlineNeeded = siblingsWidth + gapsWidth + filterInlineWidth;
    const nextCollapsed = inlineNeeded > availablePrimary + 1;

    setIsFilterCollapsed((prev) => (prev === nextCollapsed ? prev : nextCollapsed));
  }, []);

  useLayoutEffect(() => {
    const observed = [
      toolbarTopRowRef.current,
      toolbarPrimaryRef.current,
      deleteActionsRef.current,
      filterMeasureRef.current,
    ].filter(Boolean);

    if (!observed.length) return undefined;

    const ro = new ResizeObserver(() => {
      measure();
    });
    for (const node of observed) ro.observe(node);

    measure();

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => measure()).catch(() => {});
    }

    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, ...remeasureDeps]);

  return {
    toolbarTopRowRef,
    toolbarPrimaryRef,
    deleteActionsRef,
    filterMeasureRef,
    isFilterCollapsed,
    remeasureFilterCollapse: measure,
  };
}
