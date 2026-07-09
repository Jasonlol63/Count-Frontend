import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function formatOwnAccountLabel(acc, t) {
  if (!acc) return "";
  const mainStr = parseInt(acc.is_main_owner, 10) === 1 ? t("mainOwnerSuffix") : "";
  const accountType = String(acc.type || "").toLowerCase();
  if (accountType === "group") {
    return `${acc.account_name}${mainStr}`;
  }
  return `${acc.account_name} (${acc.name})${mainStr}`;
}

export default function OwnAccountSelect({ value, onChange, accounts, displayLabel = "", disabled, t }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open, close]);

  const placeholder = t("selectAccountPlaceholder");

  const selected = useMemo(
    () => accounts.find((a) => String(a.id) === String(value)),
    [accounts, value]
  );

  const triggerLabel = useMemo(() => {
    if (selected) return formatOwnAccountLabel(selected, t);
    if (value && displayLabel) return displayLabel;
    if (value) return String(value);
    return placeholder;
  }, [selected, value, displayLabel, placeholder, t]);

  const pick = (id) => {
    onChange(id ? String(id) : "");
    close();
  };

  const isGroupValue = (id) => String(id || "").startsWith("G_");

  return (
    <div className="own-account-select-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`own-account-select-trigger${open ? " is-open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="own-account-select-trigger-text">
          {triggerLabel}
        </span>
      </button>
      {open ? (
        <div className="own-account-select-menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`own-account-select-option${!value ? " is-selected" : ""}`}
            onClick={() => pick("")}
          >
            {placeholder}
          </button>
          {accounts.map((acc) => {
            const id = acc.id;
            const isGroup = String(acc.type || "").toLowerCase() === "group" || isGroupValue(id);
            const isSelected = String(value) === String(id);
            return (
              <button
                key={String(id)}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`own-account-select-option${isSelected ? " is-selected" : ""}${isGroup ? " is-group" : ""}`}
                onClick={() => pick(id)}
              >
                {formatOwnAccountLabel(acc, t)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
