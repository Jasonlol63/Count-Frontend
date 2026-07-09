import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import PortalTooltip from "../../../components/PortalTooltip.jsx";

let collapseActiveExpandedCell = null;

function collapseOtherExpandedCells(collapseSelf) {
  if (collapseActiveExpandedCell && collapseActiveExpandedCell !== collapseSelf) {
    collapseActiveExpandedCell();
  }
}

/** Ellipsis cell: hover portal tooltip + click to expand over neighbors; click outside to collapse. */
export default function TransactionHistoryEllipsisCell({ value, className = "" }) {
  const rootRef = useRef(null);
  const textRef = useRef(null);
  const [truncated, setTruncated] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const display = value == null || String(value).trim() === "" ? "-" : String(value);
  const canExpand = truncated && display !== "-";

  const collapse = useCallback(() => {
    setExpanded(false);
    if (collapseActiveExpandedCell === collapse) collapseActiveExpandedCell = null;
  }, []);

  const measure = useCallback(() => {
    const el = textRef.current;
    if (!el) {
      setTruncated(false);
      return;
    }
    setTruncated(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = textRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [display, measure]);

  useEffect(() => {
    if (!expanded) return undefined;

    const onDocumentPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      collapse();
    };

    document.addEventListener("mousedown", onDocumentPointerDown, true);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown, true);
  }, [expanded, collapse]);

  useEffect(
    () => () => {
      if (collapseActiveExpandedCell === collapse) collapseActiveExpandedCell = null;
    },
    [collapse],
  );

  const onExpandClick = useCallback(
    (event) => {
      if (!canExpand || expanded) return;
      event.stopPropagation();
      collapseOtherExpandedCells(collapse);
      setExpanded(true);
      collapseActiveExpandedCell = collapse;
    },
    [canExpand, expanded, collapse],
  );

  const textClass = [
    "transaction-history-cell-text",
    expanded ? "transaction-history-cell-text--expanded" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const rootClass = [
    "transaction-history-ellipsis-cell",
    canExpand ? "transaction-history-ellipsis-cell--truncated" : "",
    expanded ? "transaction-history-ellipsis-cell--expanded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={rootRef}
      className={rootClass}
      onClick={onExpandClick}
      onKeyDown={(event) => {
        if (!canExpand || expanded) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onExpandClick(event);
        }
      }}
      role={canExpand ? "button" : undefined}
      tabIndex={canExpand ? 0 : undefined}
    >
      <PortalTooltip
        content={display}
        enabled={canExpand && !expanded}
        placement="below"
        anchorClassName="transaction-history-cell-tooltip-anchor"
      >
        <span ref={textRef} className={textClass}>
          {display}
        </span>
      </PortalTooltip>
    </div>
  );
}
