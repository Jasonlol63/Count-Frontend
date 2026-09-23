import { useEffect, useRef, useState } from "react";

/**
 * Scroll-linked chrome tuck: offset grows while scrolling down, shrinks while scrolling up.
 * Drives transform in sync with finger movement (no snap fly).
 */
export function useScrollChromeOffset(scrollRef, { maxOffset = 120, topReveal = 12 } = {}) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const lastY = useRef(0);
  const ticking = useRef(false);
  const maxRef = useRef(maxOffset);
  maxRef.current = maxOffset;

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
        const max = Math.max(1, maxRef.current || 120);
        let next = offsetRef.current;
        if (y <= topReveal) next = 0;
        else if (dy > 0) next = Math.min(max, next + dy);
        else if (dy < 0) next = Math.max(0, next + dy);
        if (Math.abs(next - offsetRef.current) < 0.5) return;
        offsetRef.current = next;
        setOffset(next);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, topReveal]);

  return offset;
}
