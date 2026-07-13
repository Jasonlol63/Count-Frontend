/** Shared ownership row edit / validate helpers (company + group tabs). */

export function isExternalPartnerRow(row) {
  return row?.is_external_partner === true;
}

export function allocationRowsForSave(rows) {
  return (rows || []).filter((r) => !isExternalPartnerRow(r));
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

/** Spring Boot list/candidates use different group account_name shapes — unify for display. */
export function formatSpringOwnershipLabel(dto) {
  const role = String(dto?.role ?? "").toUpperCase();
  const accountName = dto?.account_name ?? "";
  const name = dto?.name ?? "";

  if (role === "GROUP") {
    const trimmed = accountName.trim();
    if (trimmed.startsWith("Group:")) return trimmed;
    if (trimmed) return `Group: ${trimmed}`;
    return name || String(dto?.account_id ?? "");
  }
  if (role === "OWNER" && accountName && name && accountName !== name) {
    return `${accountName} (${name})`;
  }
  return accountName || name || String(dto?.account_id ?? "");
}

/** Map Spring Boot TenantOwnershipDTO (or legacy PHP row) into picker account shape. */
export function normalizeOwnershipAccount(dto) {
  const accountId = String(dto?.account_id ?? dto?.id ?? "");
  if (!accountId || accountId === "undefined") return null;

  const ownerTypeRaw = String(dto?.owner_type ?? dto?.type ?? "").toLowerCase();
  const role = String(dto?.role ?? "").toUpperCase();
  const ownerType =
    ownerTypeRaw ||
    (accountId.startsWith("G_") ? "group" : role === "PARTNERSHIP" ? "user" : role.toLowerCase());

  return {
    account_id: accountId,
    account_name: dto?.account_name ?? "",
    name: dto?.name ?? "",
    owner_type: ownerType,
    role,
    partner_tenant_id: dto?.partner_tenant_id ?? null,
    ownership_id: dto?.ownership_id ?? null,
    read_only: dto?.read_only != null ? parseInt(dto.read_only, 10) : 1,
    is_external_partner: dto?.is_external_partner === 1 || dto?.is_external_partner === true,
    account_label: formatSpringOwnershipLabel(dto),
    is_main_owner: dto?.is_main_owner ?? 0,
  };
}

export function normalizeOwnershipAccounts(data) {
  return (Array.isArray(data) ? data : []).map(normalizeOwnershipAccount).filter(Boolean);
}

export function mapOwnerApiRows(data) {
  return (Array.isArray(data) ? data : []).map((o, index) => {
    const normalized = normalizeOwnershipAccount(o);
    const ownership_id = o.ownership_id || null;
    return {
      account_id: normalized?.account_id ?? o.account_id,
      account_label: normalized?.account_label ?? formatSpringOwnershipLabel(o),
      account_name: normalized?.account_name ?? o.account_name ?? "",
      display_name: normalized?.name ?? o.name ?? "",
      percentage: parseFloat(o.percentage),
      role: normalized?.role ?? o.role ?? "",
      owner_type: normalized?.owner_type ?? "",
      user_raw_id: o.user_raw_id || null,
      ownership_id,
      clientRowId: ownership_id ? `own-${ownership_id}` : `api-${o.account_id}-${index}`,
      is_external_partner: parseInt(o.is_external_partner, 10) === 1,
      read_only: o.read_only !== null && o.read_only !== undefined ? parseInt(o.read_only, 10) : 1,
    };
  });
}

export function accountsFromOwnerRows(rows) {
  return (rows || []).map((r) => ({
    account_id: r.account_id,
    account_name: r.account_name || "",
    name: r.display_name || r.name || "",
    account_label:
      r.account_label ||
      formatSpringOwnershipLabel({
        account_id: r.account_id,
        account_name: r.account_name,
        name: r.display_name || r.name,
        role: r.role,
      }),
    owner_type:
      r.owner_type ||
      (String(r.account_id || "").startsWith("G_")
        ? "group"
        : String(r.role || "").toLowerCase()),
    role: r.role || "",
    is_external_partner: isExternalPartnerRow(r),
    is_main_owner: 0,
  }));
}

/** Merge picker accounts with persisted row accounts so linked partners display correctly. */
export function mergeEditorAccounts(pickerAccounts, rows) {
  const map = new Map();
  for (const a of normalizeOwnershipAccounts(pickerAccounts)) {
    map.set(String(a.account_id), { ...a, is_external_partner: false });
  }
  for (const r of accountsFromOwnerRows(rows || [])) {
    const id = String(r.account_id);
    if (!id || id === "undefined") continue;
    if (!map.has(id)) {
      map.set(id, r);
    }
  }
  return [...map.values()].sort((a, b) =>
    String(a.account_label || a.account_name || "").localeCompare(
      String(b.account_label || b.account_name || ""),
    ),
  );
}

/** Dropdown options: hide external partners and accounts already used on other rows. */
export function accountsForRowPicker(accounts, currentAccountId = "", allRows = []) {
  const current = String(currentAccountId || "");
  const used = new Set(
    (allRows || [])
      .map((r) => String(r.account_id || ""))
      .filter((id) => id && id !== current),
  );

  return (accounts || []).filter((a) => {
    const id = String(a.account_id || "");
    if (!id || id === "undefined") return false;
    if (id === current) return true;
    if (used.has(id)) return false;
    if (a.is_external_partner) return false;
    if (String(a.owner_type || "").toLowerCase() === "owner" && parseInt(a.is_main_owner, 10) === 0) {
      return false;
    }
    return true;
  });
}

export function calcAllocationTotal(rows, excludeIdx = -1) {
  return (rows || []).reduce((sum, r, i) => {
    if (i === excludeIdx || isExternalPartnerRow(r)) return sum;
    return sum + (parseFloat(r.percentage) || 0);
  }, 0);
}

export function calcOwnershipTotal(rows) {
  return calcAllocationTotal(rows);
}

/** How much this row may hold without pushing the group total over 100%. */
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

export function ownershipRowClientId(row, fallbackIdx = 0) {
  if (row?.clientRowId) return row.clientRowId;
  if (row?.ownership_id) return `own-${row.ownership_id}`;
  if (row?.account_id) return `acct-${row.account_id}-${fallbackIdx}`;
  return `row-${fallbackIdx}`;
}

export function applyOwnershipRowFieldUpdate(row, field, val, accounts, allRows, rowIdx) {
  const r = { ...row };
  if (field === "account_id") {
    r.account_id = val;
    const acc = accounts.find((a) => String(a.account_id) === String(val));
    if (acc) {
      r.role = acc.role || "";
      r.owner_type = acc.owner_type || "";
      r.account_name = acc.account_name || "";
      r.display_name = acc.name || "";
      r.account_label = acc.account_label || formatSpringOwnershipLabel(acc);
      r.user_raw_id = String(val).startsWith("U_") ? parseInt(String(val).replace("U_", ""), 10) : null;
      r.read_only = 1;
      r.is_external_partner = false;
      r.ownership_id = null;
    } else {
      r.role = "";
      r.owner_type = "";
      r.account_name = "";
      r.display_name = "";
      r.account_label = "";
      r.user_raw_id = null;
      r.is_external_partner = false;
      r.ownership_id = null;
    }
  } else if (field === "percent_input" || field === "slider") {
    if (isExternalPartnerRow(r)) {
      r.percentage = 0;
    } else {
      let p =
        field === "percent_input"
          ? parseFloat(String(val).replace("%", ""))
          : parseFloat(val);
      if (isNaN(p)) p = 0;
      p = Math.max(0, Math.min(100, p));
      if (Array.isArray(allRows) && rowIdx >= 0) {
        p = Math.min(p, maxAllowedOwnershipPct(allRows, rowIdx));
      }
      r.percentage = Math.round(p * 100) / 100;
    }
  } else if (field === "read_only") {
    r.read_only = val;
  }
  return r;
}

export function reorderOwnershipRows(rows, from, to, insertAfter) {
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  let newIdx = to;
  if (from < to) newIdx = insertAfter ? to : to - 1;
  else newIdx = insertAfter ? to + 1 : to;
  next.splice(newIdx, 0, moved);
  return next;
}

/**
 * @returns {string|null} Error message, or null if valid.
 */
export function validateOwnershipRowsForSave(rows, messages) {
  const alloc = allocationRowsForSave(rows);
  if (alloc.some((r) => !r.account_id)) return messages.emptyAccount;
  if (calcOwnershipTotal(alloc) > 100) return messages.over100;
  const ids = alloc.map((r) => r.account_id);
  if (new Set(ids).size !== ids.length) return messages.duplicate;
  return null;
}
