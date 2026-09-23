import { DASHBOARD_I18N } from "./dashboardTranslate.js";
import { createGetText, interpolate, toLocale } from "./i18nHelpers.js";

export const MEMBER_I18N = {
  en: {
    ...DASHBOARD_I18N.en,
    winLoss: "Win/Loss",
    pageSubtitle: "Payment history for your linked accounts.",
    company: "Company",
    account: "Account",
    currency: "Currency",
    all: "ALL",
    total: "Total",
    loading: "Loading…",
    selectCurrency: "Please select currency",
    noDataInRange: "No data in the selected date range.",
    currencyTitle: "Currency: {currency}",
    colDate: "Date",
    colIdProduct: "Id Product",
    colRate: "Rate",
    colWinLoss: "Win/Loss",
    colCrDr: "Cr/Dr",
    colBalance: "Balance",
    colDescription: "Description",
    colRemark: "Remark",
    noData: "No data",
    totalRow: "Total ({currency})",
    openingBalance: "Opening Balance",
    paymentHistoryTapRowHint: "Tap a row for description, rate, and remark.",
    paymentHistoryDetails: "Details",
    createdBy: "Created by",
    queryCompleted: "Query completed",
    queryFailed: "Query failed",
    failedLoadCurrencyData: "Failed to load currency data",
    switchedToCompany: "Switched to company {label}",
    failedSwitchCompany: "Failed to switch company",
    switchedToAccount: "Switched to account {label}",
    failedSwitchAccount: "Failed to switch account",
    switchFailed: "Switch failed",
    couldNotLoadHistory: "Could not load history",
    roleMember: "Member",
    roleAgent: "Agent",
    dateRange: "Date Range",
    filters: "Filters",
    applyFilters: "Apply",
    exportPdf: "Export PDF",
    exportPdfTitle: "WIN/LOSE REPORT",
    exportPdfHint: "Same as Win/Loss table below.",
    exportPdfCurrency: "Currency",
    exportPdfCancel: "Cancel",
    exportPdfExporting: "Exporting…",
    exportPdfFailed: "Export failed",
    exportPdfLoadCurrenciesFailed: "Could not load currencies for this account.",
    exportPdfNoCurrencies: "No currencies available for this account.",
    exportPdfMissingAccount: "Account information is missing.",
    pleaseSelectDateRange: "Please select date range",
    pleaseSelectAtLeastOneCurrency: "Please select at least one currency",
    close: "Close",
    from: "From",
    to: "To",
    accessDenied: "Member access only.",
    balances: "Balances",
    balancesAccounts: "{count} accounts",
    balancesCurrencies: "{count} currencies",
    balancesEmpty: "No linked accounts.",
  },
  zh: {
    ...DASHBOARD_I18N.zh,
    winLoss: "输赢",
    pageSubtitle: "关联账号的付款流水。",
    company: "公司",
    account: "账号",
    currency: "货币",
    all: "全部",
    total: "合计",
    loading: "加载中…",
    selectCurrency: "请选择货币",
    noDataInRange: "所选日期范围内暂无数据。",
    currencyTitle: "货币：{currency}",
    colDate: "日期",
    colIdProduct: "产品编号",
    colRate: "汇率",
    colWinLoss: "输赢",
    colCrDr: "借贷",
    colBalance: "余额",
    colDescription: "说明",
    colRemark: "备注",
    noData: "暂无数据",
    totalRow: "合计（{currency}）",
    openingBalance: "期初余额",
    paymentHistoryTapRowHint: "点按行查看说明、汇率与备注。",
    paymentHistoryDetails: "详情",
    createdBy: "创建人",
    queryCompleted: "查询完成",
    queryFailed: "查询失败",
    failedLoadCurrencyData: "加载货币数据失败",
    switchedToCompany: "已切换到公司 {label}",
    failedSwitchCompany: "切换公司失败",
    switchedToAccount: "已切换到账号 {label}",
    failedSwitchAccount: "切换账号失败",
    switchFailed: "切换失败",
    couldNotLoadHistory: "无法加载历史记录",
    roleMember: "会员",
    roleAgent: "代理",
    dateRange: "日期范围",
    filters: "筛选",
    applyFilters: "应用",
    exportPdf: "导出 PDF",
    exportPdfTitle: "WIN/LOSE 报表",
    exportPdfHint: "与下方输赢表一致。",
    exportPdfCurrency: "货币",
    exportPdfCancel: "取消",
    exportPdfExporting: "导出中…",
    exportPdfFailed: "导出失败",
    exportPdfLoadCurrenciesFailed: "无法加载该账户的货币列表。",
    exportPdfNoCurrencies: "该账户暂无可用货币。",
    exportPdfMissingAccount: "缺少账户信息。",
    pleaseSelectDateRange: "请选择日期范围",
    pleaseSelectAtLeastOneCurrency: "请至少选择一种货币",
    close: "关闭",
    from: "开始",
    to: "结束",
    accessDenied: "仅限会员访问。",
    balances: "余额",
    balancesAccounts: "{count} 个账号",
    balancesCurrencies: "{count} 种货币",
    balancesEmpty: "暂无关联账号。",
  },
};

export const getMemberText = createGetText(MEMBER_I18N);

export function memberText(lang) {
  return MEMBER_I18N[toLocale(lang)];
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

const MEMBER_API_MESSAGE_KEYS = {
  "query failed": "queryFailed",
  "switch failed": "switchFailed",
  "failed to switch company": "failedSwitchCompany",
  "failed to switch account": "failedSwitchAccount",
  "could not load history": "couldNotLoadHistory",
  "no data in the selected date range.": "noDataInRange",
};

export function translateMemberApiMessage(lang, apiMessage, fallbackKey = "", params = {}) {
  const message = String(apiMessage ?? "").trim();
  const key = MEMBER_API_MESSAGE_KEYS[message.toLowerCase().replace(/\s+/g, " ")];
  if (key) return getMemberText(lang, key, params);
  if (message && fallbackKey) return getMemberText(lang, fallbackKey, params);
  return message || (fallbackKey ? getMemberText(lang, fallbackKey, params) : "");
}

export { interpolate, toLocale };
