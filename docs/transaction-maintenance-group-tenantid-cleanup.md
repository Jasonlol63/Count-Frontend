# Transaction Maintenance — 收掉单 Group 模式自己的一套 tenantId 解析 + 修复 category 判断遗漏 Group

> **范围**：`src/pages/maintenance/transaction/transactionMaintenanceLogic.js`、
> `src/pages/maintenance/transaction/TransactionMaintenancePage.jsx`。纯前端改动，**后端零改动**。
> **最后更新**：2026-08-25

---

## 0. 起因

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

## 1. 改动

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

## 2. 现状确认（未改动部分）

- List 请求字段（`tenantId`/`dateFrom`/`dateTo`/`process`/`category`/`q`）已经跟 Spring
  `MaintenanceTransactionDTO` 完全对齐，字段名、驼峰命名都是现状；本次没有再发现遗留 `.php` 端点或
  snake_case 请求字段。Transaction Maintenance 本身是只读页面（无 delete 端点）。
- Group / Company 在 `transactionScope`（`mode: "group" | "company" | "aggregate"`）里本来就是分开
  走的两个分支，`companyId` 与 `selectedGroup` 也是各自独立的 state，只在
  `resolveTransactionMaintenanceScope()` 里合并成一个 scope 对象——没有需要拆分的"Group/Company
  混用"字段。

---

## 3. 验证清单

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

## 4. 已知未变更 / 后续跟进

- 同样的模式在 Formula / Payment Maintenance（`formulaMaintenanceLogic.js` /
  `paymentMaintenanceLogic.js`）里也存在，这次按用户要求只清理了 Transaction Maintenance（继
  Capture Maintenance 之后第二个），其余页面如果要同样收口，是独立的后续工作。
- 后端 Game+Bank 双权限公司的 category 覆盖问题（见 [[capture-maintenance-group-tenantid-cleanup.md]]
  §2）未处理，跟本次改动无关。

---

## 5. 2026-08-25 联调时发现的真实 bug：纯 Group 冷启动直接进维护页，Sidebar 菜单只剩 Data Capture

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
