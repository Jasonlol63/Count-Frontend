import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getProcessModalDropdownZIndex } from "../../../components/ProcessModalPortal.jsx";
import FormDateField from "../../../components/FormDateField.jsx";
import { filterBankPickAccounts, formatBankAccountDisplay } from "../lib/bankProcessHelpers.js";

const PORTAL_MIN_WIDTH = 180;
const ACCOUNT_PICK_MIN_WIDTH = 220;
const PORTAL_EDGE_PAD = 16;
const PORTAL_GAP = 2;
const ACCOUNT_SEARCH_RESERVE = 52;
/** 下拉首选总高度上限（含搜索框）；不撑满视口，列表内滚动查看全部 */
const PORTAL_DROPDOWN_CAP_SIMPLE = 260;
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

export function BankSimpleSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "",
  disabled = false,
  includeEmptyOption = true,
  className = "",
  portalDropdownClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(280);
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
      { minWidth: PORTAL_MIN_WIDTH, minMenu: 160, dropdownCap: PORTAL_DROPDOWN_CAP_SIMPLE },
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

  const selected = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selected ? selected.label : placeholder;

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest("#addBankModal, #profitSharingModal, #confirmBankResendModal");
    setUsePortal(inModal);
    setOpen(true);
    if (inModal) positionMenu();
  };

  const pick = (nextValue) => {
    onChange(nextValue);
    close();
  };

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${usePortal ? " custom-select-dropdown-portal" : ""}${portalDropdownClassName ? ` ${portalDropdownClassName}` : ""}`}
      style={usePortal && menuStyle ? menuStyle : undefined}
      role="listbox"
      id={id ? `${id}_dropdown` : undefined}
    >
      <div
        className="custom-select-options"
        style={usePortal ? { flex: "1 1 auto", minHeight: 0 } : { maxHeight: optionsMaxHeight }}
      >
        {includeEmptyOption ? (
          <div
            className={`custom-select-option${!value ? " selected" : ""}`}
            role="option"
            aria-selected={!value}
            onClick={() => pick("")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") pick("");
            }}
          >
            {placeholder}
          </div>
        ) : null}
        {options.map((opt) => (
          <div
            key={opt.value}
            className={`custom-select-option${
              String(opt.value) === String(value) ? " selected" : ""
            }${opt.disabled ? " custom-select-option--disabled" : ""}`}
            role="option"
            aria-selected={String(opt.value) === String(value)}
            aria-disabled={opt.disabled || undefined}
            onClick={() => {
              if (opt.disabled) return;
              pick(opt.value);
            }}
            onKeyDown={(e) => {
              if (opt.disabled) return;
              if (e.key === "Enter" || e.key === " ") pick(opt.value);
            }}
          >
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`custom-select-wrapper bank-simple-select${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openDropdown())}
      >
        {displayLabel}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
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
  const [q, setQ] = useState("");
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(320);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
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

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const pickableAccounts = useMemo(() => filterBankPickAccounts(accounts), [accounts]);

  const filtered = useMemo(() => {
    const list = pickableAccounts;
    const qq = q.trim().toLowerCase();
    let rows = list;
    if (qq) {
      rows = list.filter((a) => accountLabel(a).toLowerCase().includes(qq));
    }
    return rows.slice().sort((a, b) => accountLabel(a).localeCompare(accountLabel(b), undefined, { sensitivity: "base" }));
  }, [pickableAccounts, q]);

  const selected = pickableAccounts.find((a) => String(a.id) === String(value));
  const placeholder = t("selectAccount");

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest("#addBankModal, #profitSharingModal");
    setUsePortal(inModal);
    setQ("");
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
      <div className="custom-select-search">
        <input
          ref={searchRef}
          type="text"
          placeholder={t("searchAccount")}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        />
      </div>
      <div
        className="custom-select-options"
        style={usePortal ? { flex: "1 1 auto", minHeight: 0 } : { maxHeight: optionsMaxHeight }}
      >
        <div
          className={`custom-select-option${!value ? " selected" : ""}`}
          role="option"
          aria-selected={!value}
          onClick={() => pick("")}
        >
          {placeholder}
        </div>
        {filtered.length === 0 ? (
          <div className="custom-select-no-results">{t("noAccountsFound")}</div>
        ) : (
          filtered.map((a) => (
            <div
              key={a.id}
              className={`custom-select-option${String(value) === String(a.id) ? " selected" : ""}`}
              role="option"
              aria-selected={String(value) === String(a.id)}
              onClick={() => pick(a.id)}
            >
              {accountLabel(a)}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="custom-select-wrapper bank-searchable-account-pick" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openDropdown())}
      >
        {selected ? accountLabel(selected) : placeholder}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}
