/** Account List Logic Helpers */

import { formatDmyDash } from "../../utils/date/dateUtils.js";
import {
  companiesForCompanyPicker,
  companiesGroupEntityList,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
  getCachedOwnerCompanies,
  independentCompaniesForPicker,
  isDashboardGroupOnlyMode,
  normalizeCompanyGroupId,
} from "../../utils/company/sharedCompanyFilter.js";
import { fetchMergedAccountLists } from "./accountListApi.js";

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

function parseAccountLastLogin(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Last Login 列：仅展示日期 DD-MM-YYYY */
export function formatAccountLastLoginDate(raw) {
  const d = parseAccountLastLogin(raw);
  if (!d) {
    const s = String(raw || "").trim();
    return s || "-";
  }
  return formatDmyDash(d);
}

/** Last Login 悬浮提示：仅时间 HH:MM:SS */
export function formatAccountLastLoginTimeTitle(raw) {
  const d = parseAccountLastLogin(raw);
  if (!d) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${min}:${sec}`;
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
    const key = toUpper(r);
    if (!base.includes(key)) base.push(key);
  });
  return base.indexOf(toUpper(role));
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
    }
  });
  return [...out, ...Array.from(map.values()).sort((a, b) => a.localeCompare(b))];
}

/** Spring {@code UserServiceImpl.ALLOWED_ACCOUNT_LEDGER_ROLES} — full Add/Edit modal options. */
export const ACCOUNT_LEDGER_ROLES = [...ROLE_PRIORITY];

/** Add/Edit Account modal：始终展示后端允许的完整 role 列表（不只从现有账号推导）。 */
export function getAccountModalOrderedRoles(roles) {
  const merged = [...(roles || [])];
  ACCOUNT_LEDGER_ROLES.forEach((role) => {
    if (!merged.some((r) => toUpper(r) === role)) merged.push(role);
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

/** Group code (e.g. AP) → tenant.id for Spring list. */
export function resolveGroupCodeToTenantId(groupCode, companies = null) {
  const code = String(groupCode || "").trim().toUpperCase();
  if (!code) return null;
  const rows = companies || getCachedOwnerCompanies() || [];
  const entities = companiesGroupEntityList(rows, code);
  const id = Number(entities[0]?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Unique roles from loaded account rows (Spring list has no roles meta endpoint). */
export function deriveAccountRolesFromRows(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const role = String(row?.role || "").trim();
    if (role) map.set(toUpper(role), role);
  });
  return getOrderedRoles([...map.values()]);
}

/** Fetch and merge accounts across multiple tenant ids (All modes). */
export async function fetchMergedAccounts({
  companyIds = [],
  groupIds = [],
  companies = null,
  searchTerm = "",
  showInactive = false,
  showAll = false,
  signal = undefined,
}) {
  const tenantIds = [
    ...(Array.isArray(companyIds) ? companyIds : [])
      .map((raw) => Number(raw))
      .filter((id) => Number.isFinite(id) && id > 0),
  ];
  for (const gid of Array.isArray(groupIds) ? groupIds : []) {
    const tid = resolveGroupCodeToTenantId(gid, companies);
    if (tid) tenantIds.push(tid);
  }
  if (!tenantIds.length) return { success: false, accounts: [] };
  try {
    const accounts = await fetchMergedAccountLists(
      { tenantIds, searchTerm, showInactive, showAll },
      signal,
    );
    return { success: true, accounts };
  } catch (e) {
    return { success: false, message: e?.message, accounts: [] };
  }
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

  if (Array.isArray(companiesForPickerFromHook) && companiesForPickerFromHook.length > 0) {
    return companiesForPickerFromHook;
  }

  const effectiveGroup = String(selectedGroup).trim().toUpperCase();
  return dedupeOwnerCompaniesByCode(
    companiesForCompanyPicker(companies, effectiveGroup, groupIds),
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

/** Whether Add / list mutations have a resolvable company or group ledger scope. */
export function accountListHasMutationScope(
  scopeCompanyId,
  { groupOnly = false, selectedGroup = null, canUseGroupLedger = false } = {},
) {
  const cid = scopeCompanyId != null ? Number(scopeCompanyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) return true;
  const gid = String(selectedGroup || "").trim().toUpperCase();
  return Boolean(groupOnly && gid && canUseGroupLedger);
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
