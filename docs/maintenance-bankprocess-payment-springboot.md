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
- **Payment Maintenance**：支持 Group 账本 + Groups All / Group All 聚合，情况分三种（都在
  `paymentMaintenanceLogic.js` 的 `resolvePaymentMaintenanceTenantIds()` 里处理）：
  1. **Company 模式**：`scope.scopeCompanyId` 就是 tenantId。
  2. **纯 Group 账本**（选了组但没下钻到具体子公司）：`resolveTransactionScope()` 在这个分支下
     `scopeCompanyId` 恒为 `0`（这是给旧 PHP `group_id`/`group_aggregate` 用的占位值，不是真实
     tenant）。真正的 tenantId 是「组的实体公司行」（`company_id === 组代码` 的那一行）的数字 id ——
     用 `resolveGroupEntityRowFromSnap(companies, scope.selectedGroup)` 现查（跟
     `transaction/lib/transactionApi.js` 里 `resolveTransactionSpringTenantId` 的做法一致）。
     **这是这次改动里唯一一处需要格外注意的坑**：如果照抄 `scope.scopeCompanyId` 当 tenantId，
     纯 Group 账本视图会直接对后端发 `tenantId: 0`，后端 `requireTenantId()` 会报 "Invalid tenant id"，
     查询直接失败。
  3. **Aggregate 模式**（Groups All / Group All 聚合，`scope.mode === "aggregate"`）：
     `scope.mergeCompanyIds` 是一串真实子公司 id，Spring 端没有「一次请求聚合多租户」这个能力，
     前端对每个 tenantId 并发发一次 `list` 请求，再按 `createdAt desc, id desc` 客户端合并排序
     （后端单租户结果本身就是这个顺序，合并后重排是为了保证跨租户交叉的全局顺序正确）。

`fetchCompanyCurrencies` / `searchPaymentData` / `deletePaymentRecords` 都吃同一个
`resolvePaymentMaintenanceTenantIds({ companyId, scope, companies })`，`companies` 参数
（owner companies 快照）从 `PaymentMaintenancePage.jsx` 一路透传下来，只在分支 2 才会用到。

---

## 3. 删除：按行的来源 tenant 分组

Payment Maintenance 在 aggregate 模式下，列表里的行可能来自不同 tenant。搜索时
`normalizePaymentRow(row, tenantId)` 会把该行实际来自哪个 tenant 记在内部字段 `_tenant_id`
上（UI 不读这个字段，纯内部簿记）。`deletePaymentRecords(transactionIds, scope, rows, companies)`
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
  补传 `companies`（纯 Group 账本 tenantId 兜底解析要用）/`paymentData`（删除按 tenant 分组要用）；
  `reloadScopeMeta` 的 `useCallback` 依赖数组补上 `companies`。
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
