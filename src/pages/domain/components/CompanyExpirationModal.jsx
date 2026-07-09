import { calculateCountdown, formatDate } from "../domainHelpers.js";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/** Inline z-index — production Tailwind may omit arbitrary z-[…], hiding the overlay under the sidebar */
const COMPANY_EXP_MODAL_OVERLAY_Z = 2147482998;

/**
 * Company Expiration Status Modal (read-only view)
 * Props:
 *   companies: Array<{ code, expiration_date, parent_code? }>
 *   onClose()
 */
export default function CompanyExpirationModal({ companies, onClose, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  const rows = (companies || []).filter((c) => String(c.code || "").trim());

  return (
    <DomainModalPortal>
      <div
        className="company-expiration-react-overlay"
        style={{
          display: "block",
          position: "fixed",
          inset: 0,
          zIndex: COMPANY_EXP_MODAL_OVERLAY_Z,
          overflowY: "auto",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="company-expiration-react-modal modal-content">
          <div className="modal-header company-expiration-modal-header">
            <h2>{t("companyExpirationStatus")}</h2>
            <button
              type="button"
              className="account-close"
              aria-label="Close"
              onClick={onClose}
            />
          </div>
          <div className="modal-body company-expiration-modal-body">
            <div className="company-expiration-list">
              {rows.length === 0 ? (
                <div className="company-expiration-empty">{t("noCompaniesFound")}</div>
              ) : (
                rows.map((company) => {
                  const expDate = company.expiration_date || null;
                  const countdown = expDate ? calculateCountdown(expDate) : null;
                  const formattedDate = expDate ? formatDate(expDate) : t("noExpirationDate");

                  let statusClass = "normal";
                  let statusText = t("valid");
                  if (countdown) {
                    statusClass = countdown.status;
                    statusText = countdown.text;
                  } else if (!expDate) {
                    statusClass = "warning";
                    statusText = t("noDateSet");
                  }

                  return (
                    <div key={company.code} className="company-exp-item">
                      <div className="company-exp-item-left">
                        <div className="company-exp-id">{company.code}</div>
                        <div className="company-exp-date">
                          {t("expirationPrefix")}
                          {formattedDate}
                        </div>
                      </div>
                      <div className={`company-exp-status ${statusClass}`}>{statusText}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </DomainModalPortal>
  );
}
