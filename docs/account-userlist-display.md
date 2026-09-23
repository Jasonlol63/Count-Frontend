# Admin User List / Account List — 展示与权限行为记录

> **本文档由 2 份合并而成**（2026-09-22）。两块内容分别覆盖"看得到什么"和"能不能改"。
>
> | 顺序 | 来源文档 | 定位 |
> |---|---|---|
> | 1 | `last-login-logout-ui.md` | 展示 —— 两个列表页新增 Last Login / Last Logout 列 |
> | 2 | `staff-account-readonly-and-maintenance-visibility-fixes.md` | 行为 —— 三个排查出来的问题：新建账号被锁 read-only / Bank 租户 Maintenance 空白 / 权限关了侧边栏还在 |
>
> **相关的其它 Admin/账号文档**（各自独立）：
> - `permission-rbac-frontend-alignment.md` —— Admin 权限体系的前端对齐（RBAC 契约）
> - `userlist-group-mode-issues.md` —— 单 Group 模式下 UserList 的两个问题
> - `reset-password-tac-implementation.md` —— Reset Password 接线

---
---

# 1. Admin User List & Account List：Last Login / Last Logout 展示
## Admin User List & Account List：Last Login / Last Logout 展示

> 适用范围：`src/pages/userlist/`（Admin User 列表）、`src/pages/account/`（Account/Member 列表）
> 及相关 CSS（`userlist.css` / `accountCSS.css` / `admin-responsive.css` / `global-13inch.css`）。
> 这份文档只记录前端展示/交互部分；后端字段是怎么补齐的见 `Count` 仓库的
> [`docs/admin-permission-and-userlist.md`](../../Count/docs/admin-permission-and-userlist.md)。

两个列表页面各自独立实现（组件、CSS grid 变量都不共享），但用的是同一套设计：新增一列
"Last Logout"，紧跟在已有的 "Last Login" 列后面，格式和交互跟 Last Login 完全对称。

### 共同的展示规则

- **日期格式**：单元格只显示 `DD-MM-YYYY`；鼠标悬浮显示 `title` tooltip，内容是 `HH:MM:SS`
  （只有时间，不重复日期）。空值显示 `-`。
- **可排序**：表头点击排序，跟其他列一样的升/降序切换；空值排在最后。
- **列的插入位置**：紧跟在 Last Login 后面、Created By（Admin）或 Remark（Account）之前，不打乱
  其余列的顺序。

### 1. Admin User List（`src/pages/userlist/`）

- **格式化函数**：[`userListLogic.js`](../src/pages/userlist/userListLogic.js) 新增
  `formatUserLastLogoutDate` / `formatUserLastLogoutTimeTitle`，逻辑跟既有的
  `formatUserLastLoginDate` / `...TimeTitle` 一致（复制粘贴同一套日期解析）；排序分支
  `sortColumn === "lastLogout"` 复用既有的 `lastLoginSortMs` 通用日期比较函数。
- **数据映射**：[`userListApi.js`](../src/pages/userlist/userListApi.js) 的
  `normalizeAdminListItem` 加 `lastLogout: admin.lastLogout ?? null`。
- **页面接线**：[`UserListPage.jsx`](../src/pages/userlist/UserListPage.jsx)
  - `toLegacyAdminRow` 加 `last_logout: item.lastLogout ?? null`。
  - 表头在 Last Login 和 Created By 之间插入一个新的可排序 header item
    （`handleUserListSort("lastLogout")`）。
- **行渲染**：[`UserCardsList.jsx`](../src/pages/userlist/components/UserCardsList.jsx) 在
  Last Login 单元格后面加一个新的 `card-item`，用上面两个格式化函数。
- **Owner 影子行不需要额外处理**：Admin User List 里合成的 Owner 行（`isOwnerShadow`）读的是
  同一个 `admin.lastLogin` / `admin.lastLogout` JSON 字段，本节改动天然覆盖它，不用为 Owner 单独
  写一套前端逻辑。
- **i18n**：[`userListTranslate.js`](../src/translateFile/pages/userListTranslate.js) 英文/中文
  各加一行 `lastLogout: "Last Logout"` / `"最后登出"`。

#### CSS：9 列 grid 变成 10 列

原来的 `--user-list-grid-cols`（No / Login ID / Name / Email / Role / Status / Last Login /
Created By / Action，9 条轨道）在 Last Login 后面插入一条新轨道，Bulk-delete 变体
（`--user-list-grid-cols-bulk`）同样处理，尾部 48px 的勾选框轨道保持不变。

- [`userlist.css`](../public/css/userlist.css)：默认和中文（`body.lang-zh`）两套 grid 变量都改；
  `--list-table-min-width` 从 `1040px` 调到 `1150px`，避免新列把其他列挤窄。
- [`admin-responsive.css`](../public/css/admin-responsive.css)：窄屏（≤1440px 附近）断点的
  grid 变量同步加一条轨道；最小宽度从 `980px` 调到 `1090px`。
- [`global-13inch.css`](../public/css/global-13inch.css)：13 寸屏适配断点的 grid 变量（默认 +
  中文两套）同步加一条轨道。
- 新轨道宽度统一用跟 Last Login 相同的 `minmax(...)` 值（同一列的两个"时间列"给一样的空间）。
- 没有改动任何 `nth-child` 定位样式——Role/Status 相关的窄屏省略号规则用的是第 5/6 列，插入点在
  第 7 列之后，不影响它们的序号。

### 2. Account List（`src/pages/account/`）

- **格式化函数**：[`accountLogic.js`](../src/pages/account/accountLogic.js) 新增
  `formatAccountLastLogoutDate` / `formatAccountLastLogoutTimeTitle`，同样复用既有
  `parseAccountLastLogin` 的日期解析逻辑。
- **数据映射**：[`accountListApi.js`](../src/pages/account/accountListApi.js) 的
  `normalizeAccountListItem` 加 `last_logout: item.lastLogout ?? item.last_logout ?? null`。
- **页面接线**：[`AccountListPage.jsx`](../src/pages/account/AccountListPage.jsx)
  - 排序 `getValue` 加 `if (sortColumn === "lastLogout") return account.last_logout;`。
  - 表头在 Last Login 和 Remark 之间插入 `renderSortableHeader(t("lastLogout"), "lastLogout")`。
  - 行渲染在 Last Login 单元格后面加一个新的 `account-card-item`。
- **i18n**：[`accountTranslate.js`](../src/translateFile/pages/accountTranslate.js) 英文/中文各加
  `lastLogout: "Last Logout"` / `"最后登出"`。

#### CSS：9 列 grid 变成 10 列

原来的 `--account-list-grid-cols`（No / Account / Name / Role / Alert / Status / Last Login /
Remark / Action）同样在 Last Login 后面插入一条轨道。

- [`accountCSS.css`](../public/css/accountCSS.css)：`--account-list-grid-cols` 和
  `--account-list-grid-cols-bulk` 都加一条轨道；`--list-table-min-width` 从 `980px` 调到
  `1090px`。
- [`global-13inch.css`](../public/css/global-13inch.css)：13 寸屏断点的
  `--account-list-grid-cols` 同步加一条轨道（这个断点原本没有单独的 bulk 变体覆盖，沿用
  `accountCSS.css` 里的）。
- 窄屏下 Role/Alert/Status 的 `nth-child(4)/(5)/(6)` 省略号规则同样不受影响（插入点在第 7 列
  之后）。

### 已知限制

- Last Logout 只有用户点"退出登录"按钮才会有值；关浏览器/token 过期不会记录，列表上会一直显示
  `-`。这是后端认证机制的限制，不是前端展示 bug（详见后端文档）。
- 这几处改动只在本地跑过 `vite build` 做语法检查，没有做像素级视觉回归；上线前建议实机过一遍
  Admin User List 和 Account List 在窄屏（≤1440px、13 寸屏）下的表格是否还对齐。

---
---

# 2. 三个排查出来的问题：新建账号被锁 read-only / Bank 租户 Maintenance 空白 / 权限关了侧边栏还在
## 三个排查出来的问题：新建账号被锁 read-only / Bank 租户 Maintenance 空白 / 权限关了侧边栏还在

这次排查是从"Customer Service 角色提交 CONTRA 交易报 read-only 错误"这一条症状开始的，过程中顺带
牵出另外两个不相关的问题。三个问题独立成因、独立修复，放在一份文档里是因为都是同一次排查会话里
一起发现的。后端相关的部分（问题 1 的迁移脚本）见 `Count` 仓库的
[`docs/transaction-contra-inbox-approval.md`](../../Count/docs/transaction-contra-inbox-approval.md)
——不过问题 1 的**真正根因其实在前端**，后端迁移只是清理既有脏数据，见下文。

### 问题 1：非 Partnership/Audit 角色新建账号后被锁成 read-only

#### 症状
以 Customer Service 身份登录（该账号本身没有 read-only 开关可见/可操作），提交手动交易时报
`"Read-only access cannot perform this action"`。

#### 排查过程中的误判

最初以为这是历史脏数据——`user.read_only` 这一列早期 schema 默认值是 `1`，后来某次 commit 才
改成 `0` 并补了一条迁移脚本回填存量数据。但实际查库发现：**出问题的账号是当天刚建的**，而
`read_only` 列的默认值当时已经确认是 `0`——也就是说不是"沿用旧默认值"，是**创建时被显式写成了
`1`**。

#### 真正根因

`buildAdminCreateRequest`（`src/pages/userlist/userListApi.js:204`，新建账号的请求体构造函数）：

```js
readOnly: readOnly != null ? !!readOnly : true,   // 没传值时兜底成 true
```

对比同一个文件里 `buildAdminUpdateRequest`（`userListApi.js:260`，编辑账号用）：

```js
if (readOnly != null) body.readOnly = !!readOnly;   // 没传值直接不带这个字段
```

`UserListPage.jsx:2562-2566` 算出来的 `readOnlyValue`，对 Customer Service/Supervisor 这类没有
read-only 开关的角色，本来就是 `undefined`（这部分逻辑本身没问题）。但**新建账号**走的是
`buildAdminCreateRequest`，`undefined` 在这里被错误地兜底成 `true` 而不是 `false`，于是请求体
里直接带着 `readOnly: true` 发给后端，后端老老实实存成 `1`——每新建一个没有 read-only 开关的角色
（Customer Service/Supervisor/Manager/Admin/Accountant 全部中招），账号就直接被锁死写操作。
**编辑账号没有这个问题**，因为 update 选择的是"不传字段"而不是"兜底成 true"。

查库确认当时受影响的账号：`ACCOUNTANT:2 / ADMIN:1 / CUSTOMER_SERVICE:2 / MANAGER:4 /
SUPERVISOR:2`，共 11 个——ADMIN/MANAGER 也中招意味着即使账号角色按 Contra Inbox 规则本该"绝对
豁免审批"，只要这个账号本身 `read_only=1`，`AccessControlUtils.requireWritable` 会在角色判断
之前就直接拦下来，等于豁免形同虚设。

#### 修复

`userListApi.js:204` 一处改动：

```diff
- readOnly: readOnly != null ? !!readOnly : true,
+ readOnly: readOnly != null ? !!readOnly : false,
```

`normalizeAdminDetail`（`userListApi.js:103`，解析 Edit User 弹窗详情响应）里还有一处类似的
`!= null ? ... : true`，特意确认过没有一起改——那处是解析后端"编辑详情"接口返回值时的兜底，后端
详情接口本来就一定会带真实的 `readOnly` 值，这个 `true` 只在数据异常时触发，是"失败时假设锁定"
的保守选择，跟新建请求那种"主动往后端写坏数据"性质不一样，不属于同一个 bug。

**历史脏数据的清理**（不属于前端范围，附上出处）：`Count` 仓库的
[`migrate_admin_read_only_default_false.sql`](../../Count/backend/src/main/resources/sql/migrate_admin_read_only_default_false.sql)
本身逻辑是对的，用它清掉了这次发现的 11 个现存坏账号。但这条迁移**只能清理已存在的坏数据**，
不修前端这处才是治标不治本——上面这处前端改动才是真正堵住"以后还会继续产生坏账号"这个口子的地方。

### 问题 2：Bank 类型公司登录后 Maintenance 页面空白

#### 症状
登录一个只有 Bank 账户（没有 Game/Gambling）的公司，Customer Service 角色进 Maintenance 页面，
Transaction Maintenance / Capture Maintenance 两个 tab 什么都不显示，不报错。

#### 根因

这两个 tab 需要一个必填的 `category`（`GAME`/`BANK`）传给后端。前端判断"这个租户是不是
bank-only"依赖一个内存缓存（`companySessionFlagsCache.js` 的 `peekCompanySessionFlags`），这个
缓存**只有在用户手动切换过一次公司选择器**（触发 `update_company_session_api`）之后才会被写入。
如果是登录后直接进 Maintenance（没有切换过公司），缓存是冷的，`isBankOnlyCompanyRow`/
`companyMatchesBankOnlyPillScope` 直接判定"不是 bank-only"，category 默认按 `"Games"` 去查，
而这个租户实际只有 BANK 数据，查出来自然是空的。

仓库里其实已经有一套专门解决"进页面时（不需要手动切换）就把这个缓存焐热"的机制——
`src/pages/maintenance/shared/maintenanceCompanySwitch.js` 的 `syncMaintenanceBootSidebar()`。
**Payment Maintenance 和 Bank Process Maintenance 两个 tab 已经在 boot 时正确调用了它**，所以
这两个 tab 从来没出过这个问题；**Transaction Maintenance 和 Capture Maintenance 没有调用**，
只在用户手动切换公司时才会去同步 session/缓存，首次进页面读的是冷缓存——这正是症状的来源。

#### 修复：纯前端，两个文件，复用已有机制

**`src/pages/maintenance/capture/CaptureMaintenancePage.jsx`** —— 这个页面 boot 阶段完全没有
同步过 session，照搬 Payment Maintenance 已经跑通的那套：新增 `sidebarSyncedCompanyIdRef` +
一个"boot 完成后同步一次 `syncMaintenanceBootSidebar`"的 `useEffect`。

**`src/pages/maintenance/transaction/TransactionMaintenancePage.jsx`** —— 深入看发现这个页面
boot 阶段其实**已经在调 `updateSessionCompany(initialCompanyId)`**（用于另一个"Data Capture
权限"检查），只是拿到的 `sessionData` 从来没有写进 `isBankOnlyCompanyRow` 读的那个共享缓存。
比 Capture 更省事——不需要再加一次网络请求，在已有的 `sessionData` 后面加一行：

```js
if (sessionData) {
  applySidebarForCompanySwitch(bootGroup, currentComp, sessionData);
}
```

把已经拿到手的数据顺手焐热进共享缓存即可（新增 import
`applySidebarForCompanySwitch`，来自 `src/utils/company/sidebarCompanySwitch.js`）。

两处改动都确认过：`captureScope`/`transactionScope` 的 `useMemo` 依赖里都包含 `me`，缓存写入
会触发 `me` 状态更新，下游"Load Meta Data"的 effect 会因为 scope 变化自动重新跑一次——这个自愈
机制本来就是 Payment Maintenance 现在正常工作依赖的同一条链路，不是这次新引入的假设。

Formula Maintenance 确认过不依赖 category 判断，不受影响，没有改动。

### 问题 3：Permission 弹窗关掉 Maintenance，侧边栏依然显示

#### 症状
Edit User → Choose permissions 里把 Maintenance 取消勾选（Supervisor、Customer Service 两个
角色都复现了），保存后该账号登录，侧边栏依然能看到 Maintenance 入口（精简版：Transaction
Maintenance + Formula Maintenance 子菜单）。

#### 根因

`src/utils/auth/sidebarPermissions.js` 里有一段专门写死的兜底逻辑：

```js
export function canAccessLimitedMaintenance(me) {
  if (isOwnerUser(me) || hasFullPermissions(me)) return false;
  if (canAccessFullMaintenance(me)) return false;
  return !!(me?.company_has_gambling || me?.company_has_bank);
}

export function showMaintenanceInSidebar(me) {
  return canAccessFullMaintenance(me) || canAccessLimitedMaintenance(me);
}
```

只要账号不是 Owner、且没有勾选 Maintenance 权限（不管是角色默认没有，还是手动 override 取消
勾选），只要公司本身开了 gambling 或 bank 功能（这两个公司基本都会是 true），
`canAccessLimitedMaintenance` 就无条件返回 `true`——完全无视 Permission 弹窗里的实际设置。

排查后端时确认过：除了 Ownership 一个例外，后端对 Account/Process/Data Capture/Transaction
Payment/Report/Maintenance 这些菜单**全部没有权限key校验**，只检查"是否登录"+ 写操作再加
read-only/角色层级。所以这个兜底不是"前端隐藏、后端还是会拦"的双重保险，是唯一的权限执行点被
绕过了。

#### 修复方向确认

跟需求方确认过：**权限开关应该绝对权威**——不管是角色默认排除，还是手动 override 关闭，都应该
完全隐藏，不再区分"精简版"。

#### 修复

`src/utils/auth/sidebarPermissions.js`：
- 删掉 `canAccessLimitedMaintenance` 函数。
- `showMaintenanceInSidebar`、`canAccessTransactionFormulaMaintenance` 改成直接等价于
  `canAccessFullMaintenance(me)`，和 `canAccessCaptureMaintenance` 待遇一致——四个 Maintenance
  子功能统一只认 `maintenance` 一个权限key。
- `resolveDefaultLandingPath` 里引用 `canAccessLimitedMaintenance` 的 fallback 路由一并删除。

`src/components/AuthenticatedLayout.jsx`：
- 删掉 `canAccessLimitedMaintenance` 的 import 和 `showLimitedMaintenanceMenu` 变量。
- Transaction Maintenance / Formula Maintenance 两个子菜单项的显示条件，从
  `(showFullMaintenanceMenu || showLimitedMaintenanceMenu)` 改成只看 `showFullMaintenanceMenu`。

#### 已知的范围外发现（未处理，仅记录）

后端 Report 接口连 read-only/登录之外的任何校验都没有，Admin 列表接口甚至连登录校验都没有——
这些比 Maintenance 更宽松，但这属于全应用一致的现状（前端侧边栏是唯一权限执行点），不是这次
的范围，是否要引入统一的后端权限校验机制需要单独评估。

### 涉及文件

- `src/pages/userlist/userListApi.js` —— `buildAdminCreateRequest` 的 `readOnly` 兜底值。
- `src/pages/maintenance/capture/CaptureMaintenancePage.jsx` —— 新增 boot 后同步缓存的 effect。
- `src/pages/maintenance/transaction/TransactionMaintenancePage.jsx` —— boot 阶段顺手同步缓存。
- `src/utils/auth/sidebarPermissions.js` —— 删除 `canAccessLimitedMaintenance` 兜底。
- `src/components/AuthenticatedLayout.jsx` —— 移除对应的变量和条件判断。

以下文件本次**没有改动**，列出来是因为排查过程中确认过它们的行为是正确/无关的，方便日后排查时
不用重新验证一遍：

- `src/pages/userlist/userListApi.js` 的 `normalizeAdminDetail`（`readOnly` 兜底 `true`）——
  性质跟 create 请求那处不同，是防御性代码，不是 bug。
- `src/pages/maintenance/formula/FormulaMaintenancePage.jsx` —— 不依赖 category 判断，问题 2
  不影响这个 tab。
- `src/pages/maintenance/payment/PaymentMaintenancePage.jsx`、
  `src/pages/maintenance/bankprocess/BankprocessMaintenancePage.jsx` —— 已经正确调用
  `syncMaintenanceBootSidebar`，是这次修复问题 2 时照抄的参考实现。
