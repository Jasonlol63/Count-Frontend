import { useEffect, useRef, useState } from "react";

/**
 * Hide chrome on scroll-down; reveal on scroll-up / near top.
 * Feels like modern iOS/Android tab bars.
 */
export function useScrollHideChrome(scrollRef, { threshold = 10, topReveal = 28 } = {}) {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;
    lastY.current = el.scrollTop;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        const y = el.scrollTop;
        const dy = y - lastY.current;
        lastY.current = y;
        if (y <= topReveal) {
          if (hiddenRef.current) {
            hiddenRef.current = false;
            setHidden(false);
          }
          return;
        }
        if (dy > threshold) {
          if (!hiddenRef.current) {
            hiddenRef.current = true;
            setHidden(true);
          }
        } else if (dy < -threshold) {
          if (hiddenRef.current) {
            hiddenRef.current = false;
            setHidden(false);
          }
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, threshold, topReveal]);

  return hidden;
}
