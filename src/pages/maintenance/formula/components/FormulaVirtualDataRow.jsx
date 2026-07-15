import { memo, useLayoutEffect, useRef } from "react";
import { toUpperDisplay, syncEditFormSourcePercent } from "../formulaMaintenanceLogic.js";
import { assetUrl } from "../../../../utils/core/apiUrl.js";
import MaintenanceEllipsisText from "../../shared/MaintenanceEllipsisText.jsx";

const FormulaVirtualDataRow = memo(function FormulaVirtualDataRow({
  row,
  index,
  selected,
  isEditing,
  editForm,
  onEditFormChange,
  onSave,
  onCancel,
  accounts,
  inputMethodOptions,
  onToggleSelect,
  onEdit,
  m,
}) {
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";
  const patchForm = (field, value) => onEditFormChange((prev) => ({ ...prev, [field]: value }));
  const formulaTextareaRef = useRef(null);

  useLayoutEffect(() => {
    if (!isEditing) return;
    const el = formulaTextareaRef.current;
    if (!(el instanceof HTMLTextAreaElement)) return;
    // Auto expand to full content so users can review/edit without scrolling.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [isEditing, editForm.formula]);

  return (
    <div
      role="row"
      className={`maintenance-virtual-data-row formula-virtual-data-row ${stripe}${isEditing ? " formula-virtual-data-row--editing" : ""}`}
    >
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        {row.no ?? index + 1}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap">
        <MaintenanceEllipsisText
          value={row._process ?? toUpperDisplay(row.process)}
          className="formula-cell-clamp-2 process-display"
        />
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap">
        {isEditing ? (
          <select
            className="account-select"
            value={editForm.account_id}
            onChange={(e) => patchForm("account_id", e.target.value)}
          >
            <option value="">{m.selectAccount}</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.display_text}
              </option>
            ))}
          </select>
        ) : (
          <MaintenanceEllipsisText
            value={row._account ?? toUpperDisplay(row.account)}
            className="formula-cell-clamp-2 account-display"
          />
        )}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-cell-currency">
        <MaintenanceEllipsisText
          value={row._currency ?? toUpperDisplay(row.currency)}
          className="formula-cell-clamp-2"
        />
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap">
        {isEditing ? (
          <input
            type="text"
            className="source-input"
            value={editForm.source_percent ?? ""}
            onChange={(e) => onEditFormChange((prev) => syncEditFormSourcePercent(prev, e.target.value))}
          />
        ) : (
          <MaintenanceEllipsisText
            value={row._source ?? toUpperDisplay(row.source)}
            className="formula-cell-clamp-2 source-display"
          />
        )}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap formula-virtual-cell--product">
        <MaintenanceEllipsisText
          value={row._product ?? toUpperDisplay(row.product)}
          className="formula-cell-clamp-2 product-display"
        />
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap formula-virtual-cell--input-method">
        {isEditing ? (
          <select
            className="input-method-select"
            value={editForm.input_method}
            onChange={(e) => patchForm("input_method", e.target.value)}
          >
            {inputMethodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.text}
              </option>
            ))}
          </select>
        ) : (
          <MaintenanceEllipsisText
            value={row._inputMethod ?? toUpperDisplay(row.input_method)}
            className="formula-cell-clamp-2 input-method-display"
          />
        )}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap formula-virtual-cell--formula">
        {isEditing ? (
          <textarea
            ref={formulaTextareaRef}
            className="formula-input formula-input-textarea"
            value={editForm.formula}
            onChange={(e) => patchForm("formula", e.target.value)}
            rows={2}
          />
        ) : (
          <MaintenanceEllipsisText
            value={row._formula ?? toUpperDisplay(row.formula)}
            className="formula-display formula-display--full"
            alwaysTooltip
          />
        )}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap">
        {isEditing ? (
          <input
            type="text"
            className="description-input"
            value={editForm.description}
            onChange={(e) => patchForm("description", e.target.value)}
          />
        ) : (
          <MaintenanceEllipsisText
            value={row._description ?? toUpperDisplay(row.description)}
            className="formula-cell-clamp-2 description-display"
          />
        )}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell-actions">
        <div className="maintenance-formula-actions-inner">
          {isEditing ? (
            <>
              <button type="button" className="maintenance-edit-btn" onClick={() => onSave(row.id)} title={m.save}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
              <button type="button" className="maintenance-cancel-btn" onClick={onCancel} title={m.cancel}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button type="button" className="maintenance-edit-btn" onClick={() => onEdit(row)} title={m.edit}>
                <img
                  src={assetUrl("images/edit.svg")}
                  alt={m.edit}
                  className="edit-icon"
                  style={{ width: "16px", height: "16px" }}
                  loading="lazy"
                  decoding="async"
                />
              </button>
              <input
                type="checkbox"
                className="maintenance-row-checkbox"
                checked={selected}
                onChange={() => onToggleSelect(row.id)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default FormulaVirtualDataRow;
