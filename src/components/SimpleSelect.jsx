import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { layoutPortalCustomSelect } from "./customSelectPortalLayout.js";
import { useListboxKeyboard } from "./useListboxKeyboard.js";

const MODAL_SELECTOR =
  ".modal, .process-modal, #confirmBankResendModal, [role='dialog'], .account-modal, #userModal, #account-addModal, #account-editModal, .domain-form-modal-backdrop";

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
}) {
  const [open, setOpen] = useState(false);
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [menuPlacement, setMenuPlacement] = useState("below");
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(240);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

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

  const close = useCallback(() => {
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
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, usePortal, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", fn);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", fn);
    };
  }, [open, close]);

  const selected = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selected ? selected.label : placeholder;
  const showPlaceholderTone = !selected && placeholder;

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest(MODAL_SELECTOR);
    const shouldPortal = forcePortal || inModal;
    setUsePortal(shouldPortal);
    if (!shouldPortal) setMenuPlacement("below");
    setOpen(true);
    if (shouldPortal) positionMenu();
  };

  const pick = (nextValue) => {
    onChange(nextValue);
    close();
  };

  const selectByIndex = (idx) => {
    const item = selectableItems[idx];
    if (!item) return;
    pick(item.value);
  };

  const onButtonKeyDown = (e) => {
    handleButtonKeyDown(e, {
      isOpen: open,
      onToggleOpen: openDropdown,
      onClose: close,
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
      style={usePortal && menuStyle ? menuStyle : undefined}
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
        onClick={() => (open ? close() : openDropdown())}
        onKeyDown={onButtonKeyDown}
      >
        {displayLabel}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}
