import { DASHBOARD_I18N } from "./dashboardTranslate.js";
import { createGetText } from "./i18nHelpers.js";

/** Mobile Report (Domain + Customer) dictionary. Spreads dashboard labels for MobileShell. */
export const REPORT_I18N = {
  en: {
    ...DASHBOARD_I18N.en,

    report: "Report",
    reportSubtitle: "Financial and operational reports.",
    hubTitle: "Report Centre",
    hubSubtitle: "Domain and customer win/lose summaries.",
    sectionReports: "Reports",
    backToMore: "Back to More",
    apply: "Apply",
    applyFilter: "Apply",
    group: "Group",
    allGroups: "All Groups",

    domainTitle: "Domain Report",
    domainDesc: "Turnover / Win / Lose by process.",
    domainFeatures: "Date · Group/Company · Process",

    customerTitle: "Customer Report",
    customerDesc: "Win / Lose by account.",
    customerFeatures: "Date · Account · Currency · Show All",

    allAccounts: "All Accounts",
    allProcess: "All Process",
    searchProcess: "Search process…",
    searchAccount: "Search account…",
    searchPlaceholder: "Search…",
    showAll: "Show All",
    currency: "Currency",
    account: "Account",
    process: "Process",
    name: "Name",
    turnover: "Turnover",
    win: "Win",
    lose: "Lose",
    winLose: "Win/Lose",
    total: "Total",

    loading: "Loading…",
    noData: "No data found. Adjust filters and try again.",
    loadFailed: "Failed to load report",
    bankOnlyBlocked: "Bank companies have no Domain/Customer report. Switch company.",
    needCompany: "Pick a company to load the report.",
    backToHub: "Back to reports",
    comingSoon: "Coming soon",
  },
  zh: {
    ...DASHBOARD_I18N.zh,

    report: "报表",
    reportSubtitle: "财务与营运报表。",
    hubTitle: "报表中心",
    hubSubtitle: "域名与客户输赢汇总。",
    sectionReports: "报表",
    backToMore: "返回更多",
    apply: "应用",
    applyFilter: "应用",
    group: "组别",
    allGroups: "全部组别",

    domainTitle: "域名报表",
    domainDesc: "按流程汇总 Turnover / Win / Lose。",
    domainFeatures: "日期 · 组别/公司 · 流程",

    customerTitle: "客户报表",
    customerDesc: "按账号汇总 Win / Lose。",
    customerFeatures: "日期 · 账号 · 货币 · 显示全部",

    allAccounts: "全部账号",
    allProcess: "全部流程",
    searchProcess: "搜索流程…",
    searchAccount: "搜索账号…",
    searchPlaceholder: "搜索…",
    showAll: "显示全部",
    currency: "货币",
    account: "账号",
    process: "流程",
    name: "名称",
    turnover: "营业额",
    win: "赢",
    lose: "输",
    winLose: "输赢",
    total: "合计",

    loading: "加载中…",
    noData: "无数据。请调整筛选后重试。",
    loadFailed: "加载报表失败",
    bankOnlyBlocked: "Bank 公司没有域名/客户报表。请切换公司。",
    needCompany: "请选择公司以加载报表。",
    backToHub: "返回报表",
    comingSoon: "即将推出",
  },
};

export const getReportText = createGetText(REPORT_I18N);

export function reportText(lang) {
  return REPORT_I18N[lang === "zh" ? "zh" : "en"] || REPORT_I18N.en;
}
