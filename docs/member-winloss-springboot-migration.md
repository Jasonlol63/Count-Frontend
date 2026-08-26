# Member 页面 — boot / Account Link / mini grid 全面接回 Spring Boot

> **范围**：`src/pages/member/`（`MemberPage.jsx`、`useMemberPageShell.js`、`useMemberWinLoss.js`、
> `memberWinLossApi.js`）+ `src/translateFile/pages/memberTranslate.js`（新增 `group` 翻译）。
> 对应后端改动记录在 `Count/docs/member-account-link-report.md`（新建了 `MemberPageDTO`、
> `UserPageService`、`MemberController` 下 `/api/member/*` 四个端点），这份文档只讲前端这边接线、
> 中途走过的弯路、以及实测发现的几个真实 bug。
> **最后更新**：2026-08-26

---

## 0. 起因

Member 页面（boot 身份信息、Account Link 判断、有 link 时的多账号 mini grid）一直还在打旧 PHP
端点。排查发现登录早就 100% 走 Spring `/auth/login`（JWT），不会再产生 PHP session——`current_user_
api.php` 之类端点在当前环境下已经是打不通的死代码，不是"现在能跑、要小心别弄坏"的功能。以此为
起点，把 boot 流程、Account Link 可见性判断、mini grid 全部换成 Spring。

## 1. 迁移总览

| 能力 | 旧 PHP 端点 | 新 Spring 调用 | 改动文件 |
|---|---|---|---|
| boot：当前登录身份 | `api/session/current_user_api.php` | `fetchCurrentUser()` → `GET /auth/current-user` | `useMemberPageShell.js` |
| boot：可访问的 company/group 列表 | `api/accounts/account_company_api.php?action=get_account_companies` | `fetchTenantAccessible({all:true})` → `GET /auth/tenant-accessible` | `useMemberPageShell.js` |
| 登出 | `api/session/logout_api.php` | `logoutSession()` → `POST /auth/logout` | `useMemberPageShell.js` |
| 维护模式轮询 | `current_user_api.php`（探测 `maintenance_mode`） | `fetchCurrentUser()`，Spring 无等价机制，轮询保留但不会再触发横幅 | `useMemberPageShell.js` |
| Account Link 列表（有 link 时的 mini grid 账号） | `account_link_api.php?action=get_all_linked_accounts` | `GET /api/member/profile` 的 `linkedAccounts` | `memberWinLossApi.js` |
| 单账号 currency | `account_currency_api.php?action=get_account_currencies` | `POST /api/member/account-currencies`（body 是裸 `accountId`） | `memberWinLossApi.js` |
| 批量 currency（mini grid） | `account_currency_api.php?action=get_batch_account_currencies` | `POST /api/member/account-currencies/batch`（body：`{accountIds}`） | `memberWinLossApi.js` |
| Win/Loss 报表（主表格） | `transactions/history_api.php` | `POST /api/member/history` | `memberWinLossApi.js` |
| mini grid 每格期末余额 | `transactions/history_api.php`（按账号+币种逐个请求） | `POST /api/member/mini-grid-balances`（批量） | `memberWinLossApi.js` |
| currency 兜底来源 | `transactions/search_api.php?target_account_id=` | `POST /api/transaction/search` | `memberWinLossApi.js` |
| currency 拖拽排序持久化 | `transactions/user_currency_order_api.php` | 不打后端，改用 `utils/company/currencyDisplayOrder.js`（localStorage），跟项目里其它已迁移页面同一套做法 | `useMemberWinLoss.js` |
| 切换 company/group | `session/update_company_session_api.php` | `switchSessionTenant()` → `POST /auth/switch-tenant`（复用现成端点） | `useMemberWinLoss.js` |
| 切换查看哪个 linked 账号 | `session/update_account_session_api.php` | 不需要请求——查看哪个账号现在是随请求带的参数，纯前端 `setViewAccountId` | `useMemberWinLoss.js` |

状态模型也跟着简化：原来 `companyId`/`groupId` 两个字段分开、按 `login_scope==='group'` 走不同
分支拼参数的写法，整个删掉，`useMemberWinLoss` 内部只有一个 `tenantId` 状态（Company 和 Group 在
Spring 的 `Tenant` 里本来就是共用一个 id 空间，不需要区分）。`useMemberWinLoss` 返回值里保留了
`companyId: tenantId` 这个别名字段，因为 `MemberPage.jsx`/`PaymentHistoryExportPdfModal` 还在用
这个名字；`groupId` 已经不存在，传给导出 PDF 弹窗的 `groupId` 固定给空字符串。

## 2. 中途尝试又撤销的方案

一开始按"无 Account Link 展示 Company + 单账号简化报表，有 link 时才展示 mini grid"这个思路，
新建过 `MemberSimpleReportPage.jsx`（简化报表页）+ `MemberPageGate.jsx`（按 `hasAccountLink` 分流
的路由组件）+ `memberProfileApi.js`（专用 API 层），做完并且构建通过了——但后来决定把 mini grid 本身
也一起迁移到 Spring，两条路径分开维护就没必要了，这三个文件已经删除，`App.jsx` 的 `member` 路由重新
指回 `MemberPage.jsx`，现在只有一个 Member 页面。`hasAccountLink` 为 false 时，`linkedAccounts` 是
空数组，mini grid 相关 UI 自然不渲染，回落到单账号展示——不需要专门写一个"无 link 分支"页面。

## 3. 实测发现的真实 bug（都已修复）

### 3.1 `/api/transaction/search` 跳过条件用错代理变量，导致 mini grid 偶发拿不到数据

为了避免每次搜索都无条件打一次 `/api/transaction/search`（它只是极端情况下的 currency 兜底来源），
最初用 `ownedCurrencies.length > 0`（当前查看账号自己是否已有 currency）判断要不要跳过。这个条件
跟 mini grid 真正用来算币种列表的 `availableCurrencies` 不是同一套逻辑——某些时序下
`ownedCurrencies` 已经就绪但 `linkedAccountCurrenciesMap`（mini grid 依赖的那个）还没就绪，导致
`availableCurrencies` 算出空列表，mini grid 直接跳过所有余额请求（表现为 `history` 请求数从 ~6 次
骤降到 1 次，但 mini grid 实际是空的，只是主表格因为传空 `currencyCodes` 等于不筛选，还能整表显示，
掩盖了问题）。**修复**：直接判断 `availableCurrencies.length` 本身。

### 3.2 currency 拖拽排序后，报表显示顺序跟拖拽结果相反

把 SGD 拖到 MYR 前面，mini grid 表头立刻正确显示"SGD | MYR"，报表区块却还是"MYR"在前。根因：
`persistCurrencyOrder(nextOrder)` 在 `setCurrencyOrder(nextOrder)` 后紧接着**同步**调用
`fetchMemberHistory()`，但 `fetchMemberHistory` 这个 `useCallback` 捕获的 `availableCurrencies`
来自上一次渲染（`setCurrencyOrder` 触发的重渲染这时候还没发生），所以还是用了拖拽前的旧顺序。mini
grid 表头是对的，是因为它在渲染时直接从最新 state 算，不经过这条有延迟的函数调用链。**修复**：
`fetchMemberHistory` 新增 `selectionOverride.currencyOrder` 入参，`persistCurrencyOrder` 把刚拖拽
出来的 `nextOrder` 直接当参数传进去，不再依赖还没刷新的 `availableCurrencies` state。

### 3.3 单账号 currency 请求会跟批量请求赛跑，去重判断落空

`loadOwnedCurrencies` 本来会检查 `linkedAccountCurrenciesMap` 里有没有当前查看账号的数据，有就
复用、不用再单独发请求；但它所在的 effect 只依赖 `[viewAccountId, tenantId]`，跟批量请求（依赖
`linkedDataReady`）是两个独立并行的 effect，单账号这条更快，经常在批量数据到位前就已经发出去了，
这时候去重判断查不到数据，只能老老实实发真实请求。**修复**：这个 effect 也绑定到 `linkedDataReady`
上，保证去重判断总能等到批量数据到位后再做。

### 3.4 Company/Group 那一行 `length > 1` 才显示，单 tenant 账号看不到自己在哪

`companies.length > 1` 才渲染 Company 那一行——单 group/单 company 账号（`companies` 数组只有
1 条）整行都不显示。改成 `companies.length > 0`。验证过登录本身就要求 `account_tenant_access`
里有匹配的 tenant 行，所以哪怕是"单 group 账号"，登录用的这个 group 自己也一定会在 `companies`
列表里出现，不会是空数组。这个问题在迁移前的（同一套 React 代码的）早期快照里就已经存在，不是这次
迁移引入的新 bug，只是从没人拿单 tenant 账号测过。

### 3.5 Company/Group 文案写死"Company"，group 登录也显示"Company"

那一行标签原来写死 `t("company")`。现在按当前激活 tenant 的类型动态选 `company`/`group` 两个 key
（新增了 `group`/`集团：` 翻译）。`normalizeTenantAccessibleToCompanies` 之前把 `/auth/tenant-
accessible` 返回的 `tenant_type` 丢掉了，这次补上；`MemberPage.jsx` 用
`companies.find(c => c.company_id === companyId)?.tenant_type` 判断当前激活的是哪个。

### 3.6 会员登出后跳回 Admin 登录页，而不是 Member 登录页

`performLogout` 原来固定跳 `spaPath("login")`，落在登录页默认的 Admin 标签。`LoginPage.jsx` 本来
就支持读 URL 的 `?role=member` 参数预选中 Member 标签（切标签按钮本身也是这么处理 URL 的），所以
直接复用这个机制：改成 `spaPath("login", { search: "?role=member" })`。这个改动只在
`useMemberPageShell.js`（只被 Member 页面用）里，不影响 Admin 登出。

## 4. 澄清（排查过，确认不是 bug）

- **unidirectional 非 source 方登录看不到 mini grid**：按 Account Link 可见性规则本就如此——非
  source 方查 `getAllLinkedAccounts` 只会拿到自己，`hasAccountLink` 为 false，`linkedAccounts` 是
  空数组，mini grid 自然不渲染，回落到单账号展示。没有改代码。

## 5. 已知简化 / 未覆盖的边角

- 导出 PDF（`PaymentHistoryExportPdfModal.jsx`）**完全没有触碰**，内部自己的 currency 拉取逻辑还在
  打旧 PHP，点开会失败。
- 维护模式横幅在 Member 页面暂时失效（迁移前也是失效状态，见 §1 维护模式轮询那一行）。
- `/api/transaction/search` 目前没有校验请求里的 `tenantId` 是否等于 session 自己的 `tenant_id`
  ——这是这个已迁移端点本身的既有行为，不是这次改动引入的新问题。
- currency 排序值（`currencySortOrderRef`）少了一个旧来源（`search_api.php` 返回的数字
  `currency_id`），只剩下 owned/linked currency 接口能提供排序值——影响很小，正常情况排序主要就靠
  这两个来源。

## 6. 涉及文件

- `src/pages/member/useMemberPageShell.js`
- `src/pages/member/useMemberWinLoss.js`
- `src/pages/member/memberWinLossApi.js`
- `src/pages/member/MemberPage.jsx`
- `src/translateFile/pages/memberTranslate.js`
- `src/App.jsx`（`member` 路由，最终确认后没有实际变化——still points to `MemberPage.jsx`）
