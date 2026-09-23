import { useEffect, useRef } from "react";

/**
 * Scroll-linked top chrome + bottom nav tuck without React re-renders per frame.
 */
export function useDirectScrollChrome({
  scrollRef,
  topChromeRef,
  navRef,
  maxOffset,
  topReveal = 12,
  paused = false,
}) {
  const offsetRef = useRef(0);

  const resolveNav = () =>
    navRef?.current || document.querySelector("[data-persistent-nav]");

  useEffect(() => {
    if (paused) {
      offsetRef.current = 0;
      const chrome = topChromeRef.current;
      const nav = resolveNav();
      if (chrome) {
        chrome.style.transform = "translate3d(0, 0, 0)";
        chrome.setAttribute("aria-hidden", "false");
      }
      if (nav) {
        nav.style.setProperty("--m-nav-chrome-shift", "0%");
        nav.style.setProperty("--m-nav-chrome-opacity", "1");
        nav.classList.remove("m-shell-nav--hidden");
        nav.setAttribute("aria-hidden", "false");
      }
      return undefined;
    }

    const el = scrollRef.current;
    if (!el) return undefined;

    let lastY = el.scrollTop;
    let ticking = false;

    const apply = (offset) => {
      offsetRef.current = offset;
      const max = Math.max(1, maxOffset || 120);
      const progress = Math.min(1, offset / max);
      const chrome = topChromeRef.current;
      const nav = resolveNav();

      if (chrome) {
        chrome.style.transform = `translate3d(0, ${-offset}px, 0)`;
        chrome.setAttribute("aria-hidden", progress > 0.95 ? "true" : "false");
      }
      if (nav) {
        nav.style.setProperty("--m-nav-chrome-shift", `${progress * 120}%`);
        nav.style.setProperty("--m-nav-chrome-opacity", String(Math.max(0, 1 - progress * 1.15)));
        const hidden = progress > 0.88;
        nav.classList.toggle("m-shell-nav--hidden", hidden);
        nav.setAttribute("aria-hidden", hidden ? "true" : "false");
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = el.scrollTop;
        const dy = y - lastY;
        lastY = y;
        const max = Math.max(1, maxOffset || 120);
        let next = offsetRef.current;
        if (y <= topReveal) next = 0;
        else if (dy > 0) next = Math.min(max, next + dy);
        else if (dy < 0) next = Math.max(0, next + dy);
        if (Math.abs(next - offsetRef.current) >= 0.5) apply(next);
      });
    };

    apply(offsetRef.current);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, topChromeRef, navRef, maxOffset, topReveal, paused]);
}
