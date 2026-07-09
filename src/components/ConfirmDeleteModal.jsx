import { portalToDocumentBody } from "./ProcessModalPortal.jsx";

/** Default stack level for delete confirm on list pages. */
export const CONFIRM_DELETE_Z_INDEX = 50000;
/** Above domain form modal (2147483000) and other nested dialogs. */
export const CONFIRM_DELETE_NESTED_Z_INDEX = 2147483100;

const WARNING_ICON = (
  <svg className="confirm-delete-modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

/**
 * Unified delete confirmation modal — shared across all pages.
 * Button styles: confirm-delete-unified.css (loaded globally in main.jsx).
 */
export default function ConfirmDeleteModal({
  open,
  title = "Confirm Delete",
  message,
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  confirmClassName = "btn btn-delete confirm-delete",
  onConfirm,
  onClose,
  modalId = "confirmDeleteModal",
  zIndex = CONFIRM_DELETE_Z_INDEX,
  confirmDisabled = false,
}) {
  if (!open) return null;
  const titleId = `${modalId}Title`;
  const messageId = `${modalId}Message`;

  return portalToDocumentBody(
    <div
      id={modalId}
      className="confirm-delete-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ zIndex }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="confirm-delete-modal-content domain-confirm-modal-content">
        <div className="confirm-delete-modal-icon-container confirm-icon-container">{WARNING_ICON}</div>
        <h2 id={titleId} className="confirm-delete-modal-title confirm-title">
          {title}
        </h2>
        <p id={messageId} className="confirm-delete-modal-message confirm-message">
          {message}
        </p>
        <div className="confirm-delete-modal-actions confirm-actions">
          <button type="button" className="btn btn-cancel confirm-cancel" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmClassName}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
  );
}
