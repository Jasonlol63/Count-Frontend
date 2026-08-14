import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { layoutPortalCustomSelect } from "./customSelectPortalLayout.js";
import { useListboxKeyboard } from "./useListboxKeyboard.js";

const MODAL_SELECTOR =
  ".modal, .process-modal, #confirmBankResendModal, [role='dialog'], .account-modal, #userModal, #account-addModal, #account-editModal, .domain-form-modal-backdrop";

/** TEMP: set window.__SIMPLE_SELECT_DEBUG__ = false to silence; remove with debugOpenFail prop later. */
function isSimpleSelectDebugEnabled(debugOpenFail) {
  if (!debugOpenFail || typeof window === "undefined") return false;
  return window.__SIMPLE_SELECT_DEBUG__ !== false;
}

function rectSnapshot(el) {
  if (!el?.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    left: Math.round(r.left),
    width: Math.round(r.width),
    height: Math.round(r.height),
    bottom: Math.round(r.bottom),
    right: Math.round(r.right),
  };
}

function isRectVisible(r) {
  if (!r || r.width <= 0 || r.height <= 0) return false;
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

/**
 * Lightweight custom dropdown — same look as Bank Process「Type」select.
 * Uses portal inside modals so lists are not clipped.
 */
export default function SimpleSelect({
  id,
  value,
  onChange,
  options = [],
  placeholder = "",
  disabled = false,
  required = false,
  includeEmptyOption = true,
  className = "",
  wrapperClassName = "",
  portalDropdownClassName = "",
  ariaLabelledBy,
  ariaLabel,
  dropdownCap = 260,
  minWidth = 180,
  forcePortal = false,
  /** TEMP debug: log only when open attempt fails visibility checks. */
  debugOpenFail = false,
}) {
  const [open, setOpen] = useState(false);
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [menuPlacement, setMenuPlacement] = useState("below");
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(240);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const openRef = useRef(false);
  const usePortalRef = useRef(false);
  const menuStyleRef = useRef(null);
  const openAttemptIdRef = useRef(0);
  const openAttemptAtRef = useRef(0);
  const sawVisibleAttemptIdRef = useRef(0);
  const closeSourceRef = useRef("");
  const loggedAttemptIdsRef = useRef(new Set());

  openRef.current = open;
  usePortalRef.current = usePortal;
  menuStyleRef.current = menuStyle;

  const renderItems = useMemo(() => {
    const items = [];
    if (includeEmptyOption) {
      items.push({ kind: "empty", key: "__empty__", value: "", label: placeholder });
    }
    for (const opt of options) {
      items.push({
        kind: opt.disabled ? "disabled" : "option",
        key: String(opt.value),
        value: opt.value,
        label: opt.label,
        disabled: !!opt.disabled,
      });
    }
    return items;
  }, [includeEmptyOption, options, placeholder]);

  const selectableItems = useMemo(
    () => renderItems.filter((item) => item.kind !== "disabled"),
    [renderItems],
  );

  const initialHighlight = useMemo(() => {
    const idx = selectableItems.findIndex((item) => String(item.value) === String(value));
    return idx >= 0 ? idx : 0;
  }, [selectableItems, value]);

  const getItemLabel = useCallback((idx) => selectableItems[idx]?.label ?? "", [selectableItems]);

  const { highlightIdx, setHighlightIdx, listRef, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open,
    itemCount: selectableItems.length,
    initialIndex: initialHighlight,
    getItemLabel,
  });

  const logOpenFail = useCallback(
    (reason, extra = {}) => {
      if (!isSimpleSelectDebugEnabled(debugOpenFail)) return;
      const attemptId = openAttemptIdRef.current;
      const dedupeKey = `${attemptId}:${reason}`;
      if (loggedAttemptIdsRef.current.has(dedupeKey)) return;
      loggedAttemptIdsRef.current.add(dedupeKey);
      const btn = buttonRef.current;
      const dd = dropdownRef.current;
      const dropdownRect = rectSnapshot(dd);
      // eslint-disable-next-line no-console
      console.warn(`[SimpleSelect:${id || "unknown"}] open failed`, {
        reason,
        attemptId,
        open: openRef.current,
        usePortal: usePortalRef.current,
        hasMenuStyle: !!menuStyleRef.current,
        menuStyle: menuStyleRef.current,
        disabled,
        forcePortal,
        inModal: !!wrapRef.current?.closest(MODAL_SELECTOR),
        optionCount: options.length,
        buttonRect: rectSnapshot(btn),
        dropdownInDom: !!dd,
        dropdownRect,
        dropdownVisible: isRectVisible(dropdownRect),
        zIndex: menuStyleRef.current?.zIndex ?? null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        ts: new Date().toISOString(),
        ...extra,
      });
    },
    [debugOpenFail, disabled, forcePortal, id, options.length],
  );

  const verifyOpenVisible = useCallback(
    (attemptId, phase) => {
      if (!isSimpleSelectDebugEnabled(debugOpenFail)) return;
      if (attemptId !== openAttemptIdRef.current) return;

      const dd = dropdownRef.current;
      const dropdownRect = rectSnapshot(dd);
      if (openRef.current && isRectVisible(dropdownRect)) {
        sawVisibleAttemptIdRef.current = attemptId;
      }

      if (!openRef.current) {
        const msSinceOpen = Date.now() - openAttemptAtRef.current;
        // Skip if this attempt already painted a visible menu (user closed it), or
        // close happened after the grace window (normal dismiss).
        if (msSinceOpen < 350 && sawVisibleAttemptIdRef.current !== attemptId) {
          logOpenFail("closed_immediately", {
            phase,
            msSinceOpen,
            closeSource: closeSourceRef.current || "unknown",
          });
        }
        return;
      }

      if (usePortalRef.current && !menuStyleRef.current) {
        logOpenFail("portal_without_style", { phase });
        return;
      }
      if (!dd) {
        logOpenFail("dropdown_not_in_dom", { phase });
        return;
      }
      if (!isRectVisible(dropdownRect)) {
        logOpenFail(usePortalRef.current ? "dropdown_not_visible" : "clipped_inline", {
          phase,
          dropdownRect,
        });
      }
    },
    [debugOpenFail, logOpenFail],
  );

  const close = useCallback((source = "unknown") => {
    closeSourceRef.current = source;
    openRef.current = false;
    setOpen(false);
    setMenuStyle(null);
  }, []);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const { menuStyle: nextMenuStyle, optionsMaxHeight: nextOptionsMaxHeight, openBelow } = layoutPortalCustomSelect(
      btn,
      wrapRef.current,
      { minWidth, dropdownCap },
    );
    setMenuPlacement(openBelow ? "below" : "above");
    setOptionsMaxHeight(nextOptionsMaxHeight);
    setMenuStyle(nextMenuStyle);
  }, [minWidth, dropdownCap]);

  useLayoutEffect(() => {
    if (!open || !usePortal) return undefined;
    positionMenu();
    const onReflow = () => positionMenu();
    const onScroll = (e) => {
      // Ignore scrolls inside the portaled list — highlight sync must not reflow
      // the menu (can leave it off-screen in some browsers).
      if (dropdownRef.current?.contains(e.target)) return;
      positionMenu();
    };
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, usePortal, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      const msSinceOpen = Date.now() - openAttemptAtRef.current;
      // Grace: ignore outside closes right after open (duplicate pointer/ghost events).
      if (msSinceOpen < 100) return;
      if (isSimpleSelectDebugEnabled(debugOpenFail) && openAttemptIdRef.current && msSinceOpen < 350) {
        logOpenFail("closed_by_outside_pointer", {
          phase: "pointerdown",
          msSinceOpen,
          targetTag: target?.tagName || null,
          targetClass: typeof target?.className === "string" ? target.className.slice(0, 120) : null,
        });
      }
      close("outside_pointer");
    };
    // Defer so the opening gesture does not immediately close the menu.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", fn, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", fn, true);
    };
  }, [open, close, debugOpenFail, logOpenFail]);

  const selected = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selected ? selected.label : placeholder;
  const showPlaceholderTone = !selected && placeholder;

  const openDropdown = () => {
    if (disabled) {
      logOpenFail("disabled", { phase: "click" });
      return;
    }
    const inModal = !!wrapRef.current?.closest(MODAL_SELECTOR);
    const shouldPortal = forcePortal || inModal;
    const attemptId = openAttemptIdRef.current + 1;
    openAttemptIdRef.current = attemptId;
    openAttemptAtRef.current = Date.now();
    closeSourceRef.current = "";
    setUsePortal(shouldPortal);
    usePortalRef.current = shouldPortal;
    if (!shouldPortal) setMenuPlacement("below");
    // Position before paint so portal menu never mounts without fixed coords
    // (unpositioned body portal looks like "dropdown stuck / won't open").
    if (shouldPortal) positionMenu();
    setOpen(true);
    openRef.current = true;

    if (isSimpleSelectDebugEnabled(debugOpenFail)) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => verifyOpenVisible(attemptId, "raf2"));
      });
      window.setTimeout(() => verifyOpenVisible(attemptId, "t50"), 50);
      window.setTimeout(() => verifyOpenVisible(attemptId, "t150"), 150);
      window.setTimeout(() => verifyOpenVisible(attemptId, "t350"), 350);
    }
  };

  const toggleFromTrigger = () => {
    if (openRef.current) {
      // Evidence from prod logs: open then closed_immediately ~150ms without
      // outside_pointer — duplicate click / double-tap was toggling closed.
      const msSinceOpen = Date.now() - openAttemptAtRef.current;
      if (msSinceOpen < 350) {
        if (isSimpleSelectDebugEnabled(debugOpenFail)) {
          // eslint-disable-next-line no-console
          console.info(`[SimpleSelect:${id || "unknown"}] ignored trigger-close`, {
            msSinceOpen,
            attemptId: openAttemptIdRef.current,
          });
        }
        return;
      }
      close("trigger");
      return;
    }
    openDropdown();
  };

  const pick = (nextValue) => {
    onChange(nextValue);
    close("pick");
  };

  const selectByIndex = (idx) => {
    const item = selectableItems[idx];
    if (!item) return;
    pick(item.value);
  };

  // mousedown preventDefault stops the trigger from receiving focus on click — without
  // focus, Arrow/type-ahead never fire. Re-focus (no scroll) and capture document keys
  // while open so mouse-opened menus still accept keyboard navigation.
  useEffect(() => {
    if (!open || disabled) return undefined;
    const focusTrigger = () => {
      buttonRef.current?.focus({ preventScroll: true });
    };
    focusTrigger();
    const raf = requestAnimationFrame(focusTrigger);

    const onDocKeyDown = (e) => {
      if (e.target === buttonRef.current) return;
      const target = e.target;
      if (
        target &&
        target !== document.body &&
        target !== document.documentElement &&
        !wrapRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        const tag = String(target.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      handleButtonKeyDown(e, {
        isOpen: true,
        onToggleOpen: openDropdown,
        onClose: () => close("escape"),
        len: selectableItems.length,
        onSelectIndex: selectByIndex,
      });
    };
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open, disabled, handleButtonKeyDown, selectableItems, close]);

  const onButtonKeyDown = (e) => {
    handleButtonKeyDown(e, {
      isOpen: open,
      onToggleOpen: openDropdown,
      onClose: () => close("escape"),
      len: selectableItems.length,
      onSelectIndex: selectByIndex,
    });
  };

  const placementClass =
    menuPlacement === "above" ? " custom-select-dropdown-above" : " custom-select-dropdown-below";

  const selectableIndexByKey = useMemo(() => {
    const map = new Map();
    let idx = 0;
    for (const item of renderItems) {
      if (item.kind !== "disabled") {
        map.set(item.key, idx);
        idx += 1;
      }
    }
    return map;
  }, [renderItems]);

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${placementClass}${usePortal ? " custom-select-dropdown-portal" : ""}${portalDropdownClassName ? ` ${portalDropdownClassName}` : ""}`}
      style={usePortal ? menuStyle ?? undefined : undefined}
      role="listbox"
      id={id ? `${id}_dropdown` : undefined}
    >
      <div
        ref={listRef}
        className="custom-select-options"
        style={usePortal ? { flex: "1 1 auto", minHeight: 0, maxHeight: optionsMaxHeight } : { maxHeight: optionsMaxHeight }}
      >
        {renderItems.map((item) => {
          if (item.kind === "disabled") {
            return (
              <div
                key={item.key}
                className={`custom-select-option custom-select-option--disabled${String(item.value) === String(value) ? " selected" : ""}`}
                role="option"
                aria-selected={String(item.value) === String(value)}
                aria-disabled
              >
                {item.label}
              </div>
            );
          }
          const kbIdx = selectableIndexByKey.get(item.key);
          const isSelected = String(item.value) === String(value);
          return (
            <div
              key={item.key}
              className={`custom-select-option${isSelected ? " selected" : ""}${highlightClass(kbIdx)}`}
              role="option"
              aria-selected={isSelected}
              data-kb-idx={kbIdx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item.value)}
              onMouseEnter={() => setHighlightIdx(kbIdx)}
            >
              {item.label}
            </div>
          );
        })}
      </div>
    </div>
  );

  // Portal menus must wait for fixed coords — mounting without menuStyle puts an
  // absolute panel at document end (looks like the dropdown never opened).
  const portalReady = usePortal && !!menuStyle;
  const menu =
    open && (!usePortal || portalReady)
      ? usePortal
        ? createPortal(dropdownNode, document.body)
        : dropdownNode
      : null;

  return (
    <div
      className={`custom-select-wrapper simple-select${wrapperClassName ? ` ${wrapperClassName}` : ""}`}
      ref={wrapRef}
    >
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`custom-select-button${open ? " open" : ""}${open ? (menuPlacement === "above" ? " open-above" : " open-below") : ""}${showPlaceholderTone ? " simple-select-button--placeholder" : ""}${className ? ` ${className}` : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required || undefined}
        aria-labelledby={ariaLabelledBy || undefined}
        aria-label={!ariaLabelledBy && ariaLabel ? ariaLabel : undefined}
        onMouseDown={(e) => {
          // Prevent focus-driven scroll inside overflow:hidden modal panels.
          if (e.button === 0) e.preventDefault();
        }}
        onClick={toggleFromTrigger}
        onKeyDown={onButtonKeyDown}
      >
        {displayLabel}
      </button>
      {menu}
    </div>
  );
}
