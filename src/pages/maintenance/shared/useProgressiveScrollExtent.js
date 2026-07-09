import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Only shrink scrollbar progressively when the list is long enough to matter. */
const DEFAULT_PROGRESSIVE_MIN_ROWS = 60;
const DEFAULT_INITIAL_VIEWPORT_MULTIPLIER = 5;
const GROW_VIEWPORT_MULTIPLIER = 2;
const GROW_AHEAD_VIEWPORT_MULTIPLIER = 1.5;
const GROW_THRESHOLD_VIEWPORT = 0.6;
const BOTTOM_EPSILON_PX = 3;
const REBOUND_LOCK_MS = 80;

function getClientHeight(scrollEl) {
  return scrollEl?.clientHeight > 0 ? scrollEl.clientHeight : 400;
}

/** Sticky thead inside the scroll container adds to scrollHeight but not spacer height. */
function getScrollChromeExtra(scrollEl) {
  const thead = scrollEl?.querySelector?.(".maintenance-virtual-thead");
  return thead?.offsetHeight > 0 ? thead.offsetHeight : 0;
}

/**
 * Reports scroll offset to the virtualizer as element.scrollTop + contentOffset
 * so cyclic scrollbar resets do not jump the visible rows.
 */
export function createOffsetObserveElementOffset(getContentOffset) {
  return (instance, cb) => {
    const element = instance.scrollElement;
    if (!element) return undefined;

    const notify = (isScrolling) => {
      cb(Math.max(0, element.scrollTop + getContentOffset()), isScrolling);
    };

    const onScroll = () => notify(true);
    const onScrollEnd = () => notify(false);

    notify(false);
    element.addEventListener("scroll", onScroll, { passive: true });
    if ("onscrollend" in element) {
      element.addEventListener("scrollend", onScrollEnd, { passive: true });
    }

    return () => {
      element.removeEventListener("scroll", onScroll);
      if ("onscrollend" in element) {
        element.removeEventListener("scrollend", onScrollEnd);
      }
    };
  };
}

/**
 * Virtual list spacer height that starts smaller than full content so the
 * scrollbar thumb stays usable, then grows as the user scrolls downward.
 *
 * With enableCyclicRebound, spacer height stays fixed per cycle (~50% thumb),
 * then scrollTop resets to 0 at the bottom of the track while contentOffset advances.
 */
export function useProgressiveScrollExtent({
  scrollRef,
  actualTotalH,
  rowCount,
  rowHeightEstimate = 52,
  resetDeps = [],
  minRows = DEFAULT_PROGRESSIVE_MIN_ROWS,
  initialViewportMultiplier = DEFAULT_INITIAL_VIEWPORT_MULTIPLIER,
  enableCyclicRebound = false,
  /** While true, spacer matches all loaded rows (streaming / background sync). */
  forceFullExtent = false,
  /** 流式加载：滚动范围随 actualTotalH 增长，滑块从长到短（不重置 scrollTop）。 */
  expandWithLoadedContent = false,
  /** Shared with virtualizer observeElementOffset when cyclic rebound is enabled. */
  contentOffsetRef: externalContentOffsetRef,
}) {
  const [extentH, setExtentH] = useState(0);
  const [cycleSpacerH, setCycleSpacerH] = useState(0);
  const [contentOffset, setContentOffset] = useState(0);
  const [inTerminalScroll, setInTerminalScroll] = useState(false);
  const rafRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const internalContentOffsetRef = useRef(0);
  const contentOffsetRef = externalContentOffsetRef ?? internalContentOffsetRef;
  const isReboundingRef = useRef(false);
  const reboundTimerRef = useRef(null);
  const wasExpandingLoadedRef = useRef(false);

  const tracksLoadedContent = forceFullExtent || expandWithLoadedContent;
  const enabled =
    rowCount >= minRows && actualTotalH > 0 && actualTotalH > rowHeightEstimate;

  const isTerminalPhase = useCallback(() => {
    if (!enabled || !enableCyclicRebound) return false;
    if (inTerminalScroll) return true;
    const el = scrollRef.current;
    const clientH = getClientHeight(el);
    return contentOffsetRef.current + clientH >= actualTotalH - rowHeightEstimate;
  }, [scrollRef, actualTotalH, enabled, enableCyclicRebound, rowHeightEstimate, contentOffsetRef, inTerminalScroll]);

  /** Spacer height so native thumb ≈ 50% (accounts for sticky thead in scrollHeight). */
  const measureCycleSpacer = useCallback(() => {
    const el = scrollRef.current;
    const clientH = getClientHeight(el);
    const chrome = getScrollChromeExtra(el);
    const targetScrollH = clientH * initialViewportMultiplier;
    return Math.max(clientH, targetScrollH - chrome);
  }, [scrollRef, initialViewportMultiplier]);

  const computeInitialExtent = useCallback(() => {
    if (!enabled) return actualTotalH;
    if (enableCyclicRebound) {
      if (isTerminalPhase()) return actualTotalH;
      return Math.min(actualTotalH, measureCycleSpacer());
    }
    const el = scrollRef.current;
    const clientH = getClientHeight(el);
    const byViewport = clientH * initialViewportMultiplier;
    const byRows = Math.min(rowCount, 80) * rowHeightEstimate;
    return Math.min(actualTotalH, Math.max(byViewport, byRows, clientH));
  }, [
    scrollRef,
    actualTotalH,
    rowCount,
    rowHeightEstimate,
    enabled,
    initialViewportMultiplier,
    enableCyclicRebound,
    isTerminalPhase,
    measureCycleSpacer,
  ]);

  const resetCyclicState = useCallback(() => {
    contentOffsetRef.current = 0;
    setContentOffset(0);
    setInTerminalScroll(false);
  }, [contentOffsetRef]);

  useLayoutEffect(() => {
    resetCyclicState();
    if (enableCyclicRebound && enabled) {
      setCycleSpacerH(measureCycleSpacer());
      setExtentH(0);
    } else {
      setExtentH(computeInitialExtent());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on filter/query change (resetDeps)
  }, [resetCyclicState, enableCyclicRebound, enabled, measureCycleSpacer, ...resetDeps]);

  /** 流式追加：extent 跟随已加载高度，滑块平滑变短 */
  useLayoutEffect(() => {
    if (!enabled || enableCyclicRebound || !expandWithLoadedContent) return;
    wasExpandingLoadedRef.current = true;
    setExtentH(actualTotalH);
  }, [actualTotalH, enabled, enableCyclicRebound, expandWithLoadedContent]);

  useLayoutEffect(() => {
    if (expandWithLoadedContent || !wasExpandingLoadedRef.current) return;
    wasExpandingLoadedRef.current = false;
    setExtentH((prev) => Math.min(actualTotalH, Math.max(prev, actualTotalH)));
  }, [expandWithLoadedContent, actualTotalH]);

  /** Grow scroll range as loaded rows increase — do not wait for user scroll. */
  useLayoutEffect(() => {
    if (!enabled || enableCyclicRebound || tracksLoadedContent) return;
    setExtentH((prev) => {
      const initial = computeInitialExtent();
      if (prev <= 0) return initial;
      return Math.min(actualTotalH, Math.max(prev, initial));
    });
  }, [actualTotalH, enabled, enableCyclicRebound, tracksLoadedContent, computeInitialExtent]);

  useLayoutEffect(() => {
    if (!enabled || !enableCyclicRebound) return undefined;
    const el = scrollRef.current;
    if (!el) return undefined;
    const sync = () => setCycleSpacerH(measureCycleSpacer());
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    const thead = el.querySelector(".maintenance-virtual-thead");
    if (thead) ro.observe(thead);
    return () => ro.disconnect();
  }, [scrollRef, enabled, enableCyclicRebound, measureCycleSpacer]);

  useLayoutEffect(() => {
    if (!enabled || !enableCyclicRebound) return;
    scrollRef.current?.dispatchEvent(new Event("scroll", { bubbles: false }));
  }, [contentOffset, enabled, enableCyclicRebound, scrollRef]);

  const growExtent = useCallback(() => {
    if (!enabled || enableCyclicRebound) return;
    const el = scrollRef.current;
    if (!el || isReboundingRef.current) return;

    const clientH = getClientHeight(el);
    const effectiveTop = contentOffsetRef.current + el.scrollTop;

    setExtentH((prev) => {
      if (prev >= actualTotalH) return prev;
      const threshold = Math.max(0, prev - clientH * GROW_THRESHOLD_VIEWPORT);
      if (effectiveTop < threshold) return prev;
      const target = Math.min(
        actualTotalH,
        Math.max(
          prev + clientH * GROW_VIEWPORT_MULTIPLIER,
          effectiveTop + clientH * GROW_AHEAD_VIEWPORT_MULTIPLIER,
        ),
      );
      return target > prev ? target : prev;
    });
  }, [scrollRef, actualTotalH, enabled, enableCyclicRebound, contentOffsetRef]);

  const revealExtentForScrollTop = useCallback(
    (scrollTop) => {
      if (!enabled || enableCyclicRebound) return;
      const el = scrollRef.current;
      const clientH = getClientHeight(el);
      const effectiveTop = contentOffsetRef.current + Math.max(0, scrollTop);
      const needed = Math.min(
        actualTotalH,
        effectiveTop + clientH * GROW_AHEAD_VIEWPORT_MULTIPLIER,
      );
      setExtentH((prev) => (needed > prev ? needed : prev));
    },
    [scrollRef, actualTotalH, enabled, enableCyclicRebound, contentOffsetRef],
  );

  const tryCyclicRebound = useCallback(() => {
    if (!enabled || !enableCyclicRebound || isReboundingRef.current) return false;

    const el = scrollRef.current;
    if (!el) return false;

    if (isTerminalPhase()) return false;

    const clientH = getClientHeight(el);
    const scrollTop = el.scrollTop;
    const scrollH = el.scrollHeight;
    const maxScroll = Math.max(0, scrollH - clientH);

    if (maxScroll <= 0) return false;
    if (scrollTop < maxScroll - BOTTOM_EPSILON_PX) return false;

    const consumed = scrollTop;
    if (consumed <= 0) return false;

    const nextOffset = contentOffsetRef.current + consumed;
    if (nextOffset + clientH >= actualTotalH - rowHeightEstimate) {
      const targetScroll = Math.min(Math.max(0, actualTotalH - clientH), nextOffset);
      isReboundingRef.current = true;
      setInTerminalScroll(true);
      contentOffsetRef.current = 0;
      setContentOffset(0);
      el.scrollTop = 0;
      lastScrollTopRef.current = 0;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollTop = targetScroll;
          lastScrollTopRef.current = targetScroll;
          isReboundingRef.current = false;
          el.dispatchEvent(new Event("scroll", { bubbles: false }));
        });
      });
      return true;
    }

    isReboundingRef.current = true;
    contentOffsetRef.current = nextOffset;
    setContentOffset(nextOffset);

    el.scrollTop = 0;
    lastScrollTopRef.current = 0;

    if (reboundTimerRef.current) clearTimeout(reboundTimerRef.current);
    reboundTimerRef.current = setTimeout(() => {
      isReboundingRef.current = false;
      reboundTimerRef.current = null;
      el.dispatchEvent(new Event("scroll", { bubbles: false }));
    }, REBOUND_LOCK_MS);

    return true;
  }, [
    scrollRef,
    actualTotalH,
    enabled,
    enableCyclicRebound,
    rowHeightEstimate,
    isTerminalPhase,
    contentOffsetRef,
  ]);

  const tryReverseCyclicRebound = useCallback(() => {
    if (!enabled || !enableCyclicRebound || isReboundingRef.current) return false;
    if (contentOffsetRef.current <= 0) return false;

    const el = scrollRef.current;
    if (!el || el.scrollTop > BOTTOM_EPSILON_PX) return false;

    const clientH = getClientHeight(el);
    const cycleScroll = Math.max(0, measureCycleSpacer() + getScrollChromeExtra(el) - clientH);
    if (cycleScroll <= 0) return false;

    isReboundingRef.current = true;
    const nextOffset = Math.max(0, contentOffsetRef.current - cycleScroll);
    contentOffsetRef.current = nextOffset;
    setContentOffset(nextOffset);
    el.scrollTop = Math.min(cycleScroll, Math.max(0, actualTotalH - nextOffset - clientH));
    lastScrollTopRef.current = el.scrollTop;

    if (reboundTimerRef.current) clearTimeout(reboundTimerRef.current);
    reboundTimerRef.current = setTimeout(() => {
      isReboundingRef.current = false;
      reboundTimerRef.current = null;
      el.dispatchEvent(new Event("scroll", { bubbles: false }));
    }, REBOUND_LOCK_MS);

    return true;
  }, [scrollRef, enabled, enableCyclicRebound, measureCycleSpacer, actualTotalH, contentOffsetRef]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!enableCyclicRebound && extentH <= 0) return undefined;

    const el = scrollRef.current;
    if (!el) return undefined;

    lastScrollTopRef.current = el.scrollTop;

    const onScroll = () => {
      if (isReboundingRef.current) return;

      const scrollTop = el.scrollTop;
      if (!enableCyclicRebound) {
        revealExtentForScrollTop(scrollTop);
      }

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const prevTop = lastScrollTopRef.current;
        lastScrollTopRef.current = scrollTop;

        if (enableCyclicRebound) {
          if (scrollTop >= prevTop - 0.5) {
            tryCyclicRebound();
          } else {
            tryReverseCyclicRebound();
          }
          return;
        }

        if (scrollTop > prevTop + 0.5) {
          growExtent();
        }
      });
    };

    const onScrollEnd = () => {
      if (enableCyclicRebound) tryCyclicRebound();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    if (enableCyclicRebound && "onscrollend" in el) {
      el.addEventListener("scrollend", onScrollEnd, { passive: true });
    }

    return () => {
      el.removeEventListener("scroll", onScroll);
      if (enableCyclicRebound && "onscrollend" in el) {
        el.removeEventListener("scrollend", onScrollEnd);
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (reboundTimerRef.current) {
        clearTimeout(reboundTimerRef.current);
        reboundTimerRef.current = null;
      }
    };
  }, [
    scrollRef,
    growExtent,
    revealExtentForScrollTop,
    enabled,
    extentH,
    enableCyclicRebound,
    tryCyclicRebound,
    tryReverseCyclicRebound,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled || enableCyclicRebound) return undefined;
    const ro = new ResizeObserver(() => {
      setExtentH((prev) => {
        const initial = computeInitialExtent();
        if (prev <= 0) return initial;
        return Math.min(actualTotalH, Math.max(initial, prev));
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, enabled, enableCyclicRebound, computeInitialExtent, actualTotalH]);

  const displayTotalH = (() => {
    if (forceFullExtent && actualTotalH > 0) return actualTotalH;
    if (expandWithLoadedContent && actualTotalH > 0) return actualTotalH;
    if (!enabled) return actualTotalH;
    if (enableCyclicRebound) {
      if (isTerminalPhase()) return actualTotalH;
      const cycle = cycleSpacerH > 0 ? cycleSpacerH : measureCycleSpacer();
      return Math.min(actualTotalH, cycle);
    }
    return extentH > 0 ? Math.min(extentH, actualTotalH) : computeInitialExtent();
  })();

  return {
    displayTotalH,
    revealExtentForScrollTop,
    isProgressive: enabled,
    contentOffset,
    inTerminalScroll: enableCyclicRebound && inTerminalScroll,
    getEffectiveScrollTop: () => contentOffsetRef.current + (scrollRef.current?.scrollTop ?? 0),
  };
}
