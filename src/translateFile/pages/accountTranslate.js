import { createGetText, toLocale } from "../shared/i18nHelpers.js";

export const ACCOUNT_I18N = {
  en: {
    failedToLoadAccounts: "Failed to load accounts",
    networkError: "Network error",
    failedToSwitchCompany: "Failed to switch company",
    switchedTo: "Switched to {company}",
    toggleFailed: "Toggle failed",
    failedToLoadAccount: "Failed to load account",
    errorLoadingAccount: "Error loading account",
    deleteFailed: "Delete failed",
    accountsDeletedSuccessfully: "Accounts deleted successfully",
    paymentAlertRequiredFields: "When Payment Alert is enabled, both Alert Type and Start Date are required",
    saveFailed: "Save failed",
    accountSavedSuccessfully: "Account saved successfully",
    accountAddedToFormulaList: "Account {accountId} added and ready to select",
    notifSuccess: "Success",
    notifError: "Error",
    createFailed: "Create failed",
    failedDeleteCurrency: "Failed to delete currency",
    currencyDeleted: "Currency deleted",
    loadLinksFailed: "Load links failed",
    currencySettingsSaved: "Currency settings saved",
    pleaseSelectCompanyFirst: "Please select a company first",
    pleaseSelectCurrencyFirst: "Please select a currency first (tap again to deselect)",
    deselectCurrencyBeforeDelete: "Deselect this currency first, then tap × to delete it",
    failedOpenLinkModal: "Failed to open link account modal",
    accountLinksSavedSuccessfully: "Account links saved successfully",
    failedSaveAccountLinks: "Failed to save account links",
    accountList: "Account List",
    addAccount: "Add Account",
    searchByAccountOrName: "Search by Account or Name",
    inactive: "Inactive",
    showInactive: "Show Inactive",
    showAll: "Show All",
    currencySetting: "Currency Setting",
    deleteWithCount: "Delete ({count})",
    groupId: "Group ID:",
    groupFilterAll: "ALL",
    company: "Company:",
    companyRequiredMark: "Company *",
    groupRequiredMark: "Group *",
    selectCompanies: "Choose companies",
    selectGroups: "Choose groups",
    companyNoneSelected: "None selected",
    groupNoneSelected: "None selected",
    companySearchPlaceholder: "Filter by code…",
    groupSearchPlaceholder: "Filter by group…",
    companyPickerDone: "Done",
    groupPickerDone: "Done",
    companyPickerTitle: "Companies",
    groupPickerTitle: "Groups",
    groupAndCompany: "Group / Company",
    gcSelectGroup: "SELECT GROUP",
    gcSelectCompany: "SELECT COMPANY",
    gcConfirm: "Confirm",
    gcOneSelected: "1 selected",
    no: "No",
    account: "Account",
    name: "Name",
    role: "Role",
    alert: "Alert",
    status: "Status",
    lastLogin: "Last Login",
    remark: "Remark",
    action: "Action",
    loading: "Loading...",
    paginationOf: "{page} of {total}",
    edit: "Edit",
    linkAccountTitle: "Link Account",
    deleteConfirmMessage: "Are you sure you want to delete {count} selected account(s)?",
    confirmDelete: "Confirm Delete",
    actionCannotUndone: "This action cannot be undone.",
    cancel: "Cancel",
    delete: "Delete",
    editAccount: "Edit Account",
    personalInformation: "Personal Information",
    accountIdRequired: "Account ID *",
    nameRequired: "Name *",
    roleRequired: "Role *",
    selectRole: "Select Role",
    supplier: "SUPPLIER",
    password: "Password",
    passwordRequired: "Password *",
    payment: "Payment",
    paymentAlert: "Payment Alert",
    yes: "Yes",
    noWord: "No",
    alertType: "Alert Type",
    selectType: "Select Type",
    weekly: "Weekly",
    monthly: "Monthly",
    days: "{n} Days",
    startDate: "Start Date",
    alertAmount: "Alert (Amount)",
    enterAmountPlaceholder: "Enter amount (auto-converted to negative)",
    advancedAccount: "Advanced Account",
    otherCurrency: "Other Currency:",
    newCurrencyPlaceholder: "Enter new currency code (e.g., EUR, JPY, GBP)",
    createCurrency: "Create Currency",
    updateAccount: "Update Account",
    saving: "Saving...",
    save: "Save",
    back: "Back",
    addCurrency: "Add Currency :",
    pleaseEnterNewCurrency: "Please enter new currency",
    add: "Add",
    currency: "Currency :",
    searchBar: "Search Bar",
    filterRow: "Filter Row",
    selectAll: "Select All",
    selectedCount: "{count} selected",
    bidirectional: "Bidirectional",
    unidirectional: "Unidirectional",
    bidirectionalDesc: "Bidirectional: Data syncs both ways.",
    unidirectionalDesc: "Unidirectional flows from A to B.",
    searchAccount: "Search account...",
    noAccountsToLink: "No accounts available to link.",
    readOnlyActionBlocked: "Read-only account: this action is not allowed.",
    apiAccountCreated: "Account created successfully!",
    apiAccountUpdated: "Account updated successfully",
    apiStatusUpdated: "Status updated",
    apiUnauthorized: "User not logged in",
    apiMissingCompany: "Missing company information",
    apiNoPermissionCompany: "No permission to access this company",
    apiInvalidRequestMethod: "Invalid request method",
    apiMethodNotAllowed: "Method not allowed",
    apiCurrencyDeleted: "Currency deleted successfully",
    apiCurrencyCreated: "Currency created successfully",
    apiAccountLinked: "Account links saved successfully",
    apiLinkRemoved: "Account link removed",
    apiConnectionTypeUpdated: "Connection type updated",
    apiCannotDeleteActiveAccounts: "Cannot delete active accounts",
    apiNoAccountIds: "No account IDs provided",
    apiCompanyNotSelected: "Company not selected",
    apiCurrencyNotFound: "Currency not found or access denied",
    apiCurrencyIdRequired: "Currency ID is required",
    apiPaymentAlertUpdateFailed: "Failed to update payment alert",
    apiFillRequiredFields: "Please fill in all required fields",
    apiAccountIdExists: "Account ID already exists",
    apiAccountIdExistsInScope: "Account ID already exists in {scope}",
    accountSavedCurrencySyncFailed: "Account saved, but currency sync failed: {detail}",
    apiMissingRequiredParams: "Missing required parameters",
    apiAccountNotInCompany: "Account does not belong to this company",
    apiReadOnlyCannotModifyLinks: "Read-only account cannot modify account links",
    apiCannotLinkSameAccount: "Cannot link an account to itself",
    apiUnidirectionalNeedsInitiator: "Unidirectional link requires an initiator account",
    apiAccount1NotInCompany: "Account 1 does not belong to this company",
    apiAccount2NotInCompany: "Account 2 does not belong to this company",
    apiInvalidOperation: "Invalid operation",
    apiReadOnlyCannotChangeStatus: "Read-only account cannot change account status",
    apiInvalidAccountId: "Invalid account ID",
    apiNoPermissionForAccount: "No permission to operate on this account",
    apiStatusUpdateFailed: "Status update failed",
    apiReadOnlyCannotChangePaymentAlert: "Read-only account cannot change payment alert",
    apiReadOnlyCannotCreateCurrency: "Read-only account cannot create currency",
    apiDatabaseError: "Database error",
    apiAccountCreateInProgress: "Account creation is in progress for this ID, please retry",
    apiSomeLinkedAccountsNotInCompany: "Some linked accounts do not belong to the current company",
    apiReadOnlyCannotEditAccount: "Read-only account cannot edit accounts",
    apiPaymentAlertUpdateFailed: "Failed to update payment alert",
    apiPaymentAlertUpdated: "Payment alert updated",
    apiCurrencyAdded: "Currency added successfully",
    apiCurrencyRemoved: "Currency removed successfully",
    apiCurrencyAlreadyLinked: "Currency is already linked to this account",
    apiAccountMustKeepOneCurrency: "Account must keep at least one currency",
    apiLinkNotFound: "Link not found",
    apiAccountIdRequired: "Account ID is required",
    apiAccountNotFoundOrDenied: "Account not found or access denied",
    apiCurrencyNotFoundOrDenied: "Currency not found or access denied",
    apiUnsupportedRequestMethod: "Unsupported request method",
    apiAlertAmountInvalid: "Alert amount must be a valid decimal amount",
    apiAlertTypeInvalid: 'Alert Type must be "weekly", "monthly", or a number between 1 and 31',
    apiAlertDateInvalid: "Alert Start Date must be a valid date (YYYY-MM-DD)",
    apiInvalidRoleSelected: "Invalid role selected",
    apiCompanyUpdated: "Company updated",
    apiUserNotLoggedInOrCompany: "User not logged in or missing company information",
    apiReadOnlyCannotAdd: "Read-only account cannot add accounts",
    apiReadOnlyCannotDelete: "Read-only account cannot delete accounts",
    apiCurrencyInUse: "Currency is in use and cannot be deleted",
    apiCurrencySyncedFromSubsidiary:
      "This currency was synced from subsidiary companies and cannot be deleted while subsidiaries still use it.",
    apiCurrencyBlockedByHistory:
      "Cannot delete currency — historical records still reference it ({detail}). Remove related Data Capture / Transaction records first.",
    forceDeleteCurrency: "Force delete",
    forceDeleteCurrencyConfirm:
      "Currency {code} is still referenced by historical records ({detail}). Force delete will remove the currency and reassign Process / Data Capture rows to another currency in this company. Continue?",
    currencyInUseTitle: "Cannot delete currency",
    currencyInUseMessage: "Currency {code} is still used by the following account(s):",
    ok: "OK",
  },
  zh: {
    failedToLoadAccounts: "加载账号失败",
    networkError: "网络错误",
    failedToSwitchCompany: "切换公司失败",
    switchedTo: "已切换到 {company}",
    toggleFailed: "切换失败",
    failedToLoadAccount: "加载账号失败",
    errorLoadingAccount: "加载账号时发生错误",
    deleteFailed: "删除失败",
    accountsDeletedSuccessfully: "账号删除成功",
    paymentAlertRequiredFields: "启用 Payment Alert 时，Alert Type 和 Start Date 均为必填",
    saveFailed: "保存失败",
    accountSavedSuccessfully: "账号保存成功",
    accountAddedToFormulaList: "账号 {accountId} 已添加，可在列表中选择",
    notifSuccess: "成功",
    notifError: "错误",
    createFailed: "创建失败",
    failedDeleteCurrency: "删除货币失败",
    currencyDeleted: "货币已删除",
    loadLinksFailed: "加载关联失败",
    currencySettingsSaved: "货币设置已保存",
    pleaseSelectCompanyFirst: "请先选择公司",
    pleaseSelectCurrencyFirst: "请先选择货币（再次点击可取消选中）",
    deselectCurrencyBeforeDelete: "请先点击取消选中该货币，再点 × 删除",
    failedOpenLinkModal: "打开关联账号弹窗失败",
    accountLinksSavedSuccessfully: "账号关联保存成功",
    failedSaveAccountLinks: "保存账号关联失败",
    accountList: "账号列表",
    addAccount: "新增账号",
    searchByAccountOrName: "按账号或姓名搜索",
    inactive: "停用",
    showInactive: "显示停用",
    showAll: "显示全部",
    currencySetting: "货币设置",
    deleteWithCount: "删除（{count}）",
    groupId: "集团：",
    groupFilterAll: "ALL",
    company: "公司：",
    companyRequiredMark: "公司 *",
    groupRequiredMark: "集团 *",
    selectCompanies: "选择公司",
    selectGroups: "选择集团",
    companyNoneSelected: "未选择",
    groupNoneSelected: "未选择",
    companySearchPlaceholder: "按代码筛选…",
    groupSearchPlaceholder: "按集团筛选…",
    companyPickerDone: "完成",
    groupPickerDone: "完成",
    companyPickerTitle: "公司",
    groupPickerTitle: "集团",
    groupAndCompany: "集团 / 公司",
    gcSelectGroup: "选择集团",
    gcSelectCompany: "选择公司",
    gcConfirm: "确认",
    gcOneSelected: "已选 1",
    no: "序号",
    account: "账号",
    name: "姓名",
    role: "角色",
    alert: "提醒",
    status: "状态",
    lastLogin: "最后登录",
    remark: "备注",
    action: "操作",
    loading: "加载中...",
    paginationOf: "{page} / {total}",
    edit: "编辑",
    linkAccountTitle: "关联账号",
    deleteConfirmMessage: "确定删除已选中的 {count} 个账号吗？",
    confirmDelete: "确认删除",
    actionCannotUndone: "该操作无法撤销。",
    cancel: "取消",
    delete: "删除",
    editAccount: "编辑账号",
    personalInformation: "个人信息",
    accountIdRequired: "账号 ID *",
    nameRequired: "姓名 *",
    roleRequired: "角色 *",
    selectRole: "选择角色",
    supplier: "SUPPLIER",
    password: "密码",
    passwordRequired: "密码 *",
    payment: "支付",
    paymentAlert: "支付提醒",
    yes: "是",
    noWord: "否",
    alertType: "提醒类型",
    selectType: "选择类型",
    weekly: "每周",
    monthly: "每月",
    days: "{n} 天",
    startDate: "开始日期",
    alertAmount: "提醒金额",
    enterAmountPlaceholder: "输入金额（会自动转为负数）",
    advancedAccount: "高级账号",
    otherCurrency: "其他货币：",
    newCurrencyPlaceholder: "输入新货币代码（例如 EUR、JPY、GBP）",
    createCurrency: "创建货币",
    updateAccount: "更新账号",
    saving: "保存中...",
    save: "保存",
    back: "返回",
    addCurrency: "新增货币：",
    pleaseEnterNewCurrency: "请输入新货币",
    add: "添加",
    currency: "货币：",
    searchBar: "搜索栏",
    filterRow: "筛选角色",
    selectAll: "全选",
    selectedCount: "已选 {count} 个",
    bidirectional: "双向",
    unidirectional: "单向",
    bidirectionalDesc: "双向：数据双向同步。",
    unidirectionalDesc: "单向：数据从 A 流向 B。",
    searchAccount: "搜索账号...",
    noAccountsToLink: "暂无可关联账号。",
    readOnlyActionBlocked: "只读账号，无法执行此操作。",
    apiAccountCreated: "账户创建成功！",
    apiAccountUpdated: "账号更新成功",
    apiStatusUpdated: "状态更新成功",
    apiUnauthorized: "用户未登录",
    apiMissingCompany: "缺少公司信息",
    apiNoPermissionCompany: "无权限访问该公司",
    apiInvalidRequestMethod: "无效的请求方法",
    apiMethodNotAllowed: "不允许的请求方法",
    apiCurrencyDeleted: "货币删除成功",
    apiCurrencyCreated: "货币创建成功",
    apiAccountLinked: "账户关联成功",
    apiLinkRemoved: "账户关联已移除",
    apiConnectionTypeUpdated: "连接类型更新成功",
    apiCannotDeleteActiveAccounts: "无法删除启用中的账号",
    apiNoAccountIds: "未提供账号 ID",
    apiCompanyNotSelected: "未选择公司",
    apiCurrencyNotFound: "未找到货币或无权访问",
    apiCurrencyIdRequired: "需要提供货币 ID",
    apiPaymentAlertUpdateFailed: "Payment alert 更新失败",
    apiFillRequiredFields: "请填写所有必填字段",
    apiAccountIdExists: "账户 ID 已存在",
    apiAccountIdExistsInScope: "账户 ID 已存在于 {scope}",
    accountSavedCurrencySyncFailed: "账号已保存，但货币同步失败：{detail}",
    apiMissingRequiredParams: "缺少必要参数",
    apiAccountNotInCompany: "账户不属于该公司",
    apiReadOnlyCannotModifyLinks: "只读账号无法修改账户关联",
    apiCannotLinkSameAccount: "不能关联同一个账户",
    apiUnidirectionalNeedsInitiator: "单向连接必须指定发起账户",
    apiAccount1NotInCompany: "账户1不属于该公司",
    apiAccount2NotInCompany: "账户2不属于该公司",
    apiInvalidOperation: "无效的操作",
    apiReadOnlyCannotChangeStatus: "只读账号无法修改账户状态",
    apiInvalidAccountId: "无效的账户 ID",
    apiNoPermissionForAccount: "无权限操作此账户",
    apiStatusUpdateFailed: "状态更新失败",
    apiReadOnlyCannotChangePaymentAlert: "只读账号无法修改支付提醒",
    apiReadOnlyCannotCreateCurrency: "只读账号无法创建币种",
    apiDatabaseError: "数据库错误",
    apiAccountCreateInProgress: "该账号 ID 正在创建中，请稍后重试",
    apiSomeLinkedAccountsNotInCompany: "部分关联账户不属于当前公司",
    apiReadOnlyCannotEditAccount: "只读账号无法修改账户",
    apiPaymentAlertUpdateFailed: "Payment alert 更新失败",
    apiPaymentAlertUpdated: "Payment alert 更新成功",
    apiCurrencyAdded: "货币添加成功",
    apiCurrencyRemoved: "货币移除成功",
    apiCurrencyAlreadyLinked: "该货币已经关联到此账户",
    apiAccountMustKeepOneCurrency: "账户必须至少保留一个货币，无法删除",
    apiLinkNotFound: "关联不存在",
    apiAccountIdRequired: "账户 ID 是必需的",
    apiAccountNotFoundOrDenied: "账户不存在或无权限访问",
    apiCurrencyNotFoundOrDenied: "货币不存在或无权限访问",
    apiUnsupportedRequestMethod: "不支持的请求方法",
    apiAlertAmountInvalid: "提醒金额必须是有效的小数",
    apiAlertTypeInvalid: "提醒类型必须是 weekly、monthly 或 1–31 之间的数字",
    apiAlertDateInvalid: "提醒开始日期必须是有效日期（YYYY-MM-DD）",
    apiInvalidRoleSelected: "选择的角色无效",
    apiCompanyUpdated: "公司已更新",
    apiUserNotLoggedInOrCompany: "用户未登录或缺少公司信息",
    apiReadOnlyCannotAdd: "只读账号无法添加账户",
    apiReadOnlyCannotDelete: "只读账号无法删除账户",
    apiCurrencyInUse: "货币正在使用中，无法删除",
    apiCurrencySyncedFromSubsidiary: "该货币由旗下子公司同步，子公司仍在使用时无法删除。",
    apiCurrencyBlockedByHistory:
      "无法删除货币，仍有历史业务数据引用（{detail}）。请先在 Data Capture / Transaction 中清理相关记录。",
    forceDeleteCurrency: "强制删除",
    forceDeleteCurrencyConfirm:
      "货币 {code} 仍被历史业务数据引用（{detail}）。强制删除会移除该货币，并将 Process / Data Capture 等记录改绑到本公司其他货币。是否继续？",
    currencyInUseTitle: "无法删除货币",
    currencyInUseMessage: "货币 {code} 仍被以下账号使用：",
    ok: "确定",
  },
};

function normAccountApiMessage(message) {
  return String(message || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?！。]+$/g, "");
}

const ACCOUNT_API_MESSAGE_KEYS = {
  [normAccountApiMessage("Account updated successfully")]: "accountSavedSuccessfully",
  [normAccountApiMessage("Account saved successfully")]: "accountSavedSuccessfully",
  [normAccountApiMessage("账号保存成功")]: "accountSavedSuccessfully",
  [normAccountApiMessage("账户创建成功！")]: "apiAccountCreated",
  [normAccountApiMessage("Account created successfully!")]: "apiAccountCreated",
  [normAccountApiMessage("Accounts deleted successfully")]: "accountsDeletedSuccessfully",
  [normAccountApiMessage("账号删除成功")]: "accountsDeletedSuccessfully",
  [normAccountApiMessage("Currency deleted successfully")]: "apiCurrencyDeleted",
  [normAccountApiMessage("货币已删除")]: "currencyDeleted",
  [normAccountApiMessage("Currency settings saved")]: "currencySettingsSaved",
  [normAccountApiMessage("货币设置已保存")]: "currencySettingsSaved",
  [normAccountApiMessage("Account links saved successfully")]: "accountLinksSavedSuccessfully",
  [normAccountApiMessage("账号关联保存成功")]: "accountLinksSavedSuccessfully",
  [normAccountApiMessage("账户关联成功")]: "accountLinksSavedSuccessfully",
  [normAccountApiMessage("账户关联已移除")]: "apiLinkRemoved",
  [normAccountApiMessage("连接类型更新成功")]: "apiConnectionTypeUpdated",
  [normAccountApiMessage("状态更新成功")]: "apiStatusUpdated",
  [normAccountApiMessage("Status updated")]: "apiStatusUpdated",
  [normAccountApiMessage("Toggle failed")]: "toggleFailed",
  [normAccountApiMessage("切换失败")]: "toggleFailed",
  [normAccountApiMessage("User not logged in")]: "apiUnauthorized",
  [normAccountApiMessage("用户未登录")]: "apiUnauthorized",
  [normAccountApiMessage("用户未登录或缺少公司信息")]: "apiUserNotLoggedInOrCompany",
  [normAccountApiMessage("Missing company information")]: "apiMissingCompany",
  [normAccountApiMessage("缺少公司信息")]: "apiMissingCompany",
  [normAccountApiMessage("No permission to access this company")]: "apiNoPermissionCompany",
  [normAccountApiMessage("无权限访问该公司")]: "apiNoPermissionCompany",
  [normAccountApiMessage("Invalid request method")]: "apiInvalidRequestMethod",
  [normAccountApiMessage("Method not allowed")]: "apiMethodNotAllowed",
  [normAccountApiMessage("只读账号无法执行此操作")]: "readOnlyActionBlocked",
  [normAccountApiMessage("Read-only account: this action is not allowed.")]: "readOnlyActionBlocked",
  [normAccountApiMessage("只读账号无法添加账户")]: "apiReadOnlyCannotAdd",
  [normAccountApiMessage("只读账号无法删除账户")]: "apiReadOnlyCannotDelete",
  [normAccountApiMessage("When Payment Alert is enabled, both Alert Type and Start Date are required")]:
    "paymentAlertRequiredFields",
  [normAccountApiMessage("When Payment Alert is enabled, Alert Type and Start Date are required")]:
    "paymentAlertRequiredFields",
  [normAccountApiMessage("当支付提醒为是时，必须填写提醒类型和开始日期")]: "paymentAlertRequiredFields",
  [normAccountApiMessage("Please fill in all required fields")]: "apiFillRequiredFields",
  [normAccountApiMessage("请填写所有必填字段")]: "apiFillRequiredFields",
  [normAccountApiMessage("Account ID already exists")]: "apiAccountIdExists",
  [normAccountApiMessage("账户ID已存在")]: "apiAccountIdExists",
  [normAccountApiMessage("缺少必要参数")]: "apiMissingRequiredParams",
  [normAccountApiMessage("账户不属于该公司")]: "apiAccountNotInCompany",
  [normAccountApiMessage("只读账号无法修改账户关联")]: "apiReadOnlyCannotModifyLinks",
  [normAccountApiMessage("不能关联同一个账户")]: "apiCannotLinkSameAccount",
  [normAccountApiMessage("单向连接必须指定发起账户")]: "apiUnidirectionalNeedsInitiator",
  [normAccountApiMessage("账户1不属于该公司")]: "apiAccount1NotInCompany",
  [normAccountApiMessage("账户2不属于该公司")]: "apiAccount2NotInCompany",
  [normAccountApiMessage("无效的操作")]: "apiInvalidOperation",
  [normAccountApiMessage("只读账号无法修改账户状态")]: "apiReadOnlyCannotChangeStatus",
  [normAccountApiMessage("无效的账户ID")]: "apiInvalidAccountId",
  [normAccountApiMessage("无权限操作此账户")]: "apiNoPermissionForAccount",
  [normAccountApiMessage("状态更新失败")]: "apiStatusUpdateFailed",
  [normAccountApiMessage("只读账号无法修改支付提醒")]: "apiReadOnlyCannotChangePaymentAlert",
  [normAccountApiMessage("只读账号无法创建币种")]: "apiReadOnlyCannotCreateCurrency",
  [normAccountApiMessage("只读账号无法修改账户")]: "apiReadOnlyCannotEditAccount",
  [normAccountApiMessage("部分关联账户不属于当前公司")]: "apiSomeLinkedAccountsNotInCompany",
  [normAccountApiMessage("Account creation is in progress for this ID, please retry")]: "apiAccountCreateInProgress",
  [normAccountApiMessage("Payment alert 更新成功")]: "apiPaymentAlertUpdated",
  [normAccountApiMessage("货币添加成功")]: "apiCurrencyAdded",
  [normAccountApiMessage("货币移除成功")]: "apiCurrencyRemoved",
  [normAccountApiMessage("该货币已经关联到此账户")]: "apiCurrencyAlreadyLinked",
  [normAccountApiMessage("账户必须至少保留一个货币，无法删除")]: "apiAccountMustKeepOneCurrency",
  [normAccountApiMessage("关联不存在")]: "apiLinkNotFound",
  [normAccountApiMessage("账户ID是必需的")]: "apiAccountIdRequired",
  [normAccountApiMessage("账户不存在或无权限访问")]: "apiAccountNotFoundOrDenied",
  [normAccountApiMessage("货币不存在或无权限访问")]: "apiCurrencyNotFoundOrDenied",
  [normAccountApiMessage("不支持的请求方法")]: "apiUnsupportedRequestMethod",
  [normAccountApiMessage("Alert amount must be a valid decimal amount")]: "apiAlertAmountInvalid",
  [normAccountApiMessage('Alert Type must be "weekly", "monthly", or a number between 1 and 31')]: "apiAlertTypeInvalid",
  [normAccountApiMessage("Alert Start Date must be a valid date (YYYY-MM-DD)")]: "apiAlertDateInvalid",
  [normAccountApiMessage("Invalid role selected")]: "apiInvalidRoleSelected",
  [normAccountApiMessage("选择的角色无效")]: "apiInvalidRoleSelected",
  [normAccountApiMessage("Company updated")]: "apiCompanyUpdated",
  [normAccountApiMessage("Company 已更新")]: "apiCompanyUpdated",
  [normAccountApiMessage("No account IDs provided")]: "apiNoAccountIds",
  [normAccountApiMessage("Company not selected")]: "apiCompanyNotSelected",
  [normAccountApiMessage("Currency not found or access denied")]: "apiCurrencyNotFound",
  [normAccountApiMessage("Currency ID is required")]: "apiCurrencyIdRequired",
  [normAccountApiMessage("Payment alert 更新失败")]: "apiPaymentAlertUpdateFailed",
  [normAccountApiMessage("Failed to load accounts")]: "failedToLoadAccounts",
  [normAccountApiMessage("加载账号失败")]: "failedToLoadAccounts",
  [normAccountApiMessage("Failed to load account")]: "failedToLoadAccount",
  [normAccountApiMessage("加载账号失败")]: "failedToLoadAccount",
  [normAccountApiMessage("Delete failed")]: "deleteFailed",
  [normAccountApiMessage("删除失败")]: "deleteFailed",
  [normAccountApiMessage("Save failed")]: "saveFailed",
  [normAccountApiMessage("保存失败")]: "saveFailed",
  [normAccountApiMessage("Create failed")]: "createFailed",
  [normAccountApiMessage("创建失败")]: "createFailed",
  [normAccountApiMessage("Failed to delete currency")]: "failedDeleteCurrency",
  [normAccountApiMessage("删除货币失败")]: "failedDeleteCurrency",
  [normAccountApiMessage("Cannot delete currency synced from subsidiary companies")]:
    "apiCurrencySyncedFromSubsidiary",
  [normAccountApiMessage("Failed to switch company")]: "failedToSwitchCompany",
  [normAccountApiMessage("切换公司失败")]: "failedToSwitchCompany",
  [normAccountApiMessage("Network error")]: "networkError",
  [normAccountApiMessage("网络错误")]: "networkError",
};

function accountMessageLanguageHint(message) {
  const text = String(message || "");
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  if (hasCjk && !hasLatin) return "zh";
  if (hasLatin && !hasCjk) return "en";
  return "mixed";
}

function formatAccountInUseLabel(acc) {
  const name = String(acc?.name ?? "").trim();
  const code = String(acc?.account_id ?? "").trim();
  if (name && code) return `${name} (${code})`;
  return name || code;
}

/** Parse account labels from delete_currency_api English message. */
export function parseAccountsFromCurrencyDeleteMessage(message) {
  const raw = String(message || "").trim();
  const m = raw.match(/following accounts are using it:\s*(.+?)(?:\s*\[Debug:|$)/i);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((label) => {
      const match = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (match) {
        return { name: match[1].trim(), account_id: match[2].trim() };
      }
      return { name: label, account_id: label };
    });
}

/** Parse non-account usage summary from delete_currency_api message (transactions, data captures, etc.). */
export function parseCurrencyUsageDetailFromMessage(message) {
  const raw = String(message || "").trim();
  const m = raw.match(/being used by:\s*(.+?)(?:\s*\[Debug:|$)/i);
  return m ? m[1].trim() : "";
}

/** True when delete failed only due to historical records, not linked accounts. */
export function isHistoricalOnlyCurrencyDeleteBlock(message, accountsInUse = []) {
  if (Array.isArray(accountsInUse) && accountsInUse.length > 0) return false;
  const detail = parseCurrencyUsageDetailFromMessage(message);
  if (!detail) return false;
  return !/\baccount\(s\)/i.test(detail);
}

export function formatCurrencyUsageDetail(lang, message) {
  const detail = parseCurrencyUsageDetailFromMessage(message);
  if (!detail) return "";
  return translateCurrencyUsageDetail(toLocale(lang), detail);
}

function translateCurrencyUsageDetail(lang, detail) {
  const locale = toLocale(lang);
  if (locale !== "zh") return detail;
  return detail
    .replace(/\bdata capture template\(s\)/gi, "数据采集模板")
    .replace(/\bdata capture detail\(s\)/gi, "数据采集明细")
    .replace(/\bdata capture\(s\)/gi, "数据采集")
    .replace(/\brate transaction detail\(s\)/gi, "汇率交易明细")
    .replace(/\brate transaction\(s\)/gi, "汇率交易")
    .replace(/\btransaction\(s\)/gi, "交易")
    .replace(/\bprocess\(es\)/gi, "流程")
    .replace(/\baccount\(s\)/gi, "账号");
}

function translateAccountDynamicApiMessage(lang, message, data = null) {
  const raw = String(message || "").trim();
  if (!raw) return null;

  let m =
    raw.match(/^账户ID已存在于\s+(.+)$/u) ||
    raw.match(/^账户\s*ID\s*已存在于\s+(.+)$/iu) ||
    raw.match(/^Account ID already exists in\s+(.+)$/i);
  if (m) return getAccountText(lang, "apiAccountIdExistsInScope", { scope: m[1].trim() });

  m = raw.match(/^数据库错误:\s*(.+)$/u) || raw.match(/^数据库更新错误:\s*(.+)$/u);
  if (m) return getAccountText(lang, "apiDatabaseError") + ": " + m[1].trim();

  m = raw.match(/^无权限操作此账户\s*\((.+)\)$/u);
  if (m) return getAccountText(lang, "apiNoPermissionForAccount");

  m = raw.match(/^Cannot delete:\s*used in datacapture formula:\s*(.+)$/i);
  if (m) return getAccountText(lang, "deleteFailed") + ": " + m[1].trim();

  m = raw.match(/^Cannot delete active accounts:\s*(.+)$/i);
  if (m) return getAccountText(lang, "apiCannotDeleteActiveAccounts") + ": " + m[1];
  let accountsInUse = Array.isArray(data?.accounts_in_use) ? data.accounts_in_use : [];
  if (accountsInUse.length === 0) {
    accountsInUse = parseAccountsFromCurrencyDeleteMessage(raw);
  }
  if (accountsInUse.length > 0) {
    const labels = accountsInUse.map(formatAccountInUseLabel).filter(Boolean);
    if (labels.length > 0) {
      return getAccountText(lang, "apiCurrencyInUse") + ": " + labels.join(", ");
    }
  }
  const usageDetail = parseCurrencyUsageDetailFromMessage(raw);
  if (usageDetail) {
    const localized = translateCurrencyUsageDetail(lang, usageDetail);
    const isHistoricalOnly = !/\baccount\(s\)|账号/i.test(localized);
    if (isHistoricalOnly) {
      return getAccountText(lang, "apiCurrencyBlockedByHistory", { detail: localized });
    }
    return getAccountText(lang, "apiCurrencyInUse") + ": " + localized;
  }
  m = raw.match(/^(?:Currency is being used|正在使用|Cannot delete).*currency/i);
  if (m || /being used|正在使用/i.test(raw)) return getAccountText(lang, "apiCurrencyInUse");
  return null;
}

/** Map backend API message to account-list i18n for toasts. */
export function translateAccountApiMessage(lang, apiMessage, fallbackKey = "", params = {}, apiData = null) {
  const message = String(apiMessage ?? "").trim();
  const locale = toLocale(lang);

  const dynamic = translateAccountDynamicApiMessage(locale, message, apiData);
  if (dynamic) return dynamic;

  const key = ACCOUNT_API_MESSAGE_KEYS[normAccountApiMessage(message)];
  if (key) return getAccountText(locale, key, params);

  const hint = accountMessageLanguageHint(message);
  if (message && hint !== "mixed" && hint !== locale && fallbackKey) {
    return getAccountText(locale, fallbackKey, params);
  }

  return message || (fallbackKey ? getAccountText(locale, fallbackKey, params) : "");
}

export function formatCurrencyInUseAccountLabels(accounts = []) {
  return (Array.isArray(accounts) ? accounts : [])
    .map(formatAccountInUseLabel)
    .filter(Boolean);
}

export const getAccountText = createGetText(ACCOUNT_I18N);
