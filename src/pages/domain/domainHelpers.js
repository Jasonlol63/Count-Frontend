// domainHelpers.js — Pure utility functions extracted from domain.js

import { formatDmyDash, formatYmd, parseDdMmYyyyToYmd, parseYmd } from "../../utils/date/dateUtils.js";

// ★★★ SINGLE_CATEGORY_MODE ★★★
// true: Company Settings 弹窗中 Permissions 只能选择一个分类（互斥）
export const SINGLE_CATEGORY_MODE = true;

export const MAX_VISIBLE_CHIPS = 3;

// ===================== Date Helpers =====================

/**
 * 计算到期日期
 * @param {string} period - '7days'|'1month'|'3months'|'6months'|'1year'
 * @param {string|null} startDate - YYYY-MM-DD, null → today
 * @returns {string} YYYY-MM-DD
 */
export function calculateExpirationDate(period, startDate = null) {
  let baseDate = null;
  if (startDate) {
    if (typeof startDate === "string") {
      const ymd = startDate.includes("-") ? startDate : parseDdMmYyyyToYmd(startDate);
      baseDate = ymd ? parseYmd(ymd) : null;
    } else if (startDate instanceof Date) {
      baseDate = Number.isNaN(startDate.getTime()) ? null : new Date(startDate);
    }
  }
  if (!baseDate || Number.isNaN(baseDate.getTime())) {
    baseDate = new Date();
  }
  baseDate.setHours(0, 0, 0, 0);
  const expDate = new Date(baseDate);

  switch (period) {
    case "7days":
      expDate.setDate(baseDate.getDate() + 7);
      break;
    case "1month":
      expDate.setMonth(baseDate.getMonth() + 1);
      break;
    case "3months":
      expDate.setMonth(baseDate.getMonth() + 3);
      break;
    case "6months":
      expDate.setMonth(baseDate.getMonth() + 6);
      break;
    case "1year":
      expDate.setFullYear(baseDate.getFullYear() + 1);
      break;
    default:
      expDate.setMonth(baseDate.getMonth() + 1);
  }

  if (Number.isNaN(expDate.getTime())) {
    return formatYmd(new Date());
  }
  return formatYmd(expDate);
}

/** 格式化日期显示 */
export function formatDate(dateString) {
  return formatDmyDash(dateString);
}

/** Map days-until-expiration to sidebar urgency class (matches includes/expiration_status.php). */
export function expirationStatusFromDays(diffDays) {
  if (diffDays == null || Number.isNaN(diffDays)) return "normal";
  if (diffDays < 0) return "expired";
  if (diffDays <= 7) return "exp-critical";
  if (diffDays <= 15) return "exp-orange";
  if (diffDays <= 30) return "exp-yellow";
  return "normal";
}

/** 计算倒计时 */
export function calculateCountdown(expirationDate) {
  if (!expirationDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate);
  exp.setHours(0, 0, 0, 0);

  const diffTime = exp - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const status = expirationStatusFromDays(diffDays);

  if (diffDays < 0) {
    return { text: "Expired", days: diffDays, status };
  } else if (diffDays === 0) {
    return { text: "Expires today", days: 0, status };
  } else if (diffDays <= 30) {
    return {
      text: `${diffDays} day${diffDays > 1 ? "s" : ""} left`,
      days: diffDays,
      status,
    };
  } else {
    const months = Math.floor(diffDays / 30);
    const days = diffDays % 30;
    if (days === 0) {
      return {
        text: `${months} month${months > 1 ? "s" : ""} left`,
        days: diffDays,
        status: "normal",
      };
    }
    return { text: `${months}m ${days}d left`, days: diffDays, status: "normal" };
  }
}

/** 根据到期日期反推 period */
export function getPeriodFromDate(expirationDate) {
  if (!expirationDate) return "1month";

  const today = new Date();
  const exp = new Date(expirationDate);
  const diffMonths =
    (exp.getFullYear() - today.getFullYear()) * 12 +
    (exp.getMonth() - today.getMonth());
  const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

  if (diffDays >= 360 && diffDays <= 370) return "1year";
  if (diffDays >= 175 && diffDays <= 190) return "6months";
  if (diffDays >= 88 && diffDays <= 95) return "3months";
  if (diffDays >= 28 && diffDays <= 32) return "1month";
  if (diffDays >= 5 && diffDays <= 9) return "7days";

  if (diffMonths >= 11) return "1year";
  if (diffMonths >= 5) return "6months";
  if (diffMonths >= 2) return "3months";
  if (diffDays >= 28) return "1month";
  return "7days";
}

// ===================== Fee Share Helpers =====================

export const DEFAULT_PROFIT_ACCOUNT_CODES = ["C168", "PROFIT"];

export function defaultFeeShareAllocations() {
  return { profit: [], sales: [], cs: [], it: [] };
}

/** C168 profit-role account for Share % Profit pool (prefer account_id C168). */
export function resolveDefaultProfitAccountId(accountsProfit) {
  const list = Array.isArray(accountsProfit) ? accountsProfit : [];
  for (const code of DEFAULT_PROFIT_ACCOUNT_CODES) {
    const hit = list.find(
      (a) => String(a?.account_id ?? "").trim().toUpperCase() === code
    );
    const id = hit?.id != null ? parseInt(hit.id, 10) : 0;
    if (id > 0) return id;
  }
  const first = list[0];
  const firstId = first?.id != null ? parseInt(first.id, 10) : 0;
  return firstId > 0 ? firstId : 0;
}

export function profitAllocationHasAssignedAccount(fsa) {
  const profit = Array.isArray(fsa?.profit) ? fsa.profit : [];
  return profit.some((r) => parseInt(r?.account_id, 10) > 0);
}

/** When Profit has no account, default to C168 (profit-role account under C168 company). */
export function applyDefaultProfitAllocation(fsa, accountsProfit) {
  const base =
    fsa && typeof fsa === "object"
      ? {
          profit: Array.isArray(fsa.profit) ? [...fsa.profit] : [],
          sales: Array.isArray(fsa.sales) ? [...fsa.sales] : [],
          cs: Array.isArray(fsa.cs) ? [...fsa.cs] : [],
          it: Array.isArray(fsa.it) ? [...fsa.it] : [],
        }
      : defaultFeeShareAllocations();
  if (profitAllocationHasAssignedAccount(base)) return base;
  const aid = resolveDefaultProfitAccountId(accountsProfit);
  if (!aid) return base;
  return { ...base, profit: [{ account_id: aid, percentage: "" }] };
}

export function normalizeFeeShareFromServer(raw) {
  const d = defaultFeeShareAllocations();
  if (!raw || typeof raw !== "object") return d;
  ["profit", "sales", "cs", "it"].forEach((k) => {
    if (Array.isArray(raw[k])) {
      d[k] = raw[k]
        .map((r) => ({
          account_id: parseInt(r.account_id, 10) || 0,
          percentage: r.percentage != null ? parseFloat(r.percentage) : 0,
        }))
        .filter((r) => r.account_id !== 0);
    }
  });
  return d;
}

export function ensureCompanyFeeShare(company) {
  if (!company) return;
  if (
    !company.fee_share_allocations ||
    typeof company.fee_share_allocations !== "object"
  ) {
    company.fee_share_allocations = defaultFeeShareAllocations();
  }
  ["profit", "sales", "cs", "it"].forEach((k) => {
    if (!Array.isArray(company.fee_share_allocations[k])) {
      company.fee_share_allocations[k] = [];
    }
  });
}

export function isFeeShareAllocationsEmpty(fs) {
  if (!fs || typeof fs !== "object") return true;
  return (
    (!fs.profit || !fs.profit.length) &&
    (!fs.sales || !fs.sales.length) &&
    (!fs.cs || !fs.cs.length) &&
    (!fs.it || !fs.it.length)
  );
}

export function pruneEmptyShareRows(fs) {
  const out = defaultFeeShareAllocations();
  if (!fs || typeof fs !== "object") return out;
  ["profit", "sales", "cs", "it"].forEach((role) => {
    const rows = Array.isArray(fs[role]) ? fs[role] : [];
    out[role] = rows
      .filter((row) => {
        const aid =
          row && row.account_id !== undefined
            ? parseInt(row.account_id, 10)
            : 0;
        return aid !== 0;
      })
      .map((row) => {
        const pct =
          row &&
          row.percentage !== undefined &&
          row.percentage !== null &&
          row.percentage !== ""
            ? parseFloat(row.percentage)
            : "";
        return {
          account_id: parseInt(row.account_id, 10) || 0,
          percentage: isFinite(pct) ? pct : "",
        };
      });
  });
  return out;
}

/**
 * Group 实体行：company_id 与 group_id 相同，或 company_id 为空仅带 group_id（与 PHP ensureGroupEntityCompanyId 一致）。
 * 此类行不算「独立公司」，不与 Group ID 做互斥冲突。
 */
export function domainCompanyRowIsGroupEntity(company) {
  const gid = String(company?.group_id ?? "").trim().toUpperCase();
  if (!gid) return false;
  const cid = String(company?.company_id ?? "").trim().toUpperCase();
  return cid === gid || cid === "";
}

/** 将 tempCompany 对象映射为 API payload entry */
export function companyToDomainPayloadEntry(c) {
  const companyId = String(c.company_id ?? "").trim().toUpperCase();
  const entry = {
    company_id: companyId,
    expiration_date: c.expiration_date,
    permissions: Array.isArray(c.permissions) ? c.permissions : [],
    group_id: c.group_id || null,
    fee_share_allocations: normalizeFeeShareFromServer(c.fee_share_allocations),
    apply_commission_payments_on_domain_save:
      !!c.apply_commission_payments_on_domain_save,
  };
  const period = String(c.selectedPeriod ?? c.period ?? "").trim();
  if (period && DOMAIN_FEE_PERIOD_KEYS.includes(period)) {
    entry.selectedPeriod = period;
  }
  const startYmd = normalizeDomainStartDateYmd(c.startDate ?? c.start_date ?? "");
  if (startYmd) {
    entry.startDate = startYmd;
  }
  const previousId = String(c.previous_company_id ?? "").trim().toUpperCase();
  if (previousId && previousId !== companyId) {
    entry.previous_company_id = previousId;
  }
  return entry;
}

export function createEmptyGroup(groupCode) {
  const code = String(groupCode || "").trim().toUpperCase();
  const today = new Date().toISOString().split("T")[0];
  return {
    group_code: code,
    expiration_date: null,
    originalExpirationDate: null,
    startDate: today,
    selectedPeriod: null,
    isExtending: false,
    permissions: [],
    fee_share_allocations: defaultFeeShareAllocations(),
    apply_commission_payments_on_domain_save: false,
  };
}

/** API / temp group row → form state */
export function groupFromApiRow(row) {
  const code = String(row?.group_code ?? "").trim().toUpperCase();
  const g = {
    group_code: code,
    expiration_date: row?.expiration_date || null,
    permissions: Array.isArray(row?.permissions) ? row.permissions : [],
    fee_share_allocations: normalizeFeeShareFromServer(row?.fee_share_allocations),
    apply_commission_payments_on_domain_save:
      !!row?.apply_commission_payments_on_domain_save,
  };
  ensureCompanyFeeShare(g);
  g.originalExpirationDate = g.expiration_date || null;
  g.selectedPeriod = null;
  g.startDate = new Date().toISOString().split("T")[0];
  g.isExtending = false;
  return g;
}

export function groupToDomainPayloadEntry(g) {
  const groupCode = String(g.group_code ?? "").trim().toUpperCase();
  const entry = {
    group_code: groupCode,
    expiration_date: g.expiration_date,
    permissions: Array.isArray(g.permissions) ? g.permissions : [],
    fee_share_allocations: normalizeFeeShareFromServer(g.fee_share_allocations),
    apply_commission_payments_on_domain_save:
      !!g.apply_commission_payments_on_domain_save,
  };
  const period = String(g.selectedPeriod ?? g.period ?? "").trim();
  if (period && DOMAIN_FEE_PERIOD_KEYS.includes(period)) {
    entry.selectedPeriod = period;
  }
  const startYmd = normalizeDomainStartDateYmd(g.startDate ?? g.start_date ?? "");
  if (startYmd) {
    entry.startDate = startYmd;
  }
  const previousCode = String(g.previous_group_code ?? "").trim().toUpperCase();
  if (previousCode && previousCode !== groupCode) {
    entry.previous_group_code = previousCode;
  }
  return entry;
}

export function tempGroupCode(groupOrCode) {
  if (groupOrCode == null) return "";
  if (typeof groupOrCode === "string") return groupOrCode.trim().toUpperCase();
  return String(groupOrCode.group_code ?? "").trim().toUpperCase();
}

/** Normalize Start Date / daystart to YYYY-MM-DD (empty if invalid). */
export function normalizeDomainStartDateYmd(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (s.includes("-")) {
    const ymd = s.split("T")[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
    return "";
  }
  return parseDdMmYyyyToYmd(s) || "";
}

/**
 * Non-C168 companies/groups must have an expiration date before domain Confirm.
 * @returns {{ id: string, kind: 'company'|'group' }|null}
 */
export function findMissingExpirationDate(companies, groups) {
  const cos = Array.isArray(companies) ? companies : [];
  for (const c of cos) {
    const id = String(c?.company_id ?? "").trim().toUpperCase();
    if (!id || id === "C168") continue;
    const exp = c?.expiration_date;
    if (exp == null || String(exp).trim() === "") {
      return { id, kind: "company" };
    }
  }
  const gs = Array.isArray(groups) ? groups : [];
  for (const g of gs) {
    const id = String(g?.group_code ?? "").trim().toUpperCase();
    if (!id || id === "C168") continue;
    const exp = g?.expiration_date;
    if (exp == null || String(exp).trim() === "") {
      return { id, kind: "group" };
    }
  }
  return null;
}

/**
 * When Charge is On, Start Date is required (used as transaction_date).
 * @returns {{ id: string, kind: 'company'|'group' }|null}
 */
export function findChargeMissingStartDate(companies, groups) {
  const cos = Array.isArray(companies) ? companies : [];
  for (const c of cos) {
    if (!c?.apply_commission_payments_on_domain_save) continue;
    const id = String(c.company_id ?? "").trim().toUpperCase();
    if (!id || id === "C168") continue;
    if (!normalizeDomainStartDateYmd(c.startDate ?? c.start_date ?? "")) {
      return { id, kind: "company" };
    }
  }
  const gs = Array.isArray(groups) ? groups : [];
  for (const g of gs) {
    if (!g?.apply_commission_payments_on_domain_save) continue;
    const id = String(g.group_code ?? "").trim().toUpperCase();
    if (!id || id === "C168") continue;
    if (!normalizeDomainStartDateYmd(g.startDate ?? g.start_date ?? "")) {
      return { id, kind: "group" };
    }
  }
  return null;
}

// ===================== Display Helpers =====================

/** Domain Price 弹窗未配置时的默认金额（1 年，兼容旧逻辑） */
export const DEFAULT_DOMAIN_FEE_PRICE = "2400";

/** 各周期默认价（编辑框初始值） */
export const DOMAIN_FEE_PERIOD_KEYS = ["7days", "1month", "3months", "6months", "1year"];

export function defaultDomainPeriodPrices() {
  return {
    "7days": "",
    "1month": "",
    "3months": "",
    "6months": "",
    "1year": DEFAULT_DOMAIN_FEE_PRICE,
  };
}

export function emptyDomainPeriodPrices() {
  return {
    "7days": "",
    "1month": "",
    "3months": "",
    "6months": "",
    "1year": "",
  };
}

/** @returns {{ company: Record<string, string>, group: Record<string, string> }} */
export function defaultDomainFeeSettings() {
  return {
    company: defaultDomainPeriodPrices(),
    group: emptyDomainPeriodPrices(),
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @param {'company'|'group'} kind
 */
function normalizeSinglePeriodPricesFromApi(raw, kind) {
  const out = emptyDomainPeriodPrices();
  if (!raw || typeof raw !== "object") return out;

  let source = null;
  if (kind === "company") {
    if (raw.company && typeof raw.company === "object" && !raw.company_period_prices) {
      source = raw.company;
    } else if (raw.company_period_prices && typeof raw.company_period_prices === "object") {
      source = raw.company_period_prices;
    } else if (raw.period_prices && typeof raw.period_prices === "object") {
      if (raw.period_prices.company && typeof raw.period_prices.company === "object") {
        source = raw.period_prices.company;
      } else {
        source = raw.period_prices;
      }
    }
  } else if (raw.group && typeof raw.group === "object" && !raw.group_period_prices) {
    source = raw.group;
  } else if (raw.group_period_prices && typeof raw.group_period_prices === "object") {
    source = raw.group_period_prices;
  } else if (raw.period_prices?.group && typeof raw.period_prices.group === "object") {
    source = raw.period_prices.group;
  }

  if (source) {
    DOMAIN_FEE_PERIOD_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const formatted = formatDomainFeeEdit2(source[key]);
        out[key] = formatted !== "" ? formatted : "";
      }
    });
    return out;
  }

  const legacyRaw =
    kind === "group"
      ? raw.group_price
      : raw.company_price ?? raw.price;
  const legacy = formatDomainFeeEdit2(legacyRaw);
  if (legacy !== "") {
    out["6months"] = legacy;
  }
  return out;
}

/** @param {Record<string, unknown>|null|undefined} raw */
export function normalizeDomainFeeSettingsFromApi(raw) {
  return {
    company: normalizeSinglePeriodPricesFromApi(raw, "company"),
    group: normalizeSinglePeriodPricesFromApi(raw, "group"),
  };
}

/** @deprecated Use normalizeDomainFeeSettingsFromApi — returns company period prices only. */
export function normalizeDomainPeriodPricesFromApi(raw) {
  return normalizeDomainFeeSettingsFromApi(raw).company;
}

/**
 * 按所选周期取 Domain Price（Settings 弹窗中分成基数）
 * @param {{ company?: Record<string, string>, group?: Record<string, string> }|Record<string, string>|null|undefined} feeSettings
 * @param {string} period
 * @param {'company'|'group'} [feeKind]
 */
export function resolveDomainFeePriceForPeriod(feeSettings, period, feeKind = "company") {
  if (!period) return 0;

  let periodPrices = feeSettings;
  if (feeSettings && (feeSettings.company || feeSettings.group)) {
    periodPrices = feeSettings[feeKind] ?? feeSettings.company ?? {};
  }

  if (periodPrices && periodPrices[period] !== undefined && periodPrices[period] !== "") {
    const n = Number(periodPrices[period]);
    if (isFinite(n)) return n;
  }

  if (!feeSettings || feeSettings.company || feeSettings.group) {
    return 0;
  }

  const flatKey = feeKind === "group" ? "group_price" : "company_price";
  if (feeSettings[flatKey] !== undefined && feeSettings[flatKey] !== "") {
    const flat = Number(feeSettings[flatKey]);
    if (isFinite(flat)) return flat;
  }
  return 0;
}

/** 摘要：列出已配置的非零周期价 */
export function formatDomainPeriodPricesInlineSummary(periodPrices, t) {
  if (!periodPrices || typeof periodPrices !== "object") return "";
  const parts = [];
  const labels = {
    "7days": t("sevenDays"),
    "1month": t("oneMonth"),
    "3months": t("threeMonths"),
    "6months": t("sixMonths"),
    "1year": t("oneYear"),
  };
  DOMAIN_FEE_PERIOD_KEYS.forEach((key) => {
    const disp = formatDomainFeeDisplay2(periodPrices[key]);
    if (disp !== "—") parts.push(`${labels[key]} ${disp}`);
  });
  return parts.join(" · ");
}

/** @param {{ company?: Record<string, string>, group?: Record<string, string> }|null|undefined} feeSettings */
export function formatDomainFeeSettingsInlineSummary(feeSettings, t) {
  const groupPart = formatDomainPeriodPricesInlineSummary(feeSettings?.group, t);
  const companyPart = formatDomainPeriodPricesInlineSummary(feeSettings?.company, t);
  if (groupPart && companyPart) {
    return t("feeInlineSummary", { group: groupPart, company: companyPart });
  }
  if (companyPart) return companyPart;
  if (groupPart) return groupPart;
  return "";
}

/** 固定两位小数展示 */
export function formatDomainFeeDisplay2(val) {
  if (val === null || val === undefined || val === "") return "—";
  const n = Number(val);
  if (!isFinite(n)) return "—";
  return n.toFixed(2);
}

/** 固定两位小数用于输入框 */
export function formatDomainFeeEdit2(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = Number(val);
  if (!isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatShareRowAmount2(value) {
  const n = Number(value);
  if (!isFinite(n)) return "0.00";
  return n.toFixed(2);
}

/** Sum percentages for a fee share role */
export function sumFeeShareRolePercentages(rows) {
  if (!rows || !rows.length) return 0;
  return rows.reduce((acc, r) => acc + (parseFloat(r && r.percentage) || 0), 0);
}

// ===================== Spring Boot bridging (tenant / feature module / fee share) =====================
// See Count/docs/frontend-springboot-migration.md §4.2 / §14 for the backend contract.

/** feature_module seed rows (schema.sql) — fixed id ↔ Games/Bank/Loan/Rate/Money name. */
const FEATURE_MODULE_NAME_TO_ID = { Games: 1, Bank: 2, Loan: 3, Rate: 4, Money: 5 };
const FEATURE_MODULE_ID_TO_NAME = { 1: "Games", 2: "Bank", 3: "Loan", 4: "Rate", 5: "Money" };

/** Spring Tenant.featureModules (full FeatureModule rows) → UI permission name list. */
export function featureModulesToPermissionNames(featureModules) {
  if (!Array.isArray(featureModules)) return [];
  return featureModules
    .map((m) => {
      if (!m) return null;
      if (m.name && FEATURE_MODULE_NAME_TO_ID[m.name] != null) return m.name;
      const id = Number(m.id);
      return FEATURE_MODULE_ID_TO_NAME[id] || null;
    })
    .filter(Boolean);
}

/** UI permission name list → Tenant.featureModules write shape (only `id` is read server-side). */
export function permissionNamesToFeatureModules(names) {
  const list = Array.isArray(names) ? names : [];
  return list
    .map((n) => FEATURE_MODULE_NAME_TO_ID[n])
    .filter((id) => Number.isFinite(id))
    .map((id) => ({ id }));
}

const SHARE_TYPE_TO_ROLE = { SALES: "sales", CS: "cs", IT: "it", PROFIT: "profit" };
const ROLE_TO_SHARE_TYPE = { sales: "SALES", cs: "CS", it: "IT", profit: "PROFIT" };

/**
 * Spring `TenantFeeShareAllocate[]` → UI `{profit,sales,cs,it}`.
 * Idempotent: already-UI-shaped input (has array props under those keys, not a bare array) passes through.
 */
export function feeShareSpringToUi(raw) {
  const out = defaultFeeShareAllocations();
  if (raw && !Array.isArray(raw) && typeof raw === "object") {
    ["profit", "sales", "cs", "it"].forEach((role) => {
      if (Array.isArray(raw[role])) out[role] = raw[role];
    });
    return out;
  }
  const rows = Array.isArray(raw) ? raw : [];
  for (const row of rows) {
    const shareType = String(row?.shareType ?? row?.share_type ?? "").toUpperCase();
    const role = SHARE_TYPE_TO_ROLE[shareType];
    if (!role) continue;
    // Partner-tenant ("group" ownerType) rows aren't rendered by the UI yet — skip, keep account-based rows only.
    const accountId = parseInt(row?.accountId ?? row?.account_id, 10);
    if (!accountId) continue;
    out[role].push({
      account_id: accountId,
      percentage: row?.percentage != null ? Number(row.percentage) : 0,
    });
  }
  return out;
}

/**
 * Profit has no % input in the UI (see CompanySettingsModal) — its share is always the remainder
 * after Sales/CS/IT, split evenly across assigned Profit accounts (same rounding as computeShareTotals's
 * profitRowAmounts, kept independent here to avoid touching the already-working display path).
 */
export function distributeProfitPercentages(fsa) {
  const source = fsa && typeof fsa === "object" ? fsa : defaultFeeShareAllocations();
  const salesSum = sumFeeShareRolePercentages(source.sales);
  const csSum = sumFeeShareRolePercentages(source.cs);
  const itSum = sumFeeShareRolePercentages(source.it);
  const profitPool = Math.max(0, 100 - (salesSum + csSum + itSum));

  const profitRows = Array.isArray(source.profit) ? source.profit : [];
  const assignedIdxs = [];
  profitRows.forEach((r, idx) => {
    if (parseInt(r?.account_id, 10)) assignedIdxs.push(idx);
  });
  const perBase = assignedIdxs.length > 0 ? profitPool / assignedIdxs.length : 0;
  const perRounded = Math.round(perBase * 10000) / 10000;

  let assignedSumPct = 0;
  const nextProfit = profitRows.map((r, idx) => {
    const pos = assignedIdxs.indexOf(idx);
    if (pos === -1) return { ...r, percentage: 0 };
    const isLast = pos === assignedIdxs.length - 1;
    const pct = isLast
      ? Math.round((profitPool - assignedSumPct) * 10000) / 10000
      : perRounded;
    if (!isLast) assignedSumPct += pct;
    return { ...r, percentage: pct };
  });

  return { ...source, profit: nextProfit };
}

/**
 * UI `{profit,sales,cs,it}` → Spring `TenantFeeShareAllocate[]` write shape.
 * Profit rows: ownerType "owner", percentage computed via distributeProfitPercentages.
 * Sales/CS/IT rows: ownerType "user", percentage taken as entered.
 */
export function feeShareUiToSpring(fsaUi, tenantId) {
  const withProfit = distributeProfitPercentages(fsaUi);
  const rows = [];
  ["sales", "cs", "it"].forEach((role) => {
    const list = Array.isArray(withProfit[role]) ? withProfit[role] : [];
    for (const r of list) {
      const accountId = parseInt(r?.account_id, 10);
      if (!accountId) continue;
      rows.push({
        tenantId,
        shareType: ROLE_TO_SHARE_TYPE[role],
        ownerType: "user",
        accountId,
        percentage: r?.percentage !== "" && r?.percentage != null ? Number(r.percentage) : 0,
      });
    }
  });
  const profitList = Array.isArray(withProfit.profit) ? withProfit.profit : [];
  for (const r of profitList) {
    const accountId = parseInt(r?.account_id, 10);
    if (!accountId) continue;
    rows.push({
      tenantId,
      shareType: "PROFIT",
      ownerType: "owner",
      accountId,
      percentage: r?.percentage != null ? Number(r.percentage) : 0,
    });
  }
  return rows;
}

/**
 * tempGroups/tempCompanies entry → `Tenant` write shape for `DomainDTO.groups[]`/`companies[]`.
 * `code` is the only field the backend actually matches on for add-vs-update; `tenantType`/`name`/
 * `status` are always forced server-side, and `expirationDate` is discarded for an existing tenant
 * on `/update` (real expiration is set via the follow-up `update-setting` call) — see
 * DomainServiceImpl.createDomain/updateDomain.
 */
export function groupToTenantSaveEntry(g) {
  return {
    code: tempGroupCode(g),
    expirationDate: g?.expiration_date || null,
  };
}

/** @see groupToTenantSaveEntry — `parentGroupCode` must match a code in the same request's groups[]. */
export function companyToTenantSaveEntry(c) {
  const code = String(c?.company_id ?? c?.code ?? "").trim().toUpperCase();
  const groupCode = c?.group_id ? String(c.group_id).trim().toUpperCase() : null;
  return {
    code,
    expirationDate: c?.expiration_date || null,
    parentGroupCode: groupCode,
  };
}

/** UI period-price edit state (strings) → Spring `PeriodPrices` DTO (numbers, same "7days" style keys). */
export function periodPricesUiToFeeDto(periodPrices) {
  const out = {};
  DOMAIN_FEE_PERIOD_KEYS.forEach((key) => {
    const raw = periodPrices?.[key];
    const n = raw !== "" && raw != null ? Number(raw) : null;
    out[key] = Number.isFinite(n) ? n : null;
  });
  return out;
}

/** Check if a card/domain contains protected company C168 */
export function hasProtectedCompany(companiesFull) {
  if (!Array.isArray(companiesFull) || companiesFull.length === 0) return false;
  return companiesFull.some(
    (c) => String(c.company_id || "").trim().toUpperCase() === "C168"
  );
}

// ===================== Input Helpers =====================

/** Force uppercase */
export function forceUppercaseValue(value) {
  return String(value || "").toUpperCase();
}

/** Force lowercase and filter Chinese characters */
export function forceLowercaseValue(value) {
  return String(value || "")
    .replace(/[\u4e00-\u9fa5]/g, "")
    .toLowerCase();
}

/** Force numeric only, max 6 digits */
export function forceNumericValue(value) {
  return String(value || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 6);
}

/** Search input filter: uppercase alphanumeric only */
export function forceSearchValue(value) {
  return String(value || "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

// ===================== Share Calculation =====================

/**
 * Calculate share totals for all roles, given the fee_share_allocations
 * and the domain fee price.
 * Returns { profit, sales, cs, it } totals and per-row amounts.
 */
export function computeShareTotals(fsa, price) {
  const p = Number(price) || 0;
  const salesSum = sumFeeShareRolePercentages(fsa.sales);
  const csSum = sumFeeShareRolePercentages(fsa.cs);
  const itSum = sumFeeShareRolePercentages(fsa.it);
  const otherSum = salesSum + csSum + itSum;
  const profitPool = Math.max(0, 100 - otherSum);

  // Profit: evenly split remainder among assigned accounts
  const profitRows = Array.isArray(fsa.profit) ? fsa.profit : [];
  const profitAssigned = profitRows.filter(
    (r) => parseInt(r.account_id, 10) !== 0
  ).length;
  const profitPerBase = profitAssigned > 0 ? profitPool / profitAssigned : 0;
  const profitPerRounded = Math.round(profitPerBase * 10000) / 10000;

  let assignedSoFar = 0;
  let assignedSumPct = 0;
  const profitRowAmounts = profitRows.map((r) => {
    const aid = parseInt(r.account_id, 10) || 0;
    if (aid === 0) return { percentage: 0, amount: 0 };
    assignedSoFar++;
    const isLast = assignedSoFar === profitAssigned;
    const pct = isLast
      ? Math.round((profitPool - assignedSumPct) * 10000) / 10000
      : profitPerRounded;
    if (!isLast) assignedSumPct += pct;
    return { percentage: pct, amount: p * (pct / 100) };
  });

  const computeRowAmounts = (rows) =>
    (rows || []).map((r) => {
      const pct = parseFloat(r.percentage) || 0;
      return { percentage: pct, amount: p * (pct / 100) };
    });

  return {
    salesSum,
    csSum,
    itSum,
    otherSum,
    profitPool,
    grand: otherSum + profitPool,
    profitRowAmounts,
    salesRowAmounts: computeRowAmounts(fsa.sales),
    csRowAmounts: computeRowAmounts(fsa.cs),
    itRowAmounts: computeRowAmounts(fsa.it),
  };
}
