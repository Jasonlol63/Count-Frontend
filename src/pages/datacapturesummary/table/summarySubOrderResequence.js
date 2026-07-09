import { normalizeSummaryIdProductText } from "../lib/summaryIdProductUtils.js";

/**
 * Resequence sub_order for one Id Product group (legacy resequenceSubOrdersForGroup).
 * Main rows get subOrder null; subs get 1,2,3… in table order.
 */
export function resequenceSubOrdersInRows(rows, parentIdProduct) {
  if (!Array.isArray(rows) || !parentIdProduct) return rows;

  const parentNorm = normalizeSummaryIdProductText(parentIdProduct);
  const groupKeys = new Set();
  const indices = [];

  rows.forEach((row, index) => {
    if (row.productType === "main") {
      if (normalizeSummaryIdProductText(row.idProduct) === parentNorm) {
        groupKeys.add(row.key);
        indices.push(index);
      }
      return;
    }
    if (row.productType === "sub") {
      const parent = normalizeSummaryIdProductText(row.parentIdProduct || "");
      if (parent === parentNorm) {
        groupKeys.add(row.key);
        indices.push(index);
      }
    }
  });

  if (!indices.length) return rows;

  let order = 0;
  const orderByKey = new Map();
  for (const index of indices.sort((a, b) => a - b)) {
    const row = rows[index];
    if (row.productType === "main") {
      order = 0;
      orderByKey.set(row.key, null);
    } else {
      order += 1;
      orderByKey.set(row.key, order);
    }
  }

  return rows.map((row) => {
    if (!orderByKey.has(row.key)) return row;
    return { ...row, subOrder: orderByKey.get(row.key) };
  });
}

/** Resequence all parent groups that contain subs. */
export function resequenceAllSubOrders(rows) {
  if (!Array.isArray(rows)) return rows;
  const parents = new Set();
  for (const row of rows) {
    if (row.productType !== "sub") continue;
    const parent = String(row.parentIdProduct || row.idProduct || "").trim();
    if (parent) parents.add(parent);
  }
  let next = rows;
  for (const parent of parents) {
    next = resequenceSubOrdersInRows(next, parent);
  }
  return next;
}

/** Persist resequenced sub_order values to backend (legacy post-save group sync). */
export async function syncSubOrderTemplates(rows, parentIdProduct, saveTemplateFn) {
  if (!saveTemplateFn || !parentIdProduct) return;
  const parentNorm = normalizeSummaryIdProductText(parentIdProduct);
  const subs = rows.filter(
    (r) =>
      r.productType === "sub" &&
      normalizeSummaryIdProductText(r.parentIdProduct || "") === parentNorm &&
      r.account?.trim()
  );
  for (const row of subs) {
    try {
      await saveTemplateFn(row);
    } catch (e) {
      console.warn("Failed to sync sub_order for row", row.key, e);
    }
  }
}
