import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatTransactionGridMoneyHalfUp, toUpperDisplay } from "../lib/transactionFormat.js";

function formatContraDate(raw) {
  if (!raw || raw === "-") return "-";
  const s = String(raw).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

export default function TransactionHeader({
  canApproveContra,
  contraInbox,
  toggleContraInbox,
  closeContraInbox,
  refreshContraInbox,
  approveContra,
  rejectContra,
  scopeApi,
  mutationsBlocked = false,
  m,
  t,
}) {
  const btnRef = useRef(null);
  const popoverRef = useRef(null);
  const refreshRef = useRef(refreshContraInbox);
  const wasOpenRef = useRef(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 860, caretLeft: 28 });

  const itemCount = contraInbox.items.length;
  const isOpen = contraInbox.open;

  refreshRef.current = refreshContraInbox;

  const updatePopoverPosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(860, Math.max(320, window.innerWidth - 48));
    let left = rect.left;
    if (left + width > window.innerWidth - 24) {
      left = Math.max(24, window.innerWidth - width - 24);
    }
    const caretLeft = Math.min(Math.max(rect.left + rect.width / 2 - left - 7, 16), width - 24);
    setPopoverPos({
      top: rect.bottom + 12,
      left,
      width,
      caretLeft,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, itemCount, updatePopoverPosition]);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      refreshRef.current?.();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onPointerDown = (event) => {
      const target = event.target;
      if (btnRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      closeContraInbox?.();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeContraInbox?.();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, closeContraInbox]);

  const awaitingText =
    itemCount === 1
      ? t("contraInboxAwaitingApproval", { count: itemCount })
      : t("contraInboxAwaitingApprovalPlural", { count: itemCount });

  const popover =
    isOpen &&
    createPortal(
      <div
        ref={popoverRef}
        className="contra-inbox-popover contra-inbox-popover--fixed"
        id="contraInboxPopover"
        role="dialog"
        aria-label={m.contraInbox}
        style={{
          top: popoverPos.top,
          left: popoverPos.left,
          width: popoverPos.width,
          ["--contra-inbox-caret-left"]: `${popoverPos.caretLeft}px`,
        }}
      >
        <div className="contra-inbox-popover-header">
          <div className="contra-inbox-popover-title">
            {m.contraInbox}
            <span className="contra-inbox-badge" id="contraInboxCount2">
              {itemCount}
            </span>
          </div>
          <div className="contra-inbox-popover-actions">
            <button
              type="button"
              className="contra-inbox-btn contra-inbox-refresh"
              id="contraInboxRefreshBtn"
              onClick={() => refreshRef.current?.()}
              disabled={contraInbox.loading}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {m.refresh}
            </button>
            <button type="button" className="contra-inbox-btn contra-inbox-close" aria-label={m.close} onClick={closeContraInbox}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="contra-inbox-popover-body">
          {contraInbox.loading && itemCount === 0 ? <div className="contra-inbox-loading">{m.loading}</div> : null}

          {!contraInbox.loading && itemCount === 0 ? (
            <div className="contra-inbox-empty">
              <div>{m.contraInboxEmpty}</div>
              <div className="contra-inbox-empty-hint">{m.contraInboxEmptyHint}</div>
            </div>
          ) : itemCount > 0 ? (
            <div className="contra-inbox-grid" role="table" id="contraInboxTbody">
              <div className="contra-inbox-grid-row contra-inbox-grid-row--head" role="row">
                <div className="contra-inbox-grid-cell contra-inbox-grid-cell--head contra-inbox-grid-cell--date" role="columnheader">
                  {m.date}
                </div>
                <div className="contra-inbox-grid-cell contra-inbox-grid-cell--head contra-inbox-grid-cell--from" role="columnheader">
                  {m.from}
                </div>
                <div className="contra-inbox-grid-cell contra-inbox-grid-cell--head contra-inbox-grid-cell--to" role="columnheader">
                  {m.to}
                </div>
                <div className="contra-inbox-grid-cell contra-inbox-grid-cell--head contra-inbox-grid-cell--currency" role="columnheader">
                  {m.currency}
                </div>
                <div className="contra-inbox-grid-cell contra-inbox-grid-cell--head contra-inbox-grid-cell--amount" role="columnheader">
                  {m.amount}
                </div>
                <div className="contra-inbox-grid-cell contra-inbox-grid-cell--head contra-inbox-grid-cell--submitter" role="columnheader">
                  {m.submittedBy}
                </div>
                <div className="contra-inbox-grid-cell contra-inbox-grid-cell--head contra-inbox-grid-cell--desc" role="columnheader">
                  {m.description}
                </div>
                <div className="contra-inbox-grid-cell contra-inbox-grid-cell--head contra-inbox-grid-cell--action" role="columnheader">
                  {m.action}
                </div>
              </div>
              {contraInbox.items.map((it) => {
                  const fromCode = toUpperDisplay(it.from_account_code || "-");
                  const toCode = toUpperDisplay(it.to_account_code || "-");
                  const submittedBy = toUpperDisplay(it.submitted_by || it.created_by || "-");
                  return (
                    <div
                      className="contra-inbox-grid-row"
                      role="row"
                      key={it.id || `${it.transaction_id}-${it.transaction_date}`}
                    >
                      <div className="contra-inbox-grid-cell contra-inbox-grid-cell--date" role="cell">
                        {formatContraDate(it.transaction_date || it.date)}
                      </div>
                      <div className="contra-inbox-grid-cell contra-inbox-grid-cell--from" role="cell">
                        <span className="contra-inbox-account-code contra-inbox-account-code--from">{fromCode}</span>
                      </div>
                      <div className="contra-inbox-grid-cell contra-inbox-grid-cell--to" role="cell">
                        <span className="contra-inbox-transfer-arrow" aria-hidden="true">
                          →
                        </span>
                        <span className="contra-inbox-account-code contra-inbox-account-code--to">{toCode}</span>
                      </div>
                      <div className="contra-inbox-grid-cell contra-inbox-grid-cell--currency" role="cell">
                        {toUpperDisplay(it.currency || "-")}
                      </div>
                      <div className="contra-inbox-grid-cell contra-inbox-grid-cell--amount" role="cell">
                        {formatTransactionGridMoneyHalfUp(it.amount)}
                      </div>
                      <div className="contra-inbox-grid-cell contra-inbox-grid-cell--submitter" role="cell">
                        {submittedBy}
                      </div>
                      <div className="contra-inbox-grid-cell contra-inbox-grid-cell--desc" role="cell" title={toUpperDisplay(it.description || "-")}>
                        {toUpperDisplay(it.description || "-")}
                      </div>
                      <div className="contra-inbox-grid-cell contra-inbox-grid-cell--action" role="cell">
                        <div className="contra-inbox-action-group">
                          <button
                            type="button"
                            className="contra-inbox-btn contra-inbox-approve"
                            disabled={mutationsBlocked}
                            onClick={async () => {
                              if (mutationsBlocked) return;
                              const tid = it.transaction_id || it.id;
                              if (!tid) return;
                              await approveContra({ transactionId: tid, scopeApi });
                            }}
                          >
                            {m.approve}
                          </button>
                          <button
                            type="button"
                            className="contra-inbox-btn contra-inbox-reject"
                            disabled={mutationsBlocked}
                            onClick={async () => {
                              if (mutationsBlocked) return;
                              if (!confirm(m.confirmRejectContra)) return;
                              const tid = it.transaction_id || it.id;
                              if (!tid) return;
                              await rejectContra({ transactionId: tid, scopeApi });
                            }}
                          >
                            {m.reject}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : null}
        </div>

        <div className="contra-inbox-popover-footer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
          </svg>
          <span>{awaitingText}</span>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="transaction-header-bar">
      <div className="transaction-header-left">
        {canApproveContra && (
          <div className={`contra-inbox-wrap${isOpen ? " contra-inbox-wrap--open" : ""}`} id="contraInboxWrap">
            <button
              ref={btnRef}
              type="button"
              className="contra-inbox-btn contra-inbox-main"
              id="contraInboxBtn"
              aria-expanded={isOpen}
              aria-haspopup="dialog"
              onClick={toggleContraInbox}
            >
              <svg className="contra-inbox-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="contra-inbox-main-label">{m.contraInbox}</span>
              <span className="contra-inbox-badge" id="contraInboxCount">
                {itemCount}
              </span>
              <svg className="contra-inbox-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {popover}
    </div>
  );
}
