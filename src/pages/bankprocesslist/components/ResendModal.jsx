import React from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import { bankProcessFrequencyNormalized } from "../lib/bankProcessHelpers.js";
import { BankFormDateField, BankSimpleSelect } from "./bankProcessFormFields.jsx";

export default function ResendModal({
  resendTarget,
  resendDayStart,
  resendDayEnd,
  resendFrequency,
  setResendFrequency,
  resendInlineError,
  setResendInlineError,
  resendConfirmDisabled = false,
  resendLockChecking = false,
  onResend,
  onClose,
  t,
}) {
  const fq = bankProcessFrequencyNormalized(resendFrequency);
  const isOnce = fq === "once";
  const isMonthly = fq === "monthly";
  const isWeek = fq === "week";
  const isDay = fq === "day";
  const dayEndDisabled = isOnce || isMonthly || isWeek || isDay;
  return (
    <ProcessModalPortal>
    <div id="confirmBankResendModal" className="process-modal process-modal--bank-resend" style={processModalBackdropStyle}>
      <div className="process-confirm-modal-content bank-resend-modal-content">
        <div className="bank-resend-modal-hero">
          <div className="process-confirm-icon-container bank-resend-modal-icon-wrap">
            <svg className="process-confirm-icon process-confirm-icon--resend" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3v5h5" />
            </svg>
          </div>
          <h2 className="process-confirm-title bank-resend-modal-title">{t("resendToDueTitle")}</h2>
          <p className="process-confirm-message bank-resend-modal-message">
            {t("processLabel")}: <b>{resendTarget?.supplier || resendTarget?.bank || "-"}</b>
          </p>
        </div>
        <div id="confirmBankResendScheduleFields" className="bank-resend-schedule-card">
          <div className="bank-resend-schedule-card__head">
            <span className="bank-resend-schedule-card__label">{t("billingSchedule")}</span>
            <p className="bank-resend-schedule-card__hint">
              {t("billingScheduleHint")}
            </p>
          </div>
          <div className="bank-resend-schedule-grid">
            <BankFormDateField
              fieldKey="bank_resend_day_start"
              htmlFor="bank_resend_day_start"
              label={t("dayStart")}
              value={resendDayStart}
              placeholder={t("pickDate")}
              clearLabel={t("clearDate")}
              className={`bank-resend-datepicker-field${resendInlineError ? " bank-resend-datepicker-field--error" : ""}`}
            />
            <BankFormDateField
              fieldKey="bank_resend_day_end"
              htmlFor="bank_resend_day_end"
              label={t("dayEnd")}
              value={resendDayEnd}
              disabled={dayEndDisabled}
              minYmd={dayEndDisabled ? undefined : (resendDayStart || undefined)}
              placeholder={t("pickDate")}
              clearLabel={t("clearDate")}
              className={dayEndDisabled ? "bank-resend-day-end-field--muted" : ""}
            />
            <div className="bank-resend-field bank-resend-field--full">
              <label className="bank-resend-field__label" htmlFor="bank_resend_frequency">{t("frequency")}</label>
              <BankSimpleSelect
                id="bank_resend_frequency"
                className="bank-resend-frequency-select"
                portalDropdownClassName="bank-resend-select-dropdown"
                value={fq}
                includeEmptyOption={false}
                options={[
                  { value: "1st_of_every_month", label: t("firstOfEveryMonth") },
                  { value: "monthly", label: t("monthly") },
                  { value: "week", label: t("weekFrequency") },
                  { value: "day", label: t("dayFrequency") },
                  { value: "once", label: t("onceFrequency") },
                ]}
                onChange={(next) => setResendFrequency(next)}
              />
            </div>
          </div>
          {resendInlineError ? (
            <div id="bankResendDayStartInlineError" className="bank-resend-inline-alert" role="alert">
              {resendInlineError}
            </div>
          ) : null}
        </div>
        <div className="process-confirm-actions bank-resend-modal-actions">
          <button
            type="button"
            className="process-btn process-btn-cancel confirm-cancel confirm-bank-resend-cancel"
            onClick={() => {
              setResendInlineError("");
              onClose();
            }}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className="process-btn process-btn-resend confirm-bank-resend-confirm"
            id="confirmBankResendBtn"
            disabled={resendConfirmDisabled || resendLockChecking}
            title={resendConfirmDisabled ? t("resendLockedPostedToday") : (resendLockChecking ? t("resendLockChecking") : "")}
            onClick={onResend}
          >
            {resendLockChecking ? t("resendLockChecking") : t("resendAction")}
          </button>
        </div>
      </div>
    </div>
    </ProcessModalPortal>
  );
}
