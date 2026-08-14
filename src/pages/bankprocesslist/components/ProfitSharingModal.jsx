import React from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import { BankSearchableAccountPick } from "./bankProcessFormFields.jsx";
import { formatBankMoneyFixed2, sanitizeBankMoneyTyping, isValidBankMoneyInput } from "../lib/bankProcessHelpers.js";
import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";

function ProfitSharingAddIcon() {
  return (
    <svg className="profit-sharing-inline-add-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

export function ProfitSharingDeleteIcon({ className = "profit-sharing-delete-row-icon", width = 18, height = 18 }) {
  return (
    <svg className={className} width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3h6l1 2h5v2H3V5h5l1-2z" fill="currentColor" opacity="0.92" />
      <path d="M5 9h14l-1 12H6L5 9z" fill="currentColor" />
    </svg>
  );
}

/** Profit still available to share = max(0, sell - cost - sum(other rows' amount)). */
function computeRemainingProfit(cost, price, rows, excludeIdx) {
  const costDec = isValidBankMoneyInput(cost) ? MoneyDecimal.toDecimal(cost, 0) : MoneyDecimal.toDecimal("0", 0);
  const priceDec = isValidBankMoneyInput(price) ? MoneyDecimal.toDecimal(price, 0) : MoneyDecimal.toDecimal("0", 0);
  let usedDec = MoneyDecimal.toDecimal("0", 0);
  rows.forEach((r, i) => {
    if (i === excludeIdx) return;
    if (isValidBankMoneyInput(r.amount)) {
      usedDec = usedDec.plus(MoneyDecimal.toDecimal(r.amount, 0));
    }
  });
  return MoneyDecimal.max(MoneyDecimal.sub(priceDec, costDec).minus(usedDec), "0");
}

export default function ProfitSharingModal({
  profitShareRows,
  setProfitShareRows,
  accounts,
  cost,
  price,
  onConfirm,
  onClose,
  onOpenAddAccountForField,
  notify,
  t,
}) {
  const addRow = () => {
    setProfitShareRows((prev) => [...prev, { accountId: "", accountLabel: "", amount: "", amountMode: "", percentInput: "" }]);
  };

  const rejectExceedsRemaining = (remaining) => {
    notify?.(t("profitSharingExceedsRemaining", { remaining: formatBankMoneyFixed2(remaining.toString()) }), "danger");
  };

  const blurAmount = (idx, raw) => {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) {
      setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: "" } : r)));
      return;
    }
    const formatted = formatBankMoneyFixed2(trimmed, { emptyAsZero: false });
    const remaining = computeRemainingProfit(cost, price, profitShareRows, idx);
    if (isValidBankMoneyInput(formatted) && MoneyDecimal.cmp(formatted, remaining.toString()) > 0) {
      rejectExceedsRemaining(remaining);
      return;
    }
    setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: formatted } : r)));
  };

  const deactivateAmountMode = (idx) => {
    setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amountMode: "" } : r)));
  };

  /** Recomputes amount live from a percentage input; rejects keystrokes over 100% outright and does not touch amount when the text is incomplete/invalid mid-typing. */
  const handlePercentInputChange = (idx, rawText) => {
    const sanitized = sanitizeBankMoneyTyping(rawText);
    const trimmed = sanitized.trim();
    if (!trimmed) {
      setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, percentInput: sanitized, amount: "" } : r)));
      return;
    }
    if (!isValidBankMoneyInput(trimmed)) {
      setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, percentInput: sanitized } : r)));
      return;
    }
    if (MoneyDecimal.cmp(trimmed, "100") > 0) {
      notify?.(t("profitSharingPercentMax100"), "danger");
      return;
    }
    const remaining = computeRemainingProfit(cost, price, profitShareRows, idx);
    const pctDec = MoneyDecimal.toDecimal(trimmed, 0);
    const amountDec = remaining.times(pctDec).div(100);
    if (MoneyDecimal.cmp(amountDec.toString(), remaining.toString()) > 0) {
      rejectExceedsRemaining(remaining);
      setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, percentInput: sanitized } : r)));
      return;
    }
    const formatted = formatBankMoneyFixed2(amountDec.toString(), { emptyAsZero: false });
    setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, percentInput: sanitized, amount: formatted } : r)));
  };

  const activatePercentMode = (idx) => {
    setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amountMode: "percent" } : r)));
    const prevPercent = profitShareRows[idx]?.percentInput;
    if (prevPercent) handlePercentInputChange(idx, prevPercent);
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
                        readOnly={row.amountMode === "percent"}
                        value={row.amount}
                        onChange={(e) => setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: sanitizeBankMoneyTyping(e.target.value), amountMode: "" } : r)))}
                        onBlur={(e) => blurAmount(idx, e.target.value)}
                      />
                      {row.amountMode === "percent" ? (
                        <div className="profit-sharing-percent-input-wrap">
                          <input
                            type="text"
                            className="profit-sharing-percent-input"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="%"
                            autoFocus
                            value={row.percentInput || ""}
                            onChange={(e) => handlePercentInputChange(idx, e.target.value)}
                          />
                          <button
                            type="button"
                            className="profit-sharing-percent-suffix-btn"
                            onClick={() => deactivateAmountMode(idx)}
                            aria-label="%"
                          >
                            %
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="profit-sharing-amount-mode-btn profit-sharing-amount-percent-btn"
                          onClick={() => activatePercentMode(idx)}
                          aria-label="%"
                        >
                          %
                        </button>
                      )}
                      {idx > 0 ? (
                        <button
                          type="button"
                          className="profit-sharing-delete-row-btn"
                          onClick={() => removeRow(idx)}
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
