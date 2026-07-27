import { excludeGroupLabelsFromCompanyPicker } from "../../utils/company/sharedCompanyFilter.js";
import { parseRemoveWordChips, serializeRemoveWordChips } from "../../lib/removeWordChips.js";
import { notifyTransactionListInvalidated } from "../transaction/lib/transactionPaymentLogic.js";

/** Spring `process_day.day_of_week`: 1=Mon … 7=Sun — form checkbox ids. */
export const PROCESS_WEEKDAY_OPTIONS = [
  { id: 1, dayOfWeek: 1, day_name: "MON" },
  { id: 2, dayOfWeek: 2, day_name: "TUE" },
  { id: 3, dayOfWeek: 3, day_name: "WED" },
  { id: 4, dayOfWeek: 4, day_name: "THU" },
  { id: 5, dayOfWeek: 5, day_name: "FRI" },
  { id: 6, dayOfWeek: 6, day_name: "SAT" },
  { id: 7, dayOfWeek: 7, day_name: "SUN" },
];

const DAY_OF_WEEK_LABELS = ["", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Spring Process.Status — store/compare as ACTIVE | INACTIVE (backend enum). */
export function normalizeProcessStatusKey(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "ACTIVE" || s === "INACTIVE") return s;
  return s || "ACTIVE";
}

export function isProcessStatusActive(status) {
  return normalizeProcessStatusKey(status) === "ACTIVE";
}

export function isProcessStatusInactive(status) {
  return normalizeProcessStatusKey(status) === "INACTIVE";
}

export function formatProcessDescriptionLabel(processDescriptions) {
  const list = Array.isArray(processDescriptions) ? processDescriptions : [];
  return list
    .map((d) => String(d?.name ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function formatProcessDayUseLabel(processDays) {
  const list = Array.isArray(processDays) ? processDays : [];
  return list
    .map((d) => {
      const n = Number(d?.dayOfWeek ?? d?.day_of_week);
      return n >= 1 && n <= 7 ? DAY_OF_WEEK_LABELS[n] : "";
    })
    .filter(Boolean)
    .join(",");
}

export function dayUseIdsFromListRow(row) {
  const days = row?.processDays ?? row?.process_days ?? [];
  return (Array.isArray(days) ? days : [])
    .map((d) => String(d?.dayOfWeek ?? d?.day_of_week ?? ""))
    .filter((v) => v && Number(v) >= 1 && Number(v) <= 7);
}

/** Spring `ProcessDTO` list row → table + edit payload (Games / category=GAME). */
export function normalizeProcessListItem(item) {
  if (!item || typeof item !== "object") return null;

  const proc = item.process ?? item;
  const category = String(proc.category ?? item.category ?? "GAME").trim().toUpperCase();
  if (category === "BANK") return null;

  const id = proc.id ?? item.id;
  if (id == null) return null;

  const processDescriptions = item.processDescriptions ?? item.process_descriptions ?? [];
  const processDays = item.processDays ?? item.process_days ?? [];
  const status = normalizeProcessStatusKey(proc.status ?? item.status ?? "ACTIVE");

  return {
    id,
    tenantId: proc.tenantId ?? item.tenantId ?? item.tenant_id ?? null,
    category,
    process_name: String(proc.code ?? item.code ?? "").trim(),
    description: formatProcessDescriptionLabel(processDescriptions),
    description_name: processDescriptions[0]?.name ?? "",
    status,
    currency: String(item.currencyCode ?? item.currency_code ?? "").trim(),
    currencyId: proc.currencyId ?? item.currencyId ?? item.currency_id ?? null,
    day_use: formatProcessDayUseLabel(processDays),
    processDescriptions,
    processDays,
    remove_word: proc.removeWord ?? item.removeWord ?? item.remove_word ?? "",
    replace_word_from: proc.replaceWordFrom ?? item.replaceWordFrom ?? item.replace_word_from ?? "",
    replace_word_to: proc.replaceWordTo ?? item.replaceWordTo ?? item.replace_word_to ?? "",
    remark: proc.remark ?? item.remark ?? "",
    created_by: proc.createdBy ?? item.createdBy ?? item.created_by ?? "",
    updated_by: proc.updatedBy ?? item.updatedBy ?? item.updated_by ?? "",
    dts_created: proc.createdAt ?? item.createdAt ?? item.created_at ?? "",
    dts_modified: proc.updatedAt ?? item.updatedAt ?? item.updated_at ?? "",
    has_transactions: false,
  };
}

export function normalizeProcessListRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map(normalizeProcessListItem).filter(Boolean);
}

/** Client-side list filters (Spring list has no search/status query params yet). */
export function applyProcessListFilters(rows, { search = "", showInactive = false, showAll = false } = {}) {
  let list = Array.isArray(rows) ? [...rows] : [];
  const q = String(search || "").trim().toUpperCase();
  if (q) {
    list = list.filter((r) => {
      const hay = `${r.process_name || ""} ${r.description || ""}`.toUpperCase();
      return hay.includes(q);
    });
  }
  if (showAll && showInactive) {
    return list.filter((r) => isProcessStatusInactive(r.status));
  }
  if (showAll) {
    return list.filter((r) => isProcessStatusActive(r.status));
  }
  if (showInactive) {
    return list.filter((r) => isProcessStatusInactive(r.status));
  }
  return list.filter((r) => isProcessStatusActive(r.status));
}

export function existingProcessesFromListRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r.id,
    process_id: r.id,
    process_name: r.process_name,
    description_name: r.description_name || String(r.description || "").split(",")[0]?.trim() || "",
  }));
}

export function buildCopyFromFormPatchFromRow(row, { currencies = [], descriptions = [] } = {}) {
  if (!row) return emptyCopyFromSyncFields();
  return buildCopyFromFormPatch(
    {
      currency_id: row.currencyId,
      currency_code: row.currency,
      remove_word: row.remove_word,
      replace_word_from: row.replace_word_from,
      replace_word_to: row.replace_word_to,
      remark: row.remark,
      day_use: row.day_use,
      description_name: row.description_name || String(row.description || "").split(",")[0]?.trim(),
      description_names: (row.processDescriptions || []).map((d) => d.name).filter(Boolean),
    },
    { currencies, descriptions },
  );
}

export function buildEditFormFromListRow(row, descriptionsList, { existingProcesses = [] } = {}) {
  if (!row) return { ...EMPTY_FORM, existingProcesses };

  let currencyId = row.currencyId != null ? String(row.currencyId) : "";
  const selectedDescriptions = buildEditDescriptionSelection(
    {
      description_names: (row.processDescriptions || []).map((d) => d.name).filter(Boolean),
      description_name: row.description_name,
      description_id: row.processDescriptions?.[0]?.id,
    },
    descriptionsList,
  );

  const dtsModified = row.dts_modified || "";
  const dtsCreated = row.dts_created || "";
  let displayModifiedDate = "";
  let displayModifiedBy = "";
  if (dtsModified && dtsModified !== dtsCreated) {
    displayModifiedDate = dtsModified;
    displayModifiedBy = row.updated_by || "";
  }

  return {
    id: String(row.id),
    process_name: row.process_name || "",
    selected_descriptions: selectedDescriptions,
    currency_id: currencyId,
    day_use: dayUseIdsFromListRow(row),
    remove_word: serializeRemoveWordChips(parseRemoveWordChips(row.remove_word || "")),
    replace_word_from: row.replace_word_from || "",
    replace_word_to: row.replace_word_to || "",
    remark: parseRemarkForForm(row.remark),
    status: normalizeProcessStatusKey(row.status),
    dts_modified: dtsModified,
    modified_by: row.updated_by || "",
    dts_created: dtsCreated,
    created_by: row.created_by || "",
    dts_modified_display: displayModifiedDate,
    dts_modified_user_display: displayModifiedBy,
    currency_warning: null,
    existingProcesses,
  };
}

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
  status: "ACTIVE",
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

/** Drop all cached process-list slices for one tenant (after add/edit/delete). */
export function invalidateProcessListTenantCache(cacheRef, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0 || !cacheRef?.current) return;
  const prefix = `tenant:${tid}|`;
  for (const key of cacheRef.current.keys()) {
    if (key.startsWith(prefix)) cacheRef.current.delete(key);
  }
}

/** @deprecated Use {@link invalidateProcessListTenantCache}. */
export function invalidateProcessListCompanyCache(cacheRef, tenantId) {
  invalidateProcessListTenantCache(cacheRef, tenantId);
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
    status: "ACTIVE",
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
export function resolveProcessListActiveTenantId(
  tenantId,
  tenants,
  { groupFilterKind = "follow", groupIds = [] } = {},
) {
  const id = Number(tenantId);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (groupFilterKind !== "ungrouped") return id;

  const buttons = filterProcessPageCompanyButtons(
    dedupeCompanyRowsForSwitcher(tenants, id),
    { groupFilterKind: "ungrouped", groupIds, selectedGroupKey: "" },
  );
  return buttons.some((c) => Number(c.id) === id) ? id : null;
}

/** @deprecated Use {@link resolveProcessListActiveTenantId}. */
export function resolveProcessListActiveCompanyId(tenantId, tenants, opts) {
  return resolveProcessListActiveTenantId(tenantId, tenants, opts);
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
      normalizeProcessStatusKey(a.status).localeCompare(
        normalizeProcessStatusKey(b.status),
        undefined,
        { sensitivity: "base" },
      ),
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
  if (Array.isArray(p.descriptionNames) && p.descriptionNames.length > 0) {
    names = p.descriptionNames.map((x) => String(x).trim()).filter(Boolean);
  } else if (Array.isArray(p.description_names) && p.description_names.length > 0) {
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
