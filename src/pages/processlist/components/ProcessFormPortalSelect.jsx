import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { layoutPortalCustomSelect } from "../../../components/customSelectPortalLayout.js";

const SEARCH_RESERVE = 52;

export default function ProcessFormPortalSelect({
  open,
  onOpenChange,
  disabled = false,
  displayLabel,
  hasSearch = false,
  children,
}) {
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(220);

  const searchReserve = hasSearch ? SEARCH_RESERVE : 0;

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const { menuStyle: nextMenuStyle, optionsMaxHeight: nextOptionsMaxHeight } = layoutPortalCustomSelect(
      btn,
      wrapRef.current,
      { searchReserve },
    );
    setOptionsMaxHeight(nextOptionsMaxHeight);
    setMenuStyle(nextMenuStyle);
  }, [searchReserve]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }
    positionMenu();
    const onReflow = () => positionMenu();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onOpenChange]);

  const toggle = () => {
    if (disabled) return;
    const next = !open;
    onOpenChange(next);
    if (next) positionMenu();
  };

  const dropdownNode =
    open && menuStyle ? (
      <div
        ref={dropdownRef}
        className="custom-select-dropdown show custom-select-dropdown-portal"
        style={menuStyle}
      >
        {typeof children === "function" ? children({ optionsMaxHeight }) : children}
      </div>
    ) : null;

  return (
    <div className="custom-select-wrapper" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggle}
      >
        {displayLabel}
      </button>
      {dropdownNode ? createPortal(dropdownNode, document.body) : null}
    </div>
  );
}
