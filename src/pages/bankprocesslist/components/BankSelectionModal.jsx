import React from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import { sanitizeCapitalLettersOnly } from "../../../utils/input/sanitizeCapitalLettersOnly.js";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";

export default function BankSelectionModal({
  banksList,
  selectedBankChips,
  setSelectedBankChips,
  bankSearch,
  setBankSearch,
  newBankName,
  setNewBankName,
  onSubmitNewBank,
  onRemoveAvailableBank,
  onConfirm,
  onClose,
  notify,
  t,
}) {
  const { submitting: addingBank, guardSubmit } = useSubmitGuard(true);
  const pickBank = (b) => {
    setSelectedBankChips((prev) => (prev.includes(b) ? prev : [...prev, b]));
  };

  const availableBanks = (banksList || []).filter((b) => !selectedBankChips.includes(b));

  return (
    <ProcessModalPortal>
    <div id="bankSelectionModal" className="modal bank-selection-modal-wrap" style={processModalBackdropStyle}>
      <div className="modal-content bank-selection-modal">
        <div className="modal-header bank-selection-modal-header">
          <h2>{t("selectOrAddBank")}</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body bank-selection-modal-body">
          <div className="bank-selection-container">
            <div className="available-banks-section">
              <div className="add-bank-bar">
                <h3>{t("addNewBank")}</h3>
                <form className="add-bank-form" onSubmit={guardSubmit(onSubmitNewBank)}>
                  <div className="add-bank-input-group">
                    <input
                      type="text"
                      id="new_bank_name"
                      placeholder={t("addNewBank")}
                      value={newBankName}
                      onChange={(e) => setNewBankName(sanitizeCapitalLettersOnly(e.target.value))}
                    />
                    <button type="submit" className="btn btn-save bank-selection-add-btn" disabled={addingBank}>
                      {addingBank ? t("saving") : t("add")}
                    </button>
                  </div>
                </form>
              </div>
              <h3>{t("availableBanks")}</h3>
              <div className="bank-search">
                <input
                  type="text"
                  id="bankSearch"
                  placeholder={t("searchBanks")}
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value.toUpperCase())}
                />
              </div>
              <div className="bank-list" id="existingBanks">
                {availableBanks.filter((b) => !bankSearch.trim() || b.toUpperCase().includes(bankSearch.trim())).map((b) => (
                  <div
                    key={b}
                    className="country-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => pickBank(b)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pickBank(b);
                      }
                    }}
                  >
                    <div className="country-item-left">
                      <span className="country-item-code">{b}</span>
                    </div>
                    <button
                      type="button"
                      className="country-list-delete remove-country-modal"
                      aria-label={t("removeBankChipAria", { bank: b })}
                      title={t("removeBankChipAria", { bank: b })}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void onRemoveAvailableBank(b);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="selected-banks-section">
              <h3>{t("selectedBanks")}</h3>
              <div className="selected-banks-list" id="selectedBanksInModal">
                {selectedBankChips.length === 0 ? (
                  <div className="no-countries">{t("none")}</div>
                ) : (
                  selectedBankChips.map((b) => (
                    <div key={`sel-b-${b}`} className="selected-country-modal-item">
                      <span>{b}</span>
                      <button
                        type="button"
                        className="remove-country-modal"
                        aria-label={t("removeBankChipAria", { bank: b })}
                        onClick={() => setSelectedBankChips((prev) => prev.filter((x) => x !== b))}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer bank-selection-modal-footer">
          <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
          <button
            type="button"
            className="btn btn-save"
            id="confirmBanksBtn"
            onClick={() => {
              if (selectedBankChips.length === 0) {
                notify(t("selectAtLeastOneBank"), "warning");
                return;
              }
              onConfirm(selectedBankChips);
            }}
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
    </ProcessModalPortal>
  );
}
