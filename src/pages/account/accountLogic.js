/** Account List Logic Helpers */

import { buildApiUrl } from "../../utils/core/apiUrl.js";
import {
  fetchAccountListByTenantId,
  filterAccountListRows,
  resolveAccountListTenantId,
} from "./accountListApi.js";
import {
  companiesInGroupList,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
  independentCompaniesForPicker,
  isDashboardGroupOnlyMode,
  normalizeCompanyGroupId,
} from "../../utils/company/sharedCompanyFilter.js";

export const PAGE_SIZE = 25;

export const ROLE_PRIORITY = ["CAPITAL", "BANK", "CASH", "PROFIT", "EXPENSES", "COMPANY", "PARTNER", "STAFF", "SUPPLIER", "AGENT", "MEMBER", "DEBTOR"];

export const DEFAULT_FORM = {
  id: "",
  account_id: "",
  name: "",
  role: "",
  password: "",
  remark: "",
  payment_alert: "0",
  alert_type: "",
  alert_start_date: "",
  alert_amount: "",
};

export function toUpper(v) {
  return String(v || "").toUpperCase();
}

export function normalizeAlertAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const num = Number(raw);
  if (Number.isNaN(num)) return "";
  if (num > 0) return `-${num}`;
  return String(num);
}

export function roleSortOrder(role, knownRoles) {
  const base = [...ROLE_PRIORITY];
  (knownRoles || []).forEach((r) => {
    const key = toUpper(r) === "UPLINE" ? "SUPPLIER" : toUpper(r);
    if (!base.includes(key)) base.push(key);
  });
  return base.indexOf(toUpper(role) === "UPLINE" ? "SUPPLIER" : toUpper(role));
}

export function getOrderedRoles(roles) {
  const map = new Map();
  (roles || []).forEach((r) => {
    const t = String(r || "").trim();
    if (t) map.set(toUpper(t), t);
  });
  const out = [];
  ROLE_PRIORITY.forEach((p) => {
    if (map.has(p)) {
      out.push(map.get(p));
      map.delete(p);
    } else if (p === "SUPPLIER" && map.has("UPLINE")) {
      out.push(map.get("UPLINE"));
      map.delete("UPLINE");
    }
  });
  return [...out, ...Array.from(map.values()).sort((a, b) => a.localeCompare(b))];
}

/** 账本账户角色（Add/Edit 弹窗固定列表，不依赖 editdata API） */
export const ACCOUNT_LEDGER_ROLES = [...ROLE_PRIORITY];

export function getAccountModalOrderedRoles(extraRoles = []) {
  const merged = [...ACCOUNT_LEDGER_ROLES];
  (extraRoles || []).forEach((r) => {
    const t = String(r || "").trim();
    if (t && !merged.some((x) => toUpper(x) === toUpper(t))) {
      merged.push(t);
    }
  });
  return getOrderedRoles(merged);
}

export function normalizeCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? row.group ?? null,
    company_id: row.company_id ?? row.companyId ?? row.code ?? "",
  };
}

/** 与 User List 一致：隐藏集团分润/合并产生的虚拟公司行 */
export function isVirtualGroupLinkCompanyRow(c) {
  const ls = c?.link_source_group ?? c?.linkSourceGroup;
  return ls != null && String(ls).trim() !== "";
}

export function buildAccountsFetchKey(companyId, searchTerm, showInactive, showAll) {
  return `${companyId || ""}|${String(searchTerm || "").trim()}|${showInactive ? "1" : "0"}|${showAll ? "1" : "0"}`;
}

/** Spring list URL (POST) — prefer {@link fetchAccountsForCompany}. */
export function buildAccountsUrl(companyId) {
  const tid = resolveAccountListTenantId(companyId);
  return buildApiUrl(`api/account/list?tenant_id=${encodeURIComponent(tid ?? "")}`);
}

/** POST /api/account/list with client-side filters. */
export async function fetchAccountsForCompany(
  companyId,
  { searchTerm = "", showInactive = false, showAll = false, signal, allStatuses = false } = {},
) {
  const tid = resolveAccountListTenantId(companyId);
  if (!tid) {
    return { success: false, message: "tenantIdRequired", data: { accounts: [] } };
  }
  try {
    const rows = await fetchAccountListByTenantId(tid, signal);
    const accounts = allStatuses
      ? filterAccountListRows(rows, { searchTerm, applyStatusFilter: false })
      : filterAccountListRows(rows, { searchTerm, showInactive, showAll });
    return { success: true, data: { accounts } };
  } catch (e) {
    return {
      success: false,
      message: e?.message || "failedToLoadAccounts",
      data: { accounts: [] },
    };
  }
}

export function buildGroupAccountsUrl(groupId, searchTerm, showInactive, showAll, { groupOnly = true } = {}) {
  const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
  url.searchParams.set("group_id", String(groupId));
  if (groupOnly) url.searchParams.set("group_only", "1");
  if (String(searchTerm || "").trim()) url.searchParams.set("search", String(searchTerm || "").trim());
  if (showInactive) url.searchParams.set("showInactive", "1");
  if (showAll) url.searchParams.set("showAll", "1");
  return url;
}

function mergeAccountRows(jsonList) {
  const byId = new Map();
  for (const json of jsonList) {
    if (!json?.success) continue;
    const rows = Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
    for (const row of rows) {
      const id = Number(row?.id);
      if (Number.isFinite(id) && id > 0) byId.set(id, row);
    }
  }
  return [...byId.values()];
}

/** Fetch and merge accounts across multiple companies / groups (All modes). */
export async function fetchMergedAccounts({
  companyIds = [],
  groupIds = [],
  searchTerm = "",
  showInactive = false,
  showAll = false,
  signal = undefined,
}) {
  const tasks = [];
  for (const cid of companyIds) {
    tasks.push(
      fetchAccountsForCompany(cid, { searchTerm, showInactive, showAll, signal }),
    );
  }
  for (const gid of groupIds) {
    tasks.push(
      fetch(buildGroupAccountsUrl(gid, searchTerm, showInactive, showAll).toString(), {
        credentials: "include",
        signal,
      }).then((r) => r.json()),
    );
  }
  if (!tasks.length) return { success: false, accounts: [] };
  const results = await Promise.all(tasks);
  const failed = results.find((j) => !j?.success);
  if (failed) return { success: false, message: failed.message, accounts: [] };
  return { success: true, accounts: mergeAccountRows(results) };
}

/** Add Account：列表中有 MYR 时默认勾选，否则默认第一个 currency */
export function pickDefaultAddCurrencyIds(currencies) {
  const list = Array.isArray(currencies) ? currencies : [];
  if (!list.length) return [];
  const myr = list.find((c) => toUpper(c.code) === "MYR");
  if (myr) return [Number(myr.id)];
  const first = list[0];
  return first?.id != null ? [Number(first.id)] : [];
}

/** Company pills shown in Account List inline filter (matches AccountListPage useMemo). */
export function resolveAccountListInlinePickerCompanies({
  companies = [],
  groupIds = [],
  selectedGroup = null,
  preferredCompanyId = null,
  companiesForPickerFromHook = null,
  groupFilterOptOut = false,
} = {}) {
  const independentPicker = () => {
    const list = independentCompaniesForPicker(companies, groupIds);
    if (list.length) {
      return dedupeOwnerCompaniesByCode(list, preferredCompanyId);
    }
    return excludeGroupLabelsFromCompanyPicker(
      dedupeOwnerCompaniesByCode(filterCompaniesWithDisplayId(companies), preferredCompanyId),
      groupIds,
    ).filter((c) => !normalizeCompanyGroupId(c));
  };

  if (!selectedGroup || groupFilterOptOut) {
    return independentPicker();
  }

  const effectiveGroup = String(selectedGroup).trim().toUpperCase();
  return dedupeOwnerCompaniesByCode(
    excludeGroupLabelsFromCompanyPicker(companiesInGroupList(companies, effectiveGroup), groupIds),
    preferredCompanyId,
  );
}

export function isCompanyInAccountListPicker(options, companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return false;
  return resolveAccountListInlinePickerCompanies(options).some((c) => Number(c.id) === cid);
}

/** List fetch is allowed only with an active company pill or explicit group-only mode. */
export function shouldLoadAccountListData({
  companyId = null,
  selectedGroup = null,
  groupOnlyMode = false,
  groupsAllMode = false,
  groupAllMode = false,
} = {}) {
  if (groupsAllMode || groupAllMode) return true;
  if (companyId != null && Number(companyId) > 0) return true;
  if (groupOnlyMode && selectedGroup) return true;
  return false;
}

/** Whether Spring account mutations have a tenant scope (company pill id === tenant.id). */
export function accountListHasMutationScope(activeTenantId) {
  const tid = activeTenantId != null ? Number(activeTenantId) : Number.NaN;
  return Number.isFinite(tid) && tid > 0;
}

export function readAccountListGroupFilterOptOut() {
  return (
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
  );
}

export function resolveAccountListGroupOnlyFetch(selectedGroup, companyId, groupsAllMode, groupAllMode) {
  const sg = String(selectedGroup || "").trim().toUpperCase();
  const cid = companyId != null ? Number(companyId) : null;
  if (!sg || (cid != null && cid > 0) || groupAllMode || groupsAllMode) return false;
  return isDashboardGroupOnlyMode();
}
