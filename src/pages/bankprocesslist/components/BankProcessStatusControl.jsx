import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { translateBankProcessApiMessage } from "../../../translateFile/pages/bankProcessTranslate.js";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";
import { deriveBankProcessUiStatus } from "../lib/bankProcessHelpers.js";
import { updateBankProcessStatus } from "../bankProcessListApi.js";

const STATUS_LABEL_KEYS = {
  ACTIVE: "statusActive",
  INACTIVE: "statusInactive",
  OFFICIAL: "statusOfficial",
  E_INVOICE: "statusEInvoice",
  BLOCK: "statusBlock",
};

function statusLabel(t, key) {
  return t(STATUS_LABEL_KEYS[key] || key);
}

const MENU_GAP = 6;
const MENU_MIN_WIDTH = 132;
const MENU_VIEWPORT_GUTTER = 8;

export default function BankProcessStatusControl({
  row,
  tenantId,
  onUpdated,
  notify: doNotify,
  t,
  lang,
  /** When true, menu opens above the pill (used for last rows near table footer). */
  openMenuUp = false,
}) {
  const apiMsg = (errOrJson) =>
    translateBankProcessApiMessage(
      lang,
      {
        message:
          typeof errOrJson === "string"
            ? errOrJson
            : errOrJson?.message ?? errOrJson?.error,
        errorCode:
          errOrJson?.data && typeof errOrJson.data === "object" && !Array.isArray(errOrJson.data)
            ? errOrJson.data.error
            : undefined,
      },
      t("statusUpdateFailed")
    );
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, bottom: null, left: 0, minWidth: MENU_MIN_WIDTH });
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const ui = deriveBankProcessUiStatus(row);
  const pillClass = `bank-status-button is-${ui.toLowerCase().replace(/_/g, "-")}`;

  const updateMenuPos = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const minWidth = Math.max(MENU_MIN_WIDTH, Math.round(rect.width));
    const viewportW = window.innerWidth || document.documentElement?.clientWidth || 0;
    const maxLeft = Math.max(MENU_VIEWPORT_GUTTER, viewportW - minWidth - MENU_VIEWPORT_GUTTER);
    const left = Math.min(maxLeft, Math.max(MENU_VIEWPORT_GUTTER, Math.round(rect.left)));
    if (openMenuUp) {
      setMenuPos({
        top: null,
        bottom: Math.round(window.innerHeight - rect.top + MENU_GAP),
        left,
        minWidth,
      });
    } else {
      setMenuPos({
        top: Math.round(rect.bottom + MENU_GAP),
        bottom: null,
        left,
        minWidth,
      });
    }
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    updateMenuPos();
    const onReflow = () => updateMenuPos();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, openMenuUp]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const target = e.target;
      const clickedInsideTrigger = !!(wrapRef.current && wrapRef.current.contains(target));
      const clickedInsideMenu = !!(menuRef.current && menuRef.current.contains(target));
      if (!clickedInsideTrigger && !clickedInsideMenu) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const [pending, setPending] = useState(false);

  const apply = async (target) => {
    if (pending) return;
    if (target === ui) {
      setOpen(false);
      return;
    }
    const id = row?.id;
    const tid = tenantId ?? row?.tenant_id;
    const prevUi = deriveBankProcessUiStatus(row);
    setPending(true);
    onUpdated(target, { backgroundSync: false });
    const fail = (message, tone = "danger") => {
      onUpdated(prevUi, { backgroundSync: false });
      doNotify(message, tone);
    };
    try {
      await updateBankProcessStatus({ id, tenantId: tid, status: target });
      doNotify(t("statusUpdated"), "success");
      onUpdated(target, { backgroundSync: true });
      setOpen(false);
    } catch (err) {
      fail(apiMsg(err?.message ? { message: err.message } : err));
    } finally {
      setPending(false);
    }
  };

  const options = ["ACTIVE", "INACTIVE", "OFFICIAL", "E_INVOICE", "BLOCK"];
  const label = statusLabel(t, ui);

  const getItemLabel = useCallback((idx) => statusLabel(t, options[idx]), [options, t]);

  const { highlightIdx, setHighlightIdx, listRef, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open,
    itemCount: options.length,
    initialIndex: Math.max(0, options.indexOf(ui)),
    getItemLabel,
  });

  return (
    <div className={`bank-status-dropdown${open ? " open" : ""}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`${pillClass}${open ? " open" : ""}${pending ? " is-pending" : ""}`}
        disabled={pending}
        aria-busy={pending}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          handleButtonKeyDown(e, {
            isOpen: open,
            onToggleOpen: () => setOpen(true),
            onClose: () => setOpen(false),
            len: options.length,
            onSelectIndex: (idx) => {
              const opt = options[idx];
              if (opt) void apply(opt);
            },
          });
        }}
      >
        {label}
      </button>
      {open
        ? createPortal(
            <div
              ref={(el) => {
                menuRef.current = el;
                listRef.current = el;
              }}
              className={`bank-status-menu bank-status-menu-floating${openMenuUp ? " bank-status-menu-floating--up" : ""}`}
              role="listbox"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                whiteSpace: "normal",
                position: "fixed",
                top: openMenuUp ? "auto" : menuPos.top,
                bottom: openMenuUp ? menuPos.bottom : "auto",
                left: menuPos.left,
                minWidth: menuPos.minWidth,
                zIndex: 10020,
              }}
            >
              {options.map((opt, idx) => {
                const optLabel = statusLabel(t, opt);
                const cur = ui === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`bank-status-option${cur ? " selected" : ""}${highlightClass(idx)}`}
                    disabled={pending}
                    role="option"
                    aria-selected={cur}
                    onClick={() => void apply(opt)}
                    data-value={opt.toLowerCase()}
                    data-kb-idx={idx}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    title={optLabel}
                    style={{ display: "block", width: "100%" }}
                  >
                    {optLabel}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
