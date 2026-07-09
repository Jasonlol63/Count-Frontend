// domainHelpers.js — Pure utility functions extracted from domain.js

import { formatYmd, parseDdMmYyyyToYmd, parseYmd } from "../../utils/date/dateUtils.js";

// ★★★ SINGLE_CATEGORY_MODE ★★★
// true: Company Settings 弹窗中 Permissions 只能选择一个分类（互斥）
export const SINGLE_CATEGORY_MODE = true;

export const ROWS_PER_PAGE = 20;
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
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

export function defaultFeeShareAllocations() {
  return { profit: [], sales: [], cs: [], it: [] };
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
  const previousId = String(c.previous_company_id ?? "").trim().toUpperCase();
  if (previousId && previousId !== companyId) {
    entry.previous_company_id = previousId;
  }
  return entry;
}

export function createEmptyGroup(groupCode) {
  const code = String(groupCode || "").trim().toUpperCase();
  const today = new Date().toISOString().split("T")[0];
  const exp = calculateExpirationDate("1month", today);
  return {
    group_code: code,
    expiration_date: exp,
    originalExpirationDate: exp,
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

/** Spring domain list item group → form state */
export function groupFromListItem(row) {
  const code = String(row?.code ?? "").trim().toUpperCase();
  const g = {
    id: row?.id || null,
    group_code: code,
    expiration_date: row?.expiration_date || null,
    permissions: [],
    fee_share_allocations: defaultFeeShareAllocations(),
    apply_commission_payments_on_domain_save: false,
  };
  ensureCompanyFeeShare(g);
  g.originalExpirationDate = g.expiration_date || null;
  g.selectedPeriod = null;
  g.startDate = new Date().toISOString().split("T")[0];
  g.isExtending = false;
  return g;
}

/** Spring domain list item company → form state */
export function companyFromListItem(row) {
  const code = String(row?.code ?? "").trim().toUpperCase();
  const parentCode = String(row?.parent_code ?? "").trim().toUpperCase();
  const co = {
    id: row?.id || null,
    company_id: code,
    expiration_date: row?.expiration_date || null,
    permissions: row?.category_code || [],
    group_id: parentCode || null,
    fee_share_allocations: defaultFeeShareAllocations(),
  };
  ensureCompanyFeeShare(co);
  co.originalExpirationDate = co.expiration_date || null;
  co.selectedPeriod = null;
  co.startDate = new Date().toISOString().split("T")[0];
  co.isExtending = false;
  return co;
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
  const previousCode = String(g.previous_group_code ?? "").trim().toUpperCase();
  if (previousCode && previousCode !== groupCode) {
    entry.previous_group_code = previousCode;
  }
  return entry;
}

/** Spring create API: tenant row for a group */
export function groupToTenantSaveEntry(g) {
  return {
    code: String(g.group_code ?? "").trim().toUpperCase(),
    tenant_type: "GROUP",
    expiration_date: g.expiration_date || null,
  };
}

/** Spring create API: tenant row for a company */
export function companyToTenantSaveEntry(c) {
  const code = String(c.company_id ?? "").trim().toUpperCase();
  const parentCode = String(c.group_id ?? "").trim().toUpperCase();
  return {
    code,
    tenant_type: "COMPANY",
    parent_code: parentCode || null,
    expiration_date: c.expiration_date || null,
  };
}

export function tempGroupCode(groupOrCode) {
  if (groupOrCode == null) return "";
  if (typeof groupOrCode === "string") return groupOrCode.trim().toUpperCase();
  return String(groupOrCode.group_code ?? "").trim().toUpperCase();
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

/** 工具栏紧凑标签：仅 6 个月 / 1 年，如 6M/1Y: 1200/2400 */
export function formatDomainFeeToolbarChip(periodPrices) {
  if (!periodPrices || typeof periodPrices !== "object") {
    return "6M/1Y: 0.00/0.00";
  }
  const six = formatDomainFeeDisplay2(periodPrices["6months"]);
  const one = formatDomainFeeDisplay2(periodPrices["1year"]);
  const sixDisp = six === "—" ? "0.00" : six;
  const oneDisp = one === "—" ? "0.00" : one;
  return `6M/1Y: ${sixDisp}/${oneDisp}`;
}

/** 工具栏摘要：列出已配置的非零周期价 */
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

/** Check if a card/domain contains protected company C168 */
export function hasProtectedCompany(companies) {
  if (!Array.isArray(companies) || companies.length === 0) return false;
  return companies.some(
    (c) => String(c.code || "").trim().toUpperCase() === "C168"
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
