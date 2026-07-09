import React from "react";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";

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
            <label htmlFor="editAnnouncementContent">{t("contentRequired")}</label>
            <textarea
              id="editAnnouncementContent"
              required
              value={draft.content}
              onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))}
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
          <div className="form-group">
            <label htmlFor="editMaintenanceContent">{t("contentRequired")}</label>
            <textarea
              id="editMaintenanceContent"
              required
              value={draft.content}
              onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))}
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
