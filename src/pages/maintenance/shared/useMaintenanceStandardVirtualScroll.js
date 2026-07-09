import { useProgressiveScrollExtent } from "./useProgressiveScrollExtent.js";

/** Progressive spacer growth for long lists; short lists use full native scroll (no cyclic rebound). */
const STANDARD_MIN_ROWS = 60;
const STANDARD_INITIAL_VIEWPORT_MULTIPLIER = 5;

/**
 * Payment / Bank Process maintenance tables: avoid cyclic scrollbar rebound
 * (scrollTop reset at track bottom causes twitching and hides last rows).
 */
export function useMaintenanceStandardVirtualScrollExtent({
  scrollRef,
  actualTotalH,
  rowCount,
  rowHeightEstimate,
  resetDeps = [],
  forceFullExtent = false,
  /** 后台流式加载：滚动范围随已加载行数增长，滑块逐渐变短 */
  expandWithLoadedContent = false,
}) {
  const extent = useProgressiveScrollExtent({
    scrollRef,
    actualTotalH,
    rowCount,
    rowHeightEstimate,
    resetDeps,
    minRows: STANDARD_MIN_ROWS,
    initialViewportMultiplier: STANDARD_INITIAL_VIEWPORT_MULTIPLIER,
    enableCyclicRebound: false,
    forceFullExtent,
    expandWithLoadedContent,
  });

  return {
    displayTotalH: extent.displayTotalH,
    cyclicRowOffset: 0,
  };
}
