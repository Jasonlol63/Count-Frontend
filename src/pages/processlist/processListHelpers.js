import { excludeGroupLabelsFromCompanyPicker } from "../../utils/company/sharedCompanyFilter.js";
import { parseRemoveWordChips, serializeRemoveWordChips } from "../../lib/removeWordChips.js";
import { notifyTransactionListInvalidated } from "../transaction/lib/transactionPaymentLogic.js";

export const PAGE_SIZE = 25;

/** Description 名称：输入与保存统一大写 */
export function normalizeDescriptionName(raw) {
  return String(raw ?? "").trim().toUpperCase();
}

/** Process 表单文本：提交时统一大写（输入阶段用 CSS text-transform，避免光标跳末端） */
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
  enable_save_draft: false,
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

/** `process_day.dayOfWeek` contract: 1=Mon … 7=Sun. */
export const PROCESS_WEEKDAY_OPTIONS = [
  { id: 1, day_name: "MON" },
  { id: 2, day_name: "TUE" },
  { id: 3, day_name: "WED" },
  { id: 4, day_name: "THU" },
  { id: 5, day_name: "FRI" },
  { id: 6, day_name: "SAT" },
  { id: 7, day_name: "SUN" },
];

function dayOfWeekName(dayOfWeek) {
  return PROCESS_WEEKDAY_OPTIONS.find((d) => d.id === Number(dayOfWeek))?.day_name || "";
}

/** Spring `Process.Status` is 2-value only (no WAITING — that's Bank Process). */
export function normalizeProcessStatusKey(v) {
  return String(v || "").trim().toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";
}

/** company.id in the picker === tenant.id in the backend. */
export function resolveProcessListActiveTenantId(tenantId) {
  const tid = tenantId != null ? Number(tenantId) : Number.NaN;
  return Number.isFinite(tid) && tid > 0 ? tid : null;
}

/**
 * Spring `ProcessDTO` → legacy flat table row.
 * Drops `category === 'BANK'` rows (Bank Process lives on its own list page).
 */
export function normalizeProcessListItem(dto) {
  if (!dto || typeof dto !== "object") return null;
  const process = dto.process || {};
  if (String(process.category || "").trim().toUpperCase() === "BANK") return null;

  const descriptions = Array.isArray(dto.processDescriptions) ? dto.processDescriptions : [];
  const days = Array.isArray(dto.processDays) ? dto.processDays : [];
  const dayUse = [...days]
    .map((d) => Number(d?.dayOfWeek))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7)
    .sort((a, b) => a - b)
    .map(dayOfWeekName)
    .filter(Boolean)
    .join(",");

  return {
    id: dto.id ?? process.id,
    process_name: String(process.code || ""),
    description: descriptions.map((d) => d?.name).filter(Boolean).join(", "),
    process_descriptions: descriptions,
    process_days: days,
    day_use: dayUse,
    currency: String(dto.currencyCode || "").trim().toUpperCase(),
    currency_id: process.currencyId ?? null,
    status: normalizeProcessStatusKey(process.status).toLowerCase(),
    remove_word: process.removeWord ?? "",
    replace_word_from: process.replaceWordFrom ?? "",
    replace_word_to: process.replaceWordTo ?? "",
    remark: process.remark ?? "",
    created_by: process.createdBy ?? "",
    modified_by: process.updatedBy ?? "",
    dts_created: process.createdAt ?? "",
    dts_modified: process.updatedAt ?? "",
    // Spring ProcessDTO carries no submitted-transaction flag; delete is still
    // server-gated to INACTIVE rows, this only affects the client checkbox hint.
    has_transactions: false,
  };
}

export function normalizeProcessListRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map(normalizeProcessListItem).filter(Boolean);
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
    enable_save_draft: Boolean(form?.enable_save_draft),
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

/**
 * Client-side search + status filter — Spring `/api/process/process-list` has no
 * search/status query params, it always returns the full tenant row set.
 */
export function applyProcessListFilters(rows, { search = "", showActive = false, showInactive = false, showAll = false } = {}) {
  let out = Array.isArray(rows) ? rows : [];
  const q = String(search || "").trim().toUpperCase();
  if (q) {
    out = out.filter((r) => {
      const hay = [r.process_name, r.description, r.currency, r.remark]
        .map((v) => String(v || "").toUpperCase())
        .join(" ");
      return hay.includes(q);
    });
  }
  if (showAll || (showActive && showInactive)) return out;
  if (showInactive) return out.filter((r) => String(r.status || "").toLowerCase() === "inactive");
  return out.filter((r) => String(r.status || "").toLowerCase() === "active");
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

/**
 * Copy From: adapt an already-loaded, `normalizeProcessListItem`'d list row into a partial
 * add-form patch — no network call (Spring has no `copy_from` endpoint).
 */
export function buildCopyFromFormPatch(row, { currencies = [] } = {}) {
  const patch = emptyCopyFromSyncFields();
  if (!row || typeof row !== "object") return patch;

  let currencyId = row.currency_id != null && row.currency_id !== "" ? String(row.currency_id) : "";
  if (currencyId && !currencies.some((c) => String(c.id) === currencyId)) currencyId = "";
  patch.currency_id = currencyId;

  if (row.remove_word) {
    patch.remove_word = serializeRemoveWordChips(parseRemoveWordChips(row.remove_word));
  }
  if (row.replace_word_from) patch.replace_word_from = String(row.replace_word_from);
  if (row.replace_word_to) patch.replace_word_to = String(row.replace_word_to);
  if (row.remark) patch.remark = parseRemarkForForm(row.remark);

  patch.day_use = dayUseIdsFromListRow(row);

  const descriptions = Array.isArray(row.process_descriptions) ? row.process_descriptions : [];
  patch.selected_descriptions = descriptions
    .filter((d) => d?.id != null)
    .map((d) => ({ id: d.id, name: d.name }));

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

/** `process_days[].dayOfWeek` (1=Mon…7=Sun) → checkbox id strings (`ProcessFormModal` compares by id). */
export function dayUseIdsFromListRow(row) {
  const days = Array.isArray(row?.process_days) ? row.process_days : [];
  return days.map((d) => String(d?.dayOfWeek)).filter(Boolean);
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
