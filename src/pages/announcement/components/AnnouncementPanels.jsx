import React, { useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";

export function AnnouncementPanel({ t, announcements, onEdit, onDelete, showNotice }) {
  const [form, setForm] = useState({ title: "", content: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.title.trim();
    const content = form.content.trim();
    if (!title || !content) return;
    setSubmitting(true);
    try {
      const res = await fetch(buildApiUrl("api/announcements/announcement_create_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const json = await res.json();
      if (json.success) {
        setForm({ title: "", content: "" });
        onEdit(); // triggers reload in parent
      } else {
        showNotice?.(t("updateFailed", { message: json.message || "Unknown error" }), "error");
      }
    } catch (err) {
      showNotice?.(t("updateFailed", { message: err.message }), "error");
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
              <label htmlFor="announcement-content">{t("contentRequired")}</label>
              <textarea
                id="announcement-content"
                required
                placeholder={t("enterAnnouncementContent")}
                value={form.content}
                onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
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
                    <div>
                      <button className="announcement-edit-btn" onClick={() => onEdit(item)}>{t("edit")}</button>
                      <button className="announcement-delete-btn" onClick={() => onDelete(item)}>{t("delete")}</button>
                    </div>
                  </div>
                  <div className="announcement-content">{item.content}</div>
                  <div className="announcement-meta">
                    <span>{t("createdBy", { name: item.created_by ?? item.createdBy })}</span>
                    <span>{t("createdAt", { time: item.created_at ?? item.createdAt })}</span>
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

export function MaintenancePanel({ t, maintenanceList, onEdit, onDelete, showNotice }) {
  const [form, setForm] = useState({ prefix: "", content: "" });
  const [submitting, setSubmitting] = useState(false);
  const canCreate = maintenanceList.length === 0;

  async function handleSubmit(e) {
    e.preventDefault();
    const prefix = form.prefix.trim();
    const content = form.content.trim();
    if (!prefix || !content) return;
    setSubmitting(true);
    try {
      const res = await fetch(buildApiUrl("api/maintenance/create_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, content }),
      });
      const json = await res.json();
      if (json.success) {
        setForm({ prefix: "", content: "" });
        onEdit(); // triggers reload in parent
      } else {
        showNotice?.(t("updateFailed", { message: json.message || "Unknown error" }), "error");
      }
    } catch (err) {
      showNotice?.(t("updateFailed", { message: err.message }), "error");
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
          {!canCreate && (
            <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 8, padding: 12, marginBottom: 16, color: "#92400e", fontSize: "clamp(11px, 0.73vw, 14px)" }}>
              <strong>⚠️ {t("noticeLabel")}:</strong> {t("maintenanceNotice")}
            </div>
          )}
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
              <textarea
                id="maintenanceContent"
                required
                placeholder={t("enterMaintenanceContent")}
                disabled={!canCreate}
                value={form.content}
                onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              />
            </div>
            <button type="submit" className="submit-btn" disabled={!canCreate || submitting}>
              {submitting ? t("publishing") : t("publishMaintenanceContent")}
            </button>
          </form>
        </div>

        <div className="maintenance-list-section">
          <div className="maintenance-list-header">
            <h2>{t("publishedMaintenanceContent")}</h2>
          </div>
          <div id="maintenanceList" style={{ flex: 1, overflowY: "auto" }}>
            {maintenanceList.length === 0 ? (
              <div className="empty-state"><p>{t("noMaintenanceContent")}</p></div>
            ) : (
              maintenanceList.map((item) => (
                <div className="maintenance-item" key={item.id}>
                  <div className="maintenance-item-header">
                    <div style={{ flex: 1 }} />
                    <div>
                      <button className="maintenance-edit-btn" onClick={() => onEdit(item)}>{t("edit")}</button>
                      <button className="maintenance-delete-btn" onClick={() => onDelete(item)}>{t("delete")}</button>
                    </div>
                  </div>
                  <div className="maintenance-content">
                    {item.prefix ? <strong>{item.prefix} </strong> : null}
                    {item.content}
                  </div>
                  <div className="announcement-meta">
                    <span>{t("createdBy", { name: item.created_by ?? item.createdBy })}</span>
                    <span>{t("createdAt", { time: item.created_at ?? item.createdAt })}</span>
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
