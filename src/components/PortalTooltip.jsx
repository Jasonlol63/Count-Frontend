import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 6;
const VIEWPORT_TOP_MIN = 44;

/** Only one portal tooltip visible at a time (sidebar, maintenance, etc.). */
let dismissActiveTooltip = null;

function dismissOtherTooltips() {
  if (dismissActiveTooltip) {
    dismissActiveTooltip();
    dismissActiveTooltip = null;
  }
}

/** Hide any visible portal tooltip (e.g. before opening a sidebar submenu). */
export function dismissAllPortalTooltips() {
  dismissOtherTooltips();
}

/**
 * Fixed portal tooltip — not clipped by overflow:hidden ancestors.
 * @param {{
 *   content?: string | null,
 *   enabled?: boolean,
 *   placement?: "top" | "below" | "right" | "auto-top",
 *   anchorClassName?: string,
 *   showOnFocus?: boolean,
 *   dismissOnPress?: boolean,
 *   children: import("react").ReactNode,
 * }} props
 */
export default function PortalTooltip({
  content,
  enabled = true,
  placement = "auto-top",
  anchorClassName = "",
  showOnFocus = true,
  dismissOnPress = false,
  children,
}) {
  const anchorRef = useRef(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const text = String(content ?? "").trim();
  const active = enabled && text.length > 0;

  const hideTooltip = useCallback(() => {
    setTooltipPos(null);
    if (dismissActiveTooltip === hideTooltip) dismissActiveTooltip = null;
  }, []);

  const updateTooltipPos = useCallback(() => {
    const el = anchorRef.current;
    if (!el || !active) return;
    const rect = el.getBoundingClientRect();

    if (placement === "right") {
      setTooltipPos({
        left: rect.right + GAP,
        top: rect.top + rect.height / 2,
        placement: "right",
      });
      return;
    }

    if (placement === "below") {
      setTooltipPos({
        left: rect.left,
        top: rect.bottom + GAP,
        placement: "below",
      });
      return;
    }

    if (placement === "top") {
      setTooltipPos({
        left: rect.left,
        top: rect.top - GAP,
        placement: "top",
      });
      return;
    }

    const placeBelow = rect.top < VIEWPORT_TOP_MIN;
    setTooltipPos({
      left: rect.left,
      top: placeBelow ? rect.bottom + GAP : rect.top - GAP,
      placement: placeBelow ? "below" : "top",
    });
  }, [active, placement]);

  const showTooltip = useCallback(() => {
    dismissOtherTooltips();
    dismissActiveTooltip = hideTooltip;
    updateTooltipPos();
  }, [hideTooltip, updateTooltipPos]);

  useEffect(
    () => () => {
      if (dismissActiveTooltip === hideTooltip) dismissActiveTooltip = null;
    },
    [hideTooltip],
  );

  useEffect(() => {
    if (!tooltipPos) return undefined;
    const onScrollOrResize = () => hideTooltip();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [tooltipPos, hideTooltip]);

  if (!active) return children;

  const anchorClass = ["portal-tooltip-anchor", anchorClassName].filter(Boolean).join(" ");

  const tooltipNode =
    tooltipPos &&
    createPortal(
      <span
        className={`app-portal-tooltip app-portal-tooltip--${tooltipPos.placement}`}
        style={{ left: tooltipPos.left, top: tooltipPos.top }}
        role="tooltip"
      >
        {text}
      </span>,
      document.body,
    );

  return (
    <>
      <span
        ref={anchorRef}
        className={anchorClass}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showOnFocus ? showTooltip : undefined}
        onBlur={showOnFocus ? hideTooltip : undefined}
        onPointerDown={dismissOnPress ? hideTooltip : undefined}
      >
        {children}
      </span>
      {tooltipNode}
    </>
  );
}
