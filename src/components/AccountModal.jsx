import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { accountModalOverlayZIndex, accountCompanyPickerZIndex } from "./ProcessModalPortal.jsx";
import SimpleSelect from "./SimpleSelect.jsx";
import { useSubmitGuard } from "../hooks/useSubmitGuard.js";
import { formatAccountRoleDisplay } from "../translateFile/pages/accountTranslate.js";

function upper(v) {
  return String(v || "").toUpperCase();
}

function normalizePickerValue(value) {
  return String(value ?? "").trim().toUpperCase();
}

/**
 * Single shared Account modal (Add/Edit) UI component.
 *
 * Design goals:
 * - Keep **one** modal implementation to avoid drift/overrides.
 * - No network calls inside. All state & side effects are injected via props.
 */
export default function AccountModal({
  open,
  title,
  isEditMode,
  form,
  setForm,
  orderedRoles,
  currencies,
  companies,
  selectedCurrencyIds,
  setSelectedCurrencyIds,
  selectedCompanyIds,
  setSelectedCompanyIds,
  currencyInput,
  setCurrencyInput,
  onCreateCurrency,
  onRemoveCurrency,
  onSubmit,
  onClose,
  t,
  /** When true, × delete is only shown for deselected (non-blue) currency tags */
  currencyDeleteOnlyWhenDeselected = false,
  /** When nested above other modals (e.g. Domain Company Settings at 2147483001) */
  overlayZIndex,
  /** Render on document.body so z-index is not trapped inside #root .container (default: true) */
  portalToBody = true,
  /** Group-only mode: picker behaves as Choose Group (single-select). */
  groupPickerMode = false,
}) {
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  /** Draft selection inside company picker; committed only on Done */
  const [draftCompanyIds, setDraftCompanyIds] = useState([]);
  const { submitting, guardSubmit, reset: resetSubmitGuard } = useSubmitGuard(open);

  const closeCompanyPicker = () => {
    setCompanyPickerOpen(false);
    setCompanySearchQuery("");
  };

  useEffect(() => {
    if (!open) {
      closeCompanyPicker();
      resetSubmitGuard();
    }
  }, [open, resetSubmitGuard]);

  const handleFormSubmit = guardSubmit(onSubmit);

  useEffect(() => {
    if (companyPickerOpen) {
      setDraftCompanyIds([...selectedCompanyIds]);
    }
  }, [companyPickerOpen]);

  useEffect(() => {
    if (!companyPickerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeCompanyPicker();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [companyPickerOpen]);

  const companyRows = useMemo(() => {
    if (!Array.isArray(companies)) return [];
    return companies
      .map((c) => ({
        ...c,
        company_id: c?.company_id ?? c?.company_code ?? c?.companyId ?? c?.code ?? "",
        picker_value: groupPickerMode
          ? normalizePickerValue(c?.group_id ?? c?.company_id ?? c?.id ?? "")
          : normalizePickerValue(c?.id),
      }))
      .filter((c) => String(c.company_id || "").trim() !== "" && c.picker_value !== "");
  }, [companies, groupPickerMode]);

  const selectedCompanyLabels = useMemo(() => {
    const selectedSet = new Set((selectedCompanyIds || []).map((id) => normalizePickerValue(id)));
    return companyRows
      .filter((c) => selectedSet.has(c.picker_value))
      .map((c) => String(c.company_id || "").toUpperCase());
  }, [companyRows, selectedCompanyIds]);

  const companyPickerFiltered = useMemo(() => {
    const q = companySearchQuery.trim().toUpperCase();
    if (!q) return companyRows;
    return companyRows.filter((c) => String(c.company_id || "").toUpperCase().includes(q));
  }, [companyRows, companySearchQuery]);

  const translate = (key, params) => (typeof t === "function" ? t(key, params) : key);

  const roleOptions = useMemo(
    () =>
      (orderedRoles || []).map((r) => ({
        value: r,
        label: formatAccountRoleDisplay(translate, r),
      })),
    [orderedRoles, t],
  );

  const alertTypeOptions = useMemo(
    () => [
      { value: "weekly", label: translate("weekly") },
      { value: "monthly", label: translate("monthly") },
      ...Array.from({ length: 31 }, (_, i) => ({
        value: String(i + 1),
        label: translate("days", { n: i + 1 }),
      })),
    ],
    [t],
  );

  if (!open) return null;

  const text = translate;
  const modalId = isEditMode ? "account-editModal" : "account-addModal";
  const paymentAlertOn = form.payment_alert === "1";

  const currencyPlaceholder = text("newCurrencyPlaceholder");
  /** HTML size ≈ placeholder width (ch); CJK glyphs render wider → slight bump */
  const hasCjk = /[\u4e00-\u9fff\u3000-\u303f\u3040-\u30ff]/.test(currencyPlaceholder);
  const currencyInputCols = Math.min(
    80,
    Math.max(12, Math.ceil([...currencyPlaceholder].length * (hasCjk ? 1.15 : 1) + 1))
  );

  const toggleId = (arr, id) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const renderCurrencyList = () => {
    if (!Array.isArray(currencies) || currencies.length === 0) return null;

    // If no remove handler: render as simple selectable pills.
    if (typeof onRemoveCurrency !== "function") {
      return (
        <div className="account-currency-list">
          {currencies.map((c) => {
            const id = Number(c.id);
            const selected = selectedCurrencyIds.includes(id);
            return (
              <button
                key={c.id}
                type="button"
                className={`account-currency-item ${selected ? "selected" : ""}`}
                onClick={() => setSelectedCurrencyIds((prev) => toggleId(prev, id))}
              >
                {upper(c.code)}
              </button>
            );
          })}
        </div>
      );
    }

    // With remove handler: render delete button (used in bank process page).
    return (
      <div className="account-currency-list">
        {currencies.map((c) => {
          const id = Number(c.id);
          const selected = selectedCurrencyIds.includes(id);
          return (
            <div
              key={c.id}
              className={`account-currency-item currency-toggle-item ${selected ? "selected" : ""}`}
              onClick={() => setSelectedCurrencyIds((prev) => toggleId(prev, id))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCurrencyIds((prev) => toggleId(prev, id));
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="currency-code-text">
                {upper(c.code)}
              </span>
              {(!currencyDeleteOnlyWhenDeselected || !selected) && c.deletable !== false ? (
                <button
                  type="button"
                  className="currency-delete-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveCurrency(c.id);
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
    {(() => {
      const modalNode = (
    <div
      id={modalId}
      className="account-modal"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: overlayZIndex ?? accountModalOverlayZIndex,
      }}
    >
      <div className="account-modal-content">
        <div className="account-modal-header account-form-modal-header">
          <h2>{title}</h2>
          <span className="account-close" onClick={onClose} role="button" tabIndex={0} aria-label="Close" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClose(); } }} />
        </div>
        <div className="account-modal-body">
          <form className="account-form" onSubmit={handleFormSubmit}>
            <div className="account-form-columns account-form-columns--paired-fields">
              <h3 className="account-section-header">{text("personalInformation")}</h3>
              <h3 className="account-section-header">{text("payment")}</h3>

              <div className="account-form-group">
                <label>{text("accountIdRequired")}</label>
                <input
                  type="text"
                  value={form.account_id}
                  onChange={(e) => setForm((f) => ({ ...f, account_id: upper(e.target.value) }))}
                  disabled={!!isEditMode}
                  required
                />
              </div>
              <div className="account-form-group">
                <label>{text("paymentAlert")}</label>
                <div className="account-radio-group">
                  <label className="account-radio-label">
                    <input
                      type="radio"
                      name="payment_alert"
                      value="1"
                      checked={form.payment_alert === "1"}
                      onChange={() => setForm((f) => ({ ...f, payment_alert: "1" }))}
                    />
                    {text("yes")}
                  </label>
                  <label className="account-radio-label">
                    <input
                      type="radio"
                      name="payment_alert"
                      value="0"
                      checked={form.payment_alert === "0"}
                      onChange={() =>
                        setForm((f) => ({ ...f, payment_alert: "0", alert_type: "", alert_start_date: "", alert_amount: "" }))
                      }
                    />
                    {text("noWord")}
                  </label>
                </div>
              </div>

              <div className="account-form-group">
                <label>{text("nameRequired")}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: upper(e.target.value) }))}
                  required
                />
              </div>
              {paymentAlertOn ? (
                <div className="account-form-columns__payment-extra">
                  <div className="account-form-row">
                    <div className="account-form-group">
                      <label>{text("alertType")}</label>
                      <SimpleSelect
                        value={form.alert_type}
                        onChange={(v) => setForm((f) => ({ ...f, alert_type: v }))}
                        options={alertTypeOptions}
                        placeholder={text("selectType")}
                      />
                    </div>
                    <div className="account-form-group">
                      <label>{text("startDate")}</label>
                      <input
                        type="date"
                        value={form.alert_start_date}
                        onChange={(e) => setForm((f) => ({ ...f, alert_start_date: e.target.value }))}
                        onClick={(e) => {
                          const el = e.currentTarget
                          if (typeof el.showPicker === "function") {
                            try {
                              el.showPicker()
                            } catch {
                              /* 部分环境在非用户手势等情况下会抛错 */
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="account-form-group account-form-group--remark">
                  <label>{text("remark")}</label>
                  <input
                    type="text"
                    id={isEditMode ? "edit_remark" : "add_remark"}
                    value={form.remark}
                    onChange={(e) => setForm((f) => ({ ...f, remark: upper(e.target.value) }))}
                  />
                </div>
              )}

              <div className="account-form-group">
                <label>{text("roleRequired")}</label>
                <SimpleSelect
                  value={form.role}
                  onChange={(v) => setForm((f) => ({ ...f, role: v }))}
                  options={roleOptions}
                  placeholder={text("selectRole")}
                  required
                />
              </div>
              {paymentAlertOn ? (
                <div className="account-form-group">
                  <label>{text("alertAmount")}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={text("enterAmountPlaceholder")}
                    value={form.alert_amount || ""}
                    onChange={(e) => setForm((f) => ({ ...f, alert_amount: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="account-form-columns__payment-extra" />
              )}

              <div className="account-form-group">
                <label>{text("passwordRequired")}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
              {paymentAlertOn ? (
                <div className="account-form-group account-form-group--remark account-form-group--remark-bottom">
                  <label>{text("remark")}</label>
                  <input
                    type="text"
                    id={isEditMode ? "edit_remark" : "add_remark"}
                    value={form.remark}
                    onChange={(e) => setForm((f) => ({ ...f, remark: upper(e.target.value) }))}
                  />
                </div>
              ) : (
                <div className="account-form-columns__payment-extra" />
              )}
            </div>

            <div className="account-form-section">
              <div className="account-advance-section">
                <h3>{text("advancedAccount")}</h3>
                <div className="account-other-currency">
                  <label>{text("otherCurrency")}</label>
                  <div className="account-currency-input-group">
                    <input
                      type="text"
                      size={currencyInputCols}
                      placeholder={currencyPlaceholder}
                      value={currencyInput}
                      onChange={(e) => setCurrencyInput(upper(e.target.value))}
                    />
                    <button type="button" className="account-btn-add-currency" onClick={onCreateCurrency}>
                      {text("createCurrency")}
                    </button>
                  </div>
                  {renderCurrencyList()}
                </div>

                <div className="account-other-currency account-other-currency--company">
                  <div className="form-group company-field-group account-modal-company-field">
                    <div className="user-modal-company-heading-row">
                      <label id="account-modal-company-trigger-label" htmlFor="account-modal-company-open-btn">
                        {groupPickerMode ? text("groupRequiredMark") : text("companyRequiredMark")}
                      </label>
                      <button
                        id="account-modal-company-open-btn"
                        type="button"
                        className="user-modal-company-open-btn"
                        onClick={() => {
                          setDraftCompanyIds([...selectedCompanyIds]);
                          setCompanySearchQuery("");
                          setCompanyPickerOpen(true);
                        }}
                      >
                        {groupPickerMode ? text("selectGroups") : text("selectCompanies")}
                      </button>
                    </div>
                    <div className="user-modal-company-summary" aria-labelledby="account-modal-company-trigger-label">
                      {selectedCompanyLabels.length ? (
                        <span className="user-modal-company-summary-text">{selectedCompanyLabels.join(", ")}</span>
                      ) : (
                        <span className="user-modal-company-summary-empty">
                          {groupPickerMode ? text("groupNoneSelected") : text("companyNoneSelected")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="account-form-actions">
              <button type="submit" className="account-btn account-btn-save" disabled={submitting}>
                {submitting ? text("saving") : isEditMode ? text("updateAccount") : text("addAccount")}
              </button>
              <button type="button" className="account-btn account-btn-cancel" onClick={onClose}>
                {text("cancel")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
      );
      if (portalToBody && typeof document !== "undefined" && document.body) {
        return createPortal(modalNode, document.body);
      }
      return modalNode;
    })()}
    {companyPickerOpen
      ? createPortal(
          <div
            className="user-modal-company-picker-root user-modal-company-picker-root--above-modals"
            style={{ zIndex: accountCompanyPickerZIndex }}
          >
            <button
              type="button"
              className="user-modal-company-picker-backdrop"
              aria-label={text("cancel")}
              onClick={closeCompanyPicker}
            />
            <div
              className="user-modal-company-picker user-modal-company-picker--account"
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-modal-company-picker-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="user-modal-company-picker-header">
                <span id="account-modal-company-picker-title">
                  {groupPickerMode ? text("groupPickerTitle") : text("companyPickerTitle")}
                </span>
                <button
                  type="button"
                  className="user-modal-company-picker-close"
                  aria-label={text("cancel")}
                  onClick={closeCompanyPicker}
                >
                  ×
                </button>
              </div>
              <div className="user-modal-company-picker-filter-row">
                <input
                  type="search"
                  className="user-modal-company-picker-search"
                  placeholder={groupPickerMode ? text("groupSearchPlaceholder") : text("companySearchPlaceholder")}
                  value={companySearchQuery}
                  onChange={(e) => setCompanySearchQuery(e.target.value)}
                  autoComplete="off"
                />
                {groupPickerMode ? null : (
                  <button
                    type="button"
                    className="user-modal-company-picker-select-all"
                    disabled={companyRows.length === 0}
                    onClick={() => {
                      setDraftCompanyIds(companyRows.map((c) => c.picker_value));
                    }}
                  >
                    {text("selectAll")}
                  </button>
                )}
              </div>
              <div className="user-modal-company-picker-body">
                <ul className="user-modal-company-picker-list">
                  {companyPickerFiltered.map((c) => {
                    const id = c.picker_value;
                    const checked = draftCompanyIds.map((v) => normalizePickerValue(v)).includes(id);
                    return (
                      <li key={id} className="user-modal-company-picker-row">
                        <label className={checked ? "user-modal-company-picker-label is-checked" : "user-modal-company-picker-label"}>
                          <input
                            type={groupPickerMode ? "radio" : "checkbox"}
                            name={groupPickerMode ? "account-group-picker" : undefined}
                            checked={checked}
                            onChange={() =>
                              setDraftCompanyIds((prev) => {
                                if (groupPickerMode) return [id];
                                if (prev.includes(id)) return prev.filter((x) => x !== id);
                                return [...prev, id];
                              })
                            }
                          />
                          <span>{String(c.company_id || "").toUpperCase()}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="user-modal-company-picker-footer">
                <button
                  type="button"
                  className="user-modal-company-picker-done"
                  onClick={() => {
                    setSelectedCompanyIds(draftCompanyIds);
                    closeCompanyPicker();
                  }}
                >
                  {groupPickerMode ? text("groupPickerDone") : text("companyPickerDone")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null}
    </>
  );
}
