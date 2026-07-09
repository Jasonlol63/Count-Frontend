import React, { useState, useMemo } from "react";
import ConfirmDeleteModal, { CONFIRM_DELETE_NESTED_Z_INDEX } from "../../../components/ConfirmDeleteModal.jsx";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import { normalizeDescriptionName } from "../processListHelpers.js";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";

export default function DescriptionPickerModal({
  descriptions,
  form,
  onConfirm,
  onClose,
  onAddDescription,
  onDeleteDescription,
  readOnly = false,
  t,
}) {
  const ro = Boolean(readOnly);
  const { submitting: addingDesc, guardSubmit } = useSubmitGuard(true);
  const [search, setSearch] = useState("");
  const [newDescName, setNewDescName] = useState("");
  const [localSelected, setLocalSelected] = useState(() => [...(form.selected_descriptions || [])]);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const filteredDescriptions = useMemo(() => {
    if (!search.trim()) return descriptions;
    const lowerSearch = search.toLowerCase();
    return descriptions.filter((d) => String(d.name || "").toLowerCase().includes(lowerSearch));
  }, [descriptions, search]);

  const toggleSelect = (desc) => {
    setLocalSelected((prev) => {
      const exists = prev.find((item) => String(item.id) === String(desc.id));
      if (exists) return prev.filter((item) => String(item.id) !== String(desc.id));
      return [...prev, desc];
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (ro) return;
    const name = normalizeDescriptionName(newDescName);
    if (!name) return;
    const added = await onAddDescription(name);
    setNewDescName("");
    if (added?.id != null) {
      setLocalSelected((prev) => {
        if (prev.some((item) => String(item.id) === String(added.id))) return prev;
        return [...prev, { id: added.id, name: normalizeDescriptionName(added.name) }];
      });
    }
  };

  const runDelete = async () => {
    if (ro) return;
    if (deleteConfirmId == null) return;
    await onDeleteDescription(deleteConfirmId);
    setDeleteConfirmId(null);
  };

  return (
    <ProcessModalPortal>
    <div
      id="descriptionPickerModal"
      className="modal show"
      style={{ ...processModalBackdropStyle, zIndex: 10100 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-content description-selection-modal">
        <div className="modal-header description-selection-modal-header">
          <h2>{t("selectOrAddDescription")}</h2>
        </div>
        <div className="modal-body">
          <div className="description-selection-container">
            <div className="selected-descriptions-section">
              <h3>{t("selectedDescriptions")}</h3>
              <div className="selected-descriptions-list" id="selectedDescriptionsInModal">
                {localSelected.length === 0 ? (
                  <div className="no-descriptions">{t("noDescriptionsSelected")}</div>
                ) : (
                  localSelected.map((item) => (
                    <div key={item.id} className="selected-description-modal-item">
                      <span>{String(item.name || "").toUpperCase()}</span>
                      <button type="button" className="remove-description-modal" disabled={ro} onClick={() => !ro && toggleSelect(item)}>
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="available-descriptions-section">
              <div className="add-description-bar">
                <h3>{t("addNewDescription")}</h3>
                <form className="add-description-form" onSubmit={guardSubmit(handleAdd)}>
                  <div className="add-description-input-group">
                    <input
                      type="text"
                      placeholder={t("enterNewDescriptionName")}
                      value={newDescName}
                      disabled={ro}
                      onChange={(e) => setNewDescName(e.target.value.toUpperCase())}
                      style={{ textTransform: "uppercase" }}
                      required
                    />
                    <button type="submit" className="btn btn-save" disabled={ro || addingDesc}>
                      {addingDesc ? t("saving") : t("add")}
                    </button>
                  </div>
                </form>
              </div>

              <h3>{t("availableDescriptions")}</h3>
              <div className="description-search">
                <input
                  type="text"
                  className="description-search-input"
                  placeholder={t("searchDescriptions")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value.toUpperCase())}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div className="description-list" id="existingDescriptions">
                {filteredDescriptions.map((d) => {
                  const isSelected = localSelected.some((item) => String(item.id) === String(d.id));
                  return (
                    <div key={d.id} className="description-item">
                      <div className="description-item-left">
                        <input
                          type="checkbox"
                          id={`desc_checkbox_${d.id}`}
                          checked={isSelected}
                          onChange={() => toggleSelect(d)}
                        />
                        <label htmlFor={`desc_checkbox_${d.id}`}>{String(d.name || "").toUpperCase()}</label>
                      </div>
                      <button
                        type="button"
                        className="description-delete-btn"
                        disabled={ro}
                        onClick={(e) => {
                          if (ro) return;
                          e.stopPropagation();
                          setDeleteConfirmId(d.id);
                        }}
                        title={t("deleteDescription")}
                        aria-label={t("deleteDescription")}
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-cancel" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="btn btn-save" id="confirmDescriptionsBtn" onClick={() => onConfirm(localSelected)}>
            {t("confirmSelection")}
          </button>
        </div>
      </div>

      <ConfirmDeleteModal
        open={deleteConfirmId != null}
        title={t("deleteDescriptionTitle")}
        message={t("deleteDescriptionConfirm")}
        cancelLabel={t("cancel")}
        confirmLabel={t("delete")}
        zIndex={CONFIRM_DELETE_NESTED_Z_INDEX}
        confirmDisabled={ro}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => void runDelete()}
      />
    </div>
    </ProcessModalPortal>
  );
}
