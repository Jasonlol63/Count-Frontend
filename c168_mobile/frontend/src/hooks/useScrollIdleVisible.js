import { useEffect, useRef, useState } from "react";

/**
 * Hide UI while scrolling; reveal after idle.
 * Avoids setState on every scroll tick (was causing jank with FAB + blur).
 */
export function useScrollIdleVisible(scrollRef, { idleMs = 320, minDelta = 4, onScrollStart } = {}) {
  const [visible, setVisible] = useState(true);
  const visibleRef = useRef(true);
  const lastY = useRef(0);
  const timer = useRef(null);
  const ticking = useRef(false);
  const onScrollStartRef = useRef(onScrollStart);
  onScrollStartRef.current = onScrollStart;

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;
    lastY.current = el.scrollTop;

    const clearTimer = () => {
      if (timer.current != null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const hide = () => {
      if (!visibleRef.current) return;
      visibleRef.current = false;
      setVisible(false);
      onScrollStartRef.current?.();
    };

    const scheduleShow = () => {
      clearTimer();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (visibleRef.current) return;
        visibleRef.current = true;
        setVisible(true);
      }, idleMs);
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        const y = el.scrollTop;
        const dy = Math.abs(y - lastY.current);
        lastY.current = y;
        if (dy < minDelta) return;
        hide();
        scheduleShow();
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimer();
      el.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef, idleMs, minDelta]);

  return visible;
}
