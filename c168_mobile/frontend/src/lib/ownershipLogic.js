/** Ownership helpers — keep in sync with frontend/src/pages/ownership/shared/. */

export function isApiSuccess(res) {
  return res && (res.success === true || res.status === "success");
}

export function isApiConflict(res) {
  return res && res.status === "conflict";
}

export function getApiMessage(res, fallback = "Server error") {
  if (!res) return fallback;
  if (typeof res.message === "string" && res.message.trim() !== "") return res.message;
  if (typeof res.error === "string" && res.error.trim() !== "") return res.error;
  return fallback;
}

function normalizeGroupId(value) {
  return String(value || "").trim().toUpperCase();
}

function isVirtualGroupLinkCompanyRow(companyRow) {
  return Boolean(companyRow?.link_source_group);
}

function companyRowIsGroupEntityAnyShape(companyRow) {
  if (!companyRow || isVirtualGroupLinkCompanyRow(companyRow)) return false;
  const grp = normalizeGroupId(companyRow.group_id);
  if (!grp) return false;
  const code = normalizeGroupId(companyRow.company_id);
  if (code === grp) return true;
  return code === "";
}

export function rebuildGroupIds(allCompanies) {
  return [
    ...new Set(
      (allCompanies || [])
        .map((c) => c.group_id)
        .filter((g) => g && String(g).trim() !== ""),
    ),
  ].sort();
}

export function ownershipSubsidiariesInGroup(allCompanies, groupId) {
  if (!groupId) return [];
  const g = String(groupId).trim().toLowerCase();
  return (allCompanies || []).filter((c) => {
    const gid = c.group_id ? String(c.group_id).trim().toLowerCase() : "";
    if (gid !== g) return false;
    return !companyRowIsGroupEntityAnyShape(c);
  });
}

export function countOwnershipSubsidiariesInGroup(allCompanies, groupId) {
  return ownershipSubsidiariesInGroup(allCompanies, groupId).length;
}

export function getOwnershipCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isOwnershipHistoricalMonth(monthKey) {
  return monthKey < getOwnershipCurrentMonthKey();
}

export function getOwnershipMonthLabels(lang = "en") {
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return Array.from({ length: 12 }, (_, i) =>
    new Date(2020, i, 1).toLocaleDateString(locale, { month: "short" }),
  );
}

export function formatOwnershipMonthShort(monthKey, lang = "en") {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "";
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return d.toLocaleDateString(locale, { year: "numeric", month: "short" });
}

export function formatOwnershipSavedAt(iso, lang = "en") {
  if (!iso) return "";
  const d = new Date(String(iso).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(iso);
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Trust Spring's own is_external_partner flag only. `role` is not a reliable signal here:
 * on picker accounts "OWNER" just means "owner-type account" (e.g. the tenant's own
 * main-owner account), not "linked external partner" — matches the fix already applied on
 * desktop (Count-frontend/src/pages/ownership/shared/ownershipRowHelpers.js), which found
 * the old role==="OWNER" fallback wrongly flagged main-owner accounts too.
 */
export function isExternalPartnerRow(row) {
  if (!row) return false;
  return row.is_external_partner === true || row.is_external_partner === 1 || row.is_external_partner === "1";
}

export function allocationRowsForSave(rows) {
  return rows || [];
}

export function rowsToSavePayload(rows) {
  return (rows || []).map((r, sort_order) => ({
    account_id: r.account_id,
    percentage: r.percentage,
    read_only: r.read_only,
    is_external_partner: isExternalPartnerRow(r),
    sort_order,
  }));
}

export function mapOwnerApiRows(data) {
  return (Array.isArray(data) ? data : []).map((o, index) => {
    const role = String(o.role || "").toUpperCase();
    const accountName = o.account_name || "";
    const name = o.name || "";
    let account_label = accountName || name || String(o.account_id ?? "");
    if (role === "OWNER" && accountName && name && accountName !== name) {
      account_label = `${accountName} (${name})`;
    } else if (role === "GROUP" && accountName) {
      account_label = accountName;
    }
    const ownership_id = o.ownership_id || null;
    return {
      account_id: o.account_id,
      account_label,
      account_name: accountName,
      display_name: name,
      percentage: parseFloat(o.percentage),
      role: o.role || "",
      user_raw_id: o.user_raw_id || null,
      ownership_id,
      clientRowId: ownership_id ? `own-${ownership_id}` : `api-${o.account_id}-${index}`,
      is_external_partner: parseInt(o.is_external_partner, 10) === 1,
      read_only: o.read_only !== null ? parseInt(o.read_only, 10) : 1,
    };
  });
}

export function accountsFromOwnerRows(rows) {
  return (rows || []).map((r) => ({
    id: r.account_id,
    account_name: r.account_name || r.account_label || String(r.account_id),
    name: r.display_name || r.account_label || String(r.account_id),
    role: r.role || "",
    type: String(r.account_id || "").startsWith("G_") ? "group" : r.role || "",
    is_external_partner: isExternalPartnerRow(r),
    is_main_owner: 0,
  }));
}

/**
 * Normalize `available-accounts` API rows for the picker: Spring returns
 * account_id/owner_type (no is_main_owner), while accountsForRowPicker expects
 * id/type/is_main_owner. Without this, every option's id is undefined and selecting it
 * silently resets to empty.
 */
export function mapAvailableAccountsForPicker(data) {
  return (Array.isArray(data) ? data : []).map((a) => {
    const type = String(a.type || a.owner_type || "").toLowerCase();
    const isMainOwner =
      a.is_main_owner !== undefined && a.is_main_owner !== null
        ? parseInt(a.is_main_owner, 10) === 1
        : type === "owner" && a.partner_tenant_id == null;
    return {
      ...a,
      id: a.id ?? a.account_id,
      type,
      is_main_owner: isMainOwner ? 1 : 0,
    };
  });
}

export function mergeEditorAccounts(pickerAccounts, rows) {
  const map = new Map();
  for (const a of pickerAccounts || []) {
    map.set(String(a.id), { ...a, is_external_partner: false });
  }
  for (const r of accountsFromOwnerRows(rows || [])) {
    const id = String(r.id);
    if (!id || id === "undefined") continue;
    if (!map.has(id)) map.set(id, r);
  }
  return [...map.values()].sort((a, b) =>
    String(a.account_name || "").localeCompare(String(b.account_name || "")),
  );
}

export function mergeServerRowsPreservingDrafts(localRows, serverRows) {
  const server = Array.isArray(serverRows) ? serverRows : [];
  const local = Array.isArray(localRows) ? localRows : [];
  const serverAccountIds = new Set(
    server.map((r) => String(r.account_id || "")).filter((id) => id && id !== "undefined"),
  );
  const drafts = local.filter((r) => {
    if (!r) return false;
    if (r.ownership_id) return false;
    if (r.is_external_partner === true || r.is_external_partner === 1 || r.is_external_partner === "1") {
      return false;
    }
    const aid = String(r.account_id || "");
    if (aid && serverAccountIds.has(aid)) return false;
    return true;
  });
  const serverNonPartners = server.filter((r) => !isExternalPartnerRow(r));
  const serverPartners = server.filter((r) => isExternalPartnerRow(r));
  return [...serverNonPartners, ...drafts, ...serverPartners];
}

export function accountsForRowPicker(accounts, currentAccountId = "") {
  const current = String(currentAccountId || "");
  return (accounts || []).filter((a) => {
    if (String(a.id) === current) return true;
    if (a.is_external_partner) return false;
    if (String(a.type || "").toLowerCase() === "owner" && parseInt(a.is_main_owner, 10) === 0) {
      return false;
    }
    return true;
  });
}

export function calcAllocationTotal(rows, excludeIdx = -1) {
  return (rows || []).reduce((sum, r, i) => {
    if (i === excludeIdx) return sum;
    return sum + (parseFloat(r.percentage) || 0);
  }, 0);
}

export function calcOwnershipTotal(rows) {
  return calcAllocationTotal(rows);
}

export function maxAllowedOwnershipPct(rows, idx) {
  const other = calcAllocationTotal(rows, idx);
  return Math.max(0, Math.round((100 - other) * 100) / 100);
}

export function fmtOwnershipPct(n) {
  return `${(parseFloat(n) || 0).toFixed(2)}%`;
}

export const EMPTY_OWNERSHIP_ROW = {
  account_id: "",
  percentage: 0,
  role: "",
  user_raw_id: null,
  read_only: 1,
};

let emptyRowSeq = 0;

export function createEmptyOwnershipRow() {
  emptyRowSeq += 1;
  return {
    ...EMPTY_OWNERSHIP_ROW,
    clientRowId: `new-${Date.now()}-${emptyRowSeq}`,
  };
}

export function applyOwnershipRowFieldUpdate(row, field, val, accounts, allRows, rowIdx) {
  const r = { ...row };
  if (field === "account_id") {
    r.account_id = val;
    const acc = accounts.find((a) => String(a.id) === String(val));
    if (acc) {
      r.role = (acc.role || "").toLowerCase();
      r.user_raw_id = String(val).startsWith("U_") ? parseInt(String(val).replace("U_", ""), 10) : null;
      r.read_only = 1;
      r.is_external_partner = false;
      r.ownership_id = null;
    } else {
      r.role = "";
      r.user_raw_id = null;
      r.is_external_partner = false;
      r.ownership_id = null;
    }
  } else if (field === "percent_input" || field === "slider") {
    let p = field === "percent_input" ? parseFloat(String(val).replace("%", "")) : parseFloat(val);
    if (isNaN(p)) p = 0;
    p = Math.max(0, Math.min(100, p));
    if (Array.isArray(allRows) && rowIdx >= 0) {
      p = Math.min(p, maxAllowedOwnershipPct(allRows, rowIdx));
    }
    r.percentage = Math.round(p * 100) / 100;
  } else if (field === "read_only") {
    r.read_only = val;
  }
  return r;
}

export function validateOwnershipRowsForSave(rows, messages) {
  const alloc = allocationRowsForSave(rows);
  if (alloc.some((r) => !r.account_id)) return messages.emptyAccount;
  if (calcOwnershipTotal(alloc) > 100) return messages.over100;
  const ids = alloc.map((r) => r.account_id);
  if (new Set(ids).size !== ids.length) return messages.duplicate;
  return null;
}

export function accountPickerLabel(account) {
  const code = String(account?.account_name || account?.id || "").trim();
  const name = String(account?.name || "").trim();
  if (code && name && code !== name) return `${code} · ${name}`;
  return code || name || String(account?.id || "");
}
