import React from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import { BankSearchableAccountPick } from "./bankProcessFormFields.jsx";
import { formatBankMoneyFixed2, sanitizeBankMoneyTyping } from "../lib/bankProcessHelpers.js";

function ProfitSharingAddIcon() {
  return (
    <svg className="profit-sharing-inline-add-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

function ProfitSharingDeleteIcon() {
  return (
    <svg className="profit-sharing-delete-row-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3h6l1 2h5v2H3V5h5l1-2z" fill="currentColor" opacity="0.92" />
      <path d="M5 9h14l-1 12H6L5 9z" fill="currentColor" />
    </svg>
  );
}

export default function ProfitSharingModal({
  profitShareRows,
  setProfitShareRows,
  accounts,
  onConfirm,
  onClose,
  onOpenAddAccountForField,
  t,
}) {
  const addRow = () => {
    setProfitShareRows((prev) => [...prev, { accountId: "", accountLabel: "", amount: "" }]);
  };

  const blurAmount = (idx, raw) => {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) {
      setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: "" } : r)));
      return;
    }
    const formatted = formatBankMoneyFixed2(trimmed, { emptyAsZero: false });
    setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: formatted } : r)));
  };

  const removeRow = (idx) => {
    if (idx <= 0) return;
    setProfitShareRows((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <ProcessModalPortal>
    <div id="profitSharingModal" className="modal" style={{ ...processModalBackdropStyle, zIndex: 10100 }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{t("addProfitSharing")}</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body">
          <div className="bank-form" style={{ display: "block", width: "100%" }}>
            <div
              id="profitSharingRowsContainer"
              className={profitShareRows.length > 7 ? "profit-sharing-rows-scroll" : undefined}
            >
              {profitShareRows.map((row, idx) => (
                <div key={`ps-${idx}`} className="form-row profit-sharing-row">
                  <label className="profit-sharing-label profit-sharing-label-account">{t("account")}</label>
                  <label className="profit-sharing-label profit-sharing-label-amount">{t("amount")}</label>
                  <div className="profit-sharing-control profit-sharing-control-account">
                    <div className="account-select-with-buttons">
                      <BankSearchableAccountPick
                        value={row.accountId}
                        onChange={(id) => {
                          const acc = accounts.find((a) => String(a.id) === String(id));
                          setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, accountId: id, accountLabel: acc?.account_id || "" } : r)));
                        }}
                        accounts={accounts}
                        disabled={false}
                        t={t}
                      />
                      <button type="button" className="profit-sharing-inline-add-btn" title={t("addAccount")} aria-label={t("addAccount")} onClick={() => onOpenAddAccountForField({ type: "profitRow", index: idx })}>
                        <ProfitSharingAddIcon />
                      </button>
                    </div>
                  </div>
                  <div className="profit-sharing-control profit-sharing-control-amount">
                    <div className="profit-sharing-amount-field">
                      <input
                        type="text"
                        className="bank-input profit-sharing-amount"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        value={row.amount}
                        onChange={(e) => setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: sanitizeBankMoneyTyping(e.target.value) } : r)))}
                        onBlur={(e) => blurAmount(idx, e.target.value)}
                      />
                      {idx > 0 ? (
                        <button
                          type="button"
                          className="profit-sharing-delete-row-btn"
                          onClick={() => removeRow(idx)}
                          title={t("removeRow")}
                          aria-label={t("removeRow")}
                        >
                          <ProfitSharingDeleteIcon />
                        </button>
                      ) : profitShareRows.length > 1 ? (
                        <span className="profit-sharing-delete-row-spacer" aria-hidden="true" />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="profit-sharing-add-row-wrap">
              <button type="button" className="profit-sharing-add-account-btn" onClick={addRow}>
                {t("addAccountInline")}
              </button>
            </div>
            <div className="form-actions bank-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-save profit-sharing-modal-btn" onClick={onConfirm}>{t("add")}</button>
              <button type="button" className="btn btn-cancel profit-sharing-modal-btn" onClick={onClose}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </ProcessModalPortal>
  );
}
