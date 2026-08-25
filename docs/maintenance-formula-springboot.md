# Formula Maintenance → Spring Boot 对齐

## 1. 现状

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

## 2. 2026-08-25 复查：修正纯 Group 模式的两个问题

用户要求确认「单 group 形式的数据查询、编辑、删除都可以实现，且不再有 PHP、字段/tenant 全对齐后端」。
复查发现两处需要修，跟 Transaction/Capture/Payment Maintenance 之前修过的同类问题（同一批次代码
遗留）完全对应：

### 2.1 真实 bug：纯 Group 模式的 category 判断漏了 group

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

### 2.2 死代码：重复的 group tenantId fallback

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
