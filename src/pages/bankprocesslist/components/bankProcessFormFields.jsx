import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getProcessModalDropdownZIndex } from "../../../components/ProcessModalPortal.jsx";
import SimpleSelect from "../../../components/SimpleSelect.jsx";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";
import FormDateField from "../../../components/FormDateField.jsx";
import { filterBankPickAccounts, formatBankAccountDisplay } from "../lib/bankProcessHelpers.js";

const PORTAL_MIN_WIDTH = 180;
const ACCOUNT_PICK_MIN_WIDTH = 220;
const PORTAL_EDGE_PAD = 16;
const PORTAL_GAP = 1;
const ACCOUNT_SEARCH_RESERVE = 0;
const PORTAL_DROPDOWN_CAP_ACCOUNT = 280;

function layoutPortalDropdown(buttonEl, wrapEl, { minWidth, searchReserve = 0, minMenu = 160, dropdownCap }) {
  const rect = buttonEl.getBoundingClientRect();
  const width = Math.max(rect.width, minWidth);
  const spaceBelow = window.innerHeight - rect.bottom - PORTAL_EDGE_PAD;
  const spaceAbove = rect.top - PORTAL_EDGE_PAD;
  const openBelow = spaceBelow >= minMenu || spaceBelow >= spaceAbove;
  const viewportFit = Math.max(minMenu, openBelow ? spaceBelow : spaceAbove);
  const dropdownMaxHeight = Math.min(dropdownCap, viewportFit);
  const optionsMaxHeight = Math.max(100, dropdownMaxHeight - searchReserve);

  return {
    optionsMaxHeight,
    menuStyle: {
      position: "fixed",
      left: `${rect.left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      maxHeight: `${dropdownMaxHeight}px`,
      display: "flex",
      flexDirection: "column",
      top: openBelow ? `${rect.bottom + PORTAL_GAP}px` : "auto",
      bottom: openBelow ? "auto" : `${window.innerHeight - rect.top + PORTAL_GAP}px`,
      zIndex: getProcessModalDropdownZIndex(wrapEl),
    },
  };
}

export function BankSimpleSelect({ className = "", ...props }) {
  return <SimpleSelect {...props} wrapperClassName={`bank-simple-select${className ? ` ${className}` : ""}`} />;
}

/** Bank Process modal wrapper — same calendar as FormDateField, bank-specific CSS classes. */
export function BankFormDateField(props) {
  const { wrapClassName = "", disabled = false, ...rest } = props;
  return (
    <FormDateField
      {...rest}
      disabled={disabled}
      wrapClassName={`bank-form-datepicker-wrap${disabled ? " bank-form-datepicker-wrap--disabled" : ""} ${wrapClassName}`.trim()}
      inputClassName="bank-input bank-form-datepicker-input"
      hitboxClassName="bank-form-datepicker-hitbox"
      clearClassName="bank-form-datepicker-clear"
      srSpanClassName="bank-form-datepicker-sr-span"
      showCalendarIcon={false}
    />
  );
}

function accountLabel(account) {
  if (!account) return "";
  return formatBankAccountDisplay(account.account_id, account.name, account.id);
}

export function BankSearchableAccountPick({ value, onChange, accounts, disabled, t }) {
  const [open, setOpen] = useState(false);
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(320);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const { menuStyle: nextMenuStyle, optionsMaxHeight: nextOptionsMaxHeight } = layoutPortalDropdown(
      btn,
      wrapRef.current,
      {
        minWidth: ACCOUNT_PICK_MIN_WIDTH,
        searchReserve: ACCOUNT_SEARCH_RESERVE,
        minMenu: 180,
        dropdownCap: PORTAL_DROPDOWN_CAP_ACCOUNT,
      },
    );
    setOptionsMaxHeight(nextOptionsMaxHeight);
    setMenuStyle(nextMenuStyle);
  }, []);

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
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open, close]);

  const pickableAccounts = useMemo(() => {
    const list = filterBankPickAccounts(accounts);
    return list.slice().sort((a, b) => accountLabel(a).localeCompare(accountLabel(b), undefined, { sensitivity: "base" }));
  }, [accounts]);

  const menuItems = useMemo(() => {
    const placeholder = t("selectAccount");
    return [{ id: "", label: placeholder }, ...pickableAccounts.map((a) => ({ id: a.id, label: accountLabel(a) }))];
  }, [pickableAccounts, t]);

  const getItemLabel = useCallback((idx) => menuItems[idx]?.label ?? "", [menuItems]);

  const { highlightIdx, setHighlightIdx, listRef, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open,
    itemCount: menuItems.length,
    getItemLabel,
  });

  const selected = pickableAccounts.find((a) => String(a.id) === String(value));
  const placeholder = t("selectAccount");

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest("#addBankModal, #profitSharingModal");
    setUsePortal(inModal);
    setOpen(true);
    if (inModal) positionMenu();
  };

  const pick = (id) => {
    onChange(id ? String(id) : "");
    close();
  };

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${usePortal ? " custom-select-dropdown-portal" : ""}`}
      style={usePortal && menuStyle ? menuStyle : undefined}
      role="listbox"
    >
      <div
        ref={listRef}
        className="custom-select-options"
        style={usePortal ? { flex: "1 1 auto", minHeight: 0 } : { maxHeight: optionsMaxHeight }}
      >
        {menuItems.map((item, idx) => (
          <div
            key={item.id || "placeholder"}
            className={`custom-select-option${String(value) === String(item.id) ? " selected" : ""}${highlightClass(idx)}`}
            role="option"
            aria-selected={String(value) === String(item.id)}
            data-kb-idx={idx}
            onMouseEnter={() => setHighlightIdx(idx)}
            onClick={() => pick(item.id)}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="custom-select-wrapper bank-searchable-account-pick" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${open ? " open" : ""}${!selected ? " simple-select-button--placeholder" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openDropdown())}
        onKeyDown={(e) => {
          handleButtonKeyDown(e, {
            isOpen: open,
            onToggleOpen: openDropdown,
            onClose: close,
            len: menuItems.length,
            onSelectIndex: (idx) => {
              const item = menuItems[idx];
              if (item) pick(item.id);
            },
          });
        }}
      >
        {selected ? accountLabel(selected) : placeholder}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}
