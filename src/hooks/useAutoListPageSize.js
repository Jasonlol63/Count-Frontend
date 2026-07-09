import { useLayoutEffect, useRef, useState } from "react";

const DEFAULT_FALLBACK_ROW_HEIGHT = 30;
const DEFAULT_FALLBACK_PAGE_SIZE = 15;
const PAGINATION_RESERVE_PX = 52;
const VIEWPORT_BOTTOM_GAP_PX = 6;
const ABSOLUTE_ROW_HEIGHT_CAP = 72;
const PAGINATION_TOP_GAP_PX = 8;
const BUDGET_SAFETY_PX = 4;
const MIN_ROWS = 4;
const MAX_ROWS = 80;

function readCssPx(el, varName, fallback) {
  if (!el || typeof window === "undefined") return fallback;
  const raw = getComputedStyle(el).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.height = raw;
  document.body.appendChild(probe);
  const px = probe.offsetHeight;
  probe.remove();
  return px > 0 ? px : fallback;
}

function cellMinHeight(region) {
  return readCssPx(region, "--bank-list-cell-min-height", DEFAULT_FALLBACK_ROW_HEIGHT);
}

function rowHeightPx(row) {
  const h = row.getBoundingClientRect().height;
  if (h <= 0) return 0;
  return Math.min(h, ABSOLUTE_ROW_HEIGHT_CAP);
}

function compactStride(region, rows) {
  const cellMin = cellMinHeight(region);
  const heights = rows.map(rowHeightPx).filter((h) => h > 0).sort((a, b) => a - b);
  if (heights.length === 0) return cellMin;

  const p25 = heights[Math.floor(heights.length * 0.25)] ?? heights[0];
  return Math.max(cellMin, Math.min(p25, cellMin * 1.1));
}

/**
 * 可见数据区下沿：取 clip 底与分页条上沿中更靠上的（更严格），避免 fixed 分页条导致多算行数。
 */
function rowDisplayLimitBottom(region) {
  const limits = [];

  const clip = region.querySelector(".bank-virtual-scroll-clip");
  const clipBottom = clip?.getBoundingClientRect().bottom;
  if (clipBottom && clipBottom > 0) limits.push(clipBottom);

  const listBody = region.closest(".bank-process-list-body");
  const pagination = listBody?.querySelector(".pagination-container");
  if (pagination) {
    limits.push(pagination.getBoundingClientRect().top - PAGINATION_TOP_GAP_PX);
  }

  if (limits.length === 0) return null;
  return Math.min(...limits);
}

/** 表头下沿 → 可见区下沿 */
function measureBudget(region, headerSelector) {
  const minH = cellMinHeight(region);
  const header = region.querySelector(headerSelector);
  const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
  const limitBottom = rowDisplayLimitBottom(region);

  if (headerBottom > 0 && limitBottom != null && limitBottom > headerBottom) {
    return Math.max(0, limitBottom - headerBottom - BUDGET_SAFETY_PX);
  }

  const clip = region.querySelector(".bank-virtual-scroll-clip");
  const clipBudget = clip?.getBoundingClientRect().height ?? 0;
  if (clipBudget >= minH) return Math.max(0, clipBudget - BUDGET_SAFETY_PX);

  if (!header) return 0;
  const viewportH = window.visualViewport?.height ?? window.innerHeight;
  return Math.max(0, viewportH - headerBottom - PAGINATION_RESERVE_PX - VIEWPORT_BOTTOM_GAP_PX - BUDGET_SAFETY_PX);
}

/** 当前 DOM 中完整可见的行数（任一行底沿超出可见区则停止） */
function countRowsFullyVisible(region, rowSelector) {
  const limit = rowDisplayLimitBottom(region);
  if (limit == null) return 0;

  const rows = [...region.querySelectorAll(rowSelector)];
  let count = 0;

  for (const row of rows) {
    const bottom = row.getBoundingClientRect().bottom;
    if (bottom > limit) break;
    count += 1;
  }

  return count;
}

function computePageSize(region, budget, rowSelector, minRows, maxRows) {
  const cellMin = cellMinHeight(region);
  const rows = [...region.querySelectorAll(rowSelector)];
  const stride = rows.length > 0 ? compactStride(region, rows) : cellMin;
  const cap = Math.max(0, Math.floor(budget / stride));

  if (rows.length === 0) {
    return Math.max(minRows, Math.min(maxRows, cap || minRows));
  }

  let used = 0;
  let fit = 0;

  for (const row of rows) {
    const h = rowHeightPx(row);
    if (h <= 0) continue;
    if (used + h > budget) break;
    used += h;
    fit += 1;
  }

  while (fit < cap && used + stride <= budget) {
    used += stride;
    fit += 1;
  }

  return Math.max(minRows, Math.min(maxRows, fit, cap));
}

/**
 * Fit as many table rows as the list region can show without vertical scroll (non-Show-All).
 * Any row that would be clipped goes to the next page.
 */
export function useAutoListPageSize({
  listRegionRef,
  enabled = true,
  rowSelector = ".bank-virtual-data-row:not(.bank-virtual-data-row--message)",
  headerSelector = ".bank-virtual-head-row.table-header",
  minRows = MIN_ROWS,
  maxRows = MAX_ROWS,
  remeasureDeps = [],
}) {
  const [pageSize, setPageSize] = useState(DEFAULT_FALLBACK_PAGE_SIZE);
  const pageSizeRef = useRef(DEFAULT_FALLBACK_PAGE_SIZE);

  useLayoutEffect(() => {
    if (!enabled) return undefined;

    const region = listRegionRef?.current;
    if (!region) return undefined;

    const measure = () => {
      const el = listRegionRef.current;
      if (!el) return;

      const budget = measureBudget(el, headerSelector);
      if (budget < cellMinHeight(el)) return;

      const rows = [...el.querySelectorAll(rowSelector)];
      const budgetFit = computePageSize(el, budget, rowSelector, minRows, maxRows);
      let next = budgetFit;

      const visible = countRowsFullyVisible(el, rowSelector);
      if (visible > 0) {
        // Currency 等筛选后 DOM 可能只有 1 行，勿把 pageSize 锁死；数据变多后应信任预算重算
        const domUnderfilled = rows.length > 0 && rows.length < budgetFit;
        if (!domUnderfilled) {
          next = Math.min(next, visible);
        }
      }

      pageSizeRef.current = next;
      setPageSize((p) => (p === next ? p : next));
    };

    measure();
    const raf1 = window.requestAnimationFrame(() => {
      measure();
      window.requestAnimationFrame(() => {
        measure();
        window.requestAnimationFrame(measure);
      });
    });

    const ro = new ResizeObserver(() => measure());
    ro.observe(region);
    const wrapper = region.querySelector(".process-table-wrapper.bank-process-table-region");
    if (wrapper) ro.observe(wrapper);
    const clip = region.querySelector(".bank-virtual-scroll-clip");
    if (clip) ro.observe(clip);

    const listBody = region.closest(".bank-process-list-body");
    const pagination = listBody?.querySelector(".pagination-container");
    if (pagination) ro.observe(pagination);

    const onWindow = () => measure();
    window.addEventListener("resize", onWindow);
    window.addEventListener("ec:sidebar-layout-changed", onWindow);
    window.addEventListener("ec:bank-list-layout-changed", onWindow);
    window.visualViewport?.addEventListener("resize", onWindow);
    window.visualViewport?.addEventListener("scroll", onWindow);

    return () => {
      window.cancelAnimationFrame(raf1);
      ro.disconnect();
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("ec:sidebar-layout-changed", onWindow);
      window.removeEventListener("ec:bank-list-layout-changed", onWindow);
      window.visualViewport?.removeEventListener("resize", onWindow);
      window.visualViewport?.removeEventListener("scroll", onWindow);
    };
  }, [enabled, listRegionRef, headerSelector, rowSelector, minRows, maxRows, ...remeasureDeps]);

  return enabled ? pageSize : maxRows;
}
