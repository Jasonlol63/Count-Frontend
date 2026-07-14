import { excludeGroupLabelsFromCompanyPicker } from "../../utils/company/sharedCompanyFilter.js";

export const PAGE_SIZE = 25;

/**
 * Status visibility after toggle — aligned with processlist / account list:
 * - default: active (paginated)
 * - showInactive: inactive (paginated)
 * - showAll: all active (no pagination)
 * - showAll + showInactive: all inactive
 */
export function processRowVisibleAfterStatusChange(newStatus, { showInactive, showAll }) {
  const status = String(newStatus || "").toLowerCase();
  if (showAll && showInactive) return status === "inactive";
  if (showAll) return status === "active";
  if (showInactive) return status === "inactive";
  return status === "active";
}

/** Filter normalized UI rows (after {@link normalizeProcessListItem}). */
export function applyProcessFilters(processes, { search, showInactive, showAll }) {
  let rows = (Array.isArray(processes) ? processes : []).map((p) => ({ ...p }));
  const q = String(search || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((p) => {
      const code = String(p.process_name || p.process?.code || "").toLowerCase();
      const desc =
        p.description != null
          ? String(p.description).toLowerCase()
          : (p.processDescriptions || [])
              .map((d) => String(d.name || "").toLowerCase())
              .join(" ");
      return code.includes(q) || desc.includes(q);
    });
  }
  const statusOf = (p) =>
    String(p.status || p.process?.status || "")
      .toLowerCase();
  if (showAll && showInactive) {
    rows = rows.filter((p) => statusOf(p) === "inactive");
  } else if (showAll) {
    rows = rows.filter((p) => statusOf(p) === "active");
  } else if (showInactive) {
    rows = rows.filter((p) => statusOf(p) === "inactive");
  } else {
    rows = rows.filter((p) => statusOf(p) === "active");
  }
  return rows;
}

/** Schema: process_day.day_of_week 1=Mon … 7=Sun → list "Day Use" labels. */
export const PROCESS_DAY_OF_WEEK_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Join description names for table cell (frontend display only). */
export function formatProcessDescriptionLabel(processDescriptions) {
  if (!Array.isArray(processDescriptions) || processDescriptions.length === 0) return "";
  return processDescriptions
    .map((d) => String(d?.name || "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Join processDays → `MON,THU` (frontend display only). */
export function formatProcessDayUseLabel(processDays) {
  if (!Array.isArray(processDays) || processDays.length === 0) return "";
  const ordered = [...processDays].sort(
    (a, b) => Number(a?.dayOfWeek ?? a?.day_of_week ?? 0) - Number(b?.dayOfWeek ?? b?.day_of_week ?? 0),
  );
  return ordered
    .map((d) => {
      const n = Number(d?.dayOfWeek ?? d?.day_of_week);
      if (!Number.isFinite(n) || n < 1 || n > 7) return "";
      return PROCESS_DAY_OF_WEEK_LABELS[n - 1];
    })
    .filter(Boolean)
    .join(",");
}

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

/**
 * Spring {@code ProcessDTO} → Games Process table / cache row.
 * Description + Day Use labels are computed on the frontend (lists stay structured on the wire).
 */
export function normalizeProcessListItem(item) {
  if (!item || typeof item !== "object") return null;
  // Already normalized (cache / re-sort)
  if (item.process_name !== undefined && item.process == null) return item;

  const p = item.process || {};
  const descs = Array.isArray(item.processDescriptions) ? item.processDescriptions : [];
  const days = Array.isArray(item.processDays) ? item.processDays : [];
  const descriptionIds = descs
    .map((d) => (d?.id != null ? Number(d.id) : null))
    .filter((id) => Number.isFinite(id) && id > 0);

  return {
    id: p.id,
    process_name: p.code ?? "",
    description: formatProcessDescriptionLabel(descs),
    description_names: descs.map((d) => String(d?.name || "").trim()).filter(Boolean),
    status: String(p.status || "").toLowerCase(),
    currency: String(item.currencyCode || p.currencyCode || "").trim().toUpperCase(),
    day_use: formatProcessDayUseLabel(days),
    tenant_id: p.tenantId,
    currency_id: p.currencyId,
    description_ids: descriptionIds,
    process_days: days,
    process_descriptions: descs,
    remove_word: p.removeWord ?? "",
    replace_word_from: p.replaceWordFrom ?? "",
    replace_word_to: p.replaceWordTo ?? "",
    remark: p.remark ?? "",
    created_by: p.createdBy != null ? String(p.createdBy) : "",
    updated_by: p.updatedBy != null ? String(p.updatedBy) : "",
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function normalizeRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map(normalizeProcessListItem).filter(Boolean);
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
  // Tenant/company picker rows — must not pass through process {@link normalizeRows}.
  const filtered = (Array.isArray(companies) ? companies : []).filter(
    (c) => c && c.company_id && String(c.company_id).trim() !== "",
  );
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

/** ISO / LocalDateTime display: `2026-07-14T15:08:05` → `2026-07-14 15:08:05` */
export function formatProcessDtsDisplay(value) {
  if (value == null || value === "") return "";
  return String(value).trim().replace("T", " ");
}

/** Day checkbox ids (1–7) from a normalized list row's `process_days`. */
export function dayUseIdsFromListRow(row) {
  const days = Array.isArray(row?.process_days) ? row.process_days : [];
  const out = [];
  const seen = new Set();
  for (const d of days) {
    const n = Number(d?.dayOfWeek ?? d?.day_of_week);
    if (!Number.isFinite(n) || n < 1 || n > 7 || seen.has(n)) continue;
    seen.add(n);
    out.push(String(n));
  }
  return out;
}

/** Build selected_descriptions for edit form from list row or legacy get_process payload. */
export function buildEditDescriptionSelection(p, descriptionsList) {
  const list = Array.isArray(descriptionsList) ? descriptionsList : [];

  if (Array.isArray(p?.process_descriptions) && p.process_descriptions.length > 0) {
    return p.process_descriptions
      .map((d) => {
        const name = String(d?.name || "").trim();
        if (!name && d?.id == null) return null;
        const fromDict = list.find((x) => Number(x.id) === Number(d?.id))
          || list.find((x) => String(x.name) === name);
        return {
          id: d?.id ?? fromDict?.id ?? name,
          name: name || String(fromDict?.name || "").trim(),
        };
      })
      .filter((d) => d && d.name);
  }

  if (Array.isArray(p?.description_ids) && p.description_ids.length > 0) {
    return p.description_ids
      .map((rawId) => {
        const id = Number(rawId);
        if (!Number.isFinite(id) || id <= 0) return null;
        const fromDict = list.find((x) => Number(x.id) === id);
        return fromDict ? { id: fromDict.id, name: fromDict.name } : { id, name: String(id) };
      })
      .filter(Boolean);
  }

  let names = [];
  if (Array.isArray(p?.description_names) && p.description_names.length > 0) {
    names = p.description_names.map((x) => String(x).trim()).filter(Boolean);
  } else if (p?.description_names && typeof p.description_names === "string") {
    names = p.description_names
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
  } else if (p?.description_name) {
    names = [String(p.description_name).trim()].filter(Boolean);
  }

  const selected = [];
  names.forEach((name, idx) => {
    const fromApi = list.find((d) => String(d.name) === String(name));
    const id = idx === 0 && p.description_id ? p.description_id : fromApi?.id ?? `${name}_${idx}`;
    selected.push({ id, name });
  });
  return selected;
}

export function notifyTransactionDataChanged(sourceTag) {
  const ts = String(Date.now());
  try {
    localStorage.setItem("count168_tx_invalidate_ts", ts);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent("tx-data-changed", { detail: { ts, source: sourceTag || "processlist" } })
    );
  } catch {
    /* ignore */
  }
}
