# Domain 页面 — 重新接回 Spring Boot（撤销 4f00f14 的回退）

> **范围**：`src/pages/domain/`（`DomainPage.jsx` + `components/DomainFormModal.jsx` /
> `DomainFeeModal.jsx` / `CompanySettingsModal.jsx` / `GroupSettingsModal.jsx` /
> `AddAccountModal.jsx`）+ `src/pages/autorenew/AutoRenewPage.jsx`（两处共用 `CompanySettingsModal`
> 的 Comm 设置弹窗调用点）。**没有改动任何后端代码** —— 所有需要的 Spring 端点已存在
> （`DomainController` / `UserController` / `CurrencyController`），本次全部是前端接线。
> **最后更新**：2026-08-21

---

## 0. 起因

`Count/docs/frontend-springboot-migration.md` §4.2/§14 一直记录 Domain 页面「✅ 已迁移」，
`src/pages/domain/domainApi.js` + `domainHelpers.js` 也确实完整实现了对应的 Spring 契约。但实际
UI 代码——`DomainPage.jsx` 及其全部 4 个子弹窗——**完全没有 import `domainApi.js`**，仍在打旧 PHP
`api/domain/domain_api.php`（以及 `AddAccountModal.jsx` 里的 `api/accounts/*.php` /
`api/editdata/editdata_api.php`）。

`git log` 显示这批文件最后一次改动是 `4f00f14`（"already change account/admin/transaction page to
springboot api" 那次大范围回退提交）——和 Data Capture 那次回退（已于 2026-08-19 修复，见
`datacapture-full-springboot-cleanup.md`）是同一批事故，只是 Domain 这边此前没人补。

更进一步排查发现 **`domainHelpers.js` 也被同一次回退连带影响**：`domainApi.js` 顶部 import 的
`groupToTenantSaveEntry` / `companyToTenantSaveEntry` / `featureModulesToPermissionNames` /
`feeShareSpringToUi` / `feeShareUiToSpring` / `permissionNamesToFeatureModules` /
`periodPricesUiToFeeDto` 这些函数在 `domainHelpers.js` 里根本不存在——因为没人 import `domainApi.js`，
这个断裂的 import 从未在浏览器里实际执行过，所以此前完全没有报错、也没人发现。本次一并补上（§3）。

---

## 1. 修复总览

| 能力 | 旧 PHP 端点 | 新 Spring 端点 | 改动文件 |
|------|-------------|-----------------|----------|
| Domain 列表加载 | `POST api/domain/domain_api.php`（`action:list`） | `fetchDomainList()` → `POST /api/domain/list` | `DomainPage.jsx` |
| Price 摘要读取 | `POST domain_api.php`（`get_domain_fee_settings`） | `fetchDomainFeeSettings()` → `POST /api/domain/list-fee` | `DomainPage.jsx`, `DomainFeeModal.jsx` |
| Price 保存 | `POST domain_api.php`（`save_domain_fee_settings`） | `saveDomainFeeSettings()` → `POST /api/domain/add-fee` | `DomainFeeModal.jsx` |
| 删除 owner | `POST domain_api.php`（`delete`） | `deleteOwner(id)` → `POST /api/domain/delete` | `DomainPage.jsx` |
| 编辑态加载 companies/groups | `POST domain_api.php`（`get_companies`/`get_groups`） | **无需 API** — 数据已在 `fetchDomainList()` 的聚合行 `companies_full`/`groups_full` 里 | `DomainFormModal.jsx` |
| Tenant code 全局冲突校验 | `POST domain_api.php`（`validate_domain_code`） | **无需 API** — 纯客户端 `validateTenantCodeGlobally()`，直接查内存里的 `domains` 列表 | `DomainFormModal.jsx`, `CompanySettingsModal.jsx` |
| Domain 新建/更新骨架 | `POST domain_api.php`（`action:create/update`，`companies`/`groups` 塞 JSON 字符串） | `createDomain()`/`updateDomain()` → `POST /api/domain/add` / `PUT /api/domain/update`，随后 `syncAllTenantSettings()` 逐个 tenant 调 `PUT /api/domain/update-setting` 落地 featureModules/feeShare | `DomainFormModal.jsx` |
| Company Settings 加载账户下拉 | `POST domain_api.php`（`get_company_share_settings`） | `fetchShareAccountsForTenant(shareLedgerTenantId)` → `POST /api/account/list?tenant_id=` | `CompanySettingsModal.jsx` |
| Company Settings 加载 permissions 兜底 | `POST domain_api.php`（`get_company_permissions`） | **移除** — permissions 现在总是随 `fetchDomainList()` 聚合行一起带来 | `CompanySettingsModal.jsx` |
| Company/Group Settings 保存（Auto Renew Comm） | `POST domain_api.php`（`save_company_share_settings`/`save_group_share_settings`） | `updateTenantSetting({id, code, ownerId, feeShareAllocations})` → `PUT /api/domain/update-setting` | `CompanySettingsModal.jsx` |
| Company Settings 保存（Domain Add/Edit 常规路径） | `POST domain_api.php`（`update_company_permissions` + `save_company_share_settings`，永远尝试、失败就吞掉改成本地提示） | 有真实 `company.id`（编辑已存在公司）才调 `updateTenantSetting(...)`；新建的临时公司（`company.id` 还没分配）直接跳过网络请求，交给外层 `syncAllTenantSettings` 兜底 | `CompanySettingsModal.jsx` |
| Add Account — 角色下拉 | `GET api/editdata/editdata_api.php` | **无需 API** — 复用 Account List 页同款静态 fallback `getAccountModalOrderedRoles([])` | `AddAccountModal.jsx` |
| Add Account — 可选公司 | `GET api/accounts/account_company_api.php?action=get_available_companies` | **无需 API** — Share % 建号固定单租户 C168，picker 直接给一个 `{id:tenantId, company_id:tenantCode}` | `AddAccountModal.jsx` |
| Add Account — 币种（读/建/删） | `api/accounts/account_currency_api.php` / `create_currency_api.php` / `delete_currency_api.php` | `fetchAvailableCurrencies()` / `createTenantCurrency()` / `deleteTenantCurrency()`（`accountListApi.js`，复用 Account List 页） | `AddAccountModal.jsx` |
| Add Account — 建号提交 | `POST api/accounts/addaccountapi.php` + N 次补币种/公司调用 | `createAccountUser(buildAccountCreateRequest(...))` 一次请求写完（`accountId`/`currencyIds[]`/`tenantIds[]`） | `AddAccountModal.jsx` |

---

## 2. Props 改名（贯穿 Domain + Auto Renew Comm）

`sessionCompanyId`/`sessionCompanyCode` → `shareLedgerTenantId`/`shareLedgerTenantCode`
（`domainApi.resolveShareLedgerTenantId(me)` / `resolveShareLedgerTenantCode(me)`）。

原因：Share % 的账户始终建在 **C168 ledger tenant**，不是正在编辑的 domain 自己的 tenant——
`sessionCompanyId` 这个名字在旧 PHP 时代含糊地兼容了两种语义，Spring 下必须显式区分「当前登录会话的
company_id」和「C168 tenant.id」，后者才是 Share % 账户列表/新建账号真正要用的 tenant id。

调用链：`DomainPage` / `AutoRenewPage` → `DomainFormModal` → `CompanySettingsModal` /
`GroupSettingsModal` → `AddAccountModal`（后者的 props 也从 `companyId`/`companyCode` 改名为
`tenantId`/`tenantCode`）。

`AutoRenewPage.jsx` 的两处 Comm 弹窗调用点（`CompanySettingsModal`/`GroupSettingsModal`）只改了这
两个 prop 名 + 新增 `domains={[]}`（Auto Renew 场景没有现成的跨 owner 列表，传空数组即可，Code 校验
在这里不是关键路径）——其余 Auto Renew 业务逻辑（`fetchAutoRenewApprovals`/`approveAutoRenew` 等，
以及 `autoRenewTenantSettings.js` 里加载单行 tenant 详情用的 `get_companies`/`get_groups` PHP 调用）
本次未动，仍是旧行为，不在这次「Domain 页面」范围内。

---

## 3. `domainHelpers.js` 补回的 Spring 桥接函数

以下函数此前完全不存在（见 §0），本次按后端 `DomainServiceImpl`/`Tenant`/
`TenantFeeShareAllocate`/`FeatureModule` 的实际字段/校验规则重新实现：

- **`featureModulesToPermissionNames` / `permissionNamesToFeatureModules`** — `feature_module`
  表种子数据固定 id 1-5 对应 Games/Bank/Loan/Rate/Money（`schema.sql`），双向映射。
- **`feeShareSpringToUi` / `feeShareUiToSpring`** — UI `{profit,sales,cs,it}` ↔ Spring
  `TenantFeeShareAllocate[]`。按 `DomainServiceImpl.validateAndPrepareFeeShareRows` 的规则：
  Sales/CS/IT 用 `ownerType:"user"`，Profit 用 `ownerType:"owner"`；`ownerType:"group"`
  （partner tenant 分账）UI 尚不支持，读到时直接跳过。
- **`distributeProfitPercentages`** — Profit 卡片在 UI 里没有 % 输入框（一直是"总额减去
  Sales/CS/IT 后按已指定账号均分"），Save 时才现算，对齐 §14.6 记录的业务规则。与已有的
  `computeShareTotals`（显示用）保持逻辑等价但各自独立实现，避免牵动已经在跑的显示路径。
- **`groupToTenantSaveEntry` / `companyToTenantSaveEntry`** — tempGroups/tempCompanies →
  `DomainDTO.groups[]`/`companies[]` 的 `Tenant` 写入形状。**只需要 `code`**（+ 公司行的
  `parentGroupCode`）：`tenantType`/`name`/`status` 后端强制覆盖，`id` 用于匹配时也被忽略——
  `createDomain`/`updateDomain` 纯按 `code`（trim+uppercase）在同一个 owner 下 diff 新建/更新/删除，
  已存在 tenant 的 `expirationDate` 在 `/update` 上会被服务器现有值覆盖（真正的到期日改动走后续的
  `update-setting`）。
- **`periodPricesUiToFeeDto`** — Price 弹窗编辑态字符串 → `PeriodPrices` DTO 数字，沿用
  `normalizeDomainFeeSettingsFromApi` 已经在用、且验证过可用的 `"7days"/"1month"/...` 键名。

---

## 4. 验证清单

- 前端 `npm run build` 通过（无 import/语法错误，已确认）。
- 待人工验证（需要本地 Spring Boot `8082` + 前端 `5173` 都在跑，且有 C168 owner/admin 测试账号）：
  1. Domain 列表加载、Network 面板只看到 `POST /api/domain/list` + `/list-fee`，无 `.php`。
  2. 新增 Domain（owner + 1 group + 1 company），确认 `add` → 逐 tenant `update-setting` 依次成功。
  3. 编辑已有 Domain → Company Settings → Share % → Add Account：无 "Please select a company
     first"，Network 无 `api/accounts/*.php`/`api/editdata/*.php`。
  4. Price 弹窗读取/保存。
  5. 勾选删除 owner。
  6. Auto Renew 的 Comm 设置弹窗 Share % 保存仍正常。

---

## 5. 已知未变更的边界（不在本次范围）

- `pages/report/domain/*`（Domain Report）Group-only 模式——`frontend-springboot-migration.md` §30
  已明确标注为有意保留的 PHP 边界。
- `pages/autorenew/autoRenewTenantSettings.js`——加载单行 tenant 详情时仍用 `get_companies`/
  `get_groups`/`get_domain_fee_settings` PHP action，只是这次没有波及 Domain 页面本身，属于 Auto
  Renew 自己的业务代码，未来若要处理应该单开一次改动。
