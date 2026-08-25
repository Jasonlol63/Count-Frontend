# Bank Process Maintenance / Payment Maintenance → Spring Boot 对齐

> 范围：`/maintenance/bankprocess`、`/maintenance/payment` 两个页面的 search / delete / currency / session-switch
> 全部改走 Spring Boot `tenantId` 形式，不再打旧 PHP `*_api.php` 端点、不再用 `company_id` / `group_id` /
> `group_only` / `group_aggregate` / `report_scope` / `subsidiary_accounts_only` 这套旧字段校验。
> 后端参考：`Count/backend/src/main/java/com/eazycount/controller/MaintenanceController.java`、
> `MaintenanceServiceImpl.java`、`dto/MaintenanceBankProcessDTO.java`、`dto/MaintenancePaymentDTO.java`。

---

## 1. 新端点

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

## 2. tenantId 是唯一的 scope

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

## 3. 删除：按行的来源 tenant 分组

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

## 4. 响应字段映射（Spring camelCase → 前端旧字段名）

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

## 5. 顺带修的一个真实 bug

`PaymentMaintenanceFilters.jsx` 的 Transaction Type 下拉列表跟后端 `ALLOWED_TYPES`
（`PAYMENT/CLAIM/CLEAR/CONTRA/RATE/ADJUSTMENT/PROFIT`）对不上：多了一个后端根本不认的 `RECEIVE`
（选中后旧代码直接透传成 legacy `receive` 参数，PHP 那边可能认；Spring `normalizeType()` 遇到不在
白名单里的值会直接抛 `BusinessException("Unsupported transaction type: RECEIVE")`，整个查询会失败），
也少了 `CLEAR` 和 `PROFIT` 两个合法类型选不到。已改成跟后端白名单完全一致的 7 个选项。

---

## 6. 改了哪些文件

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

## 7. 已知限制 / 未验证

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

## 8. 2026-08-25 复查：清掉 Payment Maintenance 里残留的重复 group tenantId fallback

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
