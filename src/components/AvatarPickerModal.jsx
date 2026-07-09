import { useEffect } from "react";
import { createPortal } from "react-dom";
import { assetUrl } from "../utils/core/apiUrl.js";

const AVATAR_COUNT = 9;

export default function AvatarPickerModal({
  open,
  onClose,
  selectedAvatarId,
  selectedGender,
  onGenderChange,
  onSelect,
  title,
  maleLabel,
  femaleLabel,
  cancelLabel = "Cancel",
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const prefix = selectedGender === "female" ? "female" : "male";

  const shell = (
    <div className="avatar-picker-modal-root" role="presentation">
      <button
        type="button"
        className="avatar-picker-modal-backdrop"
        aria-label={cancelLabel}
        onClick={onClose}
      />
      <div
        className="avatar-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="avatar-picker-modal-header">
          <span id="avatar-picker-modal-title">{title}</span>
          <button
            type="button"
            className="avatar-picker-modal-close"
            aria-label={cancelLabel}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="avatar-picker-modal-body">
          <div className="avatar-picker-modal-gender" role="tablist" aria-label={title}>
            <button
              type="button"
              role="tab"
              aria-selected={selectedGender === "male"}
              className={`avatar-picker-modal-gender-btn${selectedGender === "male" ? " is-active" : ""}`}
              onClick={() => onGenderChange("male")}
            >
              {maleLabel}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedGender === "female"}
              className={`avatar-picker-modal-gender-btn${selectedGender === "female" ? " is-active" : ""}`}
              onClick={() => onGenderChange("female")}
            >
              {femaleLabel}
            </button>
          </div>
          <div className="avatar-picker-modal-grid" role="listbox" aria-label={title}>
            {Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1).map((num) => {
              const id = `${prefix}${num}`;
              const imgPath = selectedGender === "female" ? `images/female${num}.png` : `images/avatar${num}.png`;
              const checked = selectedAvatarId === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={`avatar-picker-modal-option${checked ? " is-selected" : ""}`}
                  onClick={() => onSelect(id)}
                >
                  <img src={assetUrl(imgPath)} alt="" className="avatar-picker-modal-option-img" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" && document.body
    ? createPortal(shell, document.body)
    : shell;
}
