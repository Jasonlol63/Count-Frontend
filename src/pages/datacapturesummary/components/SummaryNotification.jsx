import { summaryNotificationCssType } from "../lib/summaryNotify.js";

export default function SummaryNotification({ notification, shown, onClose }) {
  const { open, title, message, type } = notification;
  const typeClass = summaryNotificationCssType(type);
  const body = String(message || "").trim();

  if (!open) return null;

  return (
    <div
      id="notificationPopup"
      className={`notification-popup ${typeClass}${shown ? " show" : ""}`}
      style={{ display: "block" }}
      role="status"
      aria-live="polite"
    >
      <div className={`notification-header${body ? "" : " notification-header--solo"}`}>
        <span className="notification-title" id="notificationTitle">
          {title}
        </span>
        <button type="button" className="notification-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>
      {body ? (
        <div className="notification-message" id="notificationMessage">
          {body}
        </div>
      ) : null}
    </div>
  );
}
