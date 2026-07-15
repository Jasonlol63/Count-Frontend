import { calculateCountdown, formatDate } from "../domainHelpers.js";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/** Inline z-index — production Tailwind may omit arbitrary z-[…], hiding the overlay under the sidebar */
const GROUP_EXP_MODAL_OVERLAY_Z = 2147482998;

/**
 * Group Expiration Status Modal (read-only view)
 * Props:
 *   groups: Array<{ group_code, expiration_date }>
 *   onClose()
 */
export default function GroupExpirationModal({ groups, onClose, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  const rows = (groups || []).filter((g) => String(g.group_code || "").trim());

  return (
    <DomainModalPortal>
      <div
        className="company-expiration-react-overlay"
        style={{
          display: "block",
          position: "fixed",
          inset: 0,
          zIndex: GROUP_EXP_MODAL_OVERLAY_Z,
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
            <h2>{t("groupExpirationStatus")}</h2>
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
                <div className="company-expiration-empty">{t("noGroupsFound")}</div>
              ) : (
                rows.map((group) => {
                  const expDate = group.expiration_date || null;
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
                    <div key={group.group_code} className="company-exp-item">
                      <div className="company-exp-item-left">
                        <div className="company-exp-id">{group.group_code}</div>
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
