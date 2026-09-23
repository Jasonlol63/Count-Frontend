import { useEffect, useRef, useState } from "react";

/** Find the nearest ancestor that actually scrolls (MobileShell main, etc.). */
function findScrollRoot(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Incremental rendering for long mobile lists (poor man's virtualization):
 * render the first chunk only, then grow as the sentinel scrolls into view.
 * Prevents the page from freezing when a query returns thousands of rows.
 */
export function useIncrementalList(items, pageSize = 60) {
  const [count, setCount] = useState(pageSize);
  const sentinelRef = useRef(null);

  useEffect(() => {
    setCount(pageSize);
  }, [items, pageSize]);

  const hasMore = items.length > count;

  useEffect(() => {
    if (!hasMore) return undefined;
    const el = sentinelRef.current;
    if (!el) return undefined;

    const root = findScrollRoot(el);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((n) => Math.min(n + pageSize, items.length));
        }
      },
      { root, rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, pageSize, items, count]);

  return {
    visible: hasMore ? items.slice(0, count) : items,
    hasMore,
    sentinelRef,
    shown: Math.min(count, items.length),
    total: items.length,
  };
}
