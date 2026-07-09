import { memo, useCallback, useRef, useState } from "react";
import { formatSourcePercentForDisplay } from "../../../shared/formula/index.js";
import {
  buildFormulaInlineEditPatch,
  buildSourceInlineEditPatch,
  getFormulaInlineEditValue,
} from "../formula/summaryInlineEditPure.js";
import SummaryInlineEditInput from "./SummaryInlineEditInput.jsx";
import { formatIdProductDisplay } from "../lib/summaryIdProductDisplay.js";

function formatAmountColor(value) {
  const n = parseFloat(String(value || "").replace(/,/g, ""));
  if (Number.isNaN(n)) return "#000000";
  if (n > 0) return "#0D60FF";
  if (n < 0) return "#A91215";
  return "#000000";
}

function SummaryTableRowInner({ row, onRowChange, onNewFormula, onEditFormula, onInlineEditSave }) {
  const [editingField, setEditingField] = useState(null);
  const [draftValue, setDraftValue] = useState("");
  const editOriginalRef = useRef("");

  const handleField = useCallback(
    (patch) => {
      onRowChange?.(row.key, patch);
    },
    [onRowChange, row.key]
  );

  const startFormulaEdit = useCallback(() => {
    const initial = getFormulaInlineEditValue(row);
    editOriginalRef.current = initial;
    setDraftValue(initial);
    setEditingField("formula");
  }, [row]);

  const startSourceEdit = useCallback(() => {
    const initial = String(row.sourcePercent || "1").trim() || "1";
    editOriginalRef.current = initial;
    setDraftValue(initial);
    setEditingField("source");
  }, [row]);

  const cancelEdit = useCallback(() => {
    setEditingField(null);
    setDraftValue("");
  }, []);

  const saveFormulaEdit = useCallback(() => {
    const patch = buildFormulaInlineEditPatch(row, draftValue);
    setEditingField(null);
    setDraftValue("");
    if (!patch) return;
    onInlineEditSave?.(row, patch);
  }, [row, draftValue, onInlineEditSave]);

  const saveSourceEdit = useCallback(() => {
    const patch = buildSourceInlineEditPatch(row, draftValue);
    setEditingField(null);
    setDraftValue("");
    if (!patch) return;
    onInlineEditSave?.(row, patch);
  }, [row, draftValue, onInlineEditSave]);

  if (!row?.idProduct?.trim()) return null;

  const isSub = row.productType === "sub";
  const idCellClass = isSub ? "id-product sub-id-product" : "id-product";
  const idDisplay = formatIdProductDisplay(row);
  const displayId = idDisplay.text;
  const currencyDisplay = row.currency
    ? row.currency.startsWith("(")
      ? row.currency
      : `(${row.currency})`
    : "";

  const formulaText = row.formulaDisplay || row.formula || "";
  const sourceDisplay = formatSourcePercentForDisplay(row.sourcePercent || "1");

  return (
    <tr
      className={row.selectChecked ? "summary-row-selected" : undefined}
      data-row-index={String(row.rowIndex)}
      data-product-type={row.productType}
      data-react-row-key={row.key}
      data-parent-id-product={isSub ? row.parentIdProduct || row.idProduct : undefined}
      data-parent-row-index={
        isSub && row.parentRowIndex != null ? String(row.parentRowIndex) : undefined
      }
      data-account-id={row.accountId || undefined}
      data-currency-id={row.currencyId || undefined}
      data-source-columns={row.sourceColumns || undefined}
      data-formula-operators={row.formulaOperators || undefined}
      data-source-percent={row.sourcePercent || undefined}
      data-template-id={row.templateId != null ? String(row.templateId) : undefined}
      data-formula-variant={row.formulaVariant != null ? String(row.formulaVariant) : undefined}
      data-original-description={row.originalDescription || undefined}
      data-base-processed-amount={row.baseProcessedAmount || undefined}
      data-final-processed-amount={row.processedAmount || undefined}
    >
      <td
        className={idCellClass}
        data-main-product={idDisplay.mainProduct || row.idProduct}
        data-sub-product={idDisplay.subProduct || ""}
        title={idDisplay.title}
      >
        {displayId}
      </td>
      <td data-account-id={row.accountId || undefined}>{row.account || ""}</td>
      <td>
        <button type="button" className="add-account-btn" onClick={() => onNewFormula?.(row)}>
          +
        </button>
      </td>
      <td data-currency-id={row.currencyId || undefined}>{currencyDisplay}</td>
      <td style={editingField === "formula" ? { overflow: "hidden", padding: 0 } : undefined}>
        <div
          className="formula-cell-content"
          style={
            editingField === "formula"
              ? { width: "100%", display: "block", margin: 0, padding: 0 }
              : undefined
          }
        >
          {editingField === "formula" ? (
            <SummaryInlineEditInput
              value={draftValue}
              onChange={setDraftValue}
              onSave={saveFormulaEdit}
              onCancel={cancelEdit}
            />
          ) : (
            <>
              <span
                className="formula-text editable-cell"
                title={row.inputMethod || undefined}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (formulaText.trim()) startFormulaEdit();
                }}
              >
                {formulaText}
              </span>
              {formulaText.trim() ? (
                <button
                  type="button"
                  className="edit-formula-btn"
                  title="Edit Row Data"
                  onClick={() => onEditFormula?.(row)}
                >
                  ✏️
                </button>
              ) : null}
            </>
          )}
        </div>
      </td>
      <td
        className="editable-cell"
        style={
          editingField === "source"
            ? { overflow: "hidden", position: "relative", maxWidth: "100%" }
            : undefined
        }
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (editingField !== "source") startSourceEdit();
        }}
      >
        {editingField === "source" ? (
          <SummaryInlineEditInput
            value={draftValue}
            onChange={setDraftValue}
            onSave={saveSourceEdit}
            onCancel={cancelEdit}
            placeholder="e.g. 1 or 2 or 0.5"
          />
        ) : (
          sourceDisplay
        )}
      </td>
      <td style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          className="rate-checkbox"
          checked={!!row.rateChecked}
          onChange={(e) => handleField({ rateChecked: e.target.checked })}
        />
      </td>
      <td
        className="editable-cell"
        style={{ textAlign: "center", cursor: "text" }}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => handleField({ rateValue: e.currentTarget.textContent?.trim() || "" })}
      >
        {row.rateValue || ""}
      </td>
      <td style={{ color: formatAmountColor(row.processedAmountDisplay || row.processedAmount) }}>
        {row.processedAmountDisplay || row.processedAmount || ""}
      </td>
      <td style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          className="summary-select-checkbox"
          checked={!!row.selectChecked}
          onChange={(e) => handleField({ selectChecked: e.target.checked })}
        />
      </td>
      <td style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          className="summary-row-checkbox"
          data-value={row.idProduct}
          checked={!!row.deleteChecked}
          disabled={isSub && !row.account?.trim()}
          title={isSub && !row.account?.trim() ? "Empty sub rows cannot be deleted" : undefined}
          onChange={(e) => handleField({ deleteChecked: e.target.checked })}
        />
      </td>
    </tr>
  );
}

const SummaryTableRow = memo(SummaryTableRowInner);

export default SummaryTableRow;
