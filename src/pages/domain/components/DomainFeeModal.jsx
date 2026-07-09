import { useState, useEffect } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";
import {
  formatDomainFeeEdit2,
  DOMAIN_FEE_PERIOD_KEYS,
  defaultDomainFeeSettings,
  normalizeDomainFeeSettingsFromApi,
} from "../domainHelpers.js";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

const FEE_MODAL_OVERLAY_Z = 2147482998;

const PERIOD_LABEL_KEYS = {
  "7days": "sevenDays",
  "1month": "oneMonth",
  "3months": "threeMonths",
  "6months": "sixMonths",
  "1year": "oneYear",
};

function CompanyPriceIcon() {
  return (
    <svg className="domain-fee-col-icon domain-fee-col-icon--company" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 21V8.5L12 3l8 5.5V21H4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9 10h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function GroupPriceIcon() {
  return (
    <svg className="domain-fee-col-icon domain-fee-col-icon--group" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M16 8.5a2.5 2.5 0 1 1 0 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M14.5 19.5c.3-2.2 2-3.8 4.5-3.8 1.4 0 2.6.5 3.5 1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function periodPricesToEditState(periodPrices) {
  const next = {};
  DOMAIN_FEE_PERIOD_KEYS.forEach((key) => {
    const raw = periodPrices[key];
    next[key] = raw !== "" && raw != null ? formatDomainFeeEdit2(raw) : "";
  });
  return next;
}

function PriceColumn({ sectionKey, title, icon, periodPrices, onUpdate, t }) {
  return (
    <div className={`domain-fee-split-col domain-fee-split-col--${sectionKey}`}>
      <div className="domain-fee-split-col-header">
        {icon}
        <span>{title}</span>
      </div>
      <div className="domain-fee-split-rows">
        {DOMAIN_FEE_PERIOD_KEYS.map((key) => (
          <div key={key} className="domain-fee-split-row">
            <label htmlFor={`domainFeePeriod_${sectionKey}_${key}`} className="domain-fee-split-label">
              {t(PERIOD_LABEL_KEYS[key])}
            </label>
            <input
              type="number"
              id={`domainFeePeriod_${sectionKey}_${key}`}
              className="domain-fee-split-input"
              step="0.01"
              min="0"
              placeholder={t("pricePlaceholder")}
              value={periodPrices[key] ?? ""}
              onChange={(e) => onUpdate(key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DomainFeeModal({ onClose, onFeeSaved, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  const [companyPeriodPrices, setCompanyPeriodPrices] = useState(() => defaultDomainFeeSettings().company);
  const [groupPeriodPrices, setGroupPeriodPrices] = useState(() => defaultDomainFeeSettings().group);
  const { submitting, runGuarded } = useSubmitGuard(true);

  useEffect(() => {
    fetch(buildApiUrl("api/domain/list-fee"), {
      cache: "no-cache",
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data && res.data.length > 0) {
          const settings = res.data[0];
          const normalized = normalizeDomainFeeSettingsFromApi(settings);
          setCompanyPeriodPrices(periodPricesToEditState(normalized.company));
          setGroupPeriodPrices(periodPricesToEditState(normalized.group));
        } else {
          showDomainAlert(res.message || t("couldNotLoadSettings"), "danger");
        }
      })
      .catch(() => showDomainAlert(t("couldNotLoadSettings"), "danger"));
  }, [lang]);

  function handleSave() {
    fetch(buildApiUrl("api/domain/add-fee"), {
      cache: "no-cache",
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_period_prices: companyPeriodPrices,
        group_period_prices: groupPeriodPrices,
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          showDomainAlert(res.message || t("saved"));
          if (res.data) onFeeSaved(res.data);
          onClose();
        } else {
          showDomainAlert(res.message || t("saveFailed"), "danger");
        }
      })
      .catch(() => showDomainAlert(t("saveFailed"), "danger"));
  }

  return (
    <DomainModalPortal>
      <div
        className="domain-fee-react-overlay domain-fee-react-overlay--dual"
        style={{
          display: "flex",
          position: "fixed",
          inset: 0,
          zIndex: FEE_MODAL_OVERLAY_Z,
          overflowY: "auto",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="domain-fee-react-modal modal-content domain-fee-react-modal--periods domain-fee-react-modal--dual domain-fee-react-modal--split">
          <div className="modal-header domain-fee-modal-header domain-fee-modal-header--split">
            <h2>{t("price")}</h2>
            <button type="button" className="account-close" onClick={onClose} aria-label="Close" />
          </div>

          <div className="modal-body domain-fee-modal-scroll">
            <div className="domain-fee-info-banner" role="note">
              <span className="domain-fee-info-banner__icon" aria-hidden="true">i</span>
              <p>{t("priceDescriptionDual")}</p>
            </div>

            <p className="domain-fee-edit-hint domain-fee-edit-hint--split">{t("editPeriodHint")}</p>

            <div className="domain-fee-split-panel">
              <PriceColumn
                sectionKey="company"
                title={t("companyPrice")}
                icon={<CompanyPriceIcon />}
                periodPrices={companyPeriodPrices}
                onUpdate={(key, value) => setCompanyPeriodPrices((prev) => ({ ...prev, [key]: value }))}
                t={t}
              />
              <div className="domain-fee-split-divider" aria-hidden="true" />
              <PriceColumn
                sectionKey="group"
                title={t("groupPrice")}
                icon={<GroupPriceIcon />}
                periodPrices={groupPeriodPrices}
                onUpdate={(key, value) => setGroupPeriodPrices((prev) => ({ ...prev, [key]: value }))}
                t={t}
              />
            </div>
          </div>

          <div className="domain-fee-modal-footer form-actions domain-fee-modal-footer--split">
            <button type="button" className="btn btn-cancel" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="button" className="btn btn-save" disabled={submitting} onClick={() => runGuarded(handleSave)}>
              {submitting ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      </div>
    </DomainModalPortal>
  );
}
