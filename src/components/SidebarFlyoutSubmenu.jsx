import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PAD = 8;

function measureFlyoutNaturalHeight(flyoutEl) {
  const savedMax = flyoutEl.style.maxHeight;
  flyoutEl.style.maxHeight = "none";
  const height = flyoutEl.scrollHeight;
  flyoutEl.style.maxHeight = savedMax;
  return height;
}

function computeFlyoutPosition(anchorEl, flyoutEl) {
  const anchorRect = anchorEl.getBoundingClientRect();
  const flyoutWidth = flyoutEl.offsetWidth || 160;
  const viewportBottom = window.innerHeight - VIEWPORT_PAD;
  const naturalHeight = measureFlyoutNaturalHeight(flyoutEl);

  const sidebar = anchorEl.closest(".informationmenu");
  const sidebarRight = sidebar?.getBoundingClientRect().right;
  let left =
    typeof sidebarRight === "number" && Number.isFinite(sidebarRight)
      ? sidebarRight
      : anchorRect.right;
  if (left + flyoutWidth > window.innerWidth - VIEWPORT_PAD) {
    left = Math.max(VIEWPORT_PAD, window.innerWidth - flyoutWidth - VIEWPORT_PAD);
  }

  const top = Math.max(VIEWPORT_PAD, anchorRect.top - 2);
  // Always align with the anchor row; overflow scrolls inside the flyout (may extend over footer).
  const available = viewportBottom - top;
  const scrollable = naturalHeight > available;
  const maxHeight = scrollable ? Math.max(available, 0) : null;

  return { top, left, maxHeight, scrollable };
}

/** Flyout submenu portaled to body — escapes sidebar overflow/transform clipping. */
export default function SidebarFlyoutSubmenu({
  id,
  open,
  anchorRef,
  onMouseEnter,
  onMouseLeave,
  children,
}) {
  const flyoutRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: null, scrollable: false });
  const [positioned, setPositioned] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setPositioned(false);
      return undefined;
    }

    const anchor = anchorRef?.current;
    const flyout = flyoutRef.current;
    if (!anchor || !flyout) return undefined;

    const sync = () => {
      const next = computeFlyoutPosition(anchor, flyout);
      setPos((prev) =>
        prev.top === next.top &&
        prev.left === next.left &&
        prev.maxHeight === next.maxHeight &&
        prev.scrollable === next.scrollable
          ? prev
          : next,
      );
      setPositioned(true);
    };

    sync();
    const raf = requestAnimationFrame(sync);

    const sidebar = anchor.closest(".informationmenu");
    const menuScroll =
      anchor.closest(".sidebar-scroll") ??
      anchor.closest(".informationmenu-content") ??
      anchor.closest(".informationmenu");
    menuScroll?.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    window.addEventListener("ec:sidebar-layout-changed", sync);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(flyout);
    ro?.observe(anchor);
    if (sidebar) ro?.observe(sidebar);

    return () => {
      cancelAnimationFrame(raf);
      menuScroll?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("ec:sidebar-layout-changed", sync);
      ro?.disconnect();
    };
  }, [open, anchorRef]);

  if (!open || typeof document === "undefined" || !document.body) return null;

  const className = `submenu show${pos.scrollable ? " submenu--scrollable" : ""}`;

  return createPortal(
    <div
      ref={flyoutRef}
      className={className}
      id={id}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        opacity: positioned ? 1 : 0,
        visibility: positioned ? "visible" : "hidden",
        transform: "translateX(0)",
        pointerEvents: "auto",
        zIndex: 4000,
        ...(pos.maxHeight != null ? { maxHeight: pos.maxHeight } : {}),
      }}
      aria-hidden={!open}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="submenu-content">{children}</div>
    </div>,
    document.body,
  );
}
