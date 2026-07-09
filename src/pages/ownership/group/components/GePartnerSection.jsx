import React, { useState } from "react";

export default function GePartnerSection({ groupId, onLink, disabled = false, t }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="own-partner-section">
      <div className="own-partner-info">
        <div className="own-partner-title-row">
          <span className="own-partner-title">{t("externalPartner")}</span>
          <div className="own-partner-actions">
            <input
              id={`ge-partner-login-${groupId}`}
              type="text"
              className="own-partner-input"
              placeholder={t("loginOrGroupId")}
              autoComplete="off"
              value={val}
              disabled={disabled}
              onChange={(e) => setVal(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="own-partner-link-btn"
              disabled={busy || disabled}
              onClick={async () => {
                const login = val.trim();
                if (!login) return;
                setBusy(true);
                const ok = await onLink(login);
                setBusy(false);
                if (ok) setVal("");
              }}
            >
              {busy ? t("linking") : t("linkPartner")}
            </button>
          </div>
        </div>
        <span className="own-partner-desc">
          {t("partnerDescGroup")}
        </span>
      </div>
    </div>
  );
}
