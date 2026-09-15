import React, { useCallback, useEffect, useState } from "react";
import { fetchTelegramLink, saveTelegramLink } from "../contactSettingsApi.js";
import { formatAnnouncementTimestamp } from "../announcementApi.js";

const TELEGRAM_PREFIX = "https://t.me/";
const HANDLE_PATTERN = /^[A-Za-z0-9_+]{1,64}$/;

/** Strips any t.me URL prefix (or a leading @) a user might paste, leaving just the handle. */
function toHandle(raw) {
  return (raw || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?t\.me\//i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^@/, "");
}

function TelegramGlyph({ size = 14 }) {
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} aria-hidden="true" style={{ flex: "none" }}>
      <path
        fill="currentColor"
        d="M170 68 55 112c-9 3-9 9-2 11l30 9 12 37c1 4 3 5 6 5s5-1 7-3l17-16 35 26c6 4 11 2 13-6l24-113c3-9-3-14-11-11Zm-19 27-76 47-3 25-9-30 78-49c4-2 8 0 5 3l-58 52-1 0 62-48Z"
      />
    </svg>
  );
}

export function ContactSettingsPanel({ t, onSaved, onSaveFailed }) {
  const [savedLink, setSavedLink] = useState("");
  const [draftHandle, setDraftHandle] = useState("");
  const [updatedBy, setUpdatedBy] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadLink = useCallback(async (signal) => {
    try {
      const { json } = await fetchTelegramLink();
      if (signal?.aborted) return;
      const data = json?.success ? json.data : null;
      const link = data?.telegramSupportLink || "";
      setSavedLink(link);
      setDraftHandle(toHandle(link));
      setUpdatedBy(data?.updatedBy || "");
      setUpdatedAt(data?.updatedAt || "");
    } catch {
      /* leave fields empty; admin can still type a new link and save */
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    loadLink(ac.signal);
    return () => ac.abort();
  }, [loadLink]);

  async function handleSubmit(e) {
    e.preventDefault();
    const handle = draftHandle.trim();
    if (handle && !HANDLE_PATTERN.test(handle)) {
      onSaveFailed?.(t("telegramLinkInvalid"));
      return;
    }
    const link = handle ? `${TELEGRAM_PREFIX}${handle}` : "";
    setSubmitting(true);
    try {
      const { json } = await saveTelegramLink(link);
      if (json.success) {
        await loadLink();
        onSaved?.();
      } else {
        onSaveFailed?.(json.message || "Unknown error");
      }
    } catch (err) {
      onSaveFailed?.(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="panel-contact" className="page-panel">
      <div className="maintenance-layout">
        <div className="maintenance-form-section">
          <h2 style={{ marginTop: 0, color: "#002C49", fontFamily: "var(--font-heading-page)", fontSize: "clamp(16px, 1.25vw, 24px)", marginBottom: "clamp(8px, 0.73vw, 14px)" }}>
            {t("telegramSectionTitle")}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="telegram-support-link">{t("telegramLinkLabel")}</label>
              <div className={`contact-link-input-group${loading ? " is-disabled" : ""}`}>
                <span className="contact-link-prefix">{TELEGRAM_PREFIX}</span>
                <input
                  id="telegram-support-link"
                  type="text"
                  maxLength={64}
                  placeholder={t("telegramLinkPlaceholder")}
                  disabled={loading}
                  value={draftHandle}
                  onChange={(e) => setDraftHandle(toHandle(e.target.value))}
                />
              </div>
              <p className="form-hint" style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b", lineHeight: 1.4 }}>
                {t("telegramLinkHint")}
              </p>
            </div>
            <button type="submit" className="submit-btn" disabled={loading || submitting}>
              {submitting ? t("saving") : t("saveTelegramLink")}
            </button>
          </form>
        </div>

        <div className="maintenance-list-section">
          <div className="maintenance-list-header">
            <h2>{t("telegramStatusSectionTitle")}</h2>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {!loading && !savedLink ? (
              <div className="empty-state"><p>{t("telegramLinkNotSet")}</p></div>
            ) : !loading ? (
              <div className="maintenance-item">
                <div className="contact-link-row">
                  <span className="contact-status-badge is-active">{t("statusActive")}</span>
                  <a href={savedLink} target="_blank" rel="noopener noreferrer" className="contact-test-link">
                    {t("testLink")}
                  </a>
                </div>
                <div className="maintenance-content" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <TelegramGlyph size={14} />
                  <a href={savedLink} target="_blank" rel="noopener noreferrer">{savedLink}</a>
                </div>
                {(updatedBy || updatedAt) && (
                  <div className="announcement-meta">
                    <span>{t("updatedBy", { name: updatedBy || "—" })}</span>
                    <span>{t("updatedAt", { time: formatAnnouncementTimestamp(updatedAt) })}</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
