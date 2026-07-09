import { useLayoutEffect, useRef } from "react";
import { useMaintenanceStandardVirtualScrollExtent } from "./useMaintenanceStandardVirtualScroll.js";

/** Pre-render extra rows above/below the viewport for smoother fast scrolling. */
export function pickMaintenanceVirtualOverscan(count) {
  if (count > 5000) return 10;
  if (count > 2000) return 12;
  if (count > 800) return 14;
  return 16;
}

/** Reset scroll position only when filters/query change — not on every data append. */
export function useMaintenanceVirtualScrollReset({
  scrollRef,
  scrollResetKey = "",
  rowVirtualizer,
  sizeCacheRef,
}) {
  const scrollResetKeyRef = useRef(scrollResetKey);

  useLayoutEffect(() => {
    if (scrollResetKeyRef.current === scrollResetKey) return;
    scrollResetKeyRef.current = scrollResetKey;
    scrollRef.current?.scrollTo(0, 0);
    sizeCacheRef?.current?.clear?.();
    rowVirtualizer.measure();
  }, [scrollResetKey, scrollRef, rowVirtualizer, sizeCacheRef]);
}

/**
 * Facebook-style scrollbar for all Maintenance tables:
 * - Long thumb at first → shortens as you scroll (progressive extent)
 * - While syncing / streaming: thumb tracks loaded row height
 */
export function useMaintenanceTableScrollExtent({
  scrollRef,
  actualTotalH,
  rowCount,
  rowHeightEstimate,
  scrollResetKey = "",
  listSyncing = false,
  /** Transaction 等流式分页：未拉完前滑块随批次变短 */
  dataIncomplete = false,
}) {
  return useMaintenanceStandardVirtualScrollExtent({
    scrollRef,
    actualTotalH,
    rowCount,
    rowHeightEstimate,
    resetDeps: [scrollResetKey],
    expandWithLoadedContent: listSyncing || dataIncomplete,
  });
}
