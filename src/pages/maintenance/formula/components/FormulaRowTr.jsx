import { memo } from "react";
import { toUpperDisplay } from "../formulaMaintenanceLogic.js";
import { assetUrl } from "../../../../utils/core/apiUrl.js";

/**
 * Memoized formula table row (virtual list). Avoids re-rendering all visible rows on parent updates.
 */
const FormulaRowTr = memo(function FormulaRowTr({
  row,
  rowIndex,
  selected,
  onToggleSelect,
  onEdit,
  m,
}) {
  const stripeClass = rowIndex % 2 === 1 ? "formula-data-row--stripe" : "";

  return (
    <tr className={`formula-data-row ${stripeClass}`}>
      <td className="maintenance-table-cell">{row.no}</td>
      <td className="maintenance-table-cell">{row._process ?? toUpperDisplay(row.process)}</td>
      <td className="maintenance-table-cell">
        <span className="account-display">{row._account ?? toUpperDisplay(row.account)}</span>
      </td>
      <td className="maintenance-table-cell maintenance-cell-currency">
        {row._currency ?? toUpperDisplay(row.currency)}
      </td>
      <td className="maintenance-table-cell formula-cell-text">
        <span className="source-display" title={row.source}>
          {row._source ?? toUpperDisplay(row.source)}
        </span>
      </td>
      <td className="maintenance-table-cell">{row._product ?? toUpperDisplay(row.product)}</td>
      <td className="maintenance-table-cell formula-cell-text">
        <span className="input-method-display" title={row.input_method}>
          {row._inputMethod ?? toUpperDisplay(row.input_method)}
        </span>
      </td>
      <td className="maintenance-table-cell formula-cell-text">
        <span className="formula-display" title={row.formula}>
          {row._formula ?? toUpperDisplay(row.formula)}
        </span>
      </td>
      <td className="maintenance-table-cell formula-cell-text">
        <span className="description-display">{row._description ?? toUpperDisplay(row.description)}</span>
      </td>
      <td className="maintenance-table-cell maintenance-cell-checkbox">
        <div className="maintenance-formula-actions-inner">
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
        </div>
      </td>
    </tr>
  );
});

export default FormulaRowTr;
