import React from "react";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";
import RichTextEditor from "./RichTextEditor.jsx";

export function EditAnnouncementModal({ t, open, draft, setDraft, onClose, onSave }) {
  const { submitting, guardSubmit } = useSubmitGuard(open);

  if (!open) return null;
  return (
    <div
      id="editAnnouncementModal"
      className="edit-modal"
      style={{ display: "block" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>{t("editAnnouncement")}</h2>
          <span className="edit-modal-close" onClick={onClose} role="button" aria-label={t("close")}>
            &times;
          </span>
        </div>
        <form id="editAnnouncementForm" onSubmit={guardSubmit(onSave)}>
          <div className="form-group">
            <label htmlFor="editAnnouncementTitle">{t("titleRequired")}</label>
            <input
              id="editAnnouncementTitle"
              type="text"
              required
              maxLength={500}
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="editAnnouncementSectionLabel">{t("sectionLabelOptional")}</label>
            <input
              id="editAnnouncementSectionLabel"
              type="text"
              maxLength={80}
              placeholder={t("enterSectionLabel")}
              value={draft.sectionLabel || ""}
              onChange={(e) => setDraft((p) => ({ ...p, sectionLabel: e.target.value }))}
            />
            <p className="form-hint" style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b", lineHeight: 1.4 }}>
              {t("sectionLabelHint")}
            </p>
          </div>
          <div className="form-group form-group-rich-text form-group-rich-text--modal">
            <label htmlFor="editAnnouncementContent">{t("contentRequired")}</label>
            <RichTextEditor
              id="editAnnouncementContent"
              placeholder={t("enterAnnouncementContent")}
              value={draft.content}
              onChange={(nextValue) => setDraft((p) => ({ ...p, content: nextValue }))}
            />
          </div>
          <div className="edit-modal-actions">
            <button type="button" className="edit-modal-btn edit-modal-btn-cancel" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" className="edit-modal-btn edit-modal-btn-save" disabled={submitting}>
              {submitting ? t("saving") : t("saveChanges")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditMaintenanceModal({ t, open, draft, setDraft, onClose, onSave }) {
  const { submitting, guardSubmit } = useSubmitGuard(open);

  if (!open) return null;
  return (
    <div
      id="editMaintenanceModal"
      className="edit-modal"
      style={{ display: "block" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>{t("editMaintenanceContent")}</h2>
          <span className="edit-modal-close" onClick={onClose} role="button" aria-label={t("close")}>
            &times;
          </span>
        </div>
        <form id="editMaintenanceForm" onSubmit={guardSubmit(onSave)}>
          <div className="form-group">
            <label htmlFor="editMaintenancePrefix">{t("prefixRequired")}</label>
            <input
              id="editMaintenancePrefix"
              type="text"
              required
              maxLength={100}
              placeholder={t("enterMaintenancePrefix")}
              value={draft.prefix}
              onChange={(e) => setDraft((p) => ({ ...p, prefix: e.target.value }))}
            />
          </div>
          <div className="form-group form-group-rich-text form-group-rich-text--modal">
            <label htmlFor="editMaintenanceContent">{t("contentRequired")}</label>
            <RichTextEditor
              id="editMaintenanceContent"
              placeholder={t("enterMaintenanceContent")}
              value={draft.content}
              onChange={(nextValue) => setDraft((p) => ({ ...p, content: nextValue }))}
            />
          </div>
          <div className="edit-modal-actions">
            <button type="button" className="edit-modal-btn edit-modal-btn-cancel" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" className="edit-modal-btn edit-modal-btn-save" disabled={submitting}>
              {submitting ? t("saving") : t("saveChanges")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
