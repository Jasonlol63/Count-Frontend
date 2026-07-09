import { useEffect, useMemo, useRef, useState } from "react";
import { EDIT_FORMULA_INPUT_METHODS, CALCULATOR_KEYPAD } from "../formula/editFormulaConstants.js";
import { formatSummaryAccountDisplay } from "../formula/editFormulaFormState.js";
import { getSummaryInputMethodLabel } from "../../../translateFile/pages/dataCaptureSummaryTranslate.js";
import { portalToDocumentBody } from "../../../components/ProcessModalPortal.jsx";

function CalcButton({ value, action, className = "", clearLabel = "Clr", onPress }) {
  const isOperator = ["/", "*", "-", "+"].includes(value);
  const isClear = action === "clear";
  const isEquals = action === "equals";
  let btnClass = "calc-btn";
  if (isOperator) btnClass += " calc-operator";
  if (isClear) btnClass += " calc-clear";
  if (isEquals) btnClass += " calc-operator";
  if (className) btnClass += ` ${className}`;

  return (
    <button
      type="button"
      className={btnClass}
      onClick={() => onPress({ action, value })}
    >
      {isClear ? clearLabel : isEquals ? "=" : value}
    </button>
  );
}

export default function EditFormulaModal({
  t,
  open,
  form,
  accounts = [],
  currencies = [],
  idProductOptions = [],
  rowDataOptions = [],
  formulaDataGridItems = [],
  saveDisabled = false,
  saving = false,
  onClose,
  onSave,
  onFormChange,
  onAccountSelect,
  onOpenAddAccount,
  onAddSelectedData,
  onFormulaGridItemClick,
  onCalculatorPress,
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const accountWrapperRef = useRef(null);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const onDocClick = (e) => {
      if (accountWrapperRef.current && !accountWrapperRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [accountOpen]);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (!q) return true;
      const label = formatSummaryAccountDisplay(acc).toLowerCase();
      return label.includes(q);
    });
  }, [accounts, accountSearch]);

  if (!open || !form) return null;

  const lang = localStorage.getItem("login_lang") === "zh" ? "zh" : "en";

  const setField = (patch) => onFormChange?.({ ...form, ...patch });

  const handleOpenAddAccount = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenAddAccount?.();
  };

  const selectAccount = (acc) => {
    const id = String(acc.id ?? "");
    const label = formatSummaryAccountDisplay(acc, id);
    setField({ accountId: id, accountText: label, currencyId: "", currencyLabel: "" });
    onAccountSelect?.(id);
    setAccountOpen(false);
    setAccountSearch("");
  };

  const handleCurrencyChange = (e) => {
    const currencyId = e.target.value;
    const opt = e.target.selectedOptions?.[0];
    setField({
      currencyId,
      currencyLabel: opt?.textContent?.trim() || "",
    });
  };

  return portalToDocumentBody(
    <div
      id="editFormulaModal"
      className="summary-modal"
      style={{ display: "flex" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-formula-title"
    >
      <div className="summary-confirm-modal-content" id="editFormulaModalContent">
        <div id="editFormulaForm" className="edit-formula-form-container">
          <div className="form-header">
            <h3 id="edit-formula-title">{t("editFormula")}</h3>
            <button type="button" className="account-close" onClick={onClose} aria-label={t("close")} />
          </div>
          <div className="form-content">
            <div className="form-layout">
              <div className="form-left-column">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="process">{t("idProduct")}</label>
                    <input type="text" id="process" value={form.processValue || ""} readOnly />
                  </div>
                </div>

                <div className="form-row account-form-row">
                  <div className="form-group">
                    <label htmlFor="account">{t("account")}</label>
                    <div className="account-select-with-buttons">
                      <div className="custom-select-wrapper" ref={accountWrapperRef}>
                        <button
                          type="button"
                          className={`custom-select-button${accountOpen ? " open" : ""}`}
                          id="account"
                          data-placeholder={t("selectAccount")}
                          name="account"
                          onClick={(e) => {
                            e.preventDefault();
                            setAccountOpen((v) => !v);
                          }}
                        >
                          {form.accountText || t("selectAccount")}
                        </button>
                        <div
                          className={`custom-select-dropdown${accountOpen ? " show" : ""}`}
                          id="account_dropdown"
                        >
                          <div className="custom-select-search">
                            <input
                              type="text"
                              placeholder={t("searchAccount")}
                              autoComplete="off"
                              value={accountSearch}
                              onChange={(e) => setAccountSearch(e.target.value)}
                            />
                          </div>
                          <div className="custom-select-options">
                            {filteredAccounts.map((acc) => (
                              <div
                                key={String(acc.id)}
                                className="custom-select-option"
                                role="button"
                                tabIndex={0}
                                onClick={() => selectAccount(acc)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") selectAccount(acc);
                                }}
                              >
                                {formatSummaryAccountDisplay(acc)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="account-add-btn"
                        onClick={handleOpenAddAccount}
                        title={t("addNewAccount")}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-row source-percent-row">
                  <div className="form-group source-percent-group">
                    <label htmlFor="sourcePercent">{t("source")}</label>
                    <input
                      type="text"
                      id="sourcePercent"
                      placeholder={t("sourcePercentPlaceholder")}
                      value={form.sourcePercent || ""}
                      onChange={(e) => setField({ sourcePercent: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="descriptionSelect1">{t("data")}</label>
                    <div className="description-select-with-buttons">
                      <select
                        id="descriptionSelect1"
                        value={form.descriptionSelect1 || ""}
                        onChange={(e) => setField({ descriptionSelect1: e.target.value })}
                      >
                        <option value="">{t("selectIdProduct")}</option>
                        {idProductOptions.map((opt) => {
                          const value = typeof opt === "string" ? opt : opt.value;
                          const label = typeof opt === "string" ? opt : opt.label;
                          return (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                      <select
                        id="descriptionSelect2"
                        value={form.descriptionSelect2 || ""}
                        onChange={(e) => setField({ descriptionSelect2: e.target.value })}
                      >
                        <option value="">{t("selectRowData")}</option>
                        {rowDataOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="description-add-btn"
                        onClick={() => onAddSelectedData?.()}
                        title={t("addSelectedDataToFormula")}
                      >
                        {t("add")}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formula">{t("formula")}</label>
                    <input
                      type="text"
                      id="formula"
                      placeholder={t("formulaPlaceholder")}
                      value={form.formula || ""}
                      onChange={(e) => setField({ formula: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formulaDisplay" />
                    <input
                      type="text"
                      id="formulaDisplay"
                      readOnly
                      value={form.formulaDisplay || ""}
                      style={{
                        backgroundColor: "#f5f5f5",
                        cursor: "not-allowed",
                        color: "#666",
                        fontStyle: "italic",
                      }}
                      placeholder=""
                    />
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formulaDataGrid" />
                    <div id="formulaDataGrid" className="formula-data-grid">
                      {formulaDataGridItems.length > 0 ? (
                        <div className="formula-data-grid-row">
                          {formulaDataGridItems.map((item) => (
                            <div
                              key={`${item.rowIndex}-${item.columnIndex}-${item.value}`}
                              className="formula-data-grid-item"
                              role="button"
                              tabIndex={0}
                              onClick={() => onFormulaGridItemClick?.(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onFormulaGridItemClick?.(item);
                                }
                              }}
                            >
                              {`[${item.columnIndex}] ${item.value}`}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-middle-column">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="inputMethod">{t("inputMethod")}</label>
                    <select
                      id="inputMethod"
                      value={form.inputMethod || ""}
                      onChange={(e) => setField({ inputMethod: e.target.value })}
                    >
                      {EDIT_FORMULA_INPUT_METHODS.map((opt) => (
                        <option key={opt.value || "empty"} value={opt.value}>
                          {getSummaryInputMethodLabel(lang, opt.value)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="currency">{t("currency")}</label>
                    <select id="currency" value={form.currencyId || ""} onChange={handleCurrencyChange}>
                      <option value="">{t("selectCurrency")}</option>
                      {currencies.map((c) => {
                        const id = String(c.id ?? c.currency_id ?? "");
                        const code = String(c.code || c.currency_code || c.name || id);
                        return (
                          <option key={id} value={id}>
                            {code}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="description">{t("description")}</label>
                    <input
                      type="text"
                      id="description"
                      placeholder=""
                      value={form.description || ""}
                      onChange={(e) => setField({ description: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="form-right-column calculator-column">
                <div className="calculator-keypad">
                  {CALCULATOR_KEYPAD.map((row, rowIndex) => (
                    <div className="calculator-row" key={`calc-row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => {
                        if (cell === "") {
                          return <button key={`empty-${cellIndex}`} type="button" className="calc-btn calc-empty" />;
                        }
                        if (cell === "clear") {
                          return (
                            <CalcButton
                              key="clear"
                              action="clear"
                              clearLabel={t("calcClear")}
                              onPress={onCalculatorPress}
                            />
                          );
                        }
                        if (cell === "equals") {
                          return <CalcButton key="equals" action="equals" onPress={onCalculatorPress} />;
                        }
                        return <CalcButton key={cell} value={cell} onPress={onCalculatorPress} />;
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="form-actions edit-formula-form-actions">
            <button
              type="button"
              id="editFormulaSaveBtn"
              className="btn btn-save"
              disabled={saveDisabled || saving}
              onClick={onSave}
            >
              {saving ? t("saving") : t("save")}
            </button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>
              {t("cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
