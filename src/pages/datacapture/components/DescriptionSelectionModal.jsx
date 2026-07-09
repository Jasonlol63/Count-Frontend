import { useCallback, useEffect, useMemo, useState } from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import { fetchDescriptionCatalog, postAddDescription, postDeleteDescription } from "../lib/dataCaptureApi.js";
import { pushDataCaptureNotification } from "../lib/dataCaptureNotify.js";
import { translateDataCaptureMessage } from "../../../translateFile/pages/dataCaptureTranslate.js";

function normalizeCatalog(json) {
  const raw = json?.descriptions ?? json?.data?.descriptions ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => ({
      id: d.id,
      name: d.name != null ? String(d.name).trim().toUpperCase() : "",
    }))
    .filter((d) => d.name && d.id != null);
}

export default function DescriptionSelectionModal({
  t,
  open,
  onClose,
  companyId,
  onConfirm,
  initialSelected = [],
  onDescriptionsChange,
}) {
  const [catalog, setCatalog] = useState([]);
  const [pendingNames, setPendingNames] = useState([]);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");

  const notify = useCallback(
    (message, type = "danger") => {
      pushDataCaptureNotification(translateDataCaptureMessage(localStorage.getItem("login_lang") === "zh" ? "zh" : "en", message), type);
    },
    [],
  );

  const loadCatalog = useCallback(async () => {
    if (!companyId) {
      setCatalog([]);
      return;
    }
    try {
      const result = await fetchDescriptionCatalog(companyId);
      if (!result.success) {
        notify(result.error || "Failed to load descriptions");
        setCatalog([]);
        return;
      }
      setCatalog(normalizeCatalog(result));
    } catch {
      notify("Failed to load descriptions");
      setCatalog([]);
    }
  }, [companyId, notify]);

  useEffect(() => {
    if (!open) return;
    setPendingNames(
      (Array.isArray(initialSelected) ? initialSelected : []).map((n) =>
        String(n).trim().toUpperCase(),
      ),
    );
    setSearch("");
    setNewName("");
    void loadCatalog();
  }, [open, loadCatalog, initialSelected]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((d) => d.name.toLowerCase().includes(q));
  }, [catalog, search]);

  const toggleName = useCallback((name, checked) => {
    setPendingNames((prev) => {
      if (checked) {
        if (prev.includes(name)) return prev;
        return [...prev, name];
      }
      return prev.filter((n) => n !== name);
    });
  }, []);

  const removeSelected = useCallback((name) => {
    setPendingNames((prev) => prev.filter((n) => n !== name));
  }, []);

  const handleAdd = useCallback(
    async (e) => {
      e.preventDefault();
      const trimmed = newName.trim().toUpperCase();
      if (!trimmed || !companyId) return;
      try {
        const result = await postAddDescription(companyId, trimmed);
        const dup =
          result.duplicate === true ||
          result.data?.duplicate === true ||
          String(result.error || "").includes("already exists");
        if (!result.success) {
          notify(dup ? "Description name already exists" : result.error || "Failed to add description");
          return;
        }
        const newId = result.data?.description_id ?? result.description_id;
        if (newId != null) {
          setCatalog((prev) => {
            if (prev.some((p) => String(p.id) === String(newId))) return prev;
            return [...prev, { id: newId, name: trimmed }];
          });
        } else {
          void loadCatalog();
        }
        setPendingNames((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
        setNewName("");
        notify("Description added successfully!", "success");
      } catch {
        notify("Failed to add description");
      }
    },
    [companyId, newName, loadCatalog, notify],
  );

  const handleDelete = useCallback(
    async (id, name) => {
      if (!id) return;
      if (!window.confirm(t("deleteDescriptionConfirm", { name }))) {
        return;
      }
      try {
        const result = await postDeleteDescription(id);
        if (!result.success) {
          notify(result.error || "Failed to delete description");
          return;
        }
        setCatalog((prev) => prev.filter((d) => String(d.id) !== String(id)));
        setPendingNames((prev) => {
          const next = prev.filter((n) => n !== name);
          onDescriptionsChange?.(next);
          return next;
        });
        notify("Description deleted successfully", "success");
      } catch {
        notify("Failed to delete description");
      }
    },
    [t, notify, onDescriptionsChange],
  );

  const handleConfirm = useCallback(() => {
    if (pendingNames.length === 0) {
      notify("Please select at least one description");
      return;
    }
    onConfirm(pendingNames);
  }, [onConfirm, pendingNames, notify]);

  if (!open) return null;

  return (
    <ProcessModalPortal>
    <div
      id="descriptionSelectionModal"
      className="modal show"
      style={processModalBackdropStyle}
      role="dialog"
      aria-modal
      aria-labelledby="dc-desc-modal-title"
    >
      <div className="modal-content description-selection-modal">
        <div className="modal-header">
          <h2 id="dc-desc-modal-title">{t("selectOrAddDescription")}</h2>
          <span className="close" onClick={onClose} role="presentation">
            &times;
          </span>
        </div>
        <div className="modal-body">
          <div className="description-selection-container">
            <div className="selected-descriptions-section">
              <h3>{t("selectedDescriptions")}</h3>
              <div className="selected-descriptions-list" id="selectedDescriptionsInModal">
                {pendingNames.length === 0 ? (
                  <div className="no-descriptions">{t("noDescriptionsSelected")}</div>
                ) : (
                  pendingNames.map((name) => (
                    <div key={name} className="selected-description-modal-item">
                      <span>{String(name).toUpperCase()}</span>
                      <button type="button" className="remove-description-modal" onClick={() => removeSelected(name)}>
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
                <form className="add-description-form" onSubmit={handleAdd}>
                  <div className="add-description-input-group">
                    <input
                      type="text"
                      name="description_name"
                      placeholder={t("enterNewDescriptionName")}
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value.toUpperCase())}
                      style={{ textTransform: "uppercase" }}
                    />
                    <button type="submit" className="btn btn-save">
                      {t("add")}
                    </button>
                  </div>
                </form>
              </div>

              <h3>{t("availableDescriptions")}</h3>
              <div className="description-search">
                <input
                  type="text"
                  placeholder={t("searchDescriptions")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value.toUpperCase())}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div className="description-list" id="existingDescriptions">
                {filteredCatalog.length === 0 ? (
                  <div className="no-descriptions">{t("noDescriptionsFound")}</div>
                ) : (
                  filteredCatalog.map((d) => (
                    <div key={String(d.id)} className="description-item">
                      <div className="description-item-left">
                        <input
                          type="checkbox"
                          name="available_descriptions"
                          value={d.name}
                          id={`desc_${d.id}`}
                          data-description-id={d.id}
                          checked={pendingNames.includes(d.name)}
                          onChange={(e) => toggleName(d.name, e.target.checked)}
                        />
                        <label htmlFor={`desc_${d.id}`}>{String(d.name).toUpperCase()}</label>
                      </div>
                      <button
                        type="button"
                        className="description-delete-btn"
                        title={t("deleteDescription")}
                        aria-label={t("deleteDescription")}
                        onClick={() => void handleDelete(d.id, d.name)}
                      >
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-cancel" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="btn btn-save" id="confirmDescriptionsBtn" onClick={handleConfirm}>
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
    </ProcessModalPortal>
  );
}
