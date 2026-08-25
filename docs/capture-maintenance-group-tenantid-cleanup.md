# Capture Maintenance — 收掉单 Group 模式自己的一套 tenantId 解析 + 修复搜不到 Group Payroll 数据

> **范围**：`src/pages/maintenance/capture/captureMaintenanceLogic.js`、
> `src/pages/maintenance/capture/CaptureMaintenancePage.jsx`。纯前端改动，**后端零改动**。
> **最后更新**：2026-08-25

---

## 0. 起因

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

## 1. 改动

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

## 1.1 联调时发现的真实 bug：纯 Group 模式搜不到自己刚提交的 Payroll 数据

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

## 2. 现状确认（未改动部分）

- List/Delete 请求字段（`tenantId`/`dateFrom`/`dateTo`/`process`/`category`/`q`/`captureIds`）已经
  跟 Spring `MaintenanceCaptureDTO` 完全对齐，字段名、驼峰命名、`captureIds`（不是旧版
  `lineIds`）都是现状；本次没有再发现遗留 `.php` 端点或 snake_case 请求字段。
- Group / Company 在 `captureScope`（`mode: "group" | "company" | "aggregate"`）里本来就是分开走的
  两个分支，`companyId` 与 `selectedGroup` 也是各自独立的 state，只在 `resolveCaptureMaintenanceScope()`
  里合并成一个 scope 对象——没有需要拆分的"Group/Company 混用"字段。
- 后端 `docs/frontend-springboot-migration.md`（Count 仓库）§13.3 记的「Category 二选一逻辑覆盖不了
  Game+Bank 都有权限的公司」仍是未验证的已知缺口，跟本次改动无关，不在这次范围内。

---

## 3. 验证清单

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

## 4. 已知未变更 / 后续跟进

- 同样的「页面自己又重复实现一份 group-entity tenantId 兜底」模式在 Transaction / Formula / Payment
  Maintenance（`transactionMaintenanceLogic.js` / `formulaMaintenanceLogic.js` /
  `paymentMaintenanceLogic.js`）里也存在，这次按用户要求只清理了 Capture Maintenance；其余几个页面
  如果要同样收口，是独立的后续工作。
- 后端 Game+Bank 双权限公司的 category 覆盖问题（见上文 §2）未处理，需要真机验证后再排期。
