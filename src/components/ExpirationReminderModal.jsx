import { useEffect } from "react";

export default function ExpirationReminderModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  secondaryLabel,
  onSecondary,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onConfirm();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="dashboard-alert-modal-overlay is-open dashboard-alert-modal-overlay--elevated"
      aria-hidden="false"
      onClick={(e) => {
        if (e.target === e.currentTarget) onConfirm();
      }}
    >
      <div className="dashboard-alert-modal-box" role="dialog" aria-labelledby="expirationReminderTitle">
        <div className="dashboard-alert-modal-icon-wrap dashboard-alert-modal-icon-wrap--warning">
          <svg
            className="dashboard-alert-modal-icon dashboard-alert-modal-icon--warning"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h3 id="expirationReminderTitle" className="dashboard-alert-modal-title">
          {title}
        </h3>
        <p className="dashboard-alert-modal-message">{message}</p>
        <div className={`dashboard-alert-modal-actions${secondaryLabel && onSecondary ? " dashboard-alert-modal-actions--dual" : ""}`}>
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              className="dashboard-alert-modal-btn dashboard-alert-modal-btn-secondary"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="dashboard-alert-modal-btn dashboard-alert-modal-btn-primary"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
