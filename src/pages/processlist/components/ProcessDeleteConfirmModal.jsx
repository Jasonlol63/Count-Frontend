import React from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";

export default function ProcessDeleteConfirmModal({ open, count, onCancel, onConfirm, deleting, confirmDisabled, t }) {
  if (!open) return null;
  const disableConfirm = Boolean(deleting || confirmDisabled);
  return (
    <ProcessModalPortal>
    <div className="process-modal" style={processModalBackdropStyle} role="dialog" aria-modal="true">
      <div className="process-confirm-modal-content">
        <div className="process-confirm-icon-container">
          <svg className="process-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="process-confirm-title">{t("confirmDeleteTitle")}</h2>
        <p className="process-confirm-message">
          {t("confirmDeleteMessage", { count })}
        </p>
        <div className="process-confirm-actions">
          <button type="button" className="process-btn process-btn-cancel confirm-cancel" onClick={onCancel} disabled={deleting}>
            {t("cancel")}
          </button>
          <button type="button" className="process-btn process-btn-delete confirm-delete" onClick={onConfirm} disabled={disableConfirm}>
            {deleting ? t("deleting") : t("delete")}
          </button>
        </div>
      </div>
    </div>
    </ProcessModalPortal>
  );
}
