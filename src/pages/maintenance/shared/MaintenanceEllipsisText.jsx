import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import PortalTooltip from "../../../components/PortalTooltip.jsx";
import { isTextTruncated } from "../../../utils/dom/isTextTruncated.js";

/**
 * Single-line ellipsis with portal tooltip for truncated maintenance table text.
 * @param {{ value?: string | null, className?: string, alwaysTooltip?: boolean }} props
 */
export default function MaintenanceEllipsisText({
  value,
  className = "payment-cell-text",
  alwaysTooltip = false,
}) {
  const textRef = useRef(null);
  const [truncated, setTruncated] = useState(false);
  const display = value == null || String(value).trim() === "" ? "-" : String(value);

  const measure = useCallback(() => {
    const el = textRef.current;
    setTruncated(isTextTruncated(el));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = textRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [display, measure]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <PortalTooltip
      content={display}
      enabled={display !== "-" && (alwaysTooltip || truncated)}
      placement="below"
      tooltipClassName="app-portal-tooltip--multiline"
    >
      <span ref={textRef} className={className}>
        {display}
      </span>
    </PortalTooltip>
  );
}
