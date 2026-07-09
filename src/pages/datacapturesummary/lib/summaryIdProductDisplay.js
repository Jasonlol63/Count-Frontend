import { normalizeSummaryIdProductText } from "./summaryIdProductUtils.js";

function mergeProductValues(mainValue, subValue) {
  const main = String(mainValue || "").trim();
  const sub = String(subValue || "").trim();
  if (main && sub) {
    const n = (s) => String(s || "").trim().replace(/\s+/g, "");
    if (n(main) === n(sub)) return main;
    return `${main} / ${sub}`;
  }
  if (main) return main;
  if (sub) return sub;
  return "";
}

function appendDescriptionSuffix(base, description) {
  const text = String(base || "").trim();
  const desc = String(description || "").trim();
  if (!text || !desc) return text;
  const suffix = ` (${desc})`;
  return text.endsWith(suffix) ? text : `${text}${suffix}`;
}

/** Legacy refreshIdProductCellDisplay — compute Id Product cell text + title. */
export function formatIdProductDisplay(row) {
  if (!row) return { text: "", title: "" };

  const productType = row.productType === "sub" ? "sub" : "main";
  const rowDescription = String(row.originalDescription || "").trim();
  const mainRaw = productType === "main" ? String(row.idProduct || "").trim() : "";
  const subRaw =
    productType === "sub"
      ? String(row.subIdProduct || row.idProduct || "").trim()
      : String(row.subIdProduct || "").trim();

  let displayText = "";
  if (productType === "sub") {
    const baseDisplay = (subRaw || mainRaw || "").trim();
    displayText = appendDescriptionSuffix(baseDisplay, rowDescription);
  } else {
    let mainDisplay = appendDescriptionSuffix(mainRaw, rowDescription);
    displayText = mergeProductValues(mainDisplay, subRaw);
  }

  if (!displayText && row.idProduct) {
    displayText = String(row.idProduct).trim();
  }

  return {
    text: displayText,
    title: displayText || undefined,
    mainProduct: productType === "main" ? mainRaw || row.idProduct : row.parentIdProduct || mainRaw,
    subProduct: productType === "sub" ? subRaw : "",
  };
}

export function getProcessValueFromSummaryRow(row) {
  if (!row) return "";
  const desc = String(row.originalDescription || "").trim();
  const stripSuffix = (value) => {
    const text = String(value || "").trim();
    if (!text || !desc) return text;
    const suffix = ` (${desc})`;
    return text.endsWith(suffix) ? text.slice(0, -suffix.length).trim() : text;
  };

  if (row.productType === "sub") {
    const sub = stripSuffix(row.subIdProduct || row.idProduct || "");
    if (sub) return sub;
  }
  const main = stripSuffix(row.idProduct || "");
  return main;
}

export function isMg95ElsonSpecialRow(row) {
  try {
    const idProductText = String(row?.idProduct || row?.subIdProduct || "").toUpperCase();
    const accountText = String(row?.account || "").toUpperCase();
    return idProductText.includes("MG95-96") && accountText.includes("KL-ELSON");
  } catch {
    return false;
  }
}

export function normalizeRowIdProductKey(value) {
  return normalizeSummaryIdProductText(value);
}
