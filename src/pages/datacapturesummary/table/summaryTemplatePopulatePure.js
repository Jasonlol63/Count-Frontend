import { buildColumnAEntries } from "./summaryColumnAData.js";
import {
  clearRowEditableFields,
  createMainRowFromEntry,
  createSubRowFromTemplate,
  applyMainTemplateToRowModel,
} from "./summaryRowData.js";
import { findMainRowForTemplate, findMainRowForSubTemplatePure } from "./summaryTemplateMatching.js";
import { fetchSummaryTemplates } from "../lib/summaryApi.js";
import { normalizeSummaryIdProductText } from "../lib/summaryIdProductUtils.js";
import { restoreRateValuesOnRows } from "../lib/summaryRefreshRestore.js";
import {
  applySavedRefreshRowToModel,
  buildSummaryRowStableKey,
  buildSummaryRowStableKeyBase,
  buildSummaryRowStableKeyFromSaved,
  resolveSummaryRefreshSavedState,
} from "../lib/summaryRefreshStatePure.js";
import {
  isParentRowSuppressed,
  isRowSuppressed,
  loadSuppressedRowKeys,
} from "../lib/summarySuppressedRows.js";
import { mapRowsWithAmountRecalc } from "./summaryRowAmount.js";

function isInheritedAccountLinkMainTemplate(m) {
  const id = m?.id != null ? String(m.id) : "";
  return /^\d+_\d+$/.test(id);
}

function reconcileRowIndexes(rows, tableData) {
  if (!tableData?.rows?.length) return rows;

  const idProductToRowIndexes = new Map();
  tableData.rows.forEach((rowData, capturedIndex) => {
    if (rowData.length <= 1 || rowData[1]?.type !== "data") return;
    const cellValue = String(rowData[1].value || "").trim();
    if (!cellValue) return;
    const norm = normalizeSummaryIdProductText(cellValue);
    if (!idProductToRowIndexes.has(norm)) {
      idProductToRowIndexes.set(norm, []);
    }
    idProductToRowIndexes.get(norm).push(capturedIndex);
  });

  const occurrenceCounter = new Map();
  return rows.map((row) => {
    if (row.productType !== "main") return row;
    const norm = normalizeSummaryIdProductText(row.idProduct);
    const indexes = idProductToRowIndexes.get(norm) || [];
    const used = occurrenceCounter.get(norm) || 0;
    const matched = used < indexes.length ? indexes[used] : undefined;
    occurrenceCounter.set(norm, used + 1);
    if (matched !== undefined && matched >= 0) {
      return { ...row, rowIndex: matched };
    }
    return row;
  });
}

function insertSubRowAfter(rows, parentRow, subRow) {
  const parentKey = parentRow.key;
  const idx = rows.findIndex((r) => r.key === parentKey);
  if (idx < 0) {
    return [...rows, subRow];
  }
  let insertAt = idx + 1;
  const parentNorm = normalizeSummaryIdProductText(parentRow.idProduct);
  while (insertAt < rows.length) {
    const next = rows[insertAt];
    if (next.productType !== "sub") break;
    if (normalizeSummaryIdProductText(next.parentIdProduct || "") !== parentNorm) break;
    insertAt += 1;
  }
  const next = rows.slice();
  next.splice(insertAt, 0, subRow);
  return next;
}

function applySubsForParent(rows, parentIdProduct, subTemplates) {
  const appliedIds = new Set();
  let result = rows;

  for (const sub of subTemplates) {
    if (!sub) continue;
    const tplId = sub.id != null ? `id:${sub.id}` : null;
    const fp = `${parentIdProduct}|${sub.account_id}|${sub.sub_order}|${sub.formula_variant}`;
    if (appliedIds.has(fp) || (tplId && appliedIds.has(tplId))) continue;

    const mainRow = findMainRowForSubTemplatePure(result, parentIdProduct, sub);
    if (!mainRow) continue;

    let subRow = createSubRowFromTemplate(mainRow, sub, result.length);
    subRow = applyMainTemplateToRowModel(subRow, sub, parentIdProduct);
    result = insertSubRowAfter(result, mainRow, subRow);
    appliedIds.add(fp);
    if (tplId) appliedIds.add(tplId);
  }
  return result;
}

function rowHasTemplate(rows, mainId, templates) {
  if (templates[mainId]) return true;
  const norm = normalizeSummaryIdProductText(mainId);
  for (const key of Object.keys(templates)) {
    if (normalizeSummaryIdProductText(key) === norm) return true;
    if (mainId.startsWith(`${key} `) || mainId.startsWith(`${key}(`)) return true;
  }
  return false;
}

/** Id Product skeleton rows from capture table — sync, no API (stable table chrome while templates load). */
export function buildInitialSummaryRows(tableData) {
  if (!tableData) return [];
  const { entries } = buildColumnAEntries(tableData);
  const rows = entries
    .filter((e) => e.idProduct?.trim())
    .map((entry, index) => createMainRowFromEntry(entry, index));
  return reconcileRowIndexes(rows, tableData);
}

/**
 * Build fully populated summary rows from capture table + templates API.
 */
export async function populateSummaryRowsPure({
  tableData,
  processId,
  processCode = "",
  companyId,
  captureScope,
  captureId = null,
  serverState = null,
  freshFromCapture = false,
  loadTemplates = null,
}) {
  const { idProducts } = buildColumnAEntries(tableData);
  let rows = buildInitialSummaryRows(tableData);

  if (processId == null || !idProducts.length) {
    return rows;
  }

  const fetchTemplates =
    typeof loadTemplates === "function"
      ? loadTemplates
      : () =>
          fetchSummaryTemplates({
            captureScope,
            companyId,
            idProducts,
            processId,
            captureId,
          });
  const { templates, subsByParent } = await fetchTemplates();

  const suppressed = freshFromCapture ? new Set() : loadSuppressedRowKeys();
  const appliedMainKeys = new Set();

  for (const templateKey of Object.keys(templates)) {
    const template = templates[templateKey];
    if (!template) continue;

    if (template.allMains && Array.isArray(template.allMains) && template.allMains.length > 0) {
      const sortedMains = [...template.allMains]
        .filter((m) => !isInheritedAccountLinkMainTemplate(m))
        .sort((a, b) => {
          const ai = a.row_index != null ? Number(a.row_index) : 999999;
          const bi = b.row_index != null ? Number(b.row_index) : 999999;
          return ai - bi;
        });

      for (const mainTemplate of sortedMains) {
        const mainIdProduct = mainTemplate.id_product || templateKey;
        const target = findMainRowForTemplate(rows, mainIdProduct, mainTemplate, appliedMainKeys);
        if (!target || isRowSuppressed(target, suppressed)) continue;
        const idx = rows.findIndex((r) => r.key === target.key);
        if (idx < 0) continue;
        rows[idx] = applyMainTemplateToRowModel(rows[idx], mainTemplate, templateKey);
        appliedMainKeys.add(target.key);
      }
    } else {
      const mainTemplate = template.main || template;
      const target = findMainRowForTemplate(rows, templateKey, mainTemplate, appliedMainKeys);
      if (target && !isRowSuppressed(target, suppressed)) {
        const idx = rows.findIndex((r) => r.key === target.key);
        if (idx >= 0) {
          rows[idx] = applyMainTemplateToRowModel(rows[idx], mainTemplate, templateKey);
          appliedMainKeys.add(target.key);
        }
      }
    }
  }

  if (subsByParent && typeof subsByParent === "object") {
    for (const parentId of Object.keys(subsByParent)) {
      const subs = subsByParent[parentId];
      if (!Array.isArray(subs) || subs.length === 0) continue;
      const parentRow = rows.find(
        (r) =>
          r.productType === "main" &&
          normalizeSummaryIdProductText(r.idProduct) === normalizeSummaryIdProductText(parentId)
      );
      if (parentRow && isRowSuppressed(parentRow, suppressed)) continue;
      rows = applySubsForParent(rows, parentId, subs);
    }
  }

  rows = rows.map((row) => {
    if (row.productType !== "main") return row;
    const mainId = String(row.idProduct || "").trim();
    if (!mainId || rowHasTemplate(rows, mainId, templates)) return row;
    if (!row.templateApplied) {
      return {
        ...row,
        formula: "",
        formulaDisplay: "",
        formulaOperators: "",
        sourceColumns: "",
      };
    }
    return row;
  });

  if (!freshFromCapture) {
    rows = restoreRefreshStateRows(rows, serverState, suppressed, captureScope, {
      processId,
      processCode,
    });
  }

  rows = rows
    .filter((row) => row.productType !== "sub" || !isParentRowSuppressed(row, rows, suppressed))
    .map((row) => (isRowSuppressed(row, suppressed) ? clearRowEditableFields(row) : row));

  rows = sortRowsByRowIndex(rows);
  rows = restoreRateValuesOnRows(rows, captureScope);
  rows = mapRowsWithAmountRecalc(rows);
  return rows;
}

function sortRowsByRowIndex(rows) {
  const mains = rows.filter((r) => r.productType === "main");
  const subs = rows.filter((r) => r.productType === "sub");
  const sortedMains = [...mains].sort((a, b) => a.rowIndex - b.rowIndex);
  const result = [];
  for (const main of sortedMains) {
    result.push(main);
    const mainNorm = normalizeSummaryIdProductText(main.idProduct);
    const childSubs = subs
      .filter(
        (s) =>
          normalizeSummaryIdProductText(s.parentIdProduct || "") === mainNorm ||
          s.parentRowIndex === main.rowIndex
      )
      .sort((a, b) => (a.subOrder ?? 0) - (b.subOrder ?? 0));
    result.push(...childSubs);
  }
  const placed = new Set(result.map((r) => r.key));
  for (const row of rows) {
    if (!placed.has(row.key)) result.push(row);
  }
  return result;
}

function findSavedRowForRestore(row, savedRows, usedSaved) {
  if (!row || !Array.isArray(savedRows) || savedRows.length === 0) return null;

  const rowKey = row.key ? String(row.key).trim() : "";
  if (rowKey) {
    const byKey = savedRows.find((s) => s.rowKey === rowKey && !usedSaved.has(s));
    if (byKey) return byKey;
  }

  const stableKey = buildSummaryRowStableKey(row);
  const stableBase = buildSummaryRowStableKeyBase(row);

  for (const saved of savedRows) {
    if (usedSaved.has(saved)) continue;
    const savedStable = buildSummaryRowStableKeyFromSaved(saved);
    if (savedStable === stableKey || savedStable === stableBase) return saved;
    const savedBase = savedStable.split("\t").slice(0, 7).join("\t");
    if (savedBase === stableBase) return saved;
  }

  const normId = normalizeSummaryIdProductText(row.idProduct);
  const rowAccountId = row.accountId != null ? String(row.accountId) : "";
  const rowAccount = String(row.account || "").trim();
  const rowFv = row.formulaVariant != null ? String(row.formulaVariant) : "";
  const rowSub = row.subOrder != null ? Number(row.subOrder) : 0;

  for (const saved of savedRows) {
    if (usedSaved.has(saved)) continue;
    if (normalizeSummaryIdProductText(saved.idProduct || saved.id_product) !== normId) continue;

    const savedAccountId = saved.accountId != null ? String(saved.accountId) : "";
    if (rowAccountId && savedAccountId && rowAccountId !== savedAccountId) continue;
    if (
      !rowAccountId &&
      !savedAccountId &&
      rowAccount &&
      saved.account &&
      rowAccount !== String(saved.account).trim()
    ) {
      continue;
    }

    const savedFv = saved.formulaVariant != null ? String(saved.formulaVariant) : "";
    if (rowFv && savedFv && rowFv !== savedFv) continue;

    const savedSub = saved.subOrder != null ? Number(saved.subOrder) : 0;
    if (row.productType === "sub" && savedSub !== rowSub) continue;

    return saved;
  }

  return null;
}

function mergeServerStateRows(rows, serverRows, suppressed = loadSuppressedRowKeys()) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const usedSaved = new Set();

  for (const row of rows) {
    if (isRowSuppressed(row, suppressed)) continue;
    const saved = findSavedRowForRestore(row, serverRows, usedSaved);
    if (!saved) continue;
    usedSaved.add(saved);
    byKey.set(row.key, applySavedRefreshRowToModel(row, saved));
  }

  return rows.map((r) => byKey.get(r.key) || r);
}

function restoreRefreshStateRows(
  rows,
  serverState,
  suppressed = loadSuppressedRowKeys(),
  captureScope = null,
  processMeta = null,
) {
  const saved = resolveSummaryRefreshSavedState(serverState, captureScope, processMeta);
  if (!saved?.rows?.length) {
    return rows;
  }
  return mergeServerStateRows(rows, saved.rows, suppressed);
}
