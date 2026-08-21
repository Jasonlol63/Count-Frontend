# 前端未提交改动记录（2026-08-21）

> 记录当前工作区（`git status` 显示为 dirty）里**所有**尚未 commit 的前端改动，覆盖 Account 页、
> Data Capture / Data Capture Summary、Sidebar 权限判断。
>
> **作者说明**：Part 1（Group 模式 Summary 全面切 Spring）是本次会话由我（Claude）实际改动的部分，
> 有完整改动过程可追溯。Part 2（Account List 页 group-tenant 解析修复、Sidebar 权限改用后端
> `me.menu.*`、Data Capture 的 `groupEntityTenantId` 透传）是本次会话**开始前就已经存在**于工作区的
> 未提交改动，非本次会话所作——这里只是如实记录 `git diff` 内容，帮助你一次性看清当前工作区的完整变更
> 面，不代表这些改动经过了本次会话的验证。

---

## Part 1 — Group 模式 Data Capture Summary 全面切 Spring（本次会话所做）

### 背景

单 Group（无锚点公司）形式提交 SALARY 等 Bank/Payroll 流程时，Submit 报错
`Submission did not return a capture ID.`。追查发现前端把这个场景误判成"真 AP/IG group ledger"，
走了旧版 PHP 批量提交接口 `api/datacapture_summary/summary_submit_api.php`，而该接口对这个场景返回了
一个和其它 PHP 错误格式都对不上的 `{status:"error", message:"An unexpected error occurred."}`，具体
根因需要服务器 PHP error log 才能进一步定位。

数据库核查确认：Spring 的 `tenant` 表本身就有 `tenant_type ENUM('GROUP','COMPANY')`，Group（如 "OK"，
`tenant.id=50`）是一等公民 tenant，账户（`account_tenant_access`）、Process（`process` 表）都已经能
正常挂在 Group 自己的 tenant id 下——这说明"Group 完全走 Spring"在数据层面本来就可行，不需要建新表、
不需要改后端。

用户明确要求：**Group 模式下完全走 Spring API 格式，不走任何 PHP 旧版格式**。以下是分两阶段落地的
改动。

### Phase 1 — Submit 路由切换

**[`src/pages/datacapturesummary/submit/summarySubmitExecution.js`](../src/pages/datacapturesummary/submit/summarySubmitExecution.js)**

- `executeSummarySubmit()` 去掉了"Group scope 走 legacy PHP 批量提交、其它走 Spring"的判断分支，
  所有 scope（Company 和 Group，纯 Group 或带子公司锚点的 Group）统一调用 `executeSpringSubmit()` →
  `POST /api/datacapture-summary/submit`。
- 传给 `executeSpringSubmit` 的 `captureScope` 改用 `normalizeGroupCaptureScope()` 归一化后的
  `effectiveScope`（带 `groupEntityTenantId`），保证 `resolveDataCaptureEffectiveTenantId` 能解析出
  Group 自己的 `tenant.id`，而不是仅对 Company scope 生效。

### Phase 2 — 配套功能（草稿、Add Account、流程号解析）全部切 Spring + 清理死代码

**草稿自动保存** — [`dataCaptureGroupOnlyTableDraft.js`](../src/pages/datacapture/lib/dataCaptureGroupOnlyTableDraft.js)

- 原本 Company payroll bucket（`company:{id}`）走 Spring `POST /api/datacapture/bank/draft/save|get`，
  Group bucket（纯 group code，如 `"OK"`）走 PHP `group_capture_draft_api.php`。改成两者统一走同一个
  Spring 草稿接口：新增 `resolveDraftTenantId(bucketId, scope)`，Company bucket 从 `"company:5"` 里解析
  tenantId，Group bucket 从 `scope.groupEntityTenantId` 解析 tenantId。
- 删除整个 [`dataCaptureGroupDraftApi.js`](../src/pages/datacapture/lib/dataCaptureGroupDraftApi.js)
  （PHP 版草稿接口封装），确认全仓库无其它引用后直接删除文件。

**Summary 页"+ Add Account"** — [`useSummaryAddAccount.js`](../src/pages/datacapturesummary/hooks/useSummaryAddAccount.js)

- 原本 `groupOnlyAccountMode` 分支整段走 `api/accounts/*` PHP（建帐户、建/删币别、可选币别），Company
  scope 走 Spring。现在两条分支合并成一条：`resolveSummaryAddAccountContext()` 里新增
  `ctx.tenantId`（Company scope = `companyId`；Group scope = `resolveDataCaptureTenantId(captureScope)`
  解析出的 Group 自己的 tenant id），`loadSelectionMeta` / `createCurrency` / `removeCurrency` /
  `submitAddAccount` 全部改成统一用 `ctx.tenantId` 调用 Spring 的
  `/api/account/add`、`/api/currency/add`、`/api/currency/delete`、`/api/currency/available`。
- `groupOnlyAccountMode` 现在只影响弹窗 UI 形态（单选"这个 Group 自己"一行，而不是多选公司列表），不
  再影响走哪个后端。
- 清掉了因此变成死代码的 `applyTenantLedgerToParams` / `LEDGER_GROUP` / `resolvePageLedgerScope` /
  `buildApiUrl`（PHP fetch 用）/ `normalizeAlertAmount` 相关引用。

**流程号（processId）预解析** — 删除了两处提交前"先打 PHP 查 numeric process_id"的调用：

- [`useDataCaptureSubmitReset.js`](../src/pages/datacapture/hooks/useDataCaptureSubmitReset.js)：点
  Data Capture 页 Submit 时，原本非纯 Group 场景会先调用 `fetchGroupProcessIdByCode()`
  （PHP `get_group_process_id`）解析出数字 processId 再跳转 Summary 页。现在统一改成
  `processData.process = processData.processCode`，把解析完全交给 Spring 提交时的
  `DataCaptureSummaryServiceImpl#resolveProcess` / `ensureBankProcess` 自己按 processCode 解析/建
  Process。
- [`summaryTemplatePopulatePure.js`](../src/pages/datacapturesummary/table/summaryTemplatePopulatePure.js)：
  Summary 页打开时回填已存公式模板，原本 Group payroll 流程会先调用同一个 PHP 接口解析 numeric id。
  已确认 `fetchSummaryTemplates()` 调的 Spring `/api/maintenance/formula-maintenance/list` 本来就接受
  纯 processCode 字符串作为 fallback，删掉这段预解析。

**清理死代码** —

- [`summarySubmitExecution.js`](../src/pages/datacapturesummary/submit/summarySubmitExecution.js)：删
  掉了因为 Phase 1 路由切换而不再被调用的 `executeLegacyGroupLedgerSubmit`、
  `ensureGroupSubmitProcessId`、`postSubmitBatch`、`verifySubmitPayload`、分批重试/二分定位问题行的
  helper、`buildSummarySubmitPayload`，以及相关的 `BATCH_DELAY_MS` / `SUBMIT_REQUEST_ID_STORAGE_PREFIX`
  等常量（407 行 → 约 120 行）。
- [`summaryApi.js`](../src/pages/datacapturesummary/lib/summaryApi.js)：删掉了不再被任何地方调用的
  `submitSummaryPayload()`（打 `summary_submit_api.php` 的封装）及其专用的 `withCaptureScope` /
  `SUMMARY_SUBMIT_API` 常量。
- [`dataCaptureApi.js`](../src/pages/datacapture/lib/dataCaptureApi.js)：删掉了不再被任何地方调用的
  `fetchGroupProcessIdByCode()`（打 PHP `get_group_process_id` 的封装）及 `DATA_CAPTURE_SUBMISSIONS_API`
  常量。**保留** `fetchGroupCaptureCurrencies()`（打 `get_scope_account_currencies_api.php`）——这是
  "Group 下还挂着多个子公司、需要跨公司聚合币别"场景的兜底，`useDataCaptureFormEngine.js` 里已经优先
  走 Spring 的 `fetchCaptureCurrenciesByTenantId`，只有解析不出 tenantId 时才 fallback 到它，本次未动。

### 验证结果

用 grep 搜索确认 `src/pages/datacapture*` 目录下已无任何 `.php` 请求残留（`fetchGroupCaptureCurrencies`
一处例外，见上）。**未做浏览器实测**——这是真实登录/session/数据库的系统，无法在当前环境安全起一套
并行环境验证，需要你在自己的开发环境里过一遍：单 Group 下 SALARY 打字 → 自动保存 → 刷新恢复 →
Add Account → Submit。

### 已知未覆盖范围（Phase 3，未来单独排期）

- **有子公司锚点的 Group**（Group 下还挂着 OK1/OK2 等公司）需要跨公司聚合币别/账户的场景，后端目前
  没有对应的 Spring 聚合查询，`fetchGroupCaptureCurrencies` 这条 PHP fallback 暂时保留。
- **历史数据**：如果生产库里 Group 场景之前有走过旧 PHP `data_capture_details` 表结构的历史提交记录，
  切换后不会自动出现在新 schema（`data_capture_line`）的报表里，需要额外确认规模、是否要写迁移脚本。
- Maintenance > Formula 页面本身（`formulaMaintenanceLogic.js`）仍在打 PHP
  `formula_maintenance/list_api.php`，不在本次范围。

---

## Part 2 — 会话开始前已存在的未提交改动（非本次会话所作，仅如实记录）

以下改动在本次会话开始时就已经出现在工作区（`git diff` 可见，尚未 commit），我没有修改或验证过，
这里只是原样记录改了什么、为什么，方便你一起管理这批未提交的改动。涉及文件里还留有调试用
`console.log`（`AccountListPage.jsx`、`accountListApi.js`），提交前建议先清掉。

### Account List 页 — Group scope 的 tenant 解析修复

**[`AccountListPage.jsx`](../src/pages/account/AccountListPage.jsx)**（154 行改动）

- **核心问题**：Group-only 账户列表/新建/编辑/币别设置，原本用"在公司列表里找 `company_id` 等于
  Group code 的那一行"来反查 Group 的锚点公司 tenant id（`allCompanyButtons.find(...)`）。但账户的
  tenant 归属应该是 Group↔Group 或 Company↔Company，不应该混用"Group 的锚点公司"顶替 Group 自己的
  tenant——新增 `companiesGroupEntityList()` / `normalizeCompanyGroupId()`，直接从公司列表里按
  `tenant_type === "GROUP"` 找到 Group 自己的 tenant 行，而不是用锚点公司顶替。
- `allCompanyButtons` 现在会过滤掉 `tenant_type === "GROUP"` 的行（避免 Group 被误当成"公司"参与
  account 归属判断，后端 `UserServiceImpl.assertCompanyTenants` 会直接拒绝传入裸 Group tenant id 的
  情况）。
- `scopeCompanyId` → 拆成 `scopeCompanyId`（保留原语义）+ 新增 `currencyScopeTenantId` 别名，Group
  scope 下解析成 Group 自己的 tenant id，而不是锚点公司 id。
- Edit Account 弹窗：编辑一个账户时，如果该账户的真实 tenant 其实是某个子公司（历史遗留的
  company-scoped 账户），现在会保留原 tenant 不动，只有用户在弹窗里真的选了"不同的 Group"才会
  重新指派到新 Group 的 tenant——避免"只是打开/保存 Edit 就把账户静默挪到 Group tenant，而它在那个
  tenant 下根本没有 `account_tenant_access` 记录，后端直接报 user not found"。
- `resolveGroupOnlyFetch()` 改成直接从 scope 自身字段判断（不再依赖
  `resolveAccountListGroupOnlyFetch` 读的 sessionStorage 标记），注释解释了原因：sessionStorage 标记
  可能滞后于真实 scope（例如 Group 登录直接落地到这个页面、没走过 sidebar 的 group-pick 流程），会
  导致 Group Account List 永远查询到空列表。
- 新增了两行调试用 `console.log`（`[fetchAccounts]` 日志），**看起来是排查用，提交前应该删掉**。

**[`accountListApi.js`](../src/pages/account/accountListApi.js)**（2 行改动）

- `filterAccountListRows()` 里新增了一行调试用 `console.log`（`[filterAccountListRows]`），同样建议
  提交前清掉。

**[`accountLogic.js`](../src/pages/account/accountLogic.js)**（32 行改动）

- `getAccountModalOrderedRoles()` 重写：原来"DB 已有 role 列表时只补 PARTNER/DEBTOR 兜底，空列表时才
  给完整 ROLE_PRIORITY"的逻辑，改成**始终**合并完整的 `ROLE_PRIORITY`，注释说明原因：Spring 账户 API
  没有暴露按公司动态查询角色列表的接口，Edit 场景下传入的 `roles` 只是"当前选中值"、不是"可选项列表"，
  不该被当成可选项来源。

### Sidebar 权限判断 — 从前端重新计算改为信任后端 `me.menu.*`

**[`sidebarPermissions.js`](../src/utils/auth/sidebarPermissions.js)**（50 行改动）

- `canShowReportInSidebar(me)`：原本要在前端重新读 `readPersistedDashboardGcFilter()` +
  `findOwnerCompanyById()` + `resolveCompanyCategoryFlags()` 综合判断（对应
  [`group-mode-report-sidebar-fix.md`](group-mode-report-sidebar-fix.md) 修的那条路径），现在改成直接
  信任后端一次性算好的 `me.menu.report`（`SessionUser.java` 里按 tenant 的 REPORT 权限 + GAME 功能开关
  算的），理由：前端重算容易在页面跳转间读到过期的 sessionStorage 状态。
- 新增 `canShowDataCaptureInSidebar(me)`，同样改成信任 `me.menu.dataCapture`，取代原来
  `canAccess("datacapture") && (me?.company_has_gambling || me?.company_has_bank)` 的前端判断。
- `resolveDefaultLandingPath()` 里登录后默认落地页的判断也同步换成 `canShowDataCaptureInSidebar(me)`。

**[`AuthenticatedLayout.jsx`](../src/components/AuthenticatedLayout.jsx)**（8 行改动）

- Sidebar Data Capture 入口的显隐条件同步换成 `canShowDataCaptureInSidebar(me)`。
- 页面级预热逻辑里去掉了对 `fetchOwnerGroupsAll(me)` 的调用——注释说明 Domain groups 预热还没有 Spring
  端点（仍在打会 500 的 PHP `domain_api.php`），不该在每个页面加载时都去请求一次；真正需要它的页面
  （Report、Transaction、Dashboard）自己会调用。

### Data Capture 核心库 — `groupEntityTenantId` 透传链路

这几个文件的改动是同一条线：让"Group 自己的 tenant id"从 scope 归一化 → session 落盘 → Summary 页
boot 时还原，全程不丢失，这也是 Part 1 里 Phase 1/2 能直接复用的基础设施：

- **[`dataCaptureScope.js`](../src/pages/datacapture/lib/dataCaptureScope.js)**：
  `normalizeGroupCaptureScope()` 新增保留 `groupEntityTenantId` 字段（避免 `scopeCompanyId` 被清零成 0
  之后，Group 自己的 tenant id 彻底丢失）；`resolveDataCaptureScopeFromSessionMeta()` 优先从
  `meta.groupEntityTenantId` 还原。
- **[`dataCaptureStorage.js`](../src/pages/datacapture/lib/dataCaptureStorage.js)**：
  `saveCaptureSession()` 新增把 `scope.groupEntityTenantId` 一起写进 session 存储，注释解释：不单独
  持久化的话，Summary 页 session-restore 时会拿一个空公司列表重新解析 scope，把这个 id 弄丢。
- **[`dataCaptureTenant.js`](../src/pages/datacapture/lib/dataCaptureTenant.js)**：
  `resolveDataCaptureTenantId()` 新增 `scope.groupEntityTenantId` 作为 `scopeCompanyId` 之外的第二个
  兜底来源（这正是 Part 1 Phase 1/2 里各处调用 `resolveDataCaptureTenantId` 能拿到 Group tenant id 的
  关键改动）。
- **[`useSummaryBoot.js`](../src/pages/datacapturesummary/hooks/useSummaryBoot.js)**：boot 时把
  `pointerMeta.groupEntityTenantId` 一并带进归一化后的 scope。
- **[`useDataCaptureFormEngine.js`](../src/pages/datacapture/hooks/useDataCaptureFormEngine.js)**：
  Group-only 币别下拉改成优先用 `resolveDataCaptureTenantId(scope)` 解析出的 tenantId 走 Spring
  `fetchCaptureCurrenciesByTenantId`，只有解析不出时才 fallback 到 PHP 的
  `fetchGroupCaptureCurrencies(viewGroup)`。

---

## 汇总：改动文件清单

```
Part 1（本次会话）
  M  src/pages/datacapture/hooks/useDataCaptureSubmitReset.js
  M  src/pages/datacapture/lib/dataCaptureApi.js
  D  src/pages/datacapture/lib/dataCaptureGroupDraftApi.js
  M  src/pages/datacapture/lib/dataCaptureGroupOnlyTableDraft.js
  M  src/pages/datacapturesummary/hooks/useSummaryAddAccount.js
  M  src/pages/datacapturesummary/lib/summaryApi.js
  M  src/pages/datacapturesummary/submit/summarySubmitExecution.js
  M  src/pages/datacapturesummary/table/summaryTemplatePopulatePure.js

Part 2（会话开始前已存在，非本次所作）
  M  src/components/AuthenticatedLayout.jsx
  M  src/pages/account/AccountListPage.jsx
  M  src/pages/account/accountListApi.js
  M  src/pages/account/accountLogic.js
  M  src/pages/datacapture/hooks/useDataCaptureFormEngine.js
  M  src/pages/datacapture/lib/dataCaptureScope.js
  M  src/pages/datacapture/lib/dataCaptureStorage.js
  M  src/pages/datacapture/lib/dataCaptureTenant.js
  M  src/pages/datacapturesummary/hooks/useSummaryBoot.js
  M  src/utils/auth/sidebarPermissions.js
```

后端（`Count/backend`）**没有任何改动**——所有改动都是让前端接线到已经存在的 Spring 端点上。
