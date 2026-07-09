import React from "react";

export default function ConflictModal({ conflict, onResolve, onCancel, t }) {
  if (!conflict) return null;

  return (
    <div className="own-modal-overlay" role="presentation" onClick={onCancel}>
      <div className="own-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="own-modal-header">
          <h3 className="own-modal-title">{t("multipleMatchesFound")}</h3>
        </div>
        <div className="own-modal-body">
          <p className="own-modal-desc">
            {t("idUsedByTwoPartners")}
          </p>
          <div className="own-modal-options">
            <button
              type="button"
              className="own-btn-outline own-btn-conflict"
              onClick={() => onResolve("login")}
            >
              {t("linkAsLoginId")}
              <br />
              <strong>{conflict.data?.login_partner}</strong>
            </button>
            <button
              type="button"
              className="own-btn-outline own-btn-conflict"
              onClick={() => onResolve("group")}
            >
              {t("joinAsGroup")}
              <br />
              <strong>{conflict.data?.group_partner}</strong>
            </button>
          </div>
        </div>
        <div className="own-modal-footer">
          <button type="button" className="own-footer-btn own-btn-cancel" onClick={onCancel}>
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
