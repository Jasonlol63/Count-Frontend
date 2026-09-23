import { useEffect } from "react";

export default function CompanyAccessModal({ open, title, message, confirmText, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="m-dash-access-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="m-dash-access-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mDashAccessTitle"
        aria-describedby="mDashAccessMessage"
      >
        <div className="m-dash-access-icon-wrap">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />
        </div>
        <h3 id="mDashAccessTitle" className="m-dash-access-title">
          {title}
        </h3>
        <p id="mDashAccessMessage" className="m-dash-access-message">
          {message}
        </p>
        <button type="button" className="m-dash-access-btn tap-scale" onClick={onClose}>
          {confirmText}
        </button>
      </div>
    </div>
  );
}
