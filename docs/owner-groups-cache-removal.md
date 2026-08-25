# 删除 "Owner Groups" 独立缓存 + 重新打开 Process List 预热（2026-08-27）

> 范围：`utils/company/sharedCompanyFilter.js` 里一套试图模拟旧 PHP `groups` 表的独立缓存机制
> （`fetchOwnerGroupsAll` / `ownerGroupsCache` / `findOwnerGroupByCode` 等），以及
> `AuthenticatedLayout.jsx` 里被过期注释误关掉的 Process List 预热功能（`runProcessListWarm`）。
> 后端（`Count` 仓库）**没有改动**，纯前端清理 + 修复。

---

## 1. 背景：为什么这套东西是多余的

旧 PHP 版本里，"公司"和"Group"是两张不同的表：`company` 表存单个公司/子公司，`groups` 表单独存
Group 级别的元数据（到期日、分润设置）。`sharedCompanyFilter.js` 里的 `fetchOwnerGroupsAll` /
`ownerGroupsCache` / `findOwnerGroupByCode` 这一整套，就是照着这个"两张表"的旧模型写的一层缓存，
只是因为 Spring 端一直没有对应的 `get_groups` 端点，所以早就被改成了一个直接返回 `[]` 的空实现
（`setOwnerGroupsCache([])`），靠调用方自己的 fallback 撑着。

但在当前的 tenant 模型里，**Group 根本不是一个独立概念**——它就是 `Tenant` 表里
`tenant_type = GROUP` 的一行，跟普通公司用的是同一个 `/auth/tenant-accessible` 端点，同一个
`tenantAccessibleRowToUiTenant()` 映射函数。这一行本身就自带 `expiration_date`、`id`
（=`tenant.id`），并且是**自引用**的（`company_id === group_id`，见
`tenantAccessibleRowToUiTenant()` 里 `company_id: code` / `group_id: isGroup ? code : parent`）。

也就是说，`getCachedOwnerCompanies()`（`/auth/tenant-accessible` 的快照）里早就混着 Group 自己
那一行了，压根不需要另外再查一次"groups 表"。核实过 `ownerGroupsCache` 实际被读的字段只有
`.expiration_date`（`resolveGroupExpirationDate`）和 `.id`（`UserListPage.jsx` 的空 Group 选择器）
——注释里提到的 `fee_share_allocations` grep 遍整个仓库确认**没有任何地方真正读取过**，只是旧
注释里的说明文字，不是被消费的真实字段。

## 2. 改动

### 2.1 `sharedCompanyFilter.js` —— 整套 owner-groups 缓存直接删除

删除：
- `ownerGroupsCache` / `ownerGroupsInflight` 模块变量
- `clearOwnerGroupsCache()` / `hasOwnerGroupsCache()` / `findOwnerGroupByCode()` /
  `setOwnerGroupsCache()`（内部函数）/ `fetchOwnerGroupsAll()`
- `clearOwnerCompaniesCache()` 里对 `clearOwnerGroupsCache()` 的联动调用

简化：
- **`resolveGroupExpirationDate(groupCode)`**：去掉 `ownerGroupsCache instanceof Map` 那个"优先查
  旧表"的分支，只保留 `getCachedOwnerCompanies()` → `companiesGroupEntityList()` 这一条路径——这条
  路径本来就是事实上一直在生效的主路径，只是代码结构上曾经把它当"备选"
- **`resolveOwnerDashboardGroupIds(companies, me)`**：去掉 `role === "owner" && ownerGroupsCache
  instanceof Map` 那个 union 分支（永远是空 Map，从未真正贡献过任何 id），函数体简化成
  `return sortedUniqueGroupIds(companies)`

### 2.2 4 个调用方去掉 `fetchOwnerGroupsAll(u)` 调用

这几个调用本来就已经是"发了也白发"（永远拿到 `[]`），删除调用点不影响任何行为：

- `src/pages/dashboard/hooks/useDashboardPage.js`（`bootstrap` 里紧跟在 `fetchOwnerCompaniesAll`
  后面的一行；用户明确说 Dashboard 本次不迁移，这里纯粹是清掉一个失效的死调用，不涉及 Dashboard
  其他部分）
- `src/pages/report/customer/CustomerReportPage.jsx`
- `src/pages/report/domain/DomainReportPage.jsx`
- `src/pages/transaction/hooks/useTransactionData.js`（这里原来还有一句注释"Warm Domain groups
  cache so snapGroupIds includes owner portfolio (empty Group KK)"——见下方第 4 节的已知限制）

### 2.3 `UserListPage.jsx` —— 空 Group 选择器去掉对死缓存的依赖

`buildModalGroupOptions()` 给"完全没有子公司、也没有 Group 本体访问权限的空 Group"生成选择器 id
时，原来会先查 `findOwnerGroupByCode(g)`（永远拿 `undefined`），再退到 session 的
`login_group_scope_id`，最后退到按 Group 代码算的稳定 hash 值。去掉中间那层永远失败的查询，直接从
session 的 `login_group_scope_id` 开始尝试，再退到 hash 值——行为完全不变，只是少了一次注定失败的
函数调用。

### 2.4 `AuthenticatedLayout.jsx` —— 重新打开被过期注释误关的 Process List 预热

`runProcessListWarm` 之前是一个空函数 `() => {}`，注释写着"`processRoutePrefetch.js` 还在打 PHP
`processlist_api.php`/`get_company_currencies_api.php`/`user_currency_order_api.php`，所以先不做
Account→Process 页面的预热"——但这条注释是旧信息，核实过 `processRoutePrefetch.js` 现在**完全是
Spring**：`fetchProcessListByTenantId`/`fetchBankProcessListByTenantId`（Spring）+
`fetchCurrencyListByTenantId`（Spring）+ `getUserCurrencyOrder`（纯 localStorage，早就不打网络请求
了）。

按 `runAccountListWarm` 的写法补回真正的预热逻辑：读持久化的 Group/Company 筛选状态，纯 Group 模式
下跳过（Process List 没有"按 Group 预热"的概念，只能按具体公司 tenantId 预热），否则动态 import
`processRoutePrefetch.js`，按当前公司是不是 bank-only 决定预热 Games 还是 Bank Process List 的
路由缓存。两处调用点（Account→Process 的即时预热、idle 时的后台预热）跟 `runAccountListWarm` 共用
同一套触发时机，改动前就已经存在，这次只是把里面的空函数体填上。

## 3. 验证

- `vite build --mode development` 通过，无未用引用/变量报错
- `node --test` 跑了三个覆盖到这几个文件的既有测试（`userListLogic.selfHiddenTiles.test.js`、
  `domainPageForbiddenRace.test.js`、`sharedCompanyFilter.partnerPill.test.js`），10/10 通过
- `grep` 确认 `fetchOwnerGroupsAll`/`findOwnerGroupByCode`/`ownerGroupsCache` 等在整个仓库里
  已经没有任何残留引用

## 4. 已知限制（改动前就存在，本次没有新引入也没有修复）

`useTransactionData.js` 删掉的那次调用原本带着注释"Warm Domain groups cache so snapGroupIds
includes owner portfolio (**empty Group KK**)"——暗示曾经有一个真实场景：owner 名下有一个完全没有
子公司的空 Group，需要额外补一次查询才能让它出现在 Group 筛选 pill 里。

但由于 `fetchOwnerGroupsAll` 早就已经是空实现（`setOwnerGroupsCache([])`），**这个"补查询"从很久
以前就已经没有任何效果了**——不是本次改动造成的新回归，是一个已经存在了一段时间、没人发现/报告的
潜在缺口。如果 owner 确实对某个 Group 拥有访问权限、但这个访问权限没有体现为
`getCachedOwnerCompanies()` 里那一行自引用的 Group 本体 tenant 行（纯粹的权限模型问题，不是数据
迁移问题），这个 Group 可能不会出现在 Group 筛选 pill 里。本次没有验证这个场景是否真实存在——如果
之后发现某个 owner 反馈"看不到某个空 Group"，排查方向应该是 owner 对该 Group 的
tenant-accessible 访问授权，而不是回头找"Domain groups 缓存"（那套东西已经删掉了，也确认过它
从未真正解决过这个问题）。
