import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isTypeAheadKey } from "../../../components/typeAheadMatch.js";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";
import { layoutPortalCustomSelect } from "../../../components/customSelectPortalLayout.js";

const SEARCH_RESERVE = 52;

export function AccountSelect({
  placeholder,
  options,
  value,
  onChange,
  disabled,
  profitType,
  ariaLabelledBy,
  ariaLabel,
  searchPlaceholder = "Search account...",
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(240);
  const searchRef = useRef(null);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toUpperCase();
    const rows = Array.isArray(options) ? options : [];
    if (!q) return rows;
    return rows.filter((r) => String(r.display_text || "").toUpperCase().includes(q));
  }, [options, filter]);

  const { setHighlightIdx, listRef, handleListKeyDown, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open,
    itemCount: filtered.length,
    resetToken: filter,
  });

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const { menuStyle: nextStyle, optionsMaxHeight: nextOptionsMaxHeight } = layoutPortalCustomSelect(
      btn,
      containerRef.current,
      {
        minWidth: Math.max(btn.getBoundingClientRect().width || 0, 140),
        searchReserve: SEARCH_RESERVE,
        minMenu: 160,
        dropdownCap: 300,
      },
    );
    setMenuStyle(nextStyle);
    setOptionsMaxHeight(nextOptionsMaxHeight);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    positionMenu();
    const onReflow = () => positionMenu();
    const onScroll = (e) => {
      if (dropdownRef.current?.contains(e.target)) return;
      positionMenu();
    };
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const target = e.target;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setFilter("");
    }
  }, [open]);

  const displayText = value?.display_text ? value.display_text : placeholder;

  const pick = (opt) => {
    onChange(opt);
    close();
  };

  const openMenu = useCallback(
    (seed = "") => {
      if (disabled) return;
      setFilter(seed);
      positionMenu();
      setOpen(true);
    },
    [disabled, positionMenu],
  );

  const selectByIndex = (idx) => {
    const opt = filtered[idx];
    if (opt) pick(opt);
  };

  const onButtonKeyDown = (e) => {
    if (disabled) return;
    if (!open && isTypeAheadKey(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openMenu(e.key);
      return;
    }
    handleButtonKeyDown(e, {
      isOpen: open,
      onToggleOpen: () => openMenu(""),
      onClose: close,
      len: filtered.length,
      onSelectIndex: selectByIndex,
    });
  };

  const dropdownNode =
    open && menuStyle ? (
      <div
        ref={dropdownRef}
        className="custom-select-dropdown show custom-select-dropdown-portal transaction-account-select-portal"
        style={menuStyle}
        role="listbox"
      >
        <div className="custom-select-search">
          <input
            ref={searchRef}
            type="text"
            placeholder={searchPlaceholder}
            autoComplete="off"
            disabled={disabled}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ textTransform: "uppercase" }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                close();
                return;
              }
              if (e.key === "Backspace" && !filter) {
                e.preventDefault();
                onChange?.(null);
                return;
              }
              handleListKeyDown(e, {
                len: filtered.length,
                onSelectIndex: selectByIndex,
                onClose: close,
              });
            }}
          />
        </div>
        <div
          className="custom-select-options"
          ref={listRef}
          style={{ flex: "1 1 auto", minHeight: 0, maxHeight: optionsMaxHeight }}
        >
          {filtered.length === 0 ? (
            <div className="custom-select-no-results">No results</div>
          ) : (
            filtered.map((opt, idx) => (
              <div
                key={opt.id}
                data-kb-idx={idx}
                className={`custom-select-option${String(value?.id) === String(opt.id) ? " selected" : ""}${highlightClass(idx)}`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                {opt.display_text}
              </div>
            ))
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="custom-select-wrapper" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || undefined}
        aria-labelledby={ariaLabel ? undefined : ariaLabelledBy || undefined}
        data-placeholder={placeholder}
        data-value={value?.id ?? ""}
        data-account-id={value?.id ?? ""}
        data-account-code={value?.account_id ?? ""}
        data-currency={
          value?.currency != null && String(value.currency).trim() !== ""
            ? String(value.currency).trim().toUpperCase()
            : ""
        }
        data-profit-type={profitType || undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            close();
            return;
          }
          openMenu("");
        }}
        onKeyDown={onButtonKeyDown}
      >
        {displayText}
      </button>
      {dropdownNode && typeof document !== "undefined" ? createPortal(dropdownNode, document.body) : null}
    </div>
  );
}

export default AccountSelect;
