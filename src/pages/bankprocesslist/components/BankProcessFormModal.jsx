import React from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";
import {
  BankFormDateField,
  BankSearchableAccountPick,
  BankSimpleSelect,
} from "./bankProcessFormFields.jsx";
import {
  parseProfitSharingToRows,
  serializeProfitSharingRows,
  parseBankContractRentalMonthsForDayEnd,
  contractBillingEndYmdForBankForm,
  bankProcessFrequencyNormalized,
  BANK_PROCESS_CONTRACT_OPTIONS,
  formatBankProcessContractLabel,
  formatBankAccountDisplay,
  formatBankMoneyFixed2,
  sanitizeBankMoneyTyping,
} from "../lib/bankProcessHelpers.js";

export default function BankProcessFormModal({
  editMode,
  form,
  setForm,
  accounts,
  countriesList,
  banksList,
  onClose,
  onSubmit,
  onOpenCountryModal,
  onOpenBankModal,
  onOpenProfitShareModal,
  onOpenBankFormNoteModal,
  onOpenAddAccountForField,
  lang,
  t,
}) {
  const { submitting, guardSubmit } = useSubmitGuard(true);
  const dayStart = String(form.day_start || "").trim();
  const contract = String(form.contract || "").trim();
  const frequency = bankProcessFrequencyNormalized(form.day_start_frequency);
  const isOnce = frequency === "once";
  const isWeek = frequency === "week";
  const isDay = frequency === "day";
  const showCapSwitch = editMode && frequency === "1st_of_every_month";
  const capOn = !!form.day_end_monthly_cap_enabled;
  const dayEndLockedByCap = showCapSwitch && capOn;
  const dayEndDisabled = isOnce || isWeek || isDay || dayEndLockedByCap;
  const profitSharingRows = parseProfitSharingToRows(form.profit_sharing, accounts);

  const profitSharingDisplayLabel = (row) => {
    const acc = accounts.find((a) => String(a.id) === String(row.accountId));
    if (acc) return formatBankAccountDisplay(acc.account_id, acc.name, acc.id);
    return row.accountLabel;
  };

  const blurMoneyField = (field) => (ev) => {
    const raw = String(ev.target.value ?? "").trim();
    if (!raw) {
      setForm((prev) => (prev[field] === "" ? prev : { ...prev, [field]: "" }));
      return;
    }
    const formatted = formatBankMoneyFixed2(raw, { emptyAsZero: false });
    setForm((prev) => (prev[field] === formatted ? prev : { ...prev, [field]: formatted }));
  };

  const removeProfitSharingAt = (idx) => {
    const next = profitSharingRows.filter((_, i) => i !== idx);
    setForm((prev) => ({ ...prev, profit_sharing: serializeProfitSharingRows(next, accounts) }));
  };

  let dayEndMin = dayStart || undefined;
  if (!isOnce && !isWeek && !isDay && frequency !== "monthly" && dayStart && contract) {
    const term = parseBankContractRentalMonthsForDayEnd(contract);
    const calculated = term ? contractBillingEndYmdForBankForm(dayStart, term, frequency) : null;
    if (calculated) {
      dayEndMin = calculated;
    }
  }

  return (
    <ProcessModalPortal>
    <div id="addBankModal" className="modal bank-modal" style={processModalBackdropStyle}>
      <div className="modal-content bank-modal-content">
        <div className="modal-header">
          <h2 id="bankModalTitle">{editMode ? t("editProcess") : t("addProcess")}</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body">
          <form id="addBankProcessForm" className="process-form bank-form" onSubmit={guardSubmit(onSubmit)}>
            <input type="hidden" name="id" value={form.id} />
            <div className="bank-form-fields-scroll">
              <div className="bank-form-row">
                <div className="bank-form-cell bank-form-cell-left">
                  <h3 className="bank-section-title">{t("bankInformation")}</h3>
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_country">{t("countryCurrency")}</label>
                      <div className="select-with-add">
                        {editMode ? (
                          <input id="bank_country" readOnly className="bank-input" value={form.country} />
                        ) : (
                          <BankSimpleSelect
                            id="bank_country"
                            value={form.country}
                            placeholder={t("selectCountry")}
                            options={countriesList.map((c) => ({ value: c, label: c }))}
                            onChange={(v) => setForm((prev) => ({ ...prev, country: v, bank: "" }))}
                          />
                        )}
                        {!editMode ? (
                          <button type="button" className="bank-add-btn" title={t("addNewCountry")} onClick={onOpenCountryModal}>+</button>
                        ) : null}
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_bank">{t("bank")}</label>
                      <div className="select-with-add">
                        {editMode ? (
                          <input id="bank_bank" readOnly className="bank-input" value={form.bank} />
                        ) : (
                          <select
                            id="bank_bank"
                            name="bank"
                            className="bank-select"
                            value={form.bank}
                            required
                            disabled={!form.country}
                            onChange={(ev) => setForm((prev) => ({ ...prev, bank: ev.target.value }))}
                          >
                            <option value="">{t("selectBank")}</option>
                            {banksList.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        )}
                        {!editMode ? (
                          <button type="button" className="bank-add-btn" title={t("addNewBank")} onClick={onOpenBankModal}>+</button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <h3 className="bank-section-title">{t("detail")}</h3>
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_card_merchant">{t("supplier")}</label>
                      <div className="account-select-with-buttons">
                        <BankSearchableAccountPick
                          value={form.card_merchant_id}
                          onChange={(id) => setForm((prev) => ({ ...prev, card_merchant_id: id }))}
                          accounts={accounts}
                          disabled={false}
                          t={t}
                        />
                        <button type="button" className="bank-add-btn" title={t("addAccount")} onClick={() => onOpenAddAccountForField("card_merchant_id")}>+</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_cost">{t("buyPrice")}</label>
                      <input
                        id="bank_cost"
                        name="cost"
                        type="text"
                        className="bank-input"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        value={form.cost}
                        onChange={(ev) => setForm((prev) => ({ ...prev, cost: sanitizeBankMoneyTyping(ev.target.value) }))}
                        onBlur={blurMoneyField("cost")}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bank-form-row">
                <div className="bank-form-cell bank-form-cell-left">
                  <div className="form-row bank-row-two-cols bank-row-type-name">
                    <div className="form-group">
                      <label htmlFor="bank_type">{t("type")}</label>
                      {editMode ? (
                        <input id="bank_type" readOnly className="bank-input" value={form.type} />
                      ) : (
                        <BankSimpleSelect
                          id="bank_type"
                          value={form.type}
                          placeholder={t("selectType")}
                          options={[
                            { value: "PERSONAL", label: t("personal") },
                            { value: "ENTERPRISE", label: t("enterprise") },
                            { value: "BUSINESS", label: t("business") },
                          ]}
                          onChange={(v) => setForm((prev) => ({ ...prev, type: v }))}
                        />
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_name">{t("cardOwner")}</label>
                      <input
                        id="bank_name"
                        name="name"
                        type="text"
                        className="bank-input"
                        placeholder={t("enterCardOwner")}
                        value={form.name}
                        readOnly={editMode}
                        required={!editMode}
                        onChange={(ev) => setForm((prev) => ({ ...prev, name: String(ev.target.value).toUpperCase() }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_customer">{t("customer")}</label>
                      <div className="account-select-with-buttons">
                        <BankSearchableAccountPick
                          value={form.customer_id}
                          onChange={(id) => setForm((prev) => ({ ...prev, customer_id: id }))}
                          accounts={accounts}
                          disabled={false}
                          t={t}
                        />
                        <button type="button" className="bank-add-btn" title={t("addAccount")} onClick={() => onOpenAddAccountForField("customer_id")}>+</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_price">{t("sellPrice")}</label>
                      <input
                        id="bank_price"
                        name="price"
                        type="text"
                        className="bank-input"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        value={form.price}
                        onChange={(ev) => setForm((prev) => ({ ...prev, price: sanitizeBankMoneyTyping(ev.target.value) }))}
                        onBlur={blurMoneyField("price")}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bank-form-row">
                <div className="bank-form-cell bank-form-cell-left">
                  <div className="form-row bank-day-start-row">
                    <BankFormDateField
                      fieldKey="bank_day_start"
                      htmlFor="bank_day_start"
                      label={t("dayStart")}
                      value={form.day_start}
                      placeholder={t("pickDate")}
                      clearLabel={t("clearDate")}
                      wrapClassName="bank-day-start-input-wrap"
                    />
                    <BankFormDateField
                      fieldKey="bank_day_end"
                      htmlFor="bank_day_end"
                      label={t("dayEnd")}
                      labelRowClassName="bank-day-end-label-row"
                      labelExtra={
                        showCapSwitch ? (
                          <div
                            id="bank_day_end_monthly_cap_wrap"
                            className="bank-day-end-monthly-cap-wrap"
                            title={t("dayEndMonthlyCapTooltip")}
                          >
                            <span
                              id="bank_day_end_monthly_cap_label_text"
                              className={`bank-day-end-cap-label${capOn ? " is-on" : ""}`}
                            >
                              {capOn ? "ON" : "OFF"}
                            </span>
                            <label className="bank-day-end-cap-switch" htmlFor="bank_day_end_monthly_cap_switch">
                              <input
                                type="checkbox"
                                id="bank_day_end_monthly_cap_switch"
                                checked={capOn}
                                onChange={(ev) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    day_end_monthly_cap_enabled: ev.target.checked,
                                  }))
                                }
                              />
                              <span className="bank-day-end-cap-switch__track" aria-hidden="true" />
                            </label>
                            <input
                              type="hidden"
                              id="bank_day_end_monthly_cap_enabled"
                              name="day_end_monthly_cap_enabled"
                              value={capOn ? "1" : "0"}
                            />
                          </div>
                        ) : null
                      }
                      value={form.day_end}
                      disabled={dayEndDisabled}
                      minYmd={isOnce || isWeek || isDay ? undefined : dayEndMin}
                      placeholder={t("pickDate")}
                      clearLabel={t("clearDate")}
                      wrapClassName="bank-day-end-input-wrap"
                      className={`bank-day-end-field-group${dayEndDisabled ? " bank-day-end-input-wrap--muted" : ""}`}
                    />
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_profit_account">{t("companyAccount")}</label>
                      <div className="account-select-with-buttons">
                        <BankSearchableAccountPick
                          value={form.profit_account_id}
                          onChange={(id) => setForm((prev) => ({ ...prev, profit_account_id: id }))}
                          accounts={accounts}
                          disabled={false}
                          t={t}
                        />
                        <button type="button" className="bank-add-btn" title={t("addAccount")} onClick={() => onOpenAddAccountForField("profit_account_id")}>+</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_profit">{t("profit")}</label>
                      <input
                        id="bank_profit"
                        name="profit"
                        type="text"
                        className="bank-input bank-input--money"
                        inputMode="decimal"
                        placeholder="0.00"
                        readOnly
                        tabIndex={-1}
                        aria-readonly="true"
                        style={{ backgroundColor: "#f5f5f5", cursor: "not-allowed" }}
                        value={form.profit ? formatBankMoneyFixed2(form.profit, { emptyAsZero: false }) : ""}
                        onChange={() => {}}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bank-form-row bank-form-row-last">
                <div className="bank-form-cell bank-form-cell-left">
                  <div className="form-group bank-day-start-frequency-wrap" style={{ marginBottom: 20 }}>
                    <label htmlFor="bank_day_start_frequency">{t("frequency")}</label>
                    <BankSimpleSelect
                      id="bank_day_start_frequency"
                      value={bankProcessFrequencyNormalized(form.day_start_frequency)}
                      includeEmptyOption={false}
                      options={[
                        { value: "1st_of_every_month", label: t("firstOfEveryMonth") },
                        { value: "monthly", label: t("monthly") },
                        { value: "week", label: t("weekFrequency") },
                        { value: "day", label: t("dayFrequency") },
                        { value: "once", label: t("onceFrequency") },
                      ]}
                      onChange={(next) => {
                        setForm((prev) => {
                          const prevNorm = bankProcessFrequencyNormalized(prev.day_start_frequency);
                          if (next === "once" && prevNorm !== "once") {
                            return {
                              ...prev,
                              day_start_frequency: next,
                              day_end: "",
                              contract: "",
                              insurance: "",
                              day_end_monthly_cap_enabled: false,
                            };
                          }
                          if (next === "week" && prevNorm !== "week") {
                            return {
                              ...prev,
                              day_start_frequency: next,
                              day_end: "",
                              contract: "",
                              day_end_monthly_cap_enabled: false,
                            };
                          }
                          if (next === "day" && prevNorm !== "day") {
                            return {
                              ...prev,
                              day_start_frequency: next,
                              day_end: "",
                              contract: "",
                              day_end_monthly_cap_enabled: false,
                            };
                          }
                          if (next !== "1st_of_every_month") {
                            return { ...prev, day_start_frequency: next, day_end_monthly_cap_enabled: false };
                          }
                          return { ...prev, day_start_frequency: next };
                        });
                      }}
                    />
                  </div>
                  <input type="hidden" name="profit_sharing" value={form.profit_sharing} />
                  <div className="bank-profit-sharing-container form-group">
                    <div className="bank-profit-sharing-header">
                      <h3>{t("selectedProfitSharing")}</h3>
                      <button
                        type="button"
                        className="bank-add-btn"
                        title={t("addProfitSharing")}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={onOpenProfitShareModal}
                      >
                        +
                      </button>
                    </div>
                    <div className="bank-profit-sharing-list" id="selectedProfitSharingList">
                      {profitSharingRows.length === 0 ? (
                        <div className="no-profit-sharing"><p>{t("noProfitSharingSelected")}</p></div>
                      ) : (
                        profitSharingRows.map((row, idx) => (
                          <div key={`${row.accountId || row.accountLabel}-${idx}`} className="profit-sharing-item">
                            <div className="ps-item-content">
                              <span className="ps-account-name" title={profitSharingDisplayLabel(row)}>
                                {profitSharingDisplayLabel(row)}
                              </span>
                              <span className="ps-amount-value">{formatBankMoneyFixed2(row.amount)}</span>
                            </div>
                            <button
                              type="button"
                              className="remove-profit-sharing-item"
                              title={t("removeRow")}
                              aria-label={t("removeRow")}
                              onClick={() => removeProfitSharingAt(idx)}
                            >
                              ×
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_contract">{t("contract")}</label>
                      <BankSimpleSelect
                        id="bank_contract"
                        value={form.contract}
                        placeholder={t("contract")}
                        disabled={isOnce || isWeek || isDay}
                        options={BANK_PROCESS_CONTRACT_OPTIONS.map((opt) => ({
                          value: opt.value,
                          label: formatBankProcessContractLabel(lang, opt.value),
                        }))}
                        onChange={(v) => setForm((prev) => ({ ...prev, contract: v }))}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_insurance">{t("insurance")}</label>
                      <input id="bank_insurance" name="insurance" type="text" className="bank-input" inputMode="decimal" autoComplete="off" placeholder={t("enterAmount")} value={form.insurance} disabled={isOnce} onChange={(ev) => setForm((prev) => ({ ...prev, insurance: ev.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group bank-remark-wrap" style={{ marginTop: 12 }}>
                    <div className="bank-remark-actions">
                      <button type="button" id="bank_sop_btn" className="btn btn-save bank-note-open-btn" onClick={() => onOpenBankFormNoteModal("sop")}>{t("sop")}</button>
                      <button type="button" id="bank_remark_btn" className="btn btn-save bank-note-open-btn" onClick={() => onOpenBankFormNoteModal("remark")}>{t("remark")}</button>
                    </div>
                    {(form.sop || form.remark) ? (
                      <p className="bank-remark-filled-hint">{[form.sop && t("sopFilled"), form.remark && t("remarkFilled")].filter(Boolean).join(" · ")}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="form-actions bank-actions">
              <button type="submit" className="btn btn-save" id="bankSubmitBtn" disabled={submitting}>
                {submitting ? t("saving") : editMode ? t("updateProcess") : t("addProcess")}
              </button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
    </ProcessModalPortal>
  );
}
