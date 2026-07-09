import { createFormulaDisplayFromExpression } from "../../../shared/formula/index.js";
import {
  calculateFormulaResultFromExpression,
  evaluateFormulaExpression,
  parseReferenceFormula,
} from "./summaryFormulaReference.js";
import {
  formatProcessedAmountDisplay,
  roundProcessedAmountTo2Decimals,
} from "../table/summaryRowAmount.js";
import { formatNegativeNumbersInFormula, parseIdProductColumnRef } from "./summaryFormulaParseUtils.js";
import { normalizeSummaryIdProductText } from "../lib/summaryIdProductUtils.js";

function normalizeSpaces(text) {
  return String(text || "").trim().replace(/\s+/g, "");
}

/**
 * Account label for Summary UI — matches backend template display:
 * `CODE [Name]` when both exist (see resolveAccountDisplayInTemplates in summary_api.php).
 */
export function formatSummaryAccountDisplay(acc, fallbackId = "") {
  const existing = String(acc?.account_display || acc?.account || "").trim();
  if (existing) return existing;

  const code = String(acc?.account_id ?? acc?.code ?? "").trim();
  const name = String(acc?.name ?? "").trim();
  const id = String(acc?.id ?? fallbackId ?? "").trim();

  if (code && name) return `${code} [${name}]`;
  if (code) return code;
  if (name) return name;
  return id;
}

/** Legacy: enableSourcePercent when source field is non-empty (including default 1). */
export function resolveEnableSourcePercent(sourcePercent) {
  return String(sourcePercent ?? "").trim() !== "";
}

function hasFormulaCellReferences(formula) {
  return /\[\s*[^,\]]+\s*,\s*\d+\s*\]|\$\d+/.test(String(formula || ""));
}

/**
 * Legacy updateFormulaDisplay — expand $/[id,n] refs to values; do not evaluate to a total.
 */
export function buildExpandedFormulaDisplay(formulaValue, processValue, clickedRefs, rowIndex) {
  const trimmed = String(formulaValue || "").trim();
  if (!trimmed) return "";

  let displayFormula = trimmed;
  if (hasFormulaCellReferences(trimmed)) {
    try {
      const parsed = parseReferenceFormula(trimmed, processValue, clickedRefs, rowIndex);
      if (parsed != null && String(parsed).trim() !== "") {
        displayFormula = String(parsed).trim();
      }
    } catch {
      displayFormula = trimmed;
    }
  }

  return formatNegativeNumbersInFormula(displayFormula);
}

function getCapturedRowLabel(rowData) {
  if (rowData?.[0]?.type === "header") {
    return String(rowData[0].value || "").trim();
  }
  return "";
}

function capturedRowMatchesIdProduct(rowData, targetIdProduct) {
  if (!rowData || rowData[1]?.type !== "data") return false;
  const rowValue = String(rowData[1].value || "").trim();
  const target = String(targetIdProduct || "").trim();
  if (!rowValue || !target) return false;
  return (
    rowValue === target ||
    normalizeSpaces(rowValue) === normalizeSpaces(target) ||
    normalizeSummaryIdProductText(rowValue) === normalizeSummaryIdProductText(target)
  );
}

function resolveCapturedRowForFormulaGrid(tableData, anchorRow) {
  if (!tableData?.rows?.length || !anchorRow) return null;

  let idProduct = String(anchorRow.idProduct || "").trim();
  if (anchorRow.productType === "sub" && anchorRow.parentIdProduct) {
    idProduct = String(anchorRow.parentIdProduct).trim();
  }
  if (!idProduct) return null;

  let rowLabel = null;
  const anchorRowIndex =
    anchorRow.rowIndex != null && !Number.isNaN(Number(anchorRow.rowIndex))
      ? Number(anchorRow.rowIndex)
      : null;

  if (anchorRowIndex != null && anchorRowIndex >= 0 && anchorRowIndex < tableData.rows.length) {
    const indexedRow = tableData.rows[anchorRowIndex];
    if (capturedRowMatchesIdProduct(indexedRow, idProduct)) {
      const matchedLabel = getCapturedRowLabel(indexedRow);
      if (matchedLabel) rowLabel = matchedLabel;
    }
  }

  if (!rowLabel) {
    const lastColonIndex = idProduct.lastIndexOf(":");
    if (lastColonIndex > 0 && lastColonIndex < idProduct.length - 1) {
      const afterColon = idProduct.substring(lastColonIndex + 1).trim();
      if (/^[A-Z]$/i.test(afterColon) || afterColon.length <= 3) {
        idProduct = idProduct.substring(0, lastColonIndex).trim();
        rowLabel = afterColon;
      }
    }
  }

  if (anchorRowIndex != null && anchorRowIndex >= 0 && anchorRowIndex < tableData.rows.length) {
    const indexedRow = tableData.rows[anchorRowIndex];
    if (capturedRowMatchesIdProduct(indexedRow, idProduct)) {
      return { rowData: indexedRow, rowIndex: anchorRowIndex };
    }
  }

  for (let i = 0; i < tableData.rows.length; i += 1) {
    const rowData = tableData.rows[i];
    if (!capturedRowMatchesIdProduct(rowData, idProduct)) continue;
    if (rowLabel) {
      const headerLabel = getCapturedRowLabel(rowData);
      if (headerLabel !== rowLabel) continue;
    }
    return { rowData, rowIndex: i };
  }

  return null;
}

/**
 * Row data chips shown below Formula in Edit Formula (legacy #formulaDataGrid).
 * @returns {Array<{ rowIndex: number, columnIndex: number, value: string, idProduct: string, rowLabel: string }>}
 */
export function buildFormulaDataGridItems(tableData, anchorRow) {
  const matched = resolveCapturedRowForFormulaGrid(tableData, anchorRow);
  if (!matched) return [];

  const { rowData, rowIndex } = matched;
  const idProduct = String(rowData[1]?.value || "").trim();
  const rowLabel = getCapturedRowLabel(rowData);
  const items = [];

  rowData.forEach((cell, colIndex) => {
    if (colIndex < 2 || cell?.type !== "data") return;
    const value = String(cell.value ?? "").trim();
    if (!value) return;
    items.push({
      rowIndex,
      columnIndex: colIndex,
      value,
      idProduct,
      rowLabel,
    });
  });

  return items;
}

export function createEmptyEditFormulaForm(processValue = "") {
  return {
    processValue: processValue || "",
    accountId: "",
    accountText: "",
    sourcePercent: "1",
    descriptionSelect1: "",
    descriptionSelect2: "",
    formula: "",
    formulaDisplay: "",
    clickedColumns: "",
    inputMethod: "",
    currencyId: "",
    currencyLabel: "",
    description: "",
  };
}

export function rowToEditFormulaForm(row) {
  if (!row) return createEmptyEditFormulaForm();
  const formulaText =
    row.formulaOperators || row.formula || row.formulaDisplay || "";
  return {
    processValue: row.idProduct || "",
    accountId: row.accountId ? String(row.accountId) : "",
    accountText: row.account || "",
    sourcePercent: row.sourcePercent || "1",
    descriptionSelect1: "",
    descriptionSelect2: "",
    formula: formulaText,
    formulaDisplay: row.formulaDisplay || "",
    clickedColumns: row.clickedColumns || "",
    inputMethod: row.inputMethod || "",
    currencyId: row.currencyId ? String(row.currencyId) : "",
    currencyLabel: row.currency ? String(row.currency).replace(/[()]/g, "").trim() : "",
    description: row.originalDescription || "",
  };
}

export function createBlankEditFormulaForm(row) {
  return createEmptyEditFormulaForm(row?.idProduct || "");
}

/** Parse descriptionSelect1 value — id_product or id_product:row_label (legacy updateIdProductRowData). */
export function parseIdProductSelectValue(idProductValue) {
  const raw = String(idProductValue || "").trim();
  if (!raw) return { idProduct: "", rowLabel: null };

  const lastColonIndex = raw.lastIndexOf(":");
  if (lastColonIndex > 0 && lastColonIndex < raw.length - 1) {
    const afterColon = raw.substring(lastColonIndex + 1).trim();
    if (/^[A-Z]$/i.test(afterColon) || afterColon.length <= 3) {
      return {
        idProduct: raw.substring(0, lastColonIndex).trim(),
        rowLabel: afterColon,
      };
    }
  }
  return { idProduct: raw, rowLabel: null };
}

/**
 * Id Product options for Data dropdown (legacy loadIdProductList).
 * @returns {Array<{ value: string, label: string, rowIndex: number, idProduct: string }>}
 */
export function buildIdProductSelectOptions(tableData) {
  const entries = [];
  if (!tableData?.rows?.length) return entries;

  tableData.rows.forEach((rowData, rowIndex) => {
    if (rowData[1]?.type !== "data") return;
    const idProduct = String(rowData[1].value || "").trim();
    if (!idProduct) return;
    const rowLabel = rowData[0]?.type === "header" ? String(rowData[0].value || "").trim() : "";
    entries.push({ idProduct, rowLabel, rowIndex });
  });

  const countMap = new Map();
  entries.forEach((e) => countMap.set(e.idProduct, (countMap.get(e.idProduct) || 0) + 1));

  return entries.map((item) => {
    const count = countMap.get(item.idProduct);
    if (count > 1 && item.rowLabel) {
      return {
        value: `${item.idProduct}:${item.rowLabel}`,
        label: `${item.idProduct} (${item.rowLabel})`,
        rowIndex: item.rowIndex,
        idProduct: item.idProduct,
      };
    }
    return {
      value: item.idProduct,
      label: item.idProduct,
      rowIndex: item.rowIndex,
      idProduct: item.idProduct,
    };
  });
}

/**
 * Row Data options for selected id product (legacy updateIdProductRowData).
 * @returns {Array<{ value: string, label: string }>}
 */
export function buildRowDataOptionsForIdProduct(tableData, idProductSelectValue) {
  const { idProduct, rowLabel } = parseIdProductSelectValue(idProductSelectValue);
  if (!idProduct || !tableData?.rows?.length) return [];

  const normTarget = normalizeSummaryIdProductText(idProduct);
  const options = [];

  tableData.rows.forEach((rowData, rowIndex) => {
    if (rowData[1]?.type !== "data") return;
    const rowId = String(rowData[1].value || "").trim();
    const idMatches =
      rowId === idProduct ||
      normalizeSpaces(rowId) === normalizeSpaces(idProduct) ||
      normalizeSummaryIdProductText(rowId) === normTarget;
    if (!idMatches) return;

    const headerLabel = rowData[0]?.type === "header" ? String(rowData[0].value || "").trim() : "";
    if (rowLabel && headerLabel !== rowLabel) return;

    rowData.forEach((cell, colIndex) => {
      if (colIndex < 2 || cell?.type !== "data") return;
      const cellValue = String(cell.value ?? "").trim();
      if (!cellValue) return;
      options.push({
        value: `${rowIndex}:${colIndex}`,
        label: `[${colIndex}] ${cellValue}`,
      });
    });
  });

  return options;
}

/** Auto-select Data dropdowns when opening Edit Formula (legacy loadIdProductList). */
export function resolveDefaultDescriptionSelects(tableData, anchorRow) {
  const idProductOptions = buildIdProductSelectOptions(tableData);
  if (!idProductOptions.length) {
    return { descriptionSelect1: "", descriptionSelect2: "" };
  }

  const processValue = String(anchorRow?.processValue || anchorRow?.idProduct || "").trim();
  const preferredRowIdx =
    anchorRow?.rowIndex != null && !Number.isNaN(Number(anchorRow.rowIndex))
      ? Number(anchorRow.rowIndex)
      : null;
  const normCur = normalizeSpaces(processValue);

  let descriptionSelect1 = "";
  const candidates = idProductOptions.filter(
    (opt) =>
      normalizeSpaces(opt.idProduct) === normCur ||
      normalizeSummaryIdProductText(opt.idProduct) === normalizeSummaryIdProductText(processValue)
  );

  if (candidates.length === 1) {
    descriptionSelect1 = candidates[0].value;
  } else if (candidates.length > 1) {
    const hit =
      preferredRowIdx != null
        ? candidates.find((c) => c.rowIndex === preferredRowIdx)
        : null;
    descriptionSelect1 = (hit || candidates[0]).value;
  } else if (preferredRowIdx != null) {
    const hit = idProductOptions.find((c) => c.rowIndex === preferredRowIdx);
    if (hit) descriptionSelect1 = hit.value;
  }
  if (!descriptionSelect1) {
    descriptionSelect1 = idProductOptions[0].value;
  }

  const rowDataOptions = buildRowDataOptionsForIdProduct(tableData, descriptionSelect1);
  return {
    descriptionSelect1,
    descriptionSelect2: rowDataOptions[0]?.value || "",
  };
}

/** @deprecated use buildIdProductSelectOptions + buildRowDataOptionsForIdProduct */
export function buildDescriptionCatalog(tableData) {
  const idProducts = buildIdProductSelectOptions(tableData).map((o) => o.value);
  const rowDataOptions = [];
  if (tableData?.rows) {
    tableData.rows.forEach((rowData, rowIndex) => {
      rowData.forEach((cell, colIndex) => {
        if (cell.type !== "data" || colIndex < 2) return;
        const rowLabel = rowData[0]?.value ? String(rowData[0].value).trim() : "";
        const label = rowLabel ? `${rowLabel} col ${colIndex}` : `Row ${rowIndex} col ${colIndex}`;
        rowDataOptions.push({
          value: `${rowIndex}:${colIndex}`,
          label: `${label} = ${cell.value}`,
        });
      });
    });
  }
  return { idProducts, rowDataOptions };
}

function buildSourceColumnsFromFormula(formulaValue, clickedRefs) {
  if (!formulaValue?.includes("$") || !clickedRefs?.trim()) return "";
  const refs = clickedRefs.trim().split(/\s+/).filter(Boolean);
  const dollarPattern = /\$(\d+)(?!\d)/g;
  const matches = [];
  let m;
  while ((m = dollarPattern.exec(formulaValue)) !== null) {
    matches.push(parseInt(m[1], 10));
  }
  const out = [];
  for (let i = 0; i < matches.length && i < refs.length; i += 1) {
    const parsed = parseIdProductColumnRef(refs[i]);
    if (parsed?.idProduct) {
      let ref = parsed.idProduct;
      if (parsed.captureRowIndex != null) ref += `:#${parsed.captureRowIndex}`;
      else if (parsed.rowLabel) ref += `:${parsed.rowLabel}`;
      ref += `:${parsed.dataColumnIndex + 1}`;
      out.push(ref);
    }
  }
  return out.length ? out.join(" ") : refs.join(" ");
}

export function computeFormulaDisplayPreview(form, rowContext = {}) {
  const formulaValue = String(form.formula || "").trim();
  const sourcePercent = String(form.sourcePercent || "1").trim() || "1";
  const enableSourcePercent = resolveEnableSourcePercent(sourcePercent);
  const processValue = form.processValue || rowContext.idProduct || "";
  const clickedRefs = form.clickedColumns || rowContext.clickedColumns || "";
  const rowIndex = rowContext.rowIndex ?? null;

  if (!formulaValue) {
    return { ...form, formulaDisplay: "" };
  }

  const expanded = buildExpandedFormulaDisplay(formulaValue, processValue, clickedRefs, rowIndex);
  const display = createFormulaDisplayFromExpression(expanded, sourcePercent, enableSourcePercent);
  return { ...form, formulaDisplay: display };
}

export function applyCalculatorToForm(form, { action, value }, rowContext = {}) {
  const formula = String(form.formula || "");
  if (action === "clear") {
    return computeFormulaDisplayPreview({ ...form, formula: "" }, rowContext);
  }
  if (action === "equals") {
    try {
      const result = evaluateFormulaExpression(formula.trim());
      return computeFormulaDisplayPreview({ ...form, formula: String(result) }, rowContext);
    } catch {
      return form;
    }
  }
  const insert = value || "";
  return computeFormulaDisplayPreview({ ...form, formula: `${formula}${insert}` }, rowContext);
}

export function insertCapturedCellIntoForm(form, cellMeta, rowContext = {}) {
  const extractedValue = String(cellMeta.value || "")
    .trim()
    .replace(/\$/g, "")
    .replace(/[^0-9+\-*/.\s()]/g, "")
    .trim();
  if (!extractedValue || !/\d/.test(extractedValue)) {
    return { ok: false, form, reason: "no_numbers" };
  }

  const idProduct = cellMeta.idProduct;
  const dataColumnIndex = cellMeta.dataColumnIndex;
  const displayColumnIndex = cellMeta.displayColumnIndex;
  if (dataColumnIndex == null || displayColumnIndex == null) {
    return { ok: false, form, reason: "invalid_column" };
  }

  let cellReference = "";
  if (idProduct) {
    if (cellMeta.rowIndex != null && cellMeta.rowIndex >= 0) {
      cellReference = `${idProduct}:#${cellMeta.rowIndex}:${dataColumnIndex}`;
    } else if (cellMeta.rowLabel) {
      cellReference = `${idProduct}:${cellMeta.rowLabel}:${dataColumnIndex}`;
    } else {
      cellReference = `${idProduct}:${dataColumnIndex}`;
    }
  }

  const refsArray = form.clickedColumns ? form.clickedColumns.split(/\s+/).filter(Boolean) : [];
  if (cellReference) refsArray.push(cellReference);

  const dollarNum = displayColumnIndex;
  const nextFormula = `${form.formula || ""}$${dollarNum}`;
  const next = computeFormulaDisplayPreview(
    { ...form, formula: nextFormula, clickedColumns: refsArray.join(" ") },
    rowContext
  );
  return { ok: true, form: next };
}

export function addSelectedDescriptionToForm(form, tableData, rowContext = {}) {
  if (!form.descriptionSelect2) {
    return { ok: false, form, reason: "no_selection" };
  }
  const parts = form.descriptionSelect2.split(":");
  if (parts.length !== 2) return { ok: false, form, reason: "invalid_selection" };
  const rowIndex = parseInt(parts[0], 10);
  const columnIndex = parts[1];
  const rowData = tableData?.rows?.[rowIndex];
  if (!rowData) return { ok: false, form, reason: "row_missing" };

  let idProduct = "";
  if (rowData[1]?.type === "data") {
    idProduct = String(rowData[1].value || "").trim();
  }
  let rowLabel = "";
  if (rowData[0]?.type === "header") {
    rowLabel = String(rowData[0].value || "").trim();
  }
  const cell = rowData[parseInt(columnIndex, 10)];
  const value = cell?.value != null ? String(cell.value) : "";

  return insertCapturedCellIntoForm(
    form,
    {
      idProduct,
      rowLabel,
      rowIndex,
      displayColumnIndex: parseInt(columnIndex, 10),
      dataColumnIndex: Math.max(0, parseInt(columnIndex, 10) - 1),
      value,
    },
    rowContext
  );
}

/**
 * @returns {{ ok: boolean, message?: string, patch?: object }}
 */
export function buildFormulaSavePatchFromForm(form, row) {
  const currencyId = String(form.currencyId || "").trim();
  if (!currencyId) {
    return { ok: false, message: "请先选择 Currency 后再保存。Please select a currency." };
  }

  const accountId = String(form.accountId || "").trim();
  const accountText = String(form.accountText || "").trim();
  if (!accountId) {
    return { ok: false, message: "Please select an account" };
  }

  const formulaValue = String(form.formula || "").trim();
  if (!formulaValue) {
    return { ok: false, message: "Please enter a formula" };
  }

  const sourcePercentValue = String(form.sourcePercent || "1").trim() || "1";
  const inputMethodValue = String(form.inputMethod || "").trim();
  const descriptionValue = String(form.description || "").trim();
  const enableInputMethod = Boolean(inputMethodValue);
  const enableSourcePercent = resolveEnableSourcePercent(sourcePercentValue);
  const clickedRefs = form.clickedColumns || "";
  const processValue = row?.idProduct || form.processValue || "";
  const hasDollarSign = formulaValue.includes("$");

  const expanded = buildExpandedFormulaDisplay(
    formulaValue,
    processValue,
    clickedRefs,
    row?.rowIndex ?? null
  );
  const formulaDisplay = createFormulaDisplayFromExpression(
    expanded,
    sourcePercentValue,
    enableSourcePercent
  );

  const processedAmount = roundProcessedAmountTo2Decimals(
    calculateFormulaResultFromExpression(
      formulaValue,
      sourcePercentValue,
      inputMethodValue,
      enableInputMethod,
      enableSourcePercent,
      processValue,
      clickedRefs,
      row?.rowIndex ?? null
    )
  );

  const sourceColumns = hasDollarSign
    ? buildSourceColumnsFromFormula(formulaValue, clickedRefs)
    : "";

  return {
    ok: true,
    patch: {
      account: accountText,
      accountId,
      currency: form.currencyLabel
        ? form.currencyLabel.startsWith("(")
          ? form.currencyLabel
          : `(${form.currencyLabel})`
        : "",
      currencyId,
      formula: formulaValue,
      formulaDisplay,
      formulaOperators: formulaValue,
      sourceColumns,
      sourcePercent: sourcePercentValue,
      enableSourcePercent,
      clickedColumns: clickedRefs,
      inputMethod: inputMethodValue,
      enableInputMethod,
      originalDescription: descriptionValue,
      processedAmountDisplay: formatProcessedAmountDisplay(processedAmount),
      templateApplied: true,
    },
  };
}
