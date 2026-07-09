import React, { useCallback, useEffect, useRef } from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import {
  formatBankProcessContractLabel,
  formatAccountingDueBillingPeriod,
  formatAccountingDueProcessDayStart,
  accountingDueRowKey,
} from "../lib/bankProcessHelpers.js";

export default function AccountingDueModal({
  isOpen,
  setOpen,
  accountingRows,
  accountingLoading,
  accountingSelected,
  setAccountingSelected,
  accountingDeleteSelected,
  setAccountingDeleteSelected,
  onPostToTransaction,
  onDismissRows,
  loadAccountingInbox,
  lang,
  t,
}) {
  const refreshRef = useRef(loadAccountingInbox);
  const wasOpenRef = useRef(false);

  const postableRows = accountingRows.filter((r) => !r.already_posted_today);
  const postableCount = postableRows.length;
  const postAllChecked = postableRows.length > 0 && postableRows.every((r) => accountingSelected.has(accountingDueRowKey(r)));
  const deleteAllChecked = accountingRows.length > 0 && accountingRows.every((r) => accountingDeleteSelected.has(accountingDueRowKey(r)));

  refreshRef.current = loadAccountingInbox;

  const closeInbox = useCallback(() => setOpen(false), [setOpen]);
  const openInbox = useCallback(() => setOpen(true), [setOpen]);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      refreshRef.current?.();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeInbox();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeInbox]);

  const footerText =
    postableCount === 1
      ? t("accountingDueAwaiting", { count: postableCount })
      : t("accountingDueAwaitingPlural", { count: postableCount });

  const tableContent =
    accountingLoading && accountingRows.length === 0 ? (
      <div className="accounting-due-inbox-loading">{t("loading")}</div>
    ) : !accountingLoading && accountingRows.length === 0 ? (
      <div className="accounting-due-inbox-empty">{t("noDueToday")}</div>
    ) : accountingRows.length > 0 ? (
      <div className="accounting-due-inbox-table-wrap">
        <div className="accounting-due-inbox-grid" role="table" id="processAccountingDueGrid">
          <div className="accounting-due-inbox-grid-row accounting-due-inbox-grid-row--head" role="row">
            <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--head accounting-due-inbox-grid-cell--cb" role="columnheader">
              <div className="accounting-due-inbox-select-head">
                <span className="accounting-due-inbox-select-head-label accounting-due-inbox-select-head-label--post">
                  {t("accountingDueColPost")}
                </span>
                <span className="accounting-due-inbox-select-head-cb">
                  <input
                    type="checkbox"
                    title={t("selectAll")}
                    aria-label={`${t("accountingDueColPost")} — ${t("selectAll")}`}
                    className="accounting-due-inbox-cb"
                    checked={postAllChecked}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAccountingSelected((prev) => {
                        const next = new Set(prev);
                        postableRows.forEach((r) => {
                          const rowKey = accountingDueRowKey(r);
                          if (!rowKey) return;
                          if (checked) next.add(rowKey);
                          else next.delete(rowKey);
                        });
                        return next;
                      });
                    }}
                  />
                </span>
              </div>
            </div>
            <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--head accounting-due-inbox-grid-cell--no" role="columnheader">
              {t("no")}
            </div>
            <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--head accounting-due-inbox-grid-cell--date" role="columnheader">
              {t("startDate")}
            </div>
            <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--head accounting-due-inbox-grid-cell--period" role="columnheader">
              {t("billingDate")}
            </div>
            <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--head accounting-due-inbox-grid-cell--owner" role="columnheader">
              {t("cardOwner")}
            </div>
            <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--head accounting-due-inbox-grid-cell--bank" role="columnheader">
              {t("bank")}
            </div>
            <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--head accounting-due-inbox-grid-cell--contract" role="columnheader">
              {t("contract")}
            </div>
            <div
              className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--head accounting-due-inbox-grid-cell--delete"
              role="columnheader"
            >
              <div className="accounting-due-inbox-select-head">
                <span className="accounting-due-inbox-select-head-label accounting-due-inbox-select-head-label--delete">
                  {t("accountingDueColDelete")}
                </span>
                <span className="accounting-due-inbox-select-head-cb">
                  <input
                    type="checkbox"
                    title={t("selectAllForDelete")}
                    aria-label={`${t("accountingDueColDelete")} — ${t("selectAllForDelete")}`}
                    className="accounting-due-inbox-delete-cb"
                    checked={deleteAllChecked}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAccountingDeleteSelected(() => {
                        if (!checked) return new Set();
                        return new Set(accountingRows.map((r) => accountingDueRowKey(r)).filter(Boolean));
                      });
                    }}
                  />
                </span>
              </div>
            </div>
          </div>

          {accountingRows.map((r, idx) => {
            const rowKey = accountingDueRowKey(r);
            const checked = rowKey ? accountingSelected.has(rowKey) : false;
            const delChecked = rowKey ? accountingDeleteSelected.has(rowKey) : false;
            const posted = !!r.already_posted_today;
            return (
              <div
                className={`accounting-due-inbox-grid-row${posted ? " accounting-due-inbox-grid-row--posted" : ""}`}
                role="row"
                key={rowKey || `${r.id}-${idx}`}
              >
                <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--cb" role="cell">
                  <input
                    type="checkbox"
                    disabled={posted}
                    checked={checked && !posted}
                    onChange={(e) =>
                      setAccountingSelected((prev) => {
                        const n = new Set(prev);
                        if (!rowKey) return n;
                        if (e.target.checked) n.add(rowKey);
                        else n.delete(rowKey);
                        return n;
                      })
                    }
                  />
                </div>
                <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--no" role="cell">
                  {idx + 1}
                </div>
                <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--date" role="cell" title={formatAccountingDueProcessDayStart(r)}>
                  {formatAccountingDueProcessDayStart(r)}
                </div>
                <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--period" role="cell" title={formatAccountingDueBillingPeriod(r)}>
                  {formatAccountingDueBillingPeriod(r)}
                </div>
                <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--owner" role="cell" title={r.card_owner || r.name || r.supplier || "-"}>
                  {r.card_owner || r.name || r.supplier || "-"}
                </div>
                <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--bank" role="cell">
                  {r.bank || "-"}
                </div>
                <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--contract" role="cell">
                  {r.contract ? formatBankProcessContractLabel(lang, r.contract) : "-"}
                </div>
                <div className="accounting-due-inbox-grid-cell accounting-due-inbox-grid-cell--delete" role="cell">
                  <input
                    type="checkbox"
                    checked={delChecked}
                    onChange={(e) =>
                      setAccountingDeleteSelected((prev) => {
                        const n = new Set(prev);
                        if (!rowKey) return n;
                        if (e.target.checked) n.add(rowKey);
                        else n.delete(rowKey);
                        return n;
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="process-accounting-inbox-wrap" id="processAccountingDueWrap">
        <button
          type="button"
          className="process-accounting-inbox-btn process-accounting-inbox-main"
          id="processAccountingDueBtn"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={openInbox}
        >
          <svg className="process-accounting-inbox-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="process-accounting-inbox-main-label">{t("accountingDue")}</span>
          <span className="process-accounting-inbox-badge">{postableCount}</span>
        </button>
      </div>

      {isOpen ? (
        <ProcessModalPortal>
          <div
            id="processAccountingDueModal"
            className="modal show"
            style={processModalBackdropStyle}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeInbox();
            }}
          >
            <div className="modal-content accounting-due-modal-content">
              <div className="modal-header">
                <h2>
                  {t("accountingDue")}
                  <span className="process-accounting-inbox-badge">{postableCount}</span>
                </h2>
                <div className="modal-header-actions">
                  <button
                    type="button"
                    className="accounting-due-inbox-btn accounting-due-inbox-refresh"
                    onClick={() => refreshRef.current?.()}
                    disabled={accountingLoading}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t("refresh")}
                  </button>
                  <span className="close" onClick={closeInbox} role="presentation" aria-label={t("close")}>
                    &times;
                  </span>
                </div>
              </div>

              <div className="modal-body accounting-due-modal-body">
                {tableContent}

                <div className="accounting-due-inbox-toolbar">
                  <button
                    type="button"
                    className="accounting-due-inbox-action-btn accounting-due-inbox-action-btn--primary"
                    onClick={onPostToTransaction}
                    disabled={accountingLoading || accountingSelected.size === 0}
                  >
                    {t("transaction")}
                  </button>
                  <button
                    type="button"
                    className="accounting-due-inbox-action-btn accounting-due-inbox-action-btn--delete"
                    onClick={onDismissRows}
                    disabled={accountingLoading || accountingDeleteSelected.size === 0}
                  >
                    {t("delete")}
                  </button>
                  <button type="button" className="accounting-due-inbox-action-btn accounting-due-inbox-action-btn--cancel" onClick={closeInbox}>
                    {t("cancel")}
                  </button>
                </div>

                <div className="accounting-due-inbox-popover-footer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
                  </svg>
                  <span>{footerText}</span>
                </div>
              </div>
            </div>
          </div>
        </ProcessModalPortal>
      ) : null}
    </>
  );
}
