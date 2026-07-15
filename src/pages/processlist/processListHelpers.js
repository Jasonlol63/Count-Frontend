import { excludeGroupLabelsFromCompanyPicker } from "../../utils/company/sharedCompanyFilter.js";
import { parseRemoveWordChips, serializeRemoveWordChips } from "../../lib/removeWordChips.js";
import { notifyTransactionListInvalidated } from "../transaction/lib/transactionPaymentLogic.js";

export const PAGE_SIZE = 25;

/** Description 名称：输入与保存统一大写 */
export function normalizeDescriptionName(raw) {
  return String(raw ?? "").trim().toUpperCase();
}

/** Process 表单文本：输入时统一大写（不 trim，避免打字中途删空格） */
export function toProcessFormUpperInput(raw) {
  return String(raw ?? "").toUpperCase();
}

export const EMPTY_FORM = {
  id: "",
  process_name: "",
  is_multi_process: false,
  selected_processes: [],
  show_multi_process_selection: true,
  selected_descriptions: [],
  copy_from: "",
  currency_id: "",
  day_use: [],
  remove_word: "",
  replace_word_from: "",
  replace_word_to: "",
  remark: "",
  status: "active",
  dts_modified: "",
  modified_by: "",
  dts_created: "",
  created_by: "",
  /** Edit UI only (legacy: hide DTS Modified when never changed) */
  dts_modified_display: "",
  dts_modified_user_display: "",
  currency_warning: null,
};

export function normalizeRows(data) {
  return Array.isArray(data) ? data : [];
}

/** Drop all cached process-list slices for one company (after add/edit/delete). */
export function invalidateProcessListCompanyCache(cacheRef, companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0 || !cacheRef?.current) return;
  const prefix = `company:${cid}|`;
  for (const key of cacheRef.current.keys()) {
    if (key.startsWith(prefix)) cacheRef.current.delete(key);
  }
}

/** Minimal table rows so the list updates immediately after addprocess_api succeeds. */
export function buildOptimisticProcessRows(created, form, { currencies = [], days = [] } = {}) {
  if (!Array.isArray(created) || created.length === 0) return [];
  const currency = currencies.find((c) => String(c.id) === String(form?.currency_id));
  const dayNames = (form?.day_use || [])
    .map((dayId) => days.find((d) => String(d.id) === String(dayId))?.day_name)
    .filter(Boolean)
    .join(",");
  const descriptions = Array.isArray(form?.selected_descriptions) ? form.selected_descriptions : [];
  const descById = new Map(descriptions.map((d) => [String(d.id), d.name]));

  return created.map((row) => ({
    id: row.id,
    process_name: row.process_id,
    description: descById.get(String(row.description_id)) || descriptions[0]?.name || "",
    status: "active",
    currency: currency?.code || "",
    day_use: dayNames,
    has_transactions: false,
  }));
}

export function mergeProcessRowsById(existingRows, incomingRows) {
  const next = Array.isArray(existingRows) ? [...existingRows] : [];
  const indexById = new Map(next.map((row, idx) => [Number(row.id), idx]));
  for (const row of incomingRows || []) {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (indexById.has(id)) {
      next[indexById.get(id)] = { ...next[indexById.get(id)], ...row };
    } else {
      indexById.set(id, next.length);
      next.push(row);
    }
  }
  return next;
}

export function rowCurrencyCodesFromRows(rows) {
  const set = new Set();
  for (const row of rows || []) {
    const code = String(row?.currency || "").trim().toUpperCase();
    if (code) set.add(code);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Prefer a currency that actually has process rows; fall back to company pill list. */
export function resolveProcessCurrencyFilter(preferredCode, rows, companyCurrencyCodes = []) {
  const preferred = String(preferredCode || "").trim().toUpperCase();
  const fromRows = rowCurrencyCodesFromRows(rows);
  if (preferred && fromRows.includes(preferred)) return preferred;
  if (fromRows.length) return fromRows[0];
  const companyCodes = (companyCurrencyCodes || [])
    .map((c) => String(c).trim().toUpperCase())
    .filter(Boolean);
  if (preferred && companyCodes.includes(preferred)) return preferred;
  return companyCodes[0] || "";
}

/** In-memory cache is only reusable when it contains at least one row (never treat [] as a hit). */
export function processListCacheHasRows(cached) {
  return Array.isArray(cached?.rows) && cached.rows.length > 0;
}

/** Cache entry exists (including confirmed-empty lists for the same filter key). */
export function processListCacheHasEntry(cached) {
  return cached != null && Array.isArray(cached.rows);
}

/**
 * Process list API scope: in ungrouped mode only independent companies (no group_id) may load rows.
 */
export function resolveProcessListActiveCompanyId(
  companyId,
  companies,
  { groupFilterKind = "follow", groupIds = [] } = {},
) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (groupFilterKind !== "ungrouped") return id;

  const buttons = filterProcessPageCompanyButtons(
    dedupeCompanyRowsForSwitcher(companies, id),
    { groupFilterKind: "ungrouped", groupIds, selectedGroupKey: "" },
  );
  return buttons.some((c) => Number(c.id) === id) ? id : null;
}

/** Process / Bank Process company pills: in-group list without group labels (AP, IG, …). */
export function filterProcessPageCompanyButtons(
  allCompanyButtons,
  { groupFilterKind, groupIds, selectedGroupKey } = {}
) {
  let list;
  if (groupFilterKind === "ungrouped") {
    list = allCompanyButtons.filter((c) => !String(c.group_id || "").trim());
  } else if (groupIds.length === 0) {
    list = allCompanyButtons;
  } else if (!selectedGroupKey) {
    const ung = allCompanyButtons.filter((c) => !String(c.group_id || "").trim());
    list = ung.length ? ung : allCompanyButtons;
  } else {
    const g = selectedGroupKey;
    const inG = allCompanyButtons.filter((c) => {
      const native = String(c.group_id || "").trim().toUpperCase();
      const link = String(c.link_source_group || "").trim().toUpperCase();
      return native === g || link === g;
    });
    list = inG.length ? inG : allCompanyButtons;
  }
  return excludeGroupLabelsFromCompanyPicker(list, groupIds);
}

export function dedupeCompanyRowsForSwitcher(companies, preferredPk) {
  const filtered = normalizeRows(companies).filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const byLabel = new Map();
  for (const c of filtered) {
    const label = String(c.company_id || "").trim().toUpperCase();
    if (!label) continue;
    let arr = byLabel.get(label);
    if (!arr) {
      arr = [];
      byLabel.set(label, arr);
    }
    const idNum = Number(c.id);
    if (Number.isFinite(idNum) && arr.some((e) => Number(e.id) === idNum)) continue;
    arr.push(c);
  }
  const pref = Number(preferredPk);
  const out = [];
  for (const arr of byLabel.values()) {
    if (arr.length === 1) {
      out.push(arr[0]);
      continue;
    }
    const sorted = [...arr].sort((a, b) => Number(a.id) - Number(b.id));
    if (Number.isFinite(pref)) {
      const hit = sorted.find((e) => Number(e.id) === pref);
      out.push(hit ?? sorted[0]);
    } else {
      out.push(sorted[0]);
    }
  }
  return out;
}

function tiebreakProcessDefault(a, b) {
  const aPn = String(a.process_name || "").toLowerCase();
  const bPn = String(b.process_name || "").toLowerCase();
  if (aPn < bPn) return -1;
  if (aPn > bPn) return 1;
  const aD = String(a.description || a.description_name || "").toLowerCase();
  const bD = String(b.description || b.description_name || "").toLowerCase();
  if (aD < bD) return -1;
  if (aD > bD) return 1;
  return Number(a.id || 0) - Number(b.id || 0);
}

/**
 * Games process table client sort (column keys match ProcessTable headers).
 * @param {"processId"|"description"|"status"|"currency"|"dayUse"} sortColumn
 */
export function sortProcessTableRows(rows, sortColumn, sortDirection) {
  const dir = sortDirection === "desc" ? -1 : 1;
  const copy = [...normalizeRows(rows)];
  const sortPrimary = (primary) => {
    copy.sort((a, b) => {
      let c = primary(a, b);
      if (c === 0) c = tiebreakProcessDefault(a, b);
      return c * dir;
    });
  };

  if (sortColumn === "processId") {
    sortPrimary((a, b) => {
      const aKey = String(a.process_name || "").toLowerCase();
      const bKey = String(b.process_name || "").toLowerCase();
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      return 0;
    });
  } else if (sortColumn === "description") {
    sortPrimary((a, b) =>
      String(a.description || a.description_name || "").localeCompare(String(b.description || b.description_name || ""), undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    );
  } else if (sortColumn === "status") {
    sortPrimary((a, b) =>
      String(a.status || "")
        .toLowerCase()
        .localeCompare(String(b.status || "").toLowerCase(), undefined, { sensitivity: "base" }),
    );
  } else if (sortColumn === "currency") {
    sortPrimary((a, b) =>
      String(a.currency || "").localeCompare(String(b.currency || ""), undefined, { sensitivity: "base" }),
    );
  } else if (sortColumn === "dayUse") {
    sortPrimary((a, b) =>
      String(a.day_use || "").localeCompare(String(b.day_use || ""), undefined, { sensitivity: "base", numeric: true }),
    );
  } else {
    sortPrimary(() => 0);
  }
  return copy;
}

/** Same ordering as js/processlist.js after fetch (Games). */
export function sortProcessRows(rows) {
  return sortProcessTableRows(rows, "processId", "asc");
}

/** Add-form fields populated or cleared by Copy From (legacy js/processlist.js). */
export function emptyCopyFromSyncFields() {
  return {
    currency_id: "",
    selected_descriptions: [],
    remove_word: "",
    replace_word_from: "",
    replace_word_to: "",
    remark: "",
    day_use: [],
    currency_warning: null,
  };
}

/** Map addprocess_api.php copy_from payload into partial add-form state. */
export function buildCopyFromFormPatch(data, { currencies = [], descriptions = [] } = {}) {
  const patch = emptyCopyFromSyncFields();
  if (!data || typeof data !== "object") return patch;

  let currencyId =
    data.currency_id != null && data.currency_id !== "" ? String(data.currency_id) : "";
  if (currencyId) {
    const exists = currencies.some((c) => String(c.id) === currencyId);
    if (!exists) currencyId = "";
  }
  if (!currencyId && data.currency_code) {
    const code = String(data.currency_code).toUpperCase();
    const match = currencies.find((c) => String(c.code || "").toUpperCase() === code);
    if (match) currencyId = String(match.id);
  }
  patch.currency_id = currencyId;
  patch.currency_warning = data.currency_warning || null;

  if (data.remove_word) {
    patch.remove_word = serializeRemoveWordChips(parseRemoveWordChips(data.remove_word));
  }
  if (data.replace_word_from) patch.replace_word_from = String(data.replace_word_from);
  if (data.replace_word_to) patch.replace_word_to = String(data.replace_word_to);
  if (data.remark) patch.remark = parseRemarkForForm(data.remark);
  if (data.day_use) {
    patch.day_use = String(data.day_use)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (data.description_name) {
    const name = String(data.description_name).trim();
    if (name) {
      const fromApi = descriptions.find((d) => String(d.name) === name);
      patch.selected_descriptions = [{ id: fromApi?.id ?? name, name }];
    }
  }

  return patch;
}

/** Legacy editProcess remarks handling (JSON meta.user_remarks). */
export function parseRemarkForForm(remarks) {
  if (remarks == null || remarks === "") return "";
  try {
    const meta = JSON.parse(remarks);
    if (meta && meta.user_remarks != null && meta.user_remarks !== "") return String(meta.user_remarks);
  } catch {
    /* plain text */
  }
  return String(remarks);
}

export function buildEditDescriptionSelection(p, descriptionsList) {
  let names = [];
  if (Array.isArray(p.description_names) && p.description_names.length > 0) {
    names = p.description_names.map((x) => String(x).trim()).filter(Boolean);
  } else if (p.description_names && typeof p.description_names === "string") {
    names = p.description_names
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
  } else if (p.description_name) {
    names = [String(p.description_name).trim()].filter(Boolean);
  }

  const selected = [];
  names.forEach((name, idx) => {
    const fromApi = descriptionsList.find((d) => String(d.name) === String(name));
    const id = idx === 0 && p.description_id ? p.description_id : fromApi?.id ?? `${name}_${idx}`;
    selected.push({ id, name });
  });
  return selected;
}

export function notifyTransactionDataChanged(sourceTag) {
  notifyTransactionListInvalidated(sourceTag || "processlist");
}
