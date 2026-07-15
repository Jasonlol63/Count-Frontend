import React from "react";
import { createPortal } from "react-dom";

function toastVariant(type) {
  const t = String(type || "success").toLowerCase();
  if (t === "error" || t === "danger") return "danger";
  if (t === "warning") return "warning";
  if (t === "info") return "info";
  return "success";
}

export function AnnouncementToast({ notices }) {
  if (!notices.length || typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <div id="accountNotificationContainer" className="account-notification-container">
      {notices.map((n) => (
        <div
          key={n.id}
          className={`account-notification account-notification-${toastVariant(n.type)}${n.visible ? " show" : ""}`}
        >
          {n.message}
        </div>
      ))}
    </div>,
    document.body
  );
}

export function AnnouncementConfirmModal({ t, message, onConfirm, onClose }) {
  return (
    <div
      className="edit-modal"
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="edit-modal-content edit-modal-content--confirm-delete" style={{ maxWidth: 420, padding: "28px 32px" }}>
        <div style={{ fontSize: "clamp(14px,1.1vw,18px)", fontWeight: 600, color: "#1e293b", marginBottom: 12 }}>
          {t("confirmTitle")}
        </div>
        <p style={{ color: "#475569", fontSize: "clamp(12px,0.9vw,15px)", marginBottom: 24, whiteSpace: "pre-wrap" }}>
          {message}
        </p>
        <div className="edit-modal-actions">
          <button type="button" className="edit-modal-btn edit-modal-btn-cancel confirm-cancel" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="edit-modal-btn edit-modal-btn-save confirm-delete" onClick={onConfirm}>
            {t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
