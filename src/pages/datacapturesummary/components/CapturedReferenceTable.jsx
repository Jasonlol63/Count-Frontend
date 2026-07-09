import { useCallback } from "react";

function parseCellMeta(cell, rowIndex, rowData) {
  let idProduct = cell.getAttribute("data-id-product");
  const rowLabel = cell.getAttribute("data-row-label") || "";
  const columnIndexAttr = cell.getAttribute("data-column-index");
  let displayColumnIndex =
    columnIndexAttr != null && columnIndexAttr !== "" ? parseInt(columnIndexAttr, 10) : null;

  if (!idProduct && rowData?.[1]?.type === "data") {
    idProduct = String(rowData[1].value || "").trim();
  }

  let dataColumnIndex = null;
  if (displayColumnIndex != null && !Number.isNaN(displayColumnIndex)) {
    if (displayColumnIndex >= 2) dataColumnIndex = displayColumnIndex - 1;
    else if (displayColumnIndex === 1) return null;
  }

  return {
    idProduct: idProduct || "",
    rowLabel,
    rowIndex,
    displayColumnIndex,
    dataColumnIndex,
    value: cell.textContent?.trim() || "",
  };
}

/**
 * Hidden reference table — cell click inserts into open formula editor.
 */
export default function CapturedReferenceTable({ tableData, onCapturedCellClick }) {
  const handleCellClick = useCallback(
    (cell, rowIndex, rowData) => {
      const meta = parseCellMeta(cell, rowIndex, rowData);
      if (!meta || meta.dataColumnIndex == null) return;
      onCapturedCellClick?.(meta);
    },
    [onCapturedCellClick]
  );

  if (!tableData?.headers?.length) return null;

  return (
    <div
      className="summary-table-container captured-table-container"
      style={{ display: "none" }}
      aria-hidden="true"
    >
      <div className="table-header">
        <span>Data Capture Table</span>
      </div>
      <div className="table-wrapper">
        <table className="summary-table" id="capturedDataTable">
          <thead id="capturedTableHeader">
            <tr>
              {tableData.headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody id="capturedTableBody">
            {tableData.rows.map((rowData, rowIndex) => {
              let rowLabel = "";
              if (rowData.length > 0 && rowData[0]?.type === "header") {
                rowLabel = String(rowData[0].value || "").trim();
              }
              const idProduct =
                rowData[1]?.type === "data" ? String(rowData[1].value || "").trim() : "";

              return (
                <tr
                  key={`cap-row-${rowIndex}`}
                  data-id-product={idProduct || undefined}
                  data-row-index={String(rowIndex)}
                >
                  {rowData.map((cellData, colIndex) => {
                    if (cellData.type === "header") {
                      return (
                        <td
                          key={`cap-${rowIndex}-${colIndex}`}
                          className="row-header"
                          style={{
                            backgroundColor: "#f6f8fa",
                            fontWeight: "bold",
                            color: "#24292f",
                            minWidth: "30px",
                          }}
                        >
                          {cellData.value}
                        </td>
                      );
                    }

                    const columnIndex = colIndex;
                    const cellPosition = rowLabel ? `${rowLabel}${columnIndex}` : undefined;

                    return (
                      <td
                        key={`cap-${rowIndex}-${colIndex}`}
                        className="clickable-table-cell"
                        style={{ textAlign: "center", minWidth: "40px", cursor: "pointer" }}
                        data-column-index={columnIndex}
                        data-row-label={rowLabel || undefined}
                        data-cell-position={cellPosition}
                        data-id-product={idProduct || undefined}
                        title={colIndex === 1 && idProduct ? idProduct : undefined}
                        onClick={(e) => handleCellClick(e.currentTarget, rowIndex, rowData)}
                      >
                        {cellData.value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
