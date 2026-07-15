import { useEffect, useRef, useState } from "react";
import { toUpperDisplay, syncEditFormSourcePercent, createFormulaEditFormFromRow } from "../formulaMaintenanceLogic.js";
import { assetUrl } from "../../../../utils/core/apiUrl.js";
import FormulaVirtualRows, { FormulaVirtualTableHead } from "./FormulaVirtualRows.jsx";
import { MAINTENANCE_FORMULA_EDIT_ROW_HEIGHT, MAINTENANCE_REPORT_ROW_HEIGHT } from "../../shared/maintenanceReportRowMetrics.js";
import MaintenanceEllipsisText from "../../shared/MaintenanceEllipsisText.jsx";

const ROW_HEIGHT = MAINTENANCE_REPORT_ROW_HEIGHT;
const EDIT_ROW_HEIGHT = MAINTENANCE_FORMULA_EDIT_ROW_HEIGHT;

export default function FormulaMaintenanceTable({
  data,
  loading,
  listSyncing = false,
  listHydrating = false,
  totalRowCount = 0,
  isRowSelected,
  selectAllChecked,
  selectAllIndeterminate,
  onToggleSelect,
  onToggleSelectAll,
  onSaveRow,
  onListScrolling,
  scrollRestoreRowId = null,
  onScrollRestoreComplete,
  scrollResetKey = "",
  accounts,
  m,
  inputMethodOptions,
  awaitingProcessSelection = false,
  bootPending = false,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const selectAllRef = useRef(null);
  const formulaTextareaRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = Boolean(selectAllIndeterminate);
    }
  }, [selectAllIndeterminate]);

  useEffect(() => {
    if (listSyncing) {
      setEditingId(null);
      setEditForm({});
    }
  }, [listSyncing]);

  useEffect(() => {
    if (editingId == null) return;
    const el = formulaTextareaRef.current;
    if (!(el instanceof HTMLTextAreaElement)) return;
    // Keep edit textarea fully visible while value changes.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editingId, editForm.formula]);

  const handleEdit = (row) => {
    setEditingId(row.id);
    setEditForm(createFormulaEditFormFromRow(row));
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (id) => {
    const success = await onSaveRow(id, editForm);
    if (success) {
      setEditingId(null);
      setEditForm({});
    }
  };

  if (data.length === 0) {
    const isLoaderActive = bootPending || loading || listSyncing;
    return (
      <div className="empty-state-container" style={{ display: "block" }}>
        <div className="empty-state">
          <p>
            {isLoaderActive
              ? m.loading
              : awaitingProcessSelection
              ? m.selectProcessPrompt
              : m.noDataAdjustSearch}
          </p>
        </div>
      </div>
    );
  }


  /* 所有公司统一用虚拟 grid 表（与 95 等大列表一致）；勿按条数切回 HTML table */
  const useVirtualList = data.length > 0;

  const buildRowTr = (row, virtualRow, virtualAttrs = {}) => {
    const isEditing = editingId === row.id;
    const rowIndex = virtualRow ? virtualRow.index : Math.max(0, (Number(row.no) || 1) - 1);
    const stripeClass = rowIndex % 2 === 1 ? "formula-data-row--stripe" : "";
    const rowStyle = virtualRow
      ? {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: `${virtualRow.size}px`,
          minHeight: `${virtualRow.size}px`,
          display: "table",
          tableLayout: "fixed",
          boxSizing: "border-box",
          transform: `translateY(${virtualRow.start}px)`,
        }
      : undefined;

    return (
      <tr
        key={virtualRow ? virtualRow.key : row.id}
        ref={virtualAttrs.ref}
        data-index={virtualAttrs["data-index"]}
        className={`formula-data-row ${stripeClass}${isEditing ? " formula-row-editing" : ""}`}
        style={rowStyle}
      >
        <td className="maintenance-table-cell">{row.no}</td>
        <td className="maintenance-table-cell">
          <MaintenanceEllipsisText
            value={toUpperDisplay(row.process)}
            className="formula-cell-clamp-2 process-display"
          />
        </td>
        <td className="maintenance-table-cell">
          {isEditing ? (
            <select
              className="account-select"
              value={editForm.account_id}
              onChange={(e) => setEditForm({ ...editForm, account_id: e.target.value })}
              style={{ display: "block", width: "100%" }}
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
              value={toUpperDisplay(row.account)}
              className="formula-cell-clamp-2 account-display"
            />
          )}
        </td>
        <td className="maintenance-table-cell maintenance-cell-currency">{toUpperDisplay(row.currency)}</td>
        <td className="maintenance-table-cell formula-cell-text">
          {isEditing ? (
            <input
              type="text"
              className="source-input"
              value={editForm.source_percent ?? ""}
              onChange={(e) => setEditForm((prev) => syncEditFormSourcePercent(prev, e.target.value))}
              style={{ display: "block", width: "100%" }}
            />
          ) : (
            <MaintenanceEllipsisText
              value={toUpperDisplay(row.source)}
              className="formula-cell-clamp-2 source-display"
            />
          )}
        </td>
        <td className="maintenance-table-cell">
          <MaintenanceEllipsisText
            value={toUpperDisplay(row.product)}
            className="formula-cell-clamp-2 product-display"
          />
        </td>
        <td className="maintenance-table-cell formula-cell-text">
          {isEditing ? (
            <select
              className="input-method-select"
              value={editForm.input_method}
              onChange={(e) => setEditForm({ ...editForm, input_method: e.target.value })}
              style={{ display: "block", width: "100%" }}
            >
              {inputMethodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.text}
                </option>
              ))}
            </select>
          ) : (
            <MaintenanceEllipsisText
              value={toUpperDisplay(row.input_method)}
              className="formula-cell-clamp-2 input-method-display"
            />
          )}
        </td>
        <td className="maintenance-table-cell formula-cell-text">
          {isEditing ? (
            <textarea
              ref={isEditing ? formulaTextareaRef : null}
              className="formula-input formula-input-textarea"
              value={editForm.formula}
              onChange={(e) => setEditForm({ ...editForm, formula: e.target.value })}
              style={{ display: "block", width: "100%" }}
              rows={2}
            />
          ) : (
            <MaintenanceEllipsisText
              value={toUpperDisplay(row.formula)}
              className="formula-display formula-display--full"
              alwaysTooltip
            />
          )}
        </td>
        <td className="maintenance-table-cell formula-cell-text">
          {isEditing ? (
            <input
              type="text"
              className="description-input"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              style={{ display: "block", width: "100%" }}
            />
          ) : (
            <MaintenanceEllipsisText
              value={toUpperDisplay(row.description)}
              className="formula-cell-clamp-2 description-display"
            />
          )}
        </td>
        <td className="maintenance-table-cell maintenance-cell-checkbox">
          <div className="maintenance-formula-actions-inner">
            {isEditing ? (
              <>
                <button type="button" className="maintenance-edit-btn" onClick={() => handleSave(row.id)} title={m.save}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
                <button type="button" className="maintenance-cancel-btn" onClick={handleCancel} title={m.cancel}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button type="button" className="maintenance-edit-btn" onClick={() => handleEdit(row)} title={m.edit}>
                  <img src={assetUrl("images/edit.svg")} alt={m.edit} className="edit-icon" style={{ width: "16px", height: "16px" }} />
                </button>
                <input
                  type="checkbox"
                  className="maintenance-row-checkbox"
                  checked={isRowSelected(row.id)}
                  onChange={() => onToggleSelect(row.id)}
                />
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };


  const headerLabels = [
    m.tblNo,
    m.tblProcess,
    m.tblAccount,
    m.tblCurrency,
    m.tblSource,
    m.tblProduct,
    m.tblInputMethod,
    m.tblFormula,
    m.tblDescription,
  ];

  const selectAllCheckbox = (
    <input
      type="checkbox"
      ref={selectAllRef}
      className="maintenance-row-checkbox"
      checked={selectAllChecked}
      onChange={onToggleSelectAll}
      title={m.selectAll}
    />
  );

  if (useVirtualList) {
    return (
      <div
        className={`maintenance-list-container maintenance-virtual-table formula-virtual-table${
          listSyncing ? " formula-list-container--syncing" : ""
        }`}
      >
        <div className="maintenance-virtual-table-inner formula-virtual-table-inner" role="table">
          <FormulaVirtualRows
            rows={data}
            rowHeight={ROW_HEIGHT}
            editRowHeight={EDIT_ROW_HEIGHT}
            editingId={editingId}
            editForm={editForm}
            onEditFormChange={setEditForm}
            onSave={handleSave}
            onCancel={handleCancel}
            accounts={accounts}
            inputMethodOptions={inputMethodOptions}
            isRowSelected={isRowSelected}
            onToggleSelect={onToggleSelect}
            onEdit={handleEdit}
            m={m}
            onScrollingChange={onListScrolling}
            scrollRestoreRowId={scrollRestoreRowId}
            onScrollRestoreComplete={onScrollRestoreComplete}
            scrollResetKey={scrollResetKey}
            listSyncing={listSyncing}
            listHydrating={listHydrating}
            selectAllRef={selectAllRef}
            selectAllChecked={selectAllChecked}
            onToggleSelectAll={onToggleSelectAll}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="maintenance-list-container" style={{ display: "block" }}>
      <table className="maintenance-table">
        <thead>
          <tr>
            {headerLabels.map((label) => (
              <th key={label}>{label}</th>
            ))}
            <th className="maintenance-select-all-header">
              <div className="maintenance-formula-actions-inner">
                <span className="maintenance-action-edit-placeholder" aria-hidden="true" />
                {selectAllCheckbox}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>{data.map((row) => buildRowTr(row, null))}</tbody>
      </table>
    </div>
  );
}
