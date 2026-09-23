import { useEffect, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import RichTextEditor from "./RichTextEditor.jsx";
import "../transaction/add-transaction-sheet.css";
import "../account/account.css";

function Sheet({ open, title, onClose, tall = false, elevate = false, children, footer = null }) {
  useOverlayLock(open, onClose);
  return (
    <div
      className={`m-sheet-overlay${elevate ? " m-sheet-overlay--high" : ""}${
        open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"
      }`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button type="button" className="m-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`m-sheet-panel${tall ? " m-sheet-panel--tall" : ""}${
          open ? " m-sheet-panel--open" : " m-sheet-panel--closed"
        }`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>
        <header className="m-sheet-header">
          <h2 className="m-sheet-title">{title}</h2>
          <button type="button" className="m-sheet-close tap-scale" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="m-sheet-body m-account-sheet-body">{children}</div>
        {footer ? <footer className="m-account-sheet-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function AnnouncementFormSheet({ open, onClose, t, initial = null, onSubmit }) {
  const isEdit = Boolean(initial?.id);
  const [title, setTitle] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title || "");
    setSectionLabel(initial?.sectionLabel || "");
    setContent(initial?.content || "");
    setSubmitting(false);
  }, [open, initial]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit?.({
        id: initial?.id,
        title,
        sectionLabel,
        content,
      });
      if (ok) onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={isEdit ? t("editAnnouncement") : t("createNewAnnouncement")}
      onClose={onClose}
      tall
      footer={
        <button
          type="button"
          className="m-account-primary-btn tap-scale"
          disabled={submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting
            ? isEdit
              ? t("saving")
              : t("publishing")
            : isEdit
              ? t("saveChanges")
              : t("publishAnnouncement")}
        </button>
      }
    >
      <div className="m-ann-form">
        <label className="m-ann-field">
          <span>{t("titleRequired")}</span>
          <input
            type="text"
            maxLength={500}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("enterAnnouncementTitle")}
          />
        </label>

        <label className="m-ann-field">
          <span>{t("sectionLabelOptional")}</span>
          <input
            type="text"
            maxLength={80}
            value={sectionLabel}
            onChange={(e) => setSectionLabel(e.target.value)}
            placeholder={t("enterSectionLabel")}
          />
          <small>{t("sectionLabelHint")}</small>
        </label>

        <div className="m-ann-field">
          <span>{t("contentRequired")}</span>
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder={t("enterAnnouncementContent")}
            disabled={submitting}
          />
        </div>
      </div>
    </Sheet>
  );
}

export function AnnouncementConfirmSheet({ open, onClose, message, onConfirm, t }) {
  return (
    <Sheet
      open={open}
      title={t("confirmTitle")}
      onClose={onClose}
      elevate
      footer={
        <div className="m-account-footer-actions">
          <button type="button" className="m-account-secondary-btn tap-scale" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="m-account-danger-btn tap-scale"
            onClick={() => {
              onConfirm?.();
              onClose();
            }}
          >
            {t("confirm")}
          </button>
        </div>
      }
    >
      <p className="m-ann-confirm-msg">{message}</p>
    </Sheet>
  );
}

export function MaintenanceFormSheet({ open, onClose, t, initial = null, onSubmit }) {
  const isEdit = Boolean(initial?.id);
  const [prefix, setPrefix] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPrefix(initial?.prefix || "");
    setContent(initial?.content || "");
    setSubmitting(false);
  }, [open, initial]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit?.({
        id: initial?.id,
        prefix,
        content,
      });
      if (ok) onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={isEdit ? t("editMaintenanceContent") : t("createNewMaintenanceContent")}
      onClose={onClose}
      tall
      footer={
        <button
          type="button"
          className="m-account-primary-btn tap-scale"
          disabled={submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting
            ? isEdit
              ? t("saving")
              : t("publishing")
            : isEdit
              ? t("saveChanges")
              : t("publishMaintenanceContent")}
        </button>
      }
    >
      <div className="m-ann-form">
        <label className="m-ann-field">
          <span>{t("prefixRequired")}</span>
          <input
            type="text"
            maxLength={100}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder={t("enterMaintenancePrefix")}
          />
        </label>

        <div className="m-ann-field">
          <span>{t("contentRequired")}</span>
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder={t("enterMaintenanceContent")}
            disabled={submitting}
          />
        </div>
      </div>
    </Sheet>
  );
}
