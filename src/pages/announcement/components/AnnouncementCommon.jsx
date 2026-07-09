import React from "react";

export function AnnouncementToast({ notices }) {
  return (
    <div id="notificationContainer">
      {notices.map((n) => (
        <div key={n.id} className={`notification ${n.type}${n.visible ? " show" : ""}`}>
          {n.message}
        </div>
      ))}
    </div>
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
