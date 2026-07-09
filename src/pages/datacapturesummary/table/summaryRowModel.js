function normalizeIdProduct(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

/**
 * Insert a sub-row descriptor after the row matching insertAfterKey (or after parent main block).
 */
export function insertSubRowInModel(rows, parentProcessValue, insertAfterKey, rowIndex) {
  const parentTrimmed = String(parentProcessValue || "").trim();
  const parentNorm = normalizeIdProduct(parentTrimmed);
  const numericRowIndex =
    rowIndex != null && rowIndex !== "" && !Number.isNaN(Number(rowIndex)) ? Number(rowIndex) : null;

  let parentRowIndexValue = null;
  const resolveParentMain = (mainRow) => {
    if (!mainRow || mainRow.productType !== "main") return;
    const mainRaw = String(mainRow.idProduct || "").trim();
    if (mainRaw === parentTrimmed || normalizeIdProduct(mainRaw) === parentNorm) {
      parentRowIndexValue = mainRow.rowIndex;
    }
  };

  if (insertAfterKey) {
    const anchorIdx = rows.findIndex((r) => r.key === insertAfterKey);
    if (anchorIdx >= 0) {
      const anchor = rows[anchorIdx];
      if (anchor.productType === "main") {
        resolveParentMain(anchor);
      } else if (anchor.parentRowIndex != null) {
        parentRowIndexValue = anchor.parentRowIndex;
      } else {
        for (let i = anchorIdx; i >= 0; i -= 1) {
          if (rows[i].productType === "main") {
            resolveParentMain(rows[i]);
            break;
          }
        }
      }
    }
  }
  if (parentRowIndexValue === null) {
    for (const row of rows) {
      if (row.productType !== "main") continue;
      resolveParentMain(row);
      if (parentRowIndexValue !== null && row.idProduct?.trim() === parentTrimmed) break;
    }
  }

  const newRow = {
    key: `sub-${parentRowIndexValue ?? "na"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    idProduct: parentTrimmed,
    rowIndex: numericRowIndex ?? parentRowIndexValue ?? 0,
    productType: "sub",
    parentIdProduct: parentTrimmed,
    parentRowIndex: parentRowIndexValue,
    subOrder: 1,
  };

  if (insertAfterKey) {
    const idx = rows.findIndex((r) => r.key === insertAfterKey);
    if (idx >= 0) {
      const next = rows.slice();
      next.splice(idx + 1, 0, newRow);
      return { rows: next, newKey: newRow.key };
    }
  }

  let insertIdx = rows.length;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.productType !== "main") continue;
    if (normalizeIdProduct(row.idProduct) !== parentNorm) continue;
    insertIdx = i + 1;
    while (
      insertIdx < rows.length &&
      rows[insertIdx].productType === "sub" &&
      normalizeIdProduct(rows[insertIdx].parentIdProduct) === parentNorm
    ) {
      insertIdx += 1;
    }
    break;
  }

  const next = rows.slice();
  next.splice(insertIdx, 0, newRow);
  return { rows: next, newKey: newRow.key };
}
