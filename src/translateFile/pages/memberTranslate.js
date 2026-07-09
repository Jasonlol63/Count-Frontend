import { DASHBOARD_I18N } from "../shell/dashboardTranslate.js";
import { MAINTENANCE_I18N } from "./maintenanceTranslate.js";
import { interpolate, toLocale } from "../shared/i18nHelpers.js";

export const MEMBER_I18N = {
  en: {
    winLoss: "Win/Loss",
    company: "Company:",
    account: "Account:",
    currency: "Currency:",
    all: "ALL",
    accounts: "Accounts",
    accountsFilterTitle: "Choose which linked accounts appear in the grid",
    total: "Total",
    balancesGridAria: "Balances by account and currency",
    totalsByCurrencyAria: "Totals by currency",
    balanceTotalsAria: "Balance totals",
    loading: "Loading...",
    selectCurrency: "Please select currency",
    noDataInRange: "No data in the selected date range.",
    currencyTitle: "Currency: {currency}",
    colDate: "Date",
    colIdProduct: "Id Product",
    colCurrency: "Currency",
    colRate: "Rate",
    colWinLoss: "Win/Loss",
    colCrDr: "Cr/Dr",
    colBalance: "Balance",
    colDescription: "Description",
    colRemark: "Remark",
    noData: "No data",
    totalRow: "Total ({currency})",
    openingBalance: "Opening Balance",
    gridAccountSelect: "Select:",
    linkedFilterTitle: "Accounts in grid",
    linkedFilterSelectAll: "Select all",
    linkedFilterClear: "Clear",
    linkedFilterApply: "Apply",
    selectAtLeastOneAccount: "Select at least one account.",
    queryCompleted: "Query completed",
    queryFailed: "Query failed",
    failedLoadCurrencySummary: "Failed to load currency summary",
    failedLoadCurrencyData: "Failed to load currency data",
    switchedToCompany: "Switched to company {label}",
    failedSwitchCompany: "Failed to switch company",
    switchedToAccount: "Switched to account {label}",
    failedSwitchAccount: "Failed to switch account",
    switchFailed: "Switch failed",
    currencyOrderSaved: "Currency order saved",
    saveOrderFailed: "Failed to save order",
    couldNotLoadGrid: "Could not load grid.",
    couldNotLoadHistory: "Could not load history",
    noAccountsHoldCurrencies: "No accounts in the grid hold any of these currencies.",
    noAccountsHoldCurrency: "No accounts in the grid hold {currency}.",
    roleMember: "Member",
    roleAgent: "Agent",
    ariaCompany: "Company",
    ariaAccount: "Account",
    ariaCurrency: "Currency",
  },
  zh: {
    winLoss: "输赢",
    company: "公司：",
    account: "账号：",
    currency: "货币：",
    all: "全部",
    accounts: "账号",
    accountsFilterTitle: "选择要在网格中显示的关联账号",
    total: "合计",
    balancesGridAria: "按账号与货币的余额",
    totalsByCurrencyAria: "按货币合计",
    balanceTotalsAria: "余额合计",
    loading: "加载中...",
    selectCurrency: "请选择货币",
    noDataInRange: "所选日期范围内暂无数据。",
    currencyTitle: "货币：{currency}",
    colDate: "日期",
    colIdProduct: "产品编号",
    colCurrency: "货币",
    colRate: "汇率",
    colWinLoss: "输赢",
    colCrDr: "借贷",
    colBalance: "余额",
    colDescription: "说明",
    colRemark: "备注",
    noData: "暂无数据",
    totalRow: "合计（{currency}）",
    openingBalance: "期初余额",
    gridAccountSelect: "选择：",
    linkedFilterTitle: "网格中的账号",
    linkedFilterSearch: "搜索账号…",
    linkedFilterSelectAll: "全选",
    linkedFilterClear: "清除",
    linkedFilterApply: "应用",
    selectAtLeastOneAccount: "请至少选择一个账号。",
    queryCompleted: "查询完成",
    queryFailed: "查询失败",
    failedLoadCurrencySummary: "加载货币汇总失败",
    failedLoadCurrencyData: "加载货币数据失败",
    switchedToCompany: "已切换到公司 {label}",
    failedSwitchCompany: "切换公司失败",
    switchedToAccount: "已切换到账号 {label}",
    failedSwitchAccount: "切换账号失败",
    switchFailed: "切换失败",
    currencyOrderSaved: "货币顺序已保存",
    saveOrderFailed: "保存顺序失败",
    couldNotLoadGrid: "无法加载网格。",
    couldNotLoadHistory: "无法加载历史记录",
    noAccountsHoldCurrencies: "网格中没有账号持有这些货币。",
    noAccountsHoldCurrency: "网格中没有账号持有 {currency}。",
    roleMember: "会员",
    roleAgent: "代理",
    ariaCompany: "公司",
    ariaAccount: "账号",
    ariaCurrency: "货币",
  },
};

const MEMBER_API_MESSAGE_KEYS = {
  "query failed": "queryFailed",
  "switch failed": "switchFailed",
  "failed to switch company": "failedSwitchCompany",
  "failed to switch account": "failedSwitchAccount",
  "could not load history": "couldNotLoadHistory",
  "could not load grid.": "couldNotLoadGrid",
  "failed to load currency summary": "failedLoadCurrencySummary",
  "no data in the selected date range.": "noDataInRange",
};

function normApiMessage(message) {
  return String(message || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function lookupNested(locale, key) {
  return MEMBER_I18N[locale]?.[key] ?? DASHBOARD_I18N[locale]?.[key] ?? MAINTENANCE_I18N[locale]?.[key] ?? null;
}

export function getMemberText(lang, key, params = {}) {
  const locale = toLocale(lang);
  const template =
    lookupNested(locale, key) ?? lookupNested("en", key) ?? MEMBER_I18N.en[key] ?? key;
  return interpolate(template, params);
}

export function formatMemberRole(lang, role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "agent") return getMemberText(lang, "roleAgent");
  if (r === "member") return getMemberText(lang, "roleMember");
  if (!r) return getMemberText(lang, "roleMember");
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
}

export function formatMemberRowDescription(lang, row) {
  if (!row) return "-";
  let text;
  if (row.row_type === "bf") {
    text = getMemberText(lang, "openingBalance");
  } else {
    const desc = String(row.description || "").trim();
    if (desc.toUpperCase() === "OPENING BALANCE") {
      text = getMemberText(lang, "openingBalance");
    } else {
      text = desc || "-";
    }
  }
  if (!text || text === "-") return "-";
  return String(text).toUpperCase();
}

/** Map backend API message to member i18n for toasts. */
export function translateMemberApiMessage(lang, apiMessage, fallbackKey = "", params = {}) {
  const message = String(apiMessage ?? "").trim();
  const locale = toLocale(lang);
  const key = MEMBER_API_MESSAGE_KEYS[normApiMessage(message)];
  if (key) return getMemberText(locale, key, params);
  if (message && fallbackKey) return getMemberText(locale, fallbackKey, params);
  return message || (fallbackKey ? getMemberText(locale, fallbackKey, params) : "");
}
