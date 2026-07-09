/** Confirm delete modal — domain page list delete */
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import ConfirmDeleteModal from "../../../components/ConfirmDeleteModal.jsx";

export default function DomainConfirmModal({ message, onConfirm, onClose, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  return (
    <ConfirmDeleteModal
      open
      title={t("confirmDeleteTitle")}
      message={message}
      cancelLabel={t("cancel")}
      confirmLabel={t("delete")}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
