import React from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";

function BankTextareaModal({ modalId, title, textareaId, value, onChange, onSave, onClose, t }) {
  return (
    <ProcessModalPortal>
      <div id={modalId} className="modal bank-modal sop-modal" style={processModalBackdropStyle}>
        <div className="modal-content sop-modal-content">
          <div className="modal-header">
            <h2 id="processNoteModalTitle">{title}</h2>
            <span className="close" onClick={onClose} role="presentation">
              &times;
            </span>
          </div>
          <div className="modal-body sop-modal-body">
            <textarea
              id={textareaId}
              placeholder={t("notePlaceholder")}
              className="bank-input sop-modal-textarea"
              value={value}
              onChange={onChange}
            />
            <div className="form-actions bank-actions sop-modal-actions">
              <button type="button" className="btn btn-save" onClick={onSave}>
                {t("save")}
              </button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ProcessModalPortal>
  );
}

export function BankNoteModal({ bankFormNote, setBankFormNote, onSave, t }) {
  if (!bankFormNote) return null;
  return (
    <BankTextareaModal
      modalId="sopModal"
      title={bankFormNote.kind === "sop" ? t("sop") : t("remark")}
      textareaId="sop_content"
      value={bankFormNote.draft}
      onChange={(e) => setBankFormNote((n) => (n ? { ...n, draft: e.target.value } : n))}
      onSave={onSave}
      onClose={() => setBankFormNote(null)}
      t={t}
    />
  );
}

export function BankRemarkModal({ remarkDraft, setRemarkDraft, onSave, onClose, t }) {
  return (
    <BankTextareaModal
      modalId="bankRemarkModal"
      title={t("remark")}
      textareaId="bank_remark_inline"
      value={remarkDraft}
      onChange={(e) => setRemarkDraft(e.target.value)}
      onSave={() => void onSave()}
      onClose={onClose}
      t={t}
    />
  );
}
