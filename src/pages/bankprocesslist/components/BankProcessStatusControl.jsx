import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { translateBankProcessApiMessage } from "../../../translateFile/pages/bankProcessTranslate.js";
import {
  deriveBankProcessUiStatus,
  normalizeBankIssueFlag,
  normalizeBankProcessStatus,
} from "../lib/bankProcessHelpers.js";

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

export default function BankProcessStatusControl({
  row,
  onUpdated,
  notify: doNotify,
  buildApiUrl: apiUrl,
  t,
  lang,
  /** When true, menu opens above the pill (used for last rows near table footer). */
  openMenuUp = false,
}) {
  const apiMsg = (json) =>
    translateBankProcessApiMessage(
      lang,
      {
        message: json?.message ?? json?.error,
        errorCode: json?.data && typeof json.data === "object" && !Array.isArray(json.data) ? json.data.error : undefined,
      },
      t("statusUpdateFailed")
    );
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, bottom: null, left: 0, minWidth: 118 });
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const ui = deriveBankProcessUiStatus(row);
  const pillClass = `bank-status-button is-${ui.toLowerCase().replace(/_/g, "-")}`;

  const updateMenuPos = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    if (openMenuUp) {
      setMenuPos({
        top: null,
        bottom: Math.round(window.innerHeight - rect.top + MENU_GAP),
        left: Math.round(rect.left),
        minWidth: Math.max(118, Math.round(rect.width)),
      });
    } else {
      setMenuPos({
        top: Math.round(rect.bottom + MENU_GAP),
        bottom: null,
        left: Math.round(rect.left),
        minWidth: Math.max(118, Math.round(rect.width)),
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

  const postIssueFlag = async (id, issueFlag) => {
    const fd = new FormData();
    fd.append("id", String(id));
    fd.append("issue_flag", issueFlag);
    const res = await fetch(apiUrl("api/processes/update_bank_issue_flag_api.php"), { method: "POST", body: fd, credentials: "include" });
    return res.json();
  };

  const postToggle = async (id) => {
    const fd = new FormData();
    fd.append("id", String(id));
    fd.append("permission", "Bank");
    const res = await fetch(apiUrl("api/processes/toggle_process_status_api.php"), { method: "POST", body: fd, credentials: "include" });
    return res.json();
  };

  const [pending, setPending] = useState(false);

  const apply = async (target) => {
    if (pending) return;
    const id = row.id;
    const st = normalizeBankProcessStatus(row?.status);
    const hasFlag = !!normalizeBankIssueFlag(row.issue_flag);
    const prevUi = deriveBankProcessUiStatus(row);
    setPending(true);
    onUpdated(target, { backgroundSync: false });
    const fail = (message, tone = "danger") => {
      onUpdated(prevUi, { backgroundSync: false });
      doNotify(message, tone);
    };
    try {
      if (target === "ACTIVE") {
        if (hasFlag) {
          const j = await postIssueFlag(id, "");
          if (!j.success) return fail(apiMsg(j));
        }
        if (st !== "active") {
          const j = await postToggle(id);
          if (!j.success) return fail(apiMsg(j));
        }
      } else if (target === "INACTIVE") {
        if (hasFlag) {
          const j = await postIssueFlag(id, "");
          if (!j.success) return fail(apiMsg(j));
        }
        if (st === "active") {
          const j = await postToggle(id);
          if (!j.success) return fail(apiMsg(j));
        }
      } else if (target === "OFFICIAL") {
        const j = await postIssueFlag(id, "official");
        if (!j.success) return fail(apiMsg(j));
      } else if (target === "E_INVOICE") {
        const j = await postIssueFlag(id, "e_invoice");
        if (!j.success) return fail(apiMsg(j));
      } else if (target === "BLOCK") {
        const j = await postIssueFlag(id, "block");
        if (!j.success) return fail(apiMsg(j));
      }
      doNotify(t("statusUpdated"), "success");
      onUpdated(target, { backgroundSync: true });
      setOpen(false);
    } catch {
      fail(t("statusUpdateFailed"));
    } finally {
      setPending(false);
    }
  };

  const options = ["ACTIVE", "INACTIVE", "OFFICIAL", "E_INVOICE", "BLOCK"];
  const label = statusLabel(t, ui);

  return (
    <div className={`bank-status-dropdown${open ? " open" : ""}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`${pillClass}${open ? " open" : ""}${pending ? " is-pending" : ""}`}
        disabled={pending}
        aria-busy={pending}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
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
              {options.map((opt) => {
                const optLabel = statusLabel(t, opt);
                const cur = ui === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`bank-status-option${cur ? " selected" : ""}`}
                    disabled={pending}
                    onClick={() => void apply(opt)}
                    data-value={opt.toLowerCase()}
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
