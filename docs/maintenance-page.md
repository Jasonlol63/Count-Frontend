# Maintenance 页面 — 设计 / Spring 迁移 / 问题记录

> **本文档由 6 份合并而成**（2026-09-22），把 Maintenance 页面（`/maintenance/*`）相关的记录按模块
> 归拢到一处。内部按 **「现行设计 → Spring 迁移 → 历史问题」** 固定排序，所以**想查"现在该怎么做"
> 只看最前面两节**；往下的都是历史记录（保留排查过程，便于回溯）。
>
> | 顺序 | 来源文档 | 定位 |
> |---|---|---|
> | 1 | `bank-process-bank-balance.md` | **现行设计** —— Bank Process 弹窗的 Bank Balance（一次性 Contra 结余） |
> | 2 | `accounting-due-early-transaction-date.md` | **现行设计** —— Accounting Due 的提前交易日期选择器 |
> | 3 | `maintenance-formula-springboot.md` | 迁移记录 —— Formula Maintenance 复查（当时已是 Spring，无 PHP 残留） |
> | 4 | `maintenance-bankprocess-payment-springboot.md` | 迁移记录 —— Bank Process / Payment Maintenance → Spring |
> | 5 | `maintenance-single-group-tenantid-cleanup.md` | 历史问题（**原 2 份合并**）—— 单 Group 的 tenantId 解析清理 + category 判断漏 Group |
> | 6 | `formula-sync-issues.md` | 历史问题（**原 2 份合并**）—— 改了公式 Summary 不同步（三个叠加根因） |
>
> 各份的后端配对文档都在 `Count/docs/` 下的同名文件里。

> ### ⚠️ 可能仍未处理的一条待办
> 第 5 节（原 `capture-maintenance-group-tenantid-cleanup.md`）的 §4 记录过：同样的
> "单 Group 自己那套 tenantId 解析" 遗留，**Formula / Payment Maintenance 也有**，当时列为后续工作。
> **合并时未核实这两处后来是否已修** —— 若未修，照第 5 节的做法处理即可（模式完全一样）。

---
---

# 1. Bank Process：Bank Balance（一次性 Contra 结余）— 前端设计
## Bank Process：Bank Balance（一次性 Contra 结余）— 前端设计

Add/Edit Process 弹窗新增一个可选的 "Bank Balance" 金额输入框，填了会自动生成一笔 Customer→
Supplier 的 Contra 交易结平双方之间的零头。这份文档只记录**前端**的设计和实现（后端见 `Count`
仓库的 `docs/bank-process.md`）。

### 涉及文件

- `src/pages/bankprocesslist/components/BankProcessFormModal.jsx`
- `src/pages/bankprocesslist/hooks/useBankProcessListPage.js`
- `src/pages/bankprocesslist/bankProcessListApi.js`
- `src/pages/bankprocesslist/lib/bankProcessHelpers.js`
- `src/pages/processlist/components/ProcessDeleteConfirmModal.jsx`
- `public/css/bankBalanceField.css`（新增，独立文件）
- `src/translateFile/pages/bankProcessTranslate.js`

### 字段位置与三种状态

新字段放在 `BankProcessFormModal.jsx` 里 SOP / Remark 按钮旁边（Detail 列，Insurance 下方），
样式跟 Buy Price / Sell Price 用同一套金额输入模式（`sanitizeBankMoneyTyping` + `blurMoneyField`，
非必填）。

| 场景 | 输入框状态 | 删除按钮 |
|---|---|---|
| Add Process | 空、可编辑 | 不显示 |
| Edit Process，之前没填过 | 空、可编辑 | 不显示 |
| Edit Process，已有关联 Contra 交易 | 只读锁定（灰底，参考现有 Profit 只读字段样式） | 显示，垃圾桶图标 |

锁定判断：`bankBalanceLocked = editMode && form.bank_balance_transaction_id != null`——只有
Edit 模式下、且这一行有关联交易 id 时才锁定，Add 模式永远可编辑。

### 删除交互：立即生效，不需要点 Update Process

点删除按钮 → 弹出确认框（复用 `ProcessDeleteConfirmModal.jsx`，不是浏览器原生 `confirm()`）→
确认后**立即**调用 `deleteBankBalance` 接口删除关联交易 → 成功后输入框立刻变回空、可编辑，
不需要用户再点 Update Process 保存。这个"立即生效"是用户明确要的行为，跟 Accounting Due 弹窗
里 Delete 按钮的交互模式保持一致。

**`ProcessDeleteConfirmModal.jsx` 做了一处向后兼容的泛化**：加了可选的 `titleKey`/`messageKey`/
`messageParams` props（默认值就是原来写死的 `confirmDeleteTitle`/`confirmDeleteMessage`/
`{count}`），原有两处调用（Bank Process 批量删除、Process List 批量删除）完全不受影响，Bank
Balance 的删除确认复用同一个组件，只是传了不同的文案 key。

### CSS：独立文件 + 几处踩过的坑

样式全部放在新建的 `public/css/bankBalanceField.css`，没有混进 `processlist.css`。中途调布局
踩了两个坑，记录一下避免以后重复排查：

**坑 1：改了 `min-height`/`padding` 没生效**。`processlist.css` 里有一条
`#addBankModal .bank-form .bank-input { min-height: 4rem !important; padding: 0.625rem 0.875rem
!important; }`，带 `#addBankModal` 这个 id 选择器 + `!important`，管着这个表单里**所有**的
`.bank-input`。要单独调矮 Bank Balance 这一个输入框的高度，选择器必须同时带上 `#addBankModal`
并且也用 `!important`，普通的类选择器覆盖不管多具体都赢不了它。

**坑 2：按钮和输入框底部对不齐，而且用固定像素硬调会在不同窗口宽度下跑偏**。SOP/Remark 按钮和
Bank Balance 字段（label + 输入框）放在同一个 flex 行里，因为按钮没有 label、天然比字段矮一截，
一开始尝试用 `margin-top: -20px` 之类的固定负值把字段往上拉对齐——这个数字是在某一个具体浏览器
宽度下量出来的，因为按钮/输入框的字号都是 `clamp(..., vw, ...)` 响应式的，换一个窗口宽度这个
硬编码的值就不准了（实际发生过：换了个更宽的窗口后，字段直接被顶到上面 Insurance 那一行去）。

**最终方案**：改用 `align-items: flex-end`，让 flex 布局根据两边"实际渲染出来的高度"自动算
对齐，不管窗口多宽、字号怎么缩放都会自动算对，不再需要手动量像素。输入框内部（输入框 + 删除
按钮）也是同样的问题（删除按钮 34px 比调矮后的输入框高），同样改成 `align-items: flex-end`
解决。这两处都在真实运行的页面上用 JS 量过三种不同窗口宽度（1024/1366/1441px）的实际坐标验证过
才确认对齐。

### 一个中途修的 bug：Edit Process 打开后金额一直显示 0.00

**现象**：Add Process 填了 Bank Balance 并保存成功（后端 Payment History 也确认生成了正确的
Contra 交易），但打开 Edit Process 查看时，Bank Balance 显示的还是空/0.00，没有锁定。

**原因**：`bankProcessHelpers.js` 的 `normalizeBankProcessListItem(dto)` 负责把后端
`/api/bank-process/list` 返回的原始 Spring DTO（驼峰命名 `dto.bankBalance`/
`dto.bankBalanceTransactionId`）转换成前端全局统一用的下划线命名字段（`row.bank_balance`/
`row.bank_balance_transaction_id`），后面所有地方（包括 Edit 表单的 `bankProcessListRowToEditForm`）
都是读转换后的 `row`，不会直接碰原始 DTO。当初只改了"消费方"（`bankProcessListRowToEditForm`
读 `row.bank_balance`），却漏了"生产方"——`normalizeBankProcessListItem` 里一直没有把
`dto.bankBalance` 搬到 `row.bank_balance` 上去，所以不管后端返回什么，`row` 这一层永远是
`undefined`。

**修复**：在 `normalizeBankProcessListItem` 返回对象里补上两行映射：

```js
bank_balance: dto.bankBalance != null ? dto.bankBalance : null,
bank_balance_transaction_id: dto.bankBalanceTransactionId ?? null,
```

### API 层

- `bankProcessListApi.js` 的 `buildBankProcessMutableWriteFields`（Add/Update 共用的字段映射器）
  加了 `bankBalance: toOptionalMoney(form?.bank_balance)`，会随 Add/Update 请求一起提交。
- 新增 `deleteBankBalance({ id, tenantId }, signal)`，对接后端
  `POST /api/bank-process/delete-bank-balance`。

### 没有改动的地方

- Buy Price / Sell Price / Insurance 等既有金额字段的输入模式、校验逻辑完全没动。
- Contract/Insurance 两列布局本身没有重排，Bank Balance 是加在 SOP/Remark 那一行的右侧。

### 已知限制

- 只做过 `vite build` 语法检查和真实页面手动验证（Add → 生成 Contra → Edit 查看锁定 → 删除
  解锁），没有自动化端到端测试覆盖。

---
---

# 2. Accounting Due：提前交易日期（Early Transaction Date）— 前端设计
## Accounting Due：提前交易日期（Early Transaction Date）— 前端设计

Accounting Due 弹窗新增一个日期选择器：用户可以选今天~今年年底之间的任意一天，预览到那一天
为止会有哪些账单到期，并直接对提前出现的账单执行入账。这份文档只记录**前端**的设计和实现
（后端见 `Count` 仓库的 `docs/bank-process.md`——后端本来就已经支持
`asOf` 参数，这次前端只是把它从"开发者调试专用"接上成正式 UI，后端只补了一处范围校验）。

### 涉及文件

- `src/pages/bankprocesslist/components/AccountingDueModal.jsx`
- `src/pages/bankprocesslist/components/AccountingDueDatePicker.jsx`（新增）
- `src/pages/bankprocesslist/hooks/useBankProcessListPage.js`
- `src/pages/bankprocesslist/bankProcessListApi.js`
- `public/css/accountingDueDatePicker.css`（新增，独立文件）
- `src/translateFile/pages/bankProcessTranslate.js`

### 设计 1：日历组件做成完全独立的组件，不复用全局共用日历

`AccountingDueModal.jsx` 一开始是用原生 `<input type="date">` 做的日期选择（能拿到浏览器原生的
`min`/`max` 范围限制），但视觉上跟应用其他地方用的那套自定义日历（`utils/date/dateRangePicker.js`
+ `date-range-picker.css`，Bank Process 表单 Day Start/Day End 也用这个）不一致。

**为什么不直接换成共用的那套日历**：排查发现 `dateRangePicker.js` 完全没有 min/max 日期限制的
能力（连 `data-min-ymd` 这种已有的 data 属性都是从来没人读取的死代码）。真要做"只能选今天~今年
年底"，要嘛在应用层做选完再拒绝的校验（体验差——点了才被拒绝，而不是一开始就点不了），要嘛去改
这套全应用共用的日历引擎（Bank Process 表单、报表筛选等到处都在用，改动面和回归风险都大）。

**最终方案**：新建 `AccountingDueDatePicker.jsx`，是一个完全独立的单日期日历组件：

- 自己实现月份网格渲染、上/下月导航、月份下拉（自绘的按钮+列表，不是原生 `<select>`——原生下拉
  弹出层没法自定义字体/配色，跟应用整体风格不搭）。
- **范围外的日期在网格层面就是禁用状态**（灰色、`disabled`、点不了），不是选完再校验拒绝。
- 视觉上照抄共用日历的配色（`#3b82f6` 蓝色、`#d1d5db` 灰色边框等），但用全新的 `accounting-due-cal-*`
  class 名，跟 `dateRangePicker.js`/`date-range-picker.css` 完全没有交集——改这个组件不会影响任何
  其他用到共用日历的页面，反之亦然。
- 因为可选范围（今天~今年年底）永远落在**同一个日历年**内，月份导航天然只会横跨同一年，所以没有
  做年份下拉——月份下拉直接显示"Sep 2026"这种带年份的完整选项，避免做一个只有一个选项、形同虚设
  的年份选择器。
- CSS 单独放在 `public/css/accountingDueDatePicker.css`，没有混进 `processlist.css`（按要求独立
  维护）。

### 设计 2：范围 = 今天 ~ 今年 12 月 31 日，自动跨年

最开始只做了"今天~未来一个月"，后来按要求扩到"今天~今年年底"。`maxAsOfIso` 用
`endOfYearIso(new Date())` 现算，不是写死某一年，所以到了明年这个范围会自动变成"今天~明年
年底"，不需要改代码。

日期选择器旁边还有一排快捷 chip：今天 / +1 周 / +2 周 / +1 月 / 年底，点了直接跳转，不用每次都
翻日历。

### 设计 3：区分"今天到期" vs "提前预览出来的"

选了未来日期后，界面上有几处提示避免用户误操作：

- 弹窗标题徽标旁加日期后缀（`Accounting Due [9] · as of 09-20`）。
- 表格上方出现一条提示条，说明当前显示的是哪个日期视角下的账单。
- 每一行如果是"因为选了未来日期才提前出现"的（`posted_date` 晚于真实今天），左侧加一条橙色竖条
  + "Early" 徽标；这个判断纯前端计算（比较 `row.posted_date` 和真实今天的日期字符串），不需要
  后端额外返回字段。
- 空状态文案区分"今天没有待入账"和"该日期没有待入账"两种情况。

### 一个中途修的 bug：日期一选就把整个日期栏弄丢

**现象**：点了某个日期/chip 后，日期选择器整个消失，要关掉弹窗重开才会恢复。

**原因**：`useBankProcessListPage.js` 的 `loadAccountingInbox` 一开始把 `accountingAsOfDate`
（选中的预览日期）直接放进了 `useCallback` 依赖数组，导致每次选日期这个函数的引用就会变——而
这个函数同时被好几个**跟日期选择器完全无关**的 `useEffect` 依赖着（比如"跨页面公司会话同步"那个
effect）。函数引用一变，那些 effect 全部被误触发一遍，其中的公司会话同步逻辑把界面状态搅乱了。

**修复**：改用 `accountingAsOfDateRef`（跟同文件里 `companyIdRef`一样的写法）在内部读最新值，
`loadAccountingInbox` 的依赖数组去掉 `accountingAsOfDate`，函数引用只在 `companyId` 变化时才变，
跟改之前的行为完全一致，不会再牵连其他 effect。

### API 层：`asOf` 怎么传下去

`bankProcessListApi.js` 的 `fetchAccountingDueInbox(tenantId, signal, { asOf, restoreSkipped })`
本来就支持 `asOf` 参数（连开发者调试常量 `ACCOUNTING_DUE_AS_OF_OVERRIDE` 都已经留好了），这次
只是把它从"写死 `null`"改成"由 UI 选中的日期驱动"，`useBankProcessListPage.js` 新增
`accountingAsOfDate` state + `setAccountingAsOf` handler，选中/重置日期时都会重新拉取一次列表。

### 已知限制

- 只在 `vite build` 层面做过语法检查，没有自动化 UI 测试；不同浏览器窗口宽度下的换行/对齐已经
  用真实页面 + JS 量过坐标验证，但没有做全量响应式断点扫描。
- COMPENSATION 类型（1+N 合同的补偿账单）不受这个预览日期影响，`BankProcessListPage` 里对提前
  出现的行只判断"是否早于真实今天"，不区分类型——如果以后要单独处理 COMPENSATION，需要在这里
  额外加判断。

---
---

# 3. Formula Maintenance → Spring Boot 对齐（迁移记录）
## Formula Maintenance → Spring Boot 对齐

### 1. 现状

Formula Maintenance 页面（`src/pages/maintenance/formula/`）在本次复查前**已经**是完整
Spring Boot 实现，没有 PHP 残留：

- List: `POST api/maintenance/formula-maintenance/list`
- Update: `POST api/maintenance/formula-maintenance/update`
- Delete: `POST api/maintenance/formula-maintenance/delete`

对应后端 `MaintenanceController.java:120-155`（`listFormulaMaintenance` /
`updateFormulaMaintenance` / `deleteFormulaMaintenance`），DTO 是
`MaintenanceFormulaDTO`（`tenantId` / `process` / `category` / `q` / `formulaIds` / `id` /
`accountId` / `sourcePercent` / `inputMethod` / `formula` / `description` 等）。前端请求体
字段名与 DTO 逐一核对一致（camelCase），无需改动。

### 2. 2026-08-25 复查：修正纯 Group 模式的两个问题

用户要求确认「单 group 形式的数据查询、编辑、删除都可以实现，且不再有 PHP、字段/tenant 全对齐后端」。
复查发现两处需要修，跟 Transaction/Capture/Payment Maintenance 之前修过的同类问题（同一批次代码
遗留）完全对应：

#### 2.1 真实 bug：纯 Group 模式的 category 判断漏了 group

`formulaMaintenanceLogic.js` 的 `resolveFormulaMaintenanceCategory(scope)`（改动前）只看
`scope.c168Channel || scope.companyPayrollChannel`（C168 / bank-only 公司），漏了
`formulaMaintenanceUsesGroupProcesses(scope)` 里的第三个条件 `scope.mode === "group"`
（纯 Group 账本模式）。而 `fetchProcesses()` 的下拉列表分支用的正是完整的
`formulaMaintenanceUsesGroupProcesses(scope)`——两者判断条件不一致，导致：

- Process 下拉在纯 Group 模式下正确显示 SALARY/COMMISSION/BONUS/PROFIT（group payroll 4 项）；
- 但实际发给 `/formula-maintenance/list` 的 `category` 却仍是 `"Games"` 而不是 `"Bank"`（group
  payroll 数据落在 Bank 分类下），导致纯 Group 模式搜索大概率查不到数据。

这跟 commit `eb3f4af` 里 Transaction Maintenance 修过的 `resolveTransactionMaintenanceCategory`
bug 是同一个模式（同一批次遗留、同一处漏改）。

**改动**：`resolveFormulaMaintenanceCategory` 改为直接复用
`formulaMaintenanceUsesGroupProcesses(scope) ? "Bank" : "Games"`，与 process 下拉判断条件保持
一致（`formulaMaintenanceLogic.js`）。

#### 2.2 死代码：重复的 group tenantId fallback

`resolveFormulaMaintenanceTenantIds({ scope, companies })` 里有一段
`scope.mode === "group" && scope.groupId` 时用 `resolveGroupEntityRowFromSnap(companies, scope.groupId)`
兜底解析 tenantId 的分支。跟 Payment Maintenance 复查时发现的问题同源：
`resolveCustomerReportScope()`（`pages/report/shared/reportScope.js:89-93`）现在已经统一负责把
纯 Group 账本的 `scopeCompanyId` 解析成真实 tenantId，这段 formula 自己维护的等价兜底逻辑是
迁移早期遗留、从未被真正命中过的死代码（`scope.scopeCompanyId` 分支永远先命中）。

**改动**：删除该 fallback 分支，`resolveFormulaMaintenanceTenantIds` 现在只剩 aggregate 分支 +
`scope.scopeCompanyId` 分支，与 `transactionMaintenanceLogic.js:110-118` /
`captureMaintenanceLogic.js` 写法完全对齐。同步删除只被这段代码使用的 `resolveGroupEntityRowFromSnap`
import，以及 `listFormulaTemplates` / `resolveFormulaMaintenanceTenantIds` 签名里不再需要的
`companies` 参数（`FormulaMaintenancePage.jsx` 里传给 `resolveFormulaMaintenanceScope(...)` 的
`companies` 是另一个不相关的用法，未改动）。

改动文件：
- `src/pages/maintenance/formula/formulaMaintenanceLogic.js` — 修正
  `resolveFormulaMaintenanceCategory`；删除死代码 fallback 分支 + 未用到的
  `resolveGroupEntityRowFromSnap` import；`listFormulaTemplates` /
  `resolveFormulaMaintenanceTenantIds` 签名去掉 `companies` 参数。
- `src/pages/maintenance/formula/FormulaMaintenancePage.jsx` — `listFormulaTemplates(...)`
  调用点去掉 `companies` 实参。

**已验证**：`formulaMaintenanceLogic.test.js` 跑过（9/11 通过，2 个失败是
`syncEditFormSourcePercent`/`syncEditFormFormulaInput` 相关的既有失败，跟本次改动无关——改动前后
`git stash` 对比确认同样失败，不是本次引入的回归）。

**未验证**：字段/tenant 静态审查 + 单测通过，未跑浏览器端到端回归（建议人工过一遍纯 Group 账本
模式下 Process 下拉自动加载 group payroll 4 项、搜索能查到 Bank 分类下的 formula 行、编辑保存、
批量删除）。

---
---

# 4. Bank Process Maintenance / Payment Maintenance → Spring Boot 对齐（迁移记录）
## Bank Process Maintenance / Payment Maintenance → Spring Boot 对齐

> 范围：`/maintenance/bankprocess`、`/maintenance/payment` 两个页面的 search / delete / currency / session-switch
> 全部改走 Spring Boot `tenantId` 形式，不再打旧 PHP `*_api.php` 端点、不再用 `company_id` / `group_id` /
> `group_only` / `group_aggregate` / `report_scope` / `subsidiary_accounts_only` 这套旧字段校验。
> 后端参考：`Count/backend/src/main/java/com/eazycount/controller/MaintenanceController.java`、
> `MaintenanceServiceImpl.java`、`dto/MaintenanceBankProcessDTO.java`、`dto/MaintenancePaymentDTO.java`。

---

### 1. 新端点

| 页面 | 动作 | 旧端点（已删除，不再调用） | 新端点 |
|---|---|---|---|
| Bank Process Maintenance | 查询 | `GET api/bankprocess_maintenance/search_api.php` | `POST api/maintenance/bankprocess-maintenance/list` |
| Bank Process Maintenance | 删除 | `POST api/bankprocess_maintenance/delete_api.php` | `POST api/maintenance/bankprocess-maintenance/delete` |
| Payment Maintenance | 查询 | `GET api/payment_maintenance/search_api.php` | `POST api/maintenance/payment-maintenance/list` |
| Payment Maintenance | 删除 | `POST api/payment_maintenance/delete_api.php` | `POST api/maintenance/payment-maintenance/delete` |
| 两者 | 币种下拉 | `GET api/transactions/get_company_currencies_api.php` / `get_scope_account_currencies_api.php` | `POST api/currency/list?tenant_id=`（`fetchCurrencyListByTenantId`，`utils/api/currencyApi.js`） |
| 两者 | 切换公司 session | `GET api/session/update_company_session_api.php?company_id=` | `POST auth/switch-tenant?tenant_id=`（`syncCompanySessionApi`，`utils/company/companySessionSync.js`） |

请求体一律是 JSON（`Content-Type: application/json`），字段用 camelCase 直接对应后端 DTO：
`tenantId` / `dateFrom` / `dateTo` / `q` / `currencyCodes` / `transactionType`（仅 Payment）/ `transactionIds`。
不再拼 `URLSearchParams`，不再传 `view_group` / `group_id` / `group_only` / `group_aggregate` /
`report_scope` / `subsidiary_accounts_only` —— Spring 端 DTO 里根本没有这些字段，传了也没用。

`dateFrom`/`dateTo` 沿用页面原本的 `dd/mm/yyyy` 字符串，后端 `TransactionDateParse` 原生支持
`d/M/uuuu`（不要求补零）和 ISO `yyyy-MM-dd` 两种格式，前端不用改格式。

---

### 2. tenantId 是唯一的 scope

新后端的 `MaintenanceBankProcessDTO` / `MaintenancePaymentDTO` 只有一个 `tenantId: Integer` 字段，
**没有 group 聚合的概念**。旧 PHP 那套「`group_id` + `group_aggregate=1` 由后端聚合整个组的账」的模式
在 Spring 这边完全不存在。

- **Bank Process Maintenance**：本来就没有 Group 账本（页面注释原文如此），`companyId`（UI 选中的
  公司 pill id）直接当 `tenantId` 用，`bankprocessMaintenanceLogic.js` 没有任何 scope 解析逻辑。
- **Payment Maintenance**：支持 Group 账本 + Groups All / Group All 聚合，情况分两种（都在
  `paymentMaintenanceLogic.js` 的 `resolvePaymentMaintenanceTenantIds()` 里处理）：
  1. **Company 模式 / 纯 Group 账本**：统一走 `scope.scopeCompanyId`。纯 Group 账本（选了组但没
     下钻到具体子公司）时，`resolveCustomerReportScope()`（`pages/report/shared/reportScope.js`）
     已经在 scope 解析阶段把 `scopeCompanyId` 填成「组的实体公司行」（`company_id === 组代码`）的
     真实 tenantId，不会再落到 `0`。所以这里**不需要**、也**不应该**再由 maintenance 页面自己二次
     查 `companies` 兜底——2026-08-25 之前 `resolvePaymentMaintenanceTenantIds` 里还留着一段
     `scope.mode === "group" && scope.selectedGroup` 的死代码 fallback（`resolveGroupEntityRowFromSnap`
     现查），但 `resolveCustomerReportScope` 产出的 scope 字段名其实是 `groupId` 不是
     `selectedGroup`，这段 fallback 永远不会命中，纯属误导性的重复逻辑，已删除（跟
     `transactionMaintenanceLogic.js` / `captureMaintenanceLogic.js` 之前的清理保持一致）。
  2. **Aggregate 模式**（Groups All / Group All 聚合，`scope.mode === "aggregate"`）：
     `scope.mergeCompanyIds` 是一串真实子公司 id，Spring 端没有「一次请求聚合多租户」这个能力，
     前端对每个 tenantId 并发发一次 `list` 请求，再按 `createdAt desc, id desc` 客户端合并排序
     （后端单租户结果本身就是这个顺序，合并后重排是为了保证跨租户交叉的全局顺序正确）。

`fetchCompanyCurrencies` / `searchPaymentData` / `deletePaymentRecords` 都吃同一个
`resolvePaymentMaintenanceTenantIds({ companyId, scope })`——`companies` 参数已随上面的死代码一并
从这三个函数的签名里删掉。

---

### 3. 删除：按行的来源 tenant 分组

Payment Maintenance 在 aggregate 模式下，列表里的行可能来自不同 tenant。搜索时
`normalizePaymentRow(row, tenantId)` 会把该行实际来自哪个 tenant 记在内部字段 `_tenant_id`
上（UI 不读这个字段，纯内部簿记）。`deletePaymentRecords(transactionIds, scope, rows)`
删除前先按 `_tenant_id` 把选中的 id 分组，每组各发一次
`POST api/maintenance/payment-maintenance/delete`（`{ tenantId, transactionIds }`）。
非 aggregate 场景下永远只有一组，行为跟单租户删除一样。

Bank Process Maintenance 没有 aggregate 场景，`deleteBankprocessData(transactionIds, companyId)`
直接用当前选中公司的 `companyId` 当 `tenantId`（调用点 `BankprocessMaintenancePage.jsx` 的
`onConfirmDelete` 已同步改为传 `companyId`）。

---

### 4. 响应字段映射（Spring camelCase → 前端旧字段名）

表格组件（`BankprocessVirtualDataRow.jsx` / `PaymentVirtualDataRow.jsx` 等）完全没动，
沿用 `transaction_id` / `dts_created` / `account` / `from_account` / `amount` / `currency` /
`description` / `remark` / `created_by` / `is_deleted` / `deleted_by` / `dts_deleted` 这套旧字段名
—— 由 `normalizeBankprocessRow()` / `normalizePaymentRow()` 在 API 层做一次映射，UI 层零改动：

| Spring DTO 字段（JSON） | 前端行字段 |
|---|---|
| `id` | `transaction_id` |
| `createdAt`（ISO `yyyy-MM-ddTHH:mm:ss`） | `dts_created`（转成 `dd/mm/yyyy HH:mm:ss`，见下） |
| `toAccountCode` | `account` |
| `fromAccountCode` | `from_account` |
| `amount` | `amount` |
| `currencyCode` | `currency` |
| `description` / `remark` / `createdBy` | 原样，`remark` 转大写 |
| `deleted`（boolean） | `is_deleted` |
| `deletedBy` / `deletedAt` | `deleted_by` / `dts_deleted` |
| `bankProcessId` / `periodType` / `transactionDate`（仅 Bank Process） | `source_bank_process_id` / `period_type` / `date`（Post/Resend 批次分组用，见 `bankprocessMaintenanceBatchKey`） |

新增 `formatSpringDateTimeToDmy()`（`shared/maintenanceDateHelpers.js`）：把 Spring 默认序列化的
`LocalDateTime` ISO 字符串转成页面原本显示用的 `dd/mm/yyyy HH:mm:ss`。

---

### 5. 顺带修的一个真实 bug

`PaymentMaintenanceFilters.jsx` 的 Transaction Type 下拉列表跟后端 `ALLOWED_TYPES`
（`PAYMENT/CLAIM/CLEAR/CONTRA/RATE/ADJUSTMENT/PROFIT`）对不上：多了一个后端根本不认的 `RECEIVE`
（选中后旧代码直接透传成 legacy `receive` 参数，PHP 那边可能认；Spring `normalizeType()` 遇到不在
白名单里的值会直接抛 `BusinessException("Unsupported transaction type: RECEIVE")`，整个查询会失败），
也少了 `CLEAR` 和 `PROFIT` 两个合法类型选不到。已改成跟后端白名单完全一致的 7 个选项。

---

### 6. 改了哪些文件

- `src/pages/maintenance/bankprocess/bankprocessMaintenanceLogic.js` — 全部重写：`searchBankprocessData`
  / `deleteBankprocessData`（新增 `companyId` 参数）/ `fetchCompanyCurrencies`（改走
  `fetchCurrencyListByTenantId`）/ `updateSessionCompany`（改走 `syncCompanySessionApi`）。
  batch-select（`bankprocessMaintenanceBatchKey` 等）逻辑不变。
- `src/pages/maintenance/bankprocess/BankprocessMaintenancePage.jsx` — `onConfirmDelete` 里
  `deleteBankprocessData(selectedIds)` → `deleteBankprocessData(selectedIds, companyId)`。
- `src/pages/maintenance/payment/paymentMaintenanceLogic.js` — 全部重写：新增
  `resolvePaymentMaintenanceTenantIds()`；`searchPaymentData` / `deletePaymentRecords` /
  `fetchCompanyCurrencies` 都改走新端点 + tenantId 解析；删掉了只对 WIN/LOSE 生效的
  `mergeProfitRows()`（Payment Maintenance 后端结果集里现在保证不会出现 WIN/LOSE，这段本来就是死代码）。
- `src/pages/maintenance/payment/PaymentMaintenancePage.jsx` — 所有
  `fetchCompanyCurrencies(...)` / `searchPaymentData(...)` / `deletePaymentRecords(...)` 调用点
  补传 `paymentData`（删除按 tenant 分组要用）。（原本还补传过 `companies` 给纯 Group 账本
  tenantId 兜底解析，2026-08-25 该兜底逻辑连同 `companies` 参数一起删除，见第 8 节。）
- `src/pages/maintenance/payment/components/PaymentMaintenanceFilters.jsx` — Transaction Type
  下拉选项对齐后端 `ALLOWED_TYPES`（见第 5 节）。
- `src/pages/maintenance/shared/maintenanceDateHelpers.js` — 新增 `formatSpringDateTimeToDmy()`。

**没有改**：`paymentMaintenanceScope.js`（`resolvePaymentMaintenanceScope` /
`paymentMaintenanceScopeApiParams` 继续用，前者产出 `scope.mode` / `scope.scopeCompanyId` /
`scope.mergeCompanyIds` 给新逻辑用，后者只用来生成 localStorage 币种排序的 key，不发网络请求，
不涉及后端字段对齐）；两个页面的 Filters/Table/VirtualRows 组件（除上面第 5 点那处下拉框）；
`bankprocessMaintenanceScope`（不存在，Bank Process 本来就没有 scope 概念）。

---

### 7. 已知限制 / 未验证

- 本次改动只做了 `esbuild` 语法检查（`BankprocessMaintenancePage.jsx` / `PaymentMaintenancePage.jsx`
  分别过了 bundle），**没有在浏览器里跑通登录 → 搜索 → 删除的完整流程**，需要人工用真实账号在
  Bank Process Maintenance / Payment Maintenance 两个页面各测一遍：
  - 普通 Company 模式搜索 + 删除
  - Payment Maintenance 的纯 Group 账本模式（不下钻子公司）搜索 + 删除 —— 这是本次唯一新增的
    「查 `companies` 表找组实体行」逻辑，最容易出问题的地方
  - Payment Maintenance 的 Groups All / Group All 聚合模式搜索 + 跨公司批量删除
  - Transaction Type 下拉的 7 个选项是否都能正常查询（尤其 `CLEAR` / `PROFIT` 之前选不到）
- Transaction / Capture / Formula Maintenance 三个页面**没有包含在本次改动里**——检查下来它们目前
  仍在调用旧 PHP 路径（`api/transactions/maintenance_search_api.php` 等），跟新的
  `api/maintenance/{transaction,capture,formula}-maintenance/*` 后端端点同样对不上，是遗留的技术债，
  按用户这次的范围要求（只做 Bank Process + Payment）暂未处理。

  > 更新（见第 8 节）：Transaction / Capture Maintenance 后来（`eb3f4af` / `ea2f69d`）已单独迁移到
  > Spring，本节这句话对这两个页面已经过时；Formula Maintenance 状态未复核。

---

### 8. 2026-08-25 复查：清掉 Payment Maintenance 里残留的重复 group tenantId fallback

用户要求核对 Payment Maintenance 是否（1）已完全走 Spring API、不再有 PHP 残留，（2）纯 Group 模式
查数据是否正确、不会窜到 Company（不是 `company = group` 的问题）。复查结论：

- **PHP 残留检查**：无问题。`paymentMaintenanceLogic.js` 的 list/delete 全部走
  `buildApiUrl("api/maintenance/payment-maintenance/list|delete")`，跟第 1 节表格一致，没有
  `.php` 或旧端点残留。
- **Group/Company 作用域检查**：发现死代码，已清理，但**不是实际的窜数据 bug**——纯 Group 模式
  查询在清理前后行为一致（都正确落到 `scope.scopeCompanyId` 解析出的组实体 tenantId）。

  问题代码（清理前，`paymentMaintenanceLogic.js:17-30`）：
  ```js
  function resolvePaymentMaintenanceTenantIds({ companyId, scope, companies } = {}) {
    ...
    const tid = Number(companyId ?? scope?.scopeCompanyId);
    if (Number.isFinite(tid) && tid > 0) return [tid];
    if (scope?.mode === "group" && scope.selectedGroup && Array.isArray(companies)) {
      const row = resolveGroupEntityRowFromSnap(companies, scope.selectedGroup);
      ...
    }
    return [];
  }
  ```
  这段 `scope.mode === "group"` fallback 是第 2 节原文档描述的"旧做法"——在
  `resolveCustomerReportScope()` 统一负责把纯 Group 账本的 `scopeCompanyId` 解析成真实 tenantId
  之前（`transactionMaintenanceLogic.js`/`captureMaintenanceLogic.js` 迁移时期遗留），Payment
  Maintenance 自己也维护了一份等价的兜底逻辑。但它读的字段是 `scope.selectedGroup`，而
  `resolveCustomerReportScope`/`mapTransactionScopeToReportScope`
  （`pages/report/shared/reportScope.js:22-36`）产出的 scope 对象里这个字段实际叫 `groupId`——
  所以 `scope.selectedGroup` 恒为 `undefined`，这段 fallback 从来没有真正执行过，是纯粹的死代码，
  并不提供它看起来该有的"安全网"效果。

  **改动**：删除这段 fallback 分支（连带只被它使用的 `resolveGroupEntityRowFromSnap` import），
  `resolvePaymentMaintenanceTenantIds` 现在只剩 aggregate 分支 + `scope.scopeCompanyId` 分支，
  跟 `transactionMaintenanceLogic.js:110-118` / `captureMaintenanceLogic.js:72-80` 的写法完全对齐。
  同步把已经不再被用到的 `companies` 参数从 `fetchCompanyCurrencies` / `searchPaymentData` /
  `deletePaymentRecords` 的签名里删掉，以及 `PaymentMaintenancePage.jsx` 里对应的 6 处调用点
  （`fetchCompanyCurrencies` 4 处、`searchPaymentData` 1 处、`deletePaymentRecords` 1 处；
  页面里传给 `resolvePaymentMaintenanceScope(...)` 的 `companies` 是另一个不相关的用法，未改动）。

  - **Category 默认值检查**（对照 Transaction/Capture Maintenance 曾经把纯 Group 模式默认成
    `Games` 而不是 `Bank` 的 bug）：不适用。Payment Maintenance 请求体里根本没有 `category`
    字段，过滤器是 `PAYMENT/CLAIM/CLEAR/CONTRA/RATE/ADJUSTMENT/PROFIT` 这套 transactionType，
    不存在 `resolvePaymentMaintenanceCategory` 这个函数，没有这条 bug 存在的空间。

改动文件：
- `src/pages/maintenance/payment/paymentMaintenanceLogic.js` — 删除死代码 fallback 分支 + 未用到的
  `resolveGroupEntityRowFromSnap` import；`fetchCompanyCurrencies` / `searchPaymentData` /
  `deletePaymentRecords` 签名去掉 `companies` 参数。
- `src/pages/maintenance/payment/PaymentMaintenancePage.jsx` — 对应 6 处调用点去掉 `companies`
  实参；`reloadScopeMeta` 的 `useCallback` 依赖数组去掉 `companies`。

**未验证**：本次只做了代码审查 + 静态清理，没有跑浏览器端到端回归（纯 Company 模式、纯 Group
账本模式、Groups All / Group All 聚合模式的搜索 + 删除都建议人工过一遍，尤其确认纯 Group 模式
下币种下拉、数据列表、删除操作跟清理前表现一致）。

---
---

# 5. 单 Group 模式 tenantId 解析清理 + category 漏 Group（历史问题，原 2 份合并）
## Maintenance 各页：收掉"单 Group 模式自己那套 tenantId 解析" + category 判断漏 Group

> **本文档由两份合并而成**（2026-09-22）：`capture-maintenance-group-tenantid-cleanup.md` +
> `transaction-maintenance-group-tenantid-cleanup.md`（两份同为 2026-08-25，标题结构、范围、
> "纯前端改动、后端零改动"全部同款）。Transaction 那份原文 §0 直接写着"同一模式在
> `[[capture-maintenance-group-tenantid-cleanup.md]]` 已经处理过一次"，是同一轮工作的两个模块。
>
> 下面先给结论速览，再完整保留两份原文（含各自的验证清单与"未改动部分"确认）。

### 结论速览

**共同模式**：`reportScope.js` 的 `resolveCustomerReportScope()` 早就统一收口了「纯 Group scope
（选中 Group、未下钻到 Company）」的 tenantId 解析——用 `resolveGroupEntityRowFromSnap()` 把 group
自己的 entity company（`company_id` 等于 group 代码那一行）的 `id` 塞回 `scopeCompanyId`。
但**各 Maintenance 页各自又留了一份同类型兜底分支**，而这段分支**永远不会触发**
（`scope.scopeCompanyId` 传进来时已经是正数了），是死代码。

**顺带修掉的真 bug（两个模块同一个根因）**：`category` 判断只看 `scope.c168Channel` /
`scope.companyPayrollChannel` 两个标志，而这两个标志**只在选中具体 Company 行时才被算出来**——
纯 Group 模式下恒为 `false`，兜底成 `"Games"`；但 group payroll 提交
（SALARY/COMMISSION/BONUS/PROFIT）落库用的是 `category = "BANK"`。结果就是**提交成功但搜不到**。

| 模块 | 改动 | 备注 |
|---|---|---|
| **Capture** Maintenance | 收掉 `resolveCaptureMaintenanceTenantIds()` 自己的兜底分支；修 `category` 判断 | 该 bug 是**联调时实测**发现的（原文 §1.1） |
| **Transaction** Maintenance | 收掉 `resolveTransactionMaintenanceTenantIds()` 自己的兜底分支；修 `category` 判断 | group payroll 那处是**实测前对照 Capture 的结论提前修掉**的，没有再等联调跑出"搜不到"（原文 §0 末段）；另含 §5「纯 Group 冷启动进维护页 Sidebar 只剩 Data Capture」的修复 |

### ⚠️ 可能仍未处理

`capture-maintenance-group-tenantid-cleanup.md` 原文 **§4 明确记录**：同样的遗留
**Formula / Payment Maintenance 也有**，当时作为后续工作列出。**本次合并没有核实这两处后来是否已修**
——如果没修，请参照本文件的两份原文处理（模式完全一样）。这条是本合并文档刻意提到最前面的可执行项。

---
---

## 原文 A：`capture-maintenance-group-tenantid-cleanup.md`（2026-08-25）
### Capture Maintenance — 收掉单 Group 模式自己的一套 tenantId 解析 + 修复搜不到 Group Payroll 数据

> **范围**：`src/pages/maintenance/capture/captureMaintenanceLogic.js`、
> `src/pages/maintenance/capture/CaptureMaintenancePage.jsx`。纯前端改动，**后端零改动**。
> **最后更新**：2026-08-25

---

### 0. 起因

`d929379`（`reportScope.js`）已经把「纯 Group scope（选中 Group、未下钻到 Company）」的 tenantId
解析统一收口：`resolveCustomerReportScope()` 在 `mode === "group"` 且 `scopeCompanyId` 还没解析出
正数时，用 `resolveGroupEntityRowFromSnap()` 把 group 自己的 entity company（`company_id` 等于
group 代码那一行）的 `id` 塞回 `scopeCompanyId`。

Capture Maintenance 的 `captureMaintenanceScope.js`（`resolveCaptureMaintenanceScope`）本来就是直接
委托给这个函数，所以理论上 Capture Maintenance 早就"免费"吃到了这个修复。但
`captureMaintenanceLogic.js` 里的 `resolveCaptureMaintenanceTenantIds()` 还留着一份**自己的**同类型
兜底逻辑：

```js
if (scope?.mode === "group" && scope.groupId && Array.isArray(companies)) {
  const row = resolveGroupEntityRowFromSnap(companies, scope.groupId);
  ...
}
```

两处用完全相同的 `companies` 数组、完全相同的 `resolveGroupEntityRowFromSnap()` 做同一件事——这段
分支永远不会真正触发（scope 传进来的时候 `scopeCompanyId` 已经是正数了），是一份死代码，也是"单
Group 模式在页面自己的数据层里又搞了一套独立解析"的隐患：以后如果 `reportScope.js` 那边的解析规则
改了，这里不会跟着变，容易悄悄跑出两套不一致的 tenantId。

---

### 1. 改动

- `resolveCaptureMaintenanceTenantIds()`：删掉 group-only 分支，只保留 `aggregate` 分支
  （`scope.mergeCompanyIds`）和 `scope.scopeCompanyId`/`companyId` 的直接读取。Group 模式的 tenantId
  完全交给 `resolveCustomerReportScope()` 一处产出，Capture Maintenance 不再有自己的解析路径。
- 删掉 `import { resolveGroupEntityRowFromSnap } from "../../report/shared/reportScope.js"`（不再
  使用）。
- `searchCaptureData()` / `deleteCaptureItems()` 的 `companies` 形参一并删掉（唯一用途就是喂给上面
  那段死代码）；`CaptureMaintenancePage.jsx` 里两处调用同步不再传 `companies`。
- 顺手清掉 `CaptureMaintenancePage.jsx` 里三个未使用的 import：`buildApiUrl`、
  `ensureMaintenanceDateRangePicker`、`formatYmd`。

功能行为**完全不变**——纯 Group scope 的真实 tenantId 解析结果跟改动前一致，只是现在只有一处代码
在算这件事。

---

### 1.1 联调时发现的真实 bug：纯 Group 模式搜不到自己刚提交的 Payroll 数据

上面 §1 的清理落地后实测：在 Group "OK"（不下钻子公司）提交了一笔 SALARY payroll，Data Capture 侧
"Submitted Processes" 确认成功、DB `data_captures` 也确实新增了一行（`tenant_id=50`,
`category=BANK`, `process_id=13`），但回到 Capture Maintenance 用同一个 Group、同一天日期搜索，
返回 "No data found"。

根因：`resolveCaptureMaintenanceCategory()`（发请求前算 `category` 硬过滤条件的函数）只看
`scope.c168Channel` / `scope.companyPayrollChannel` 这两个标志——而这两个标志只在**选中了具体
Company 行**时才会被 `captureMaintenanceScope.js` 算出来（`captureId != null` 才去找 company 行）。
纯 Group 模式下 `companyId` 是 `null`，两个标志永远是 `false`，于是 category 兜底成了 `"Games"`。
但 group payroll 提交（SALARY/COMMISSION/BONUS/PROFIT）落库时用的是 `category = "BANK"`（跟
`report-group-scope-springboot-migration.md` §0 记录的机制一致）——请求过滤 `Games`、数据实际是
`BANK`，query 必然是空。

同一份文件里 Process 下拉用的 `captureMaintenanceUsesGroupProcesses(scope)`（`mode === "group"` 也
算数）本来就判断对了，只是 category 解析没跟着用同一套条件，两处判断标准不一致。

**修法**：`resolveCaptureMaintenanceCategory()` 直接复用 `captureMaintenanceUsesGroupProcesses(scope)`
（原来的 `c168Channel`/`companyPayrollChannel` 判断已经被这个函数完整包含），保证「Process 下拉走
Bank payroll 列表」和「List/Delete 请求的 category 过滤」永远是同一个判断，不会再出现下拉里看得到
数据、搜索却搜不到的情况。

---

### 2. 现状确认（未改动部分）

- List/Delete 请求字段（`tenantId`/`dateFrom`/`dateTo`/`process`/`category`/`q`/`captureIds`）已经
  跟 Spring `MaintenanceCaptureDTO` 完全对齐，字段名、驼峰命名、`captureIds`（不是旧版
  `lineIds`）都是现状；本次没有再发现遗留 `.php` 端点或 snake_case 请求字段。
- Group / Company 在 `captureScope`（`mode: "group" | "company" | "aggregate"`）里本来就是分开走的
  两个分支，`companyId` 与 `selectedGroup` 也是各自独立的 state，只在 `resolveCaptureMaintenanceScope()`
  里合并成一个 scope 对象——没有需要拆分的"Group/Company 混用"字段。
- 后端 `docs/frontend-springboot-migration.md`（Count 仓库）§13.3 记的「Category 二选一逻辑覆盖不了
  Game+Bank 都有权限的公司」仍是未验证的已知缺口，跟本次改动无关，不在这次范围内。

---

### 3. 验证清单

1. `npx vite build` 通过（已跑过，无报错）。
2. 起前端 + Spring Boot 后端，用有 Group 的账号登录，进 `/capture-maintenance`：
   - 纯 Group（选中 Group、未下钻 Company）：Process 下拉、列表搜索、删除都正常，Network 面板
     `capture-maintenance/list`、`/delete` 的 `tenantId` 是 group entity company 的真实 id（不是 0），
     请求体 `category` 是 `"Bank"`。
   - 用这个 Group 提交一笔 SALARY/COMMISSION/BONUS/PROFIT payroll 后，回 Capture Maintenance 用同一
     Group + 当天日期搜索，能搜到刚提交的这一行（§1.1 修复的场景）。
   - 下钻到子公司 pill：行为跟改动前一致。
   - Aggregate（Groups All / Group All）：跨租户合并查询/删除不受影响。
3. 独立（非 group）公司走一遍，确认没受影响。

---

### 4. 已知未变更 / 后续跟进

- 同样的「页面自己又重复实现一份 group-entity tenantId 兜底」模式在 Transaction / Formula / Payment
  Maintenance（`transactionMaintenanceLogic.js` / `formulaMaintenanceLogic.js` /
  `paymentMaintenanceLogic.js`）里也存在，这次按用户要求只清理了 Capture Maintenance；其余几个页面
  如果要同样收口，是独立的后续工作。
- 后端 Game+Bank 双权限公司的 category 覆盖问题（见上文 §2）未处理，需要真机验证后再排期。

---
---

## 原文 B：`transaction-maintenance-group-tenantid-cleanup.md`（2026-08-25）
### Transaction Maintenance — 收掉单 Group 模式自己的一套 tenantId 解析 + 修复 category 判断遗漏 Group

> **范围**：`src/pages/maintenance/transaction/transactionMaintenanceLogic.js`、
> `src/pages/maintenance/transaction/TransactionMaintenancePage.jsx`。纯前端改动，**后端零改动**。
> **最后更新**：2026-08-25

---

### 0. 起因

同一模式在 [[capture-maintenance-group-tenantid-cleanup.md]] 已经处理过一次（该文档 §4 也明确记录了
Transaction / Formula / Payment Maintenance 有同样的遗留，作为后续工作）。这次按用户要求收口
Transaction Maintenance：

- `resolveTransactionMaintenanceTenantIds()` 里留着一份自己的 group-entity tenantId 兜底分支
  （`scope.mode === "group"` 时用 `resolveGroupEntityRowFromSnap(companies, scope.groupId)` 现算），
  跟 `reportScope.js` 的 `resolveCustomerReportScope()` 做的是同一件事、用的是同一份 `companies`
  快照——这段分支永远不会真正触发（`scope.scopeCompanyId` 传进来时已经是正数了），是死代码。
- `resolveTransactionMaintenanceCategory()` 只看 `scope.c168Channel` / `scope.companyPayrollChannel`
  这两个标志——这两个标志只在选中了具体 Company 行时才会被 `transactionMaintenanceScope.js` 算出来。
  纯 Group 模式下这两个标志永远是 `false`，category 兜底成 `"Games"`；但 group payroll 提交
  （SALARY/COMMISSION/BONUS/PROFIT）落库用的是 `category = "BANK"`——跟 Capture Maintenance 那次
  发现的 bug（该文档 §1.1）完全同一个根因、同一个模式，这次实测前就先发现并一起修了，没有再等联调
  跑出"提交成功但搜不到"的场景。

---

### 1. 改动

- `resolveTransactionMaintenanceTenantIds()`：删掉 group-only 分支，只保留 `aggregate` 分支
  （`scope.mergeCompanyIds`）和 `scope.scopeCompanyId` 的直接读取；形参也从 `{ scope, companies }`
  收窄成 `{ scope }`。Group 模式的 tenantId 完全交给 `resolveCustomerReportScope()` 一处产出。
- 删掉 `import { resolveGroupEntityRowFromSnap } from "../../report/shared/reportScope.js"`（不再
  使用）。
- `resolveTransactionMaintenanceCategory()`：判断条件从"只看两个 payroll-channel 标志"改成直接复用
  `transactionMaintenanceUsesGroupProcesses(scope)`（原来的两个标志已经被这个函数完整包含，多了
  `scope.mode === "group"` 这一条），保证「Process 下拉走 Bank payroll 列表」和「List 请求的
  category 过滤」永远是同一个判断依据。
- `searchTransactionData()` 的 `companies` 形参删掉（唯一用途就是喂给上面那段死代码）；
  `TransactionMaintenancePage.jsx` 里 `performMaintenanceSearch()` / `runBootMaintenanceSearch()`
  两处调用同步不再传 `companies`。
- 顺手清掉一路没被消费过的 `category` 参数链路：`searchTransactionData()` 本来就没有解构
  `category` 形参（内部自己用 `resolveTransactionMaintenanceCategory(scope)` 算），页面这边却一直在
  维护一份 `category`（`overrides.category ?? "Games"` / `pending.category || "Games"` /
  `pendingBootSearchRef.current.category` / 硬编码的 `"Games"` 字面量）传下去、塞进 search-key
  数组——全部是没人读的死参数，一并删除。真正决定 category 的只有 `scope`，这条链路收口到
  `transactionMaintenanceLogic.js` 一处。

功能行为**完全不变**（除了修掉的 category bug）——纯 Group scope 的真实 tenantId 解析结果跟改动前
一致，只是现在只有一处代码在算这件事；纯 Group 模式下 category 现在正确解析为 `"Bank"`。

---

### 2. 现状确认（未改动部分）

- List 请求字段（`tenantId`/`dateFrom`/`dateTo`/`process`/`category`/`q`）已经跟 Spring
  `MaintenanceTransactionDTO` 完全对齐，字段名、驼峰命名都是现状；本次没有再发现遗留 `.php` 端点或
  snake_case 请求字段。Transaction Maintenance 本身是只读页面（无 delete 端点）。
- Group / Company 在 `transactionScope`（`mode: "group" | "company" | "aggregate"`）里本来就是分开
  走的两个分支，`companyId` 与 `selectedGroup` 也是各自独立的 state，只在
  `resolveTransactionMaintenanceScope()` 里合并成一个 scope 对象——没有需要拆分的"Group/Company
  混用"字段。

---

### 3. 验证清单

1. `npx vite build` 通过（已跑过，无报错）。
2. 起前端 + Spring Boot 后端，用有 Group 的账号登录，进 `/transaction-maintenance`：
   - 纯 Group（选中 Group、未下钻 Company）：Process 下拉、列表搜索都正常，Network 面板
     `transaction-maintenance/list` 的 `tenantId` 是 group entity company 的真实 id（不是 0），
     请求体 `category` 是 `"Bank"`。
   - 用这个 Group 提交一笔 SALARY/COMMISSION/BONUS/PROFIT payroll 后，回 Transaction Maintenance
     用同一 Group + 当天日期搜索，能搜到刚提交的这一行对应的 transaction line。
   - 下钻到子公司 pill：行为跟改动前一致。
   - Aggregate（Groups All / Group All）：跨租户合并查询不受影响。
3. 独立（非 group）公司走一遍，确认没受影响。

---

### 4. 已知未变更 / 后续跟进

- 同样的模式在 Formula / Payment Maintenance（`formulaMaintenanceLogic.js` /
  `paymentMaintenanceLogic.js`）里也存在，这次按用户要求只清理了 Transaction Maintenance（继
  Capture Maintenance 之后第二个），其余页面如果要同样收口，是独立的后续工作。
- 后端 Game+Bank 双权限公司的 category 覆盖问题（见 [[capture-maintenance-group-tenantid-cleanup.md]]
  §2）未处理，跟本次改动无关。

---

### 5. 2026-08-25 联调时发现的真实 bug：纯 Group 冷启动直接进维护页，Sidebar 菜单只剩 Data Capture

**范围**：`src/components/AuthenticatedLayout.jsx`（`AuthenticatedLayout` 组件），跟上面 §1 的
Transaction Maintenance 数据层改动无关，但同一次联调里发现、且跟本文档主题（纯 Group 模式）直接相关，
一并记录。

**现象**：Owner 账号，纯 Group 模式（选中 Group「OK」、未下钻 Company），直接用 URL / 刷新方式进入
`/transaction-maintenance`（不是从 Dashboard 点 Group pill 跳转过来的）。页面本身数据正常（Process
下拉、搜索、Group「OK」的 COMMISSION 记录都能正常显示——证明 §1 的 tenantId/category 修复生效）。但
左侧 Sidebar「Maintenance」展开菜单只剩「Data Capture」一项，Payment / Transaction / Formula /
Bankprocess Maintenance 全部消失。

**根因**：`AuthenticatedLayout.jsx` 里"纯 Group 强制 Games 分类、Bank 关闭"这条 sidebar 规则本来就
存在（`patchMeFromCompanyContext(prev, { forceGroupGamesCategory: true, hasBank: false, ... })`），
但只在**会话期间**的两处事件驱动路径里触发：
1. `refreshSession()`（由 `applySidebarFromFilterDetail` 经 `scheduleRefreshSession` 调用）；
2. `onCompanySession` 事件监听器（响应 `notifyCompanySessionUpdated()` 广播）。

这两条路径都要求"用户在当前会话里做过一次 Group/Company 筛选切换，触发了对应事件"。而直接用 URL /
刷新进入维护页面时，`AuthenticatedLayout` 的初次 boot（`fetchCurrentUser()` 之后 `setMe(u)`）从头到
尾没有走这条 patch 逻辑——`me.company_has_gambling` / `company_has_bank` 就停留在后端
`/auth/current-user` 原始返回值（当前 session 锚定的 tenant 的真实标志，可能两者都是 `false`）。

「Data Capture」菜单项只看 `canAccessFullMaintenance(me)`（跟 gambling/bank 无关），所以不受影响；
Payment / Transaction / Formula / Bankprocess Maintenance 都额外要求
`me?.company_has_gambling || me?.company_has_bank`，纯 Group 冷启动时这个条件是 `false && false`，
四个入口全部被隐藏——即使页面本身（通过直接 URL 访问）完全可用。

**修法**：`AuthenticatedLayout.jsx` 初次 boot 的 `setMe(u)` 之前，读一次
`readPersistedDashboardGcFilter()` / `isDashboardGroupOnlyMode()`；如果当前是纯 Group 模式，直接
对刚拿到的 `u` 应用跟 `refreshSession()` 里完全一样的
`patchMeFromCompanyContext(u, { companyId: null, companyCode: selectedGroup, hasBank: false,
forceGroupGamesCategory: true, hasGambling: resolveGroupOnlySidebarGambling(selectedGroup) ?? true })`，
再 `setMe(bootMe)`。这样冷启动首帧就跟"事件驱动路径跑完之后"的 `me` 状态一致，不用等用户去点一次
Group/Company 筛选才能把 sidebar 修正过来。

**验证**：`npx vite build` 通过。用户在自己本地 `localhost:5173` 实测确认——纯 Group「OK」账号刷新
`/transaction-maintenance` 页面后，Payment / Transaction / Formula Maintenance 菜单项恢复显示。

---
---

# 6. Formula 同步问题链（历史问题，原 2 份合并）
## Formula 同步问题链：改了公式，Summary 不跟着变（三个叠加根因）

> **本文档由两份合并而成**（2026-09-22）：`summary-formula-refresh-fix.md`（2026-08-20）+
> `formula-operators-removal.md`（2026-08-20）。两份互相引用，原文分别写着"后续发现即使这次的前端
> 缓存修完，还有第二个独立根因"和"这是那次修复的后续……两个问题独立存在，都需要修"，所以合成一份
> 事故链记录。
>
> **注意**：这份文档跨两个仓库——第 2 个根因**改动了后端**（`Count` 仓库，删 DB 列 +
> entity/DTO/MyBatis），另两个纯前端。下面先给结论速览，再完整保留两份原文。

### 结论速览

**症状**：在 Formula Maintenance 把某行 Formula 从 `20.62` 改成 `50.50` 并保存后，Data Capture
Summary（Transaction Payment 那张汇总表）的 Processed Amount 仍按 `20.62` 计算。后端
`data_capture_formula` 表**已经即时更新**（`updateFormulaMaintenanceRow` 是直接 `UPDATE`，无缓存、
无 `@Cacheable`、无定时任务），所以问题全在前端与字段设计。

**三个独立且叠加的根因**（只修一个都还是不对）：

| # | 根因 | 修法 | 改动范围 | 日期 |
|---|---|---|---|---|
| 1 | **两层前端缓存**把新公式吃掉了 | 修缓存失效 | 纯前端 | 2026-08-20 |
| 2 | **`formula_operators` 冗余字段**：保存接口只写 `formula`，而计算读的是 `formula_operators`——即使缓存刷新了，读到的字段本身还是旧值 | **选择直接删掉该字段**（而不是让保存接口补写它）。理由见原文 §1：这两个字段从头就没被设计成可以存不同内容，每条正常保存路径都是同一个值塞进两列 | **后端 + 前端**（DB 列、entity/DTO/MyBatis、row model/保存/计算） | 2026-08-20 |
| 3 | Summary 的 **「Edit Formula」保存时 Input Method 从未真正落库** | 补上 | 纯前端 | 2026-08-27 |

---
---

## 原文 A：`summary-formula-refresh-fix.md`（2026-08-20，含 08-27 追加）
### Summary 页面公式不同步 Bug 修复（2026-08-20）

> 范围：Formula Maintenance 编辑公式后，Data Capture Summary（Transaction Payment 那张汇总表）
> 的 Processed Amount 没有跟着变，仍然按旧公式算。本文档记录排查过程、根因、以及最终改了哪些文件。
> 后端（`Count` 仓库）**没有改动**，问题完全在前端（`Count-frontend`）。
>
> 后续发现即使这次的前端缓存修完，还有第二个独立根因——`formula_operators` 冗余字段导致
> 计算读到的是另一份没同步的旧值，见 [formula-operators-removal.md](./formula-operators-removal.md)。

---

### 1. 现象

1. 在 Formula Maintenance 页面把某一行的 Formula 从 `20.62` 改成 `50.50` 并保存。
2. 后端 `data_capture_formula` 表已经即时更新（确认过：`MaintenanceMapper.xml` 的
   `updateFormulaMaintenanceRow` 是直接 `UPDATE ... WHERE id = #{id}`，没有缓存、没有
   `@Cacheable`、没有定时任务）。
3. 但打开 Data Capture Summary 页面，对应那一行的 Processed Amount 仍然是按 `20.62`
   算出来的，不是 `50.50`。

### 2. 根因：两层前端缓存把新公式吃掉了

Summary 页面的数据流：Data Capture 提交时把整张表写进 `localStorage`（不落库），跳转到
Summary 页后再调 `POST /api/maintenance/formula-maintenance/list` 去把当前公式回填进每一行，
算出 Processed Amount。这条"回填"逻辑本身没错，但有两处缓存机制把它架空了：

#### 2.1 sessionStorage 整行快照 —— 根本没有重新请求

[`hooks/useSummaryTableModel.js`](../src/pages/datacapturesummary/hooks/useSummaryTableModel.js)
里，只要不是"刚从 Data Capture 提交跳转过来"（`isFirstFreshPopulate === false`，也就是刷新页面、
后退、直接输网址进来等所有非首次场景），一旦 `sessionStorage` 里存在上一次的整行快照
（`summaryRowsSnapshot:...`），代码会**直接用快照渲染，完全不调用 formula-maintenance 接口**：

```js
// 修复前
if (!isFirstFreshPopulate) {
  const snapshot = loadSummarySessionSnapshotWithFallback(...);
  if (snapshot?.rows?.length) {
    let restoredRows = restoreRateValuesOnRows(snapshot.rows, captureScope);
    restoredRows = mapRowsWithAmountRecalc(restoredRows);
    replaceRows(restoredRows);
    return true;   // populateSummaryRowsPure / fetchSummaryTemplates 根本没被调用
  }
}
```

也就是说，只有"提交后第一次跳进来"这一次会真正拉最新公式；之后每次进 Summary 页都是在
回放这份旧快照——哪怕快照里的公式已经在 Formula Maintenance 被改掉了。

#### 2.2 就算真的重新拉取了，新数据也会被旧缓存覆盖回去

就算走到真正会发请求的那条路径（`populateSummaryRowsPure` → `applyMainTemplateToRowModel`
用最新模板给每一行填上最新的 `formulaOperators` / `formulaDisplay` / `account` /
`currency` / `sourceColumns` / `inputMethod` 等字段），之后还有一步
`restoreRefreshStateRows`（`table/summaryTemplatePopulatePure.js`）会把 `localStorage`
里的旧草稿（`summaryRefreshDraft` 之类的 key）合并回每一行，用的是
[`lib/summaryRefreshStatePure.js`](../src/pages/datacapturesummary/lib/summaryRefreshStatePure.js)
里的 `applySavedRefreshRowToModel`：

```js
// 修复前 —— saved（旧缓存）无条件优先，新拉到的 row 值直接被扔掉
formulaOperators: saved.formulaOperators || row.formulaOperators,
account: saved.account || saved.accountDisplay || row.account,
...
```

`saved.formulaOperators` 只要存在（几乎总是存在，因为草稿每次都会存），就会赢，新拉到的
`row.formulaOperators`（本次 fetch 出来的最新公式）根本没机会用上。而 Processed Amount
后面虽然会用 `mapRowsWithAmountRecalc` "重新计算"，但计算的输入 `formulaOperators` 本身
已经是旧值了，所以算出来还是旧结果——表面上看像是"没重新算"，实际上是"拿旧公式重新算了一遍"。

**没有任何地方在 Formula Maintenance 保存成功后去清空/标记失效 Summary 这两层缓存**——
清缓存的逻辑只挂在"从 Data Capture 提交跳转过来"这一条路径上
（`useDataCaptureSubmitReset.js` 里的 `markSummaryFreshNavigation()`），编辑
Formula Maintenance 完全不会触碰这些 key。

### 3. 修复方案

原则：**Formula Maintenance 的字段（formula、account、currency、source、input method、
description）是配置数据，永远该以最新一次接口请求为准；只有 rate 勾选/数值、批量选中这类
纯前端会话状态才该用本地草稿保留。**

#### 3.1 `applySavedRefreshRowToModel` 反转合并优先级

文件：[`lib/summaryRefreshStatePure.js`](../src/pages/datacapturesummary/lib/summaryRefreshStatePure.js)

- 当这一行本次已经匹配到了最新模板（`row.templateApplied === true`）时，config 类字段
  一律优先用 `row.*`（刚 fetch 回来的），`saved.*`（本地草稿）只在 `row.*` 为空时兜底。
- 没匹配到模板的行（比如该 idProduct 已经没有对应公式了）才继续用 `saved.*` 兜底，
  避免变成空白。
- `rateChecked` / `rateValue` / `selectChecked` 这些纯会话状态，逻辑不变，仍然是
  `saved` 优先。
- `baseProcessedAmount` / `processedAmount` 这两个字段其实不用管谁优先——下游
  `mapRowsWithAmountRecalc` 每次都会用当前 `formulaOperators` 重新算一遍，所以只要
  公式本身是新的，金额自然是对的。

#### 3.2 去掉 sessionStorage 整行快照的"短路"

文件：[`hooks/useSummaryTableModel.js`](../src/pages/datacapturesummary/hooks/useSummaryTableModel.js)

删掉了"非首次进入就直接回放快照、不调接口"的分支，改成**每次进入 Summary 页面都会走完整的
`populateSummaryRowsPure` 流程**，一定会重新请求 formula-maintenance 接口拿最新公式，
再靠 3.1 的合并逻辑把 rate/勾选这些会话状态合回去。

代价：非首次进入 Summary 页面时会多一次网络请求（原来是纯本地渲染）。这张表涉及金额计算，
正确性优先于这点性能损耗，所以接受这个代价。

连带清理：`loadSummarySessionSnapshotWithFallback` 这个 import、`restoreRateValuesOnRows`、
`mapRowsWithAmountRecalc`、`snapshotScopeCandidates`（`useMemo`）、
`resolveDataCaptureScopeFromSessionMeta` 这几个在这个文件里不再用到的引用一并删掉。
`loadSummarySessionSnapshotWithFallback` 函数本身还留在 `summaryRefreshStatePure.js`
里没删（避免影响其他潜在调用方/后续需要），只是这个文件不再调用它。

### 4. 验证方法

1. 在 Formula Maintenance 改一条已经在用的公式并保存。
2. **不要**从 Data Capture 重新提交（模拟"非首次进入"的场景），直接导航/刷新到
   Data Capture Summary 页面。
3. 对应那一行的 Formula 列和 Processed Amount 应该立刻反映刚才改的新值。
4. 顺便确认 rate 勾选框、手动 select 的状态在刷新前后没有丢——这两个是 3.1 里仍然走
   `saved` 优先的字段，改动不应该影响它们。

### 5. 涉及文件

- [`src/pages/datacapturesummary/lib/summaryRefreshStatePure.js`](../src/pages/datacapturesummary/lib/summaryRefreshStatePure.js)
  —— `applySavedRefreshRowToModel` 合并优先级反转
- [`src/pages/datacapturesummary/hooks/useSummaryTableModel.js`](../src/pages/datacapturesummary/hooks/useSummaryTableModel.js)
  —— 删除 sessionStorage 整行快照短路分支，改为每次都走 `populateSummaryRowsPure`

---

### 6. 2026-08-27：Summary「Edit Formula」保存时 Input Method 从未真正落库

> 范围：Data Capture Summary 页面里点某一行的 Edit Formula，在弹窗里选好 Input Method（比如
> "Positive to negative, negative to positive"）保存，提示 "Formula saved." 成功；但回
> Formula Maintenance 页面看这一行，Input Method 列永远是 `-`（空）；直接查 `data_capture_formula`
> 表也确认 `input_method` 列是 `NULL`。跟第 1-5 节的"缓存架空新数据"是完全不同的根因，这次是
> 请求体本身就没带这个字段。

#### 6.1 根因

[`formula/summarySaveTemplatePure.js`](../src/pages/datacapturesummary/formula/summarySaveTemplatePure.js)
的 `saveAddFormulaSpring`（新增）和 `saveUpdateFormulaSpring`（编辑）在拼装
`POST /api/datacapture-summary/formula/save|update` 的请求体时，把 `formula` /
`sourcePercent` / `enableSourcePercent` / `description` 等字段都从 `row.*` 搬进了
`body.*`，唯独漏了 `inputMethod`（Add 那边只带了 `enableInputMethod` 这个布尔标记，
Update 那边连 `enableInputMethod` 都没带）。

弹窗本身没问题——`editFormulaFormState.js:639` 的 `buildFormulaSavePatchFromForm` 确实把
选中的 Input Method 值放进了 patch（`inputMethod: inputMethodValue`），也确实合并回了本地
`row.inputMethod`，UI 上看着"已经选好了"；但组装成 fetch body 那一步，这个字段被静默漏掉，
根本没发出去。

后端 `DataCaptureSummaryServiceImpl.updateFormula`（`Count` 仓库，line 313-315）逻辑是：
```java
String inputMethod = request.getInputMethod() != null
        ? trimToNull(request.getInputMethod())
        : existing.getInputMethod();
```
既然前端从来没在 body 里放 `inputMethod`，`request.getInputMethod()` 永远是 `null`，于是
永远回退到 `existing.getInputMethod()`——而这一行最初是靠同样漏了这个字段的
`saveAddFormulaSpring` 创建的，`existing.getInputMethod()` 从一开始就是 `null`。结果是：
不管在弹窗里编辑多少次、选了什么 Input Method，落库的值永远是最初 Add 时的 `NULL`，
点几次 Save 都不会变。跟 `source_percent`（同样走 `row.sourcePercent → body.sourcePercent`，
但这条链路没漏字段）落库正常形成对照，印证了问题确实出在"漏发字段"而不是弹窗算错、也不是
后端逻辑错。

#### 6.2 修复

文件：[`src/pages/datacapturesummary/formula/summarySaveTemplatePure.js`](../src/pages/datacapturesummary/formula/summarySaveTemplatePure.js)

- `saveAddFormulaSpring`：`body` 里补上 `inputMethod: row.inputMethod || null`。
- `saveUpdateFormulaSpring`：`body` 里补上 `inputMethod: row.inputMethod || null`，
  同时补上原来完全没发的 `enableInputMethod: !!row.enableInputMethod`（跟
  `enableSourcePercent` 的处理方式对齐——`enableInputMethod` 表单里是
  `Boolean(inputMethodValue)` 算出来的，理应跟 `inputMethod` 的值同步发出去，否则会重现
  "字段值对了、但 enable 标记没跟上"的同类漏发问题）。

#### 6.3 验证

跑过 `vite build --mode development`，构建通过，无未用变量/引用报错。

**未验证**：本次只做了代码审查 + 静态修复，没有跑浏览器端到端回归。建议人工验证：在 Summary
页面 Edit Formula 选一个 Input Method 保存，回 Formula Maintenance 页面确认该行 Input Method
列显示正确（不再是 `-`），并直接查 `data_capture_formula.input_method` 确认落库；同时验证
Add Formula（新增一行）路径下选 Input Method 也能正确落库。

---
---

## 原文 B：`formula-operators-removal.md`（2026-08-20）
### 移除 formula_operators 冗余字段（2026-08-20）

> 范围：`data_capture_formula` 表里 `formula` / `formula_operators` 两个字段本该永远同步，
> 但 Formula Maintenance 的保存接口只写了 `formula`，导致改公式不影响实际计算结果。
> 本次直接把 `formula_operators` 从整条链路（DB 列、后端 entity/DTO/MyBatis、前端 row model/
> 保存/计算逻辑）里删掉，只保留 `formula` 一个字段。
>
> 这是 [summary-formula-refresh-fix.md](./summary-formula-refresh-fix.md) 那次修复的后续——
> 那次修的是前端缓存不刷新；这次修的是即使缓存刷新了，读到的字段本身也可能是错的。
> 两个问题独立存在，都需要修。

---

### 1. 为什么要删，而不是把 Formula Maintenance 保存接口补全

一开始的想法是让 Formula Maintenance 的保存接口也把 `formula_operators` 一起写上（照抄
`formula` 的值），风险最小。但排查后发现：**这两个字段在现在这套代码里，从来没有被设计成
可以存不同内容**——每一条正常工作的保存路径（Summary 自己的 Edit Formula 弹窗、批量改
Source 列等）都是把同一个值同时塞进 `formula` 和 `formulaOperators`：

```js
// summarySaveTemplatePure.js（改之前）
const formula = row.formulaOperators || row.formula || "";
const body = { ..., formula, formulaOperators: formula, ... };
```

唯一"写少了"的就是 Formula Maintenance 那条路径。也就是说，`formula_operators` 当前
100% 是历史包袱（迁移文档里也承认是"旧 PHP 时代遗留"），不是有意的设计。既然两个字段永远
该相等，留着第二个字段只是多一个出错的地方——干脆删掉，`formula` 变成唯一真相来源，
从根上让"两个字段没同步"这种 bug 不可能再发生。

### 2. 后端改动（`Count` 仓库）

| 文件 | 改动 |
|---|---|
| [schema.sql](../../Count/backend/src/main/resources/sql/schema.sql) | `data_capture_formula` 表 `CREATE TABLE` 里删掉 `formula_operators` 这一列定义 |
| [migrate_drop_formula_operators.sql](../../Count/backend/src/main/resources/sql/migrate_drop_formula_operators.sql) | **新增**的迁移脚本，`ALTER TABLE ... DROP COLUMN formula_operators`，幂等（列不存在时跳过）。**没有自动执行**，需要你自己手动跑一次对齐现有数据库 |
| [MaintenanceMapper.xml](../../Count/backend/src/main/resources/mybatis/MaintenanceMapper.xml) | Formula Maintenance 列表查询去掉 `formula_operators` 这一列 |
| [DataCaptureSummaryMapper.xml](../../Count/backend/src/main/resources/mybatis/DataCaptureSummaryMapper.xml) | resultMap、共用 SELECT 片段、`insertFormula`、`updateMainFields`、`updateFormulaById` 全部去掉这一列 |
| `DataCaptureFormula.java` / `MaintenanceFormulaDTO.java` / `DataCaptureSummaryDTO.java` | 删掉 `formulaOperators` 字段 |
| `DataCaptureSummaryServiceImpl.java` | 删掉所有 `request.getFormulaOperators()` 兜底分支、`saveAsMain`/`saveAsSub`/`updateFormula` 里的 `formulaOperators` 参数和 `setFormulaOperators(...)` 调用；`updateFormula` 里那条四层兜底链（`request.formula → request.formulaOperators → existing.formula → existing.formulaOperators`）简化成两层（`request.formula → existing.formula`） |

用 `mvn compile`（强制全量重编译）验证过，`BUILD SUCCESS`。

**数据库这一步需要你自己执行**：

```bash
mysql -u <user> -p <database> < backend/src/main/resources/sql/migrate_drop_formula_operators.sql
```

不执行也不影响功能——代码已经完全不读/不写这一列了，只是列还留在表里占地方。执行了才算真正"删干净"。

### 3. 前端改动（`Count-frontend` 仓库）

核心计算路径（最关键，直接对应之前那个 bug）：

- [summaryRowAmount.js](../src/pages/datacapturesummary/table/summaryRowAmount.js)
  `resolveFormulaTextForCalculation` 不再读 `row.formulaOperators`，改读 `row.formula`——
  这是算 Processed Amount 时真正取值的地方。
- [resolveFormulaForDisplay.js](../src/shared/formula/resolveFormulaForDisplay.js)
  `resolveEffectiveSourcePercentForRow` / `resolveTemplateFormulaBaseAndPercent` 原本读的是
  `row?.formula_operators`（原始模板/API 对象上的字段，从来没有 fallback 到 `formula`），
  改成读 `row?.formula`。
- [summaryRowData.js](../src/pages/datacapturesummary/table/summaryRowData.js)
  `applyMainTemplateToRowModel` 里解析模板公式那段，原本 `mainTemplate.formula_operators ||
  mainTemplate.formulaOperators` 两个 fallback 全删，改成读 `mainTemplate.formula`；
  row model 上不再有 `formulaOperators` 这个字段。

其余都是跟着 row model 字段改名走的"安全重命名"（这些文件里 `formula`/`formulaOperators`
本来就总是被写成同一个值，删掉多余的那份纯粹是清理）：

`summaryApi.js`（API 响应映射）、`summaryRefreshStatePure.js`（草稿快照/合并逻辑）、
`summaryTemplatePopulatePure.js`、`summarySaveTemplatePure.js`（保存请求体）、
`buildSubmitRowsFromModel.js` / `summarySubmitExecution.js`（提交请求体）、
`summaryBatchSourceColumns.js`、`editFormulaFormState.js` / `summaryInlineEditPure.js`
（Edit Formula 弹窗 / 双击行内编辑）、`useSummaryEditFormulaPure.js`、
`summaryTemplateFormulaDisplay.js` / `summaryTemplateSourceData.js`（内部只有一处
`template?.formula_operators` 原始读取需要改成 `template?.formula`，其余出现的
`formulaOperators` 都只是这两个文件内部函数的参数名，跟外部字段无关，没有改的必要）、
`SummaryTableRow.jsx`（一个已经没人读的 DOM data 属性，顺手改成读 `row.formula`）。

**没有动的**：`src/shared/formula/resolveFormulaForSave.js`、`scoreTemplateForDedup.js`
里还留着 `formula_operators`/`formulaOperators` 字样，但这两个文件排查确认**全项目零调用方**
（只在 `shared/formula/index.js` 里被重新导出，从没被任何页面真正 import 使用），是死代码，
不影响功能，故意没动以免无谓扩大改动范围。

用 `npx vite build` 跑过一次完整生产构建（1830 个模块），`✓ built`，没有报错。

### 4. 验证方法

跟上一份文档（[summary-formula-refresh-fix.md](./summary-formula-refresh-fix.md)）第 4 节
的步骤一样：改 Formula Maintenance 的 Formula → 非首次进入 Summary 页面 → 确认新公式和新
Processed Amount 立刻生效。这次即使某个历史数据行的 `formula_operators` 列早就跟
`formula` 不一致，也不会再影响结果，因为代码根本不读那一列了。

### 5. 涉及文件

后端（`Count`）：
- [schema.sql](../../Count/backend/src/main/resources/sql/schema.sql)
- [migrate_drop_formula_operators.sql](../../Count/backend/src/main/resources/sql/migrate_drop_formula_operators.sql)（新增，需手动执行）
- [MaintenanceMapper.xml](../../Count/backend/src/main/resources/mybatis/MaintenanceMapper.xml)
- [DataCaptureSummaryMapper.xml](../../Count/backend/src/main/resources/mybatis/DataCaptureSummaryMapper.xml)
- `DataCaptureFormula.java` / `MaintenanceFormulaDTO.java` / `DataCaptureSummaryDTO.java`
- `DataCaptureSummaryServiceImpl.java`

前端（`Count-frontend`）：
- `summaryRowAmount.js`、`resolveFormulaForDisplay.js`、`summaryRowData.js`（核心计算/解析路径）
- `summaryApi.js`、`summaryRefreshStatePure.js`、`summaryTemplatePopulatePure.js`、
  `summarySaveTemplatePure.js`、`buildSubmitRowsFromModel.js`、`summarySubmitExecution.js`、
  `summaryBatchSourceColumns.js`、`editFormulaFormState.js`、`summaryInlineEditPure.js`、
  `useSummaryEditFormulaPure.js`、`summaryTemplateFormulaDisplay.js`、
  `summaryTemplateSourceData.js`、`SummaryTableRow.jsx`
