import { createGetText } from "../shared/i18nHelpers.js";

export const DATA_CAPTURE_I18N = {
  en: {
    pageTitle: "Data Capture",
    category: "Category:",
    groupId: "GroupID:",
    groupFilterAll: "ALL",
    company: "Company:",
    date: "Date",
    process: "Process",
    selectProcess: "Select Process",
    groupProcessSalary: "Salary",
    groupProcessCommission: "Commission",
    groupProcessBonus: "Bonus",
    searchProcess: "Search process...",
    typeToSearchProcesses: "Type to search ({count} processes)",
    description: "Description",
    clickToSelectDescriptions: "Click + to select descriptions",
    selectDescriptions: "Select descriptions",
    currency: "Currency",
    selectCurrency: "Select Currency",
    replaceWord: "Replace Word",
    oldWord: "Old word",
    newWord: "New word",
    removeWord: "Remove Word",
    remark: "Remark",
    enterWordsToRemove: "Enter words to remove",
    enterRemark: "Enter remark",
    removeWordHelp: "Press Enter to add a word chip; saved for this process for next time.",
    removeWordChipRemove: "Remove",
    submittedProcesses: "Submitted Processes",
    noProcessesSubmitted: "No processes submitted for this date",
    dataCaptureTable: "Data Capture Table",
    tableSize: "Add Row",
    tableSizeResetTitle: "Reset to default size (11×11)",
    tableSizeAddRows: "Add Rows",
    tableSizeAddColumns: "Add Columns",
    tableSizeAddSummary:
      "Rows: {currentRows} + {addRows} = {totalRows} · Cols: {currentCols} + {addCols} = {totalCols}",
    deleteRowData: "Delete Row Data",
    selectRowToDeleteData: "Select a row header to delete its data",
    pasteFormattedTableHint: "Paste a formatted table below",
    captureTypeText: "1.TEXT",
    captureTypeFormat: "2.FORMAT",
    captureTypeCitibet: "3.CITIBET",
    captureTypeReturn: "4.RETURN",
    reset: "Reset",
    apply: "Apply",
    submit: "Submit",
    copy: "Copy",
    paste: "Paste",
    clear: "Clear",
    delete: "Delete",
    selectAll: "Select All",
    insertColumnLeft: "Insert 1 column left",
    insertColumnRight: "Insert 1 column right",
    deleteColumn: "Delete column",
    clearColumn: "Clear column",
    insertRowAbove: "Insert 1 row above",
    insertRowBelow: "Insert 1 row below",
    deleteRow: "Delete row",
    clearRow: "Clear row",
    shiftCellsLeft: "Shift cells left",
    shiftCellsUp: "Shift cells up",
    entireRow: "Entire row",
    entireColumn: "Entire column",
    ok: "OK",
    cancel: "Cancel",
    selectOrAddDescription: "Select or Add Description",
    selectedDescriptions: "Selected Descriptions",
    noDescriptionsSelected: "No descriptions selected",
    addNewDescription: "Add New Description",
    enterNewDescriptionName: "Enter new description name...",
    add: "Add",
    availableDescriptions: "Available Descriptions",
    searchDescriptions: "Search descriptions...",
    noDescriptionsFound: "No descriptions found",
    deleteDescription: "Delete description",
    confirm: "Confirm",
    deleteDescriptionConfirm: "Are you sure you want to delete description {name}? This action cannot be undone.",
    readOnlyBlocked: "Read-only account: this action is not allowed.",
    failedCaptureData: "Failed to capture data",
    pleaseSelectProcess: "Please select a process",
    pleaseSelectDescription: "Please select at least one description",
    pleaseSelectCurrency: "Please select a currency",
    pleaseEnterTableData: "Please enter data in the table",
    failedLoadDescriptions: "Failed to load descriptions",
    descriptionExists: "Description name already exists",
    failedAddDescription: "Failed to add description",
    descriptionAdded: "Description added successfully!",
    failedDeleteDescription: "Failed to delete description",
    descriptionDeleted: "Description deleted successfully",
    renderFailedTitle: "Data Capture failed to render",
    renderFailedHint: "Refresh the page. If it keeps happening, open the browser console (F12) and share the first error line with support.",
    groupAria: "Group ID",
    companyAria: "Company",
    captureFormatAria: "Data capture format",
    pasteSuccessExcel:
      "Successfully pasted {count} cells ({rows} rows × {cols} columns). Excel format preserved.",
    pasteSuccessUndo:
      "Successfully pasted {count} cells ({rows} rows × {cols} columns). Press Ctrl+Z to undo.",
    pasteSuccessFormatTable:
      "Successfully pasted table ({headerRows} header rows, {dataRows} data rows × {cols} columns). Full structure preserved.",
    pasteSuccessGeneric:
      "Successfully pasted {count} cells ({rows} rows × {cols} columns).",
    pasteSuccessPrefixGeneric:
      "{prefix}: successfully pasted {count} cells ({rows} rows × {cols} columns).",
    pasteSuccessPrefixPdf:
      "{prefix}: successfully pasted {count} cells ({rows} rows × {cols} columns). PDF format preserved.",
    pasteSuccessPrefixRows:
      "{prefix}: successfully pasted {rows} rows × {cols} columns.",
    pasteFailedClipboard: "Failed to access clipboard",
  },
  zh: {
    pageTitle: "数据采集",
    category: "类别：",
    groupId: "集团：",
    groupFilterAll: "全部",
    company: "公司：",
    date: "日期",
    process: "流程",
    selectProcess: "选择流程",
    groupProcessSalary: "1. Salary",
    groupProcessCommission: "Commission",
    groupProcessBonus: "2. Bonus",
    searchProcess: "搜索流程…",
    typeToSearchProcesses: "输入以搜索（共 {count} 个流程）",
    description: "描述",
    clickToSelectDescriptions: "点击 + 选择描述",
    selectDescriptions: "选择描述",
    currency: "货币",
    selectCurrency: "选择货币",
    replaceWord: "替换词",
    oldWord: "原词",
    newWord: "新词",
    removeWord: "移除词",
    remark: "备注",
    enterWordsToRemove: "输入要移除的词",
    enterRemark: "输入备注",
    removeWordHelp: "输入词语后按 Enter 添加为标签；会保存在当前 Process，下次可继续使用。",
    removeWordChipRemove: "移除",
    submittedProcesses: "已提交流程",
    noProcessesSubmitted: "该日期暂无已提交流程",
    dataCaptureTable: "数据采集表",
    tableSize: "新增行",
    tableSizeResetTitle: "重置为默认大小（11×11）",
    tableSizeAddRows: "新增行数",
    tableSizeAddColumns: "新增列数",
    tableSizeAddSummary:
      "行：{currentRows} + {addRows} = {totalRows} · 列：{currentCols} + {addCols} = {totalCols}",
    deleteRowData: "删除行数据",
    selectRowToDeleteData: "请先选择行标题以删除该行数据",
    pasteFormattedTableHint: "请在下方粘贴格式化表格",
    captureTypeText: "1.文本",
    captureTypeFormat: "2.格式",
    captureTypeCitibet: "3.CITIBET",
    captureTypeReturn: "4.RETURN",
    reset: "重置",
    apply: "应用",
    submit: "提交",
    copy: "复制",
    paste: "粘贴",
    clear: "清除",
    delete: "删除",
    selectAll: "全选",
    insertColumnLeft: "在左侧插入 1 列",
    insertColumnRight: "在右侧插入 1 列",
    deleteColumn: "删除列",
    clearColumn: "清除列",
    insertRowAbove: "在上方插入 1 行",
    insertRowBelow: "在下方插入 1 行",
    deleteRow: "删除行",
    clearRow: "清除行",
    shiftCellsLeft: "单元格左移",
    shiftCellsUp: "单元格上移",
    entireRow: "整行",
    entireColumn: "整列",
    ok: "确定",
    cancel: "取消",
    selectOrAddDescription: "选择或新增描述",
    selectedDescriptions: "已选描述",
    noDescriptionsSelected: "未选择描述",
    addNewDescription: "新增描述",
    enterNewDescriptionName: "输入新描述名称…",
    add: "新增",
    availableDescriptions: "可用描述",
    searchDescriptions: "搜索描述…",
    noDescriptionsFound: "未找到描述",
    deleteDescription: "删除描述",
    confirm: "确认",
    deleteDescriptionConfirm: "确认删除描述 {name} 吗？此操作无法撤销。",
    readOnlyBlocked: "只读账号，无法执行此操作。",
    failedCaptureData: "数据采集失败",
    pleaseSelectProcess: "请选择流程",
    pleaseSelectDescription: "请至少选择一个描述",
    pleaseSelectCurrency: "请选择货币",
    pleaseEnterTableData: "请在表格中输入数据",
    failedLoadDescriptions: "加载描述失败",
    descriptionExists: "描述名称已存在",
    failedAddDescription: "新增描述失败",
    descriptionAdded: "描述新增成功！",
    failedDeleteDescription: "删除描述失败",
    descriptionDeleted: "描述删除成功",
    renderFailedTitle: "数据采集页面渲染失败",
    renderFailedHint: "请刷新页面。若问题持续，请打开浏览器控制台（F12）并将第一条错误信息提供给支持人员。",
    groupAria: "集团",
    companyAria: "公司",
    captureFormatAria: "数据采集格式",
    pasteSuccessExcel:
      "成功粘贴 {count} 个单元格 ({rows} 行 x {cols} 列)，已保持Excel原始格式!",
    pasteSuccessUndo:
      "成功粘贴 {count} 个单元格 ({rows} 行 x {cols} 列)! 按 Ctrl+Z 可撤销",
    pasteSuccessFormatTable:
      "成功粘贴表格 ({headerRows} 个表头行, {dataRows} 个数据行 x {cols} 列)，已保持完整表格结构!",
    pasteSuccessGeneric:
      "成功粘贴 {count} 个单元格 ({rows} 行 x {cols} 列)!",
    pasteSuccessPrefixGeneric:
      "{prefix}：成功粘贴 {count} 个单元格 ({rows} 行 x {cols} 列)!",
    pasteSuccessPrefixPdf:
      "{prefix}：成功粘贴 {count} 个单元格 ({rows} 行 x {cols} 列)，已保持PDF原始格式!",
    pasteSuccessPrefixRows:
      "{prefix}：成功粘贴 {rows} 行 x {cols} 列数据!",
    pasteFailedClipboard: "无法访问剪贴板",
  },
};

export const getDataCaptureText = createGetText(DATA_CAPTURE_I18N);

/** Map validation / API message keys used in hooks. */
export function translateDataCaptureMessage(lang, message) {
  const raw = String(message || "").trim();
  const map = {
    "Please select a process": "pleaseSelectProcess",
    "Please select at least one description": "pleaseSelectDescription",
    "Please select a currency": "pleaseSelectCurrency",
    "Please enter data in the table": "pleaseEnterTableData",
    "Read-only account: this action is not allowed.": "readOnlyBlocked",
    "只读账号，无法执行此操作。": "readOnlyBlocked",
    "Failed to capture data": "failedCaptureData",
    "Failed to load descriptions": "failedLoadDescriptions",
    "Description name already exists": "descriptionExists",
    "Failed to add description": "failedAddDescription",
    "Description added successfully!": "descriptionAdded",
    "Failed to delete description": "failedDeleteDescription",
    "Description deleted successfully": "descriptionDeleted",
  };
  const key = map[raw];
  return key ? getDataCaptureText(lang, key) : raw;
}

/** Localize legacy paste toasts (still emitted as Chinese strings from paste modules). */
export function translateDataCaptureNotification(lang, message) {
  const locale = lang === "zh" ? "zh" : "en";
  const raw = String(message || "").trim();
  if (!raw) return raw;

  const t = (key, params) => getDataCaptureText(locale, key, params);

  if (raw === "Failed to access clipboard") {
    return t("pasteFailedClipboard");
  }

  let m = raw.match(/^成功粘贴 (\d+) 个单元格 \((\d+) 行 x (\d+) 列\)，已保持Excel原始格式!$/);
  if (m) return t("pasteSuccessExcel", { count: m[1], rows: m[2], cols: m[3] });

  m = raw.match(/^成功粘贴 (\d+) 个单元格 \((\d+) 行 x (\d+) 列\)! 按 Ctrl\+Z 可撤销$/);
  if (m) return t("pasteSuccessUndo", { count: m[1], rows: m[2], cols: m[3] });

  m = raw.match(/^成功粘贴表格 \((\d+) 个表头行, (\d+) 个数据行 x (\d+) 列\)，已保持完整表格结构!$/);
  if (m) return t("pasteSuccessFormatTable", { headerRows: m[1], dataRows: m[2], cols: m[3] });

  m = raw.match(/^成功粘贴 (\d+) 个单元格 \((\d+) 行 x (\d+) 列\)!$/);
  if (m) return t("pasteSuccessGeneric", { count: m[1], rows: m[2], cols: m[3] });

  m = raw.match(/^(.+?)：成功粘贴 (\d+) 个单元格 \((\d+) 行 x (\d+) 列\)，已保持PDF原始格式!$/);
  if (m) return t("pasteSuccessPrefixPdf", { prefix: m[1], count: m[2], rows: m[3], cols: m[4] });

  m = raw.match(/^(.+?)：成功粘贴 (\d+) 个单元格 \((\d+) 行 x (\d+) 列\)，已保持PDF原始格式!$/);
  if (m) return t("pasteSuccessPrefixPdf", { prefix: m[1], count: m[2], rows: m[3], cols: m[4] });

  m = raw.match(/^(.+?)：成功粘贴 (\d+) 个单元格 \((\d+) 行 x (\d+) 列\)，已保持表格行格式!$/);
  if (m) return t("pasteSuccessPrefixGeneric", { prefix: m[1], count: m[2], rows: m[3], cols: m[4] });

  m = raw.match(/^(.+?)：成功粘贴 (\d+) 个单元格 \((\d+) 行 x (\d+) 列\)!$/);
  if (m) return t("pasteSuccessPrefixGeneric", { prefix: m[1], count: m[2], rows: m[3], cols: m[4] });

  m = raw.match(/^(.+?)：成功粘贴 (\d+) 行 x (\d+) 列数据!$/);
  if (m) return t("pasteSuccessPrefixRows", { prefix: m[1], rows: m[2], cols: m[3] });

  return raw;
}
