import { useEffect, useLayoutEffect, useRef } from "react";
import { saveSummaryRefreshStatePure } from "../lib/summaryRefreshStatePure.js";
import { useSummaryContext } from "../context/SummaryContext.jsx";

const SCROLL_SHELL_SELECTORS = [
  "#root",
  ".ec-page-shell",
  ".ec-page-shell__content",
  ".container",
  "#summaryTableContainer",
  ".summary-table-container",
];

/** Ownership-page pattern: body scrolls; kill nested vertical scrollports on Summary. */
function applySummaryPageScrollLock() {
  const html = document.documentElement;

  html.style.setProperty("overflow", "visible", "important");
  html.style.setProperty("height", "auto", "important");

  document.body.style.setProperty("overflow-x", "hidden", "important");
  document.body.style.setProperty("overflow-y", "auto", "important");
  document.body.style.setProperty("height", "auto", "important");
  document.body.style.setProperty("min-height", "100vh", "important");
  document.body.style.setProperty("max-height", "none", "important");

  for (const selector of SCROLL_SHELL_SELECTORS) {
    document.querySelectorAll(selector).forEach((el) => {
      el.style.setProperty("overflow", "visible", "important");
      el.style.setProperty("max-height", "none", "important");
      el.style.setProperty("height", "auto", "important");
      el.style.setProperty("min-height", "0", "important");
    });
  }

  document.querySelectorAll(".summary-table-x-scroll").forEach((el) => {
    el.style.setProperty("overflow-x", "auto", "important");
    el.style.setProperty("overflow-y", "visible", "important");
    el.style.setProperty("max-height", "none", "important");
    el.style.setProperty("height", "auto", "important");
  });

  document.querySelectorAll("#summaryTableContainer *").forEach((el) => {
    if (el.classList.contains("summary-table-x-scroll")) return;
    if (el.closest(".captured-table-container")) return;

    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const canScrollY =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden") &&
      el.scrollHeight > el.clientHeight + 1;

    if (canScrollY || style.overflow === "auto" || style.overflow === "scroll") {
      el.style.setProperty("overflow-y", "visible", "important");
      el.style.setProperty("overflow", "visible", "important");
      el.style.setProperty("max-height", "none", "important");
    }
  });
}

function clearSummaryPageScrollLock() {
  const html = document.documentElement;
  const body = document.body;

  html.style.removeProperty("overflow");
  html.style.removeProperty("height");

  for (const prop of ["overflow-x", "overflow-y", "height", "min-height", "max-height"]) {
    body.style.removeProperty(prop);
  }
}

/**
 * @param {unknown} rowsRevision — bump when table rows render (e.g. rows.length) to re-apply after F5 restore.
 */
export function useSummaryPageScroll(rowsRevision) {
  useLayoutEffect(() => {
    const run = () => applySummaryPageScrollLock();
    run();
    const raf = requestAnimationFrame(run);

    const root = document.getElementById("summaryTableContainer");
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            run();
          })
        : null;
    if (root && observer) observer.observe(root);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      clearSummaryPageScrollLock();
    };
  }, []);

  useLayoutEffect(() => {
    applySummaryPageScrollLock();
    const raf = requestAnimationFrame(applySummaryPageScrollLock);
    return () => cancelAnimationFrame(raf);
  }, [rowsRevision]);
}

/**
 * Persist formula/rate draft before F5 or tab close (legacy beforeunload parity).
 */
export function useSummaryRefreshPersist({ captureScope, processId, processCode, enabled }) {
  const { rows, dataPopulating } = useSummaryContext();
  const rowsRef = useRef(rows);
  const dataPopulatingRef = useRef(dataPopulating);
  rowsRef.current = rows;
  dataPopulatingRef.current = dataPopulating;

  useEffect(() => {
    if (!enabled) return undefined;

    const persist = () => {
      if (window.isNavigatingAwayByBackOrSubmit) return;
      if (dataPopulatingRef.current) return;
      const currentRows = rowsRef.current;
      if (!currentRows?.length) return;
      saveSummaryRefreshStatePure(currentRows, { processId, processCode }, captureScope);
    };

    window.addEventListener("beforeunload", persist);
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("beforeunload", persist);
      window.removeEventListener("pagehide", persist);
    };
  }, [enabled, captureScope, processId, processCode]);

  useEffect(() => {
    if (!enabled || dataPopulating || !rows?.length) return undefined;
    const timer = window.setTimeout(() => {
      if (window.isNavigatingAwayByBackOrSubmit) return;
      if (dataPopulatingRef.current) return;
      saveSummaryRefreshStatePure(rows, { processId, processCode }, captureScope);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [enabled, rows, dataPopulating, captureScope, processId, processCode]);
}
