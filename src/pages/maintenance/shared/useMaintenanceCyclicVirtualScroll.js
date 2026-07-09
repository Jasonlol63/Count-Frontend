import { useMemo, useRef } from "react";
import {
  createOffsetObserveElementOffset,
  useProgressiveScrollExtent,
} from "./useProgressiveScrollExtent.js";

/** scrollHeight ≈ 2× viewport → native thumb ~50% of track */
export const MAINTENANCE_CYCLIC_VIEWPORT_MULTIPLIER = 2;

/** Cyclic scroll applies even for short lists (same as Capture Maintenance). */
export const MAINTENANCE_CYCLIC_MIN_ROWS = 1;

/** Call before useVirtualizer — supplies observeElementOffset. */
export function useMaintenanceCyclicScrollObserver() {
  const contentOffsetRef = useRef(0);

  const observeElementOffset = useMemo(
    () => createOffsetObserveElementOffset(() => contentOffsetRef.current),
    [],
  );

  return { contentOffsetRef, observeElementOffset };
}

/** Call after rowVirtualizer.getTotalSize(). */
export function useMaintenanceCyclicScrollExtent({
  scrollRef,
  actualTotalH,
  rowCount,
  rowHeightEstimate,
  resetDeps = [],
  contentOffsetRef,
}) {
  const extent = useProgressiveScrollExtent({
    scrollRef,
    actualTotalH,
    rowCount,
    rowHeightEstimate,
    resetDeps,
    minRows: MAINTENANCE_CYCLIC_MIN_ROWS,
    initialViewportMultiplier: MAINTENANCE_CYCLIC_VIEWPORT_MULTIPLIER,
    enableCyclicRebound: true,
    contentOffsetRef,
  });

  const cyclicRowOffset =
    extent.isProgressive && !extent.inTerminalScroll ? extent.contentOffset : 0;

  return {
    ...extent,
    cyclicRowOffset,
  };
}
