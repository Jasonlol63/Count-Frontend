import React, { useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import RichTextEditor from "./RichTextEditor.jsx";
import {
  isRichTextEffectivelyEmpty,
  sanitizeRichTextHtml,
  toSafeRenderHtml,
} from "../../../utils/content/richTextSanitizer.js";
import { composeAnnouncementSection } from "../../../components/announcements/announcementSectionLabel.js";

export function AnnouncementPanel({ t, announcements, onEdit, onDelete, onPublished, onPublishFailed }) {
  const [form, setForm] = useState({ title: "", sectionLabel: "", content: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.title.trim();
    const content = composeAnnouncementSection(form.sectionLabel, form.content);
    if (!title) {
      onPublishFailed?.(t("titleCannotBeEmpty"));
      return;
    }
    if (isRichTextEffectivelyEmpty(content)) {
      onPublishFailed?.(t("contentCannotBeEmpty"));
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("content", content);
      const res = await fetch(buildApiUrl("api/announcements/announcement_create_api.php"), {
        method: "POST", body: fd, credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setForm({ title: "", sectionLabel: "", content: "" });
        onPublished?.();
      } else {
        onPublishFailed?.(json.message || "Unknown error");
      }
    } catch (err) {
      onPublishFailed?.(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="panel-announcement" className="page-panel">
      <div className="announcement-layout">
        <div className="announcement-form-section">
          <h2 style={{ marginTop: 0, color: "#002C49", fontFamily: "var(--font-heading-page)", fontSize: "clamp(16px, 1.25vw, 24px)", marginBottom: "clamp(8px, 0.73vw, 14px)" }}>
            {t("createNewAnnouncement")}
          </h2>
          <form id="announcementForm" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="announcement-title">{t("titleRequired")}</label>
              <input
                id="announcement-title"
                type="text"
                required
                maxLength={500}
                placeholder={t("enterAnnouncementTitle")}
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="announcement-section-label">{t("sectionLabelOptional")}</label>
              <input
                id="announcement-section-label"
                type="text"
                maxLength={80}
                placeholder={t("enterSectionLabel")}
                value={form.sectionLabel}
                onChange={(e) => setForm((p) => ({ ...p, sectionLabel: e.target.value }))}
              />
              <p className="form-hint" style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b", lineHeight: 1.4 }}>
                {t("sectionLabelHint")}
              </p>
            </div>
            <div className="form-group">
              <label htmlFor="announcement-content">{t("contentRequired")}</label>
              <RichTextEditor
                id="announcement-content"
                placeholder={t("enterAnnouncementContent")}
                value={form.content}
                onChange={(nextValue) => setForm((p) => ({ ...p, content: nextValue }))}
              />
            </div>
            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? t("publishing") : t("publishAnnouncement")}
            </button>
          </form>
        </div>

        <div className="announcement-list-section">
          <div className="announcement-list-header">
            <h2>{t("publishedAnnouncements")}</h2>
          </div>
          <div id="announcementList" style={{ flex: 1, overflowY: "auto" }}>
            {announcements.length === 0 ? (
              <div className="empty-state"><p>{t("noAnnouncements")}</p></div>
            ) : (
              announcements.map((item) => (
                <div className="announcement-item" key={item.id}>
                  <div className="announcement-item-header">
                    <h3 className="announcement-title">{item.title}</h3>
                    <div className="announcement-item-actions">
                      <button type="button" className="btn btn-save" onClick={() => onEdit(item)}>{t("edit")}</button>
                      <button type="button" className="btn btn-delete" onClick={() => onDelete(item)}>{t("delete")}</button>
                    </div>
                  </div>
                  <div
                    className="announcement-content rich-text-renderer"
                    dangerouslySetInnerHTML={{ __html: toSafeRenderHtml(item.content) }}
                  />
                  <div className="announcement-meta">
                    <span>{t("createdBy", { name: item.created_by })}</span>
                    <span>{t("createdAt", { time: item.created_at })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MaintenancePanel({
  t,
  maintenanceList,
  maintenanceMode,
  canManageMaintenanceMode,
  modeSubmitting,
  onEnableMaintenanceMode,
  onDisableMaintenanceMode,
  onEdit,
  onDelete,
  onPublished,
  onPublishFailed,
}) {
  const [form, setForm] = useState({ prefix: "", content: "" });
  const [submitting, setSubmitting] = useState(false);
  const canCreate = maintenanceList.length === 0;
  const modeEnabled = Boolean(maintenanceMode?.enabled);
  const modeCanToggle = modeEnabled || maintenanceList.length > 0;
  const modeToggleDisabled = modeSubmitting || !modeCanToggle;

  async function handleSubmit(e) {
    e.preventDefault();
    const prefix = form.prefix.trim();
    const content = sanitizeRichTextHtml(form.content);
    if (!prefix) {
      onPublishFailed?.(t("prefixCannotBeEmpty"));
      return;
    }
    if (isRichTextEffectivelyEmpty(content)) {
      onPublishFailed?.(t("contentCannotBeEmpty"));
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("prefix", prefix);
      fd.append("content", content);
      const res = await fetch(buildApiUrl("api/maintenance/create_api.php"), {
        method: "POST", body: fd, credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setForm({ prefix: "", content: "" });
        onPublished?.();
      } else {
        onPublishFailed?.(json.message || "Unknown error");
      }
    } catch (err) {
      onPublishFailed?.(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="panel-maintenance" className="page-panel">
      <div className="maintenance-layout">
        <div className="maintenance-form-section">
          <h2 style={{ marginTop: 0, color: "#002C49", fontFamily: "var(--font-heading-page)", fontSize: "clamp(16px, 1.25vw, 24px)", marginBottom: "clamp(8px, 0.73vw, 14px)" }}>
            {t("createNewMaintenanceContent")}
          </h2>
          <form id="maintenanceForm" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="maintenancePrefix">{t("prefixRequired")}</label>
              <input
                id="maintenancePrefix"
                type="text"
                required
                maxLength={100}
                placeholder={t("enterMaintenancePrefix")}
                disabled={!canCreate}
                value={form.prefix}
                onChange={(e) => setForm((p) => ({ ...p, prefix: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="maintenanceContent">{t("contentRequired")}</label>
              <RichTextEditor
                id="maintenanceContent"
                placeholder={t("enterMaintenanceContent")}
                disabled={!canCreate}
                value={form.content}
                onChange={(nextValue) => setForm((p) => ({ ...p, content: nextValue }))}
              />
            </div>
            <button type="submit" className="submit-btn" disabled={!canCreate || submitting}>
              {submitting ? t("publishing") : t("publishMaintenanceContent")}
            </button>
            {!canCreate && (
              <div className="maintenance-singleton-hint">
                <strong>⚠️ {t("noticeLabel")}:</strong> {t("maintenanceNotice")}
              </div>
            )}
          </form>
        </div>

        <div className="maintenance-list-section">
          <div className="maintenance-list-header">
            <h2>{t("publishedMaintenanceContent")}</h2>
            {canManageMaintenanceMode ? (
              <div className="maintenance-mode-inline">
                <span className="maintenance-mode-inline-label">Maintenance Mode</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={modeEnabled}
                  aria-label="Maintenance Mode"
                  className={`maintenance-mode-toggle maintenance-mode-toggle--inline ${modeEnabled ? "is-on" : "is-off"}`}
                  disabled={modeToggleDisabled}
                  onClick={modeEnabled ? onDisableMaintenanceMode : onEnableMaintenanceMode}
                >
                  <span className="maintenance-mode-switch" aria-hidden="true">
                    <span className="maintenance-mode-switch-thumb" />
                  </span>
                </button>
              </div>
            ) : null}
          </div>
          <div id="maintenanceList" style={{ flex: 1, overflowY: "auto" }}>
            {maintenanceList.length === 0 ? (
              <div className="empty-state"><p>{t("noMaintenanceContent")}</p></div>
            ) : (
              maintenanceList.map((item) => (
                <div className="maintenance-item" key={item.id}>
                  <div className="maintenance-item-header">
                    <div style={{ flex: 1 }} />
                    <div className="announcement-item-actions">
                      <button type="button" className="btn btn-save" onClick={() => onEdit(item)}>{t("edit")}</button>
                      <button type="button" className="btn btn-delete" onClick={() => onDelete(item)}>{t("delete")}</button>
                    </div>
                  </div>
                  <div className="maintenance-content rich-text-renderer">
                    {item.prefix ? <strong>{item.prefix} </strong> : null}
                    <span dangerouslySetInnerHTML={{ __html: toSafeRenderHtml(item.content) }} />
                  </div>
                  <div className="announcement-meta">
                    <span>{t("createdBy", { name: item.created_by })}</span>
                    <span>{t("createdAt", { time: item.created_at })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
