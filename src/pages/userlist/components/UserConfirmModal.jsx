import React from "react";
import { accountModalOverlayZIndex, portalToDocumentBody } from "../../../components/ProcessModalPortal.jsx";

const confirmModalZIndex = accountModalOverlayZIndex + 50;

export default function UserConfirmModal({ open, message, onConfirm, onClose, confirmDisabled, t }) {
  if (!open) return null;
  const disableDelete = Boolean(confirmDisabled);
  return portalToDocumentBody(
    <div id="confirmModal" className="modal" style={{ display: "flex", zIndex: confirmModalZIndex }}>
      <div className="confirm-modal-content">
        <div className="confirm-icon-container">
          <svg className="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="confirm-title">{t("confirmDelete")}</h2>
        <p className="confirm-message" style={{ whiteSpace: "pre-line" }}>
          {message}
        </p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-cancel confirm-cancel" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="btn btn-delete confirm-delete" disabled={disableDelete} onClick={onConfirm}>
            {t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
