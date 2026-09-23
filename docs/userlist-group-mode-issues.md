# Admin 用户列表：单 Group 模式下的两个问题（数据不显示 / Process ACL 应隐藏）

> **本文档由两份合并而成**（2026-09-22）：`userlist-groupview-owner-missing-fix.md` +
> `group-mode-userlist-process-acl-hidden.md`。两份都在讲 Admin/用户列表页（`UserListPage.jsx` +
> `UserModal.jsx`）在**单 Group 模式**（选中 Group、Company 栏为空）下的行为问题。
>
> 下面先给结论速览，再完整保留两份原文。**注意问题 1 含后端改动**。

## 结论速览

| # | 问题 | 根因 | 修法 | 后端改动 |
|---|---|---|---|---|
| 1 | Owner 新建一个 Group 后，Admin 用户列表切到**单 Group 视图**是空的，要等很久或反复刷新才出现（Company 视图正常） | Company 视图直接用点击拿到的数字 id；**Group-only 视图要靠本地 `companies` 数组"扫"出该 Group 的 tenant id**。而 `companies` 只在页面首次挂载时加载一次（`bootInitializedRef`），背后是**模块级、session 生命周期共享**的缓存 `fetchOwnerCompaniesAll`（"one HTTP request per session"）。新建 Group 后虽然会 `notifySessionRefreshRequested()` 清缓存，但 **UserListPage 没有监听这个事件**，已挂载的 `companies` state 不更新 → 扫不到那一行 → 返回 `null` → `tenantIds` 为空 → **连请求都不发** | 不去修补"何时刷新 `companies`"（容易被以后新的创建入口再次遗漏），改成让 Group-only 的 tenant id 解析**不再单纯依赖本地缓存**：本地查不到就回退后端按 code 直查 | ✅ 新增 `GET /auth/tenant-by-code` |
| 2 | 单 Group 模式下编辑/新增用户时，右侧 **Process ACL 方块列表不应展示**（即使该用户已挂了具体 Company） | Process 列显隐由 `showProcessColumn` 决定：`dualTenantPicker` 为真时**只看"被编辑用户是否选了至少一个 Company"**，完全不看**页面当前**是否处于单 Group 模式 | 新增页面级 prop `groupOnlyUserList`（`UserListPage` 已有同名 `useMemo`）透传给 `UserModal`，在 `showProcessColumn` 里**最先判断**它 | ❌ 纯前端 |

> 问题 2 的关键约束：**隐藏 ≠ 清空**。只是"这次编辑看不到、改不了"，该用户原有的 Process 权限在数据库里
> **保持不变**，切回 Company 视图重新打开同一用户仍能看到并可编辑。

**后端侧已确认无问题**（问题 1）：建 Group 是同步事务，`/auth/tenant-accessible` 每次直查数据库、无缓存。

---
---

# 原文 A：`userlist-groupview-owner-missing-fix.md`
## Admin 用户列表：新建 Group 后单 Group 视图看不到自己数据

## 问题现象

- Owner 新建一个 Domain/Group（例如 Group "Q"，无下属 Company）。
- Admin 用户列表页在 **Company** 维度筛选（例如 Q1）下能立刻看到自己 Owner 的账号数据。
- 但切到**单 Group 维度**（选中 Group "Q"，Company 栏为空）时列表是空的，要等很久或反复刷新页面好几次才会出现。

## 根因

[`UserListPage.jsx`](../src/pages/userlist/UserListPage.jsx) 里 `loadUsersListFromApi` 解析要查询哪个 tenant 时，Company 视图和 Group-only 视图走的是两条不同路径：

- **Company 视图**：直接用点击时拿到的数字 `activeCompanyId` 请求，不依赖任何本地状态，永远能立刻发出请求。
- **Group-only 视图**：没有现成的数字 id，必须靠 `resolveGroupEntityTenantId()` 在页面本地状态 `companies` 数组里"扫描"出该 Group 对应的那一行 tenant 才能拿到 id。**如果本地 `companies` 里还没有这一行，函数返回 `null`，`tenantIds` 为空，`loadUsersListFromApi` 直接 `return []`，连 API 请求都不会发出去**。

而 `companies` 只在页面**首次挂载**时加载一次（`bootInitializedRef` 保护），背后是一个**模块级、session 生命周期共享**的内存缓存 `fetchOwnerCompaniesAll`（[`sharedCompanyFilter.js`](../src/utils/company/sharedCompanyFilter.js)，注释写明 "one HTTP request per session"）。新建 Group 后，`DomainFormModal.jsx` 虽然会调用 `notifySessionRefreshRequested()` 清空并重新拉取这个模块级缓存，但**`UserListPage.jsx` 没有任何地方监听这个刷新事件**，已经挂载的 `companies` state 不会被更新——只有整页刷新（F5）重置 `bootInitializedRef` 才会重新拉取，这正是"要等很久 / 反复刷新才出来"的原因。

后端侧确认没有问题：建 Group 是同步事务，`/auth/tenant-accessible` 每次都直查数据库、无缓存。延迟完全是前端本地状态未同步导致。

## 修复

不去修补"何时刷新 `companies`"这个容易被以后新的创建入口再次遗漏的点，而是让 Group-only 视图的 tenant id 解析本身**不再单纯依赖本地缓存**：本地查不到时，回退去后端按 code 直查一次（见 [Count/docs/userlist-groupview-owner-missing-fix.md](../../Count/docs/userlist-groupview-owner-missing-fix.md) 里新增的 `GET /auth/tenant-by-code`）。

### 1. 新增按 code 查 tenant id 的 API 封装

[`tenantAccessibleApi.js`](../src/utils/company/tenantAccessibleApi.js)：

```js
// Session-lifetime positive cache — once a code resolves, don't re-hit the backend for it again.
const tenantIdByCodeCache = new Map();

export async function fetchTenantIdByCode(code, options = {}) {
  const normalized = ...;
  if (tenantIdByCodeCache.has(normalized)) return tenantIdByCodeCache.get(normalized);
  const res = await fetch(buildApiUrl(`auth/tenant-by-code?code=${encodeURIComponent(normalized)}`), { credentials: "include", signal });
  ...
  if (resolved != null) tenantIdByCodeCache.set(normalized, resolved);
  return resolved;
}
```

- 查不到 / 请求失败时返回 `null`，不抛异常，不影响页面其它逻辑。
- 内置一个 `Map` 做**正向缓存**：同一个 code 一旦解析成功，本次页面 session 里不会再重复请求（详见下面"调用频率"一节）。

### 2. `UserListPage.jsx` 接入兜底解析

新增 `resolveGroupEntityTenantIdFresh(companies, groupCode, signal)`：本地 `resolveGroupEntityTenantId` 查得到就直接用，查不到才 `await fetchTenantIdByCode(...)`。替换了 `loadUsersListFromApi` 里两处依赖本地 `companies` 的调用点：

```js
// Group-only 视图
} else if (useGroupOnly && activeGroup) {
  const id = await resolveGroupEntityTenantIdFresh(effectiveCompanies, activeGroup, signal);
  if (id != null) tenantIds = [id];
}
```

```js
// Group "All" 聚合视图
if (groupsAllMode) {
  const resolved = await Promise.all(
    groupIds.map((code) => resolveGroupEntityTenantIdFresh(effectiveCompanies, code, signal)),
  );
  tenantIds = resolved.filter((id) => id != null);
}
```

Company 视图路径（`activeCompanyId != null` 分支）未改动。

## 调用频率说明

`loadUsersListFromApi` 本身在每次真正需要刷新列表（切 Group/Company、tab 切换、页面挂载等）时都会执行一次网络请求，这点跟本次改动无关；`userListCacheRef` 只用于乐观展示旧数据，不会跳过重新拉取。

新增的 `/auth/tenant-by-code` 只在**本地 `companies` 查不到时**才会被调用：

- 本地查得到（正常情况，或 `companies` 已刷新）→ 完全不调新接口，行为和改动前一样。
- 本地查不到（典型场景：刚建完新 Group，本地快照还是旧的）→ 调一次新接口。查到后写入 `tenantIdByCodeCache`，**同一 session 内**再切换回这个 Group 不会重复请求。
- 缓存只在整页刷新（模块变量重置）后失效，重新走一次真实校验——避免"万一 tenant 之后被删了/权限变了"却永远信任一条过期的内存记录。

## 验证

- `npx vite build` 通过，无编译/类型错误。

## 影响范围

- 修改文件：
  - [`src/utils/company/tenantAccessibleApi.js`](../src/utils/company/tenantAccessibleApi.js) —— 新增 `fetchTenantIdByCode` + 正向缓存。
  - [`src/pages/userlist/UserListPage.jsx`](../src/pages/userlist/UserListPage.jsx) —— 新增 `resolveGroupEntityTenantIdFresh`，替换两处 Group-only / Group-All 的 tenant id 解析调用。
- 未改动 Company 视图路径、`companies` 本身的加载/刷新逻辑、任何提交/保存逻辑。
- 建议人工验证：Owner 新建一个无下属 Company 的 Group，不刷新页面直接切到该 Group 的单 Group 视图，确认自己的账号数据立刻出现；再切走切回，确认不会再触发多余的网络请求（Network 面板确认 `auth/tenant-by-code` 只在首次命中一次）。

---
---

# 原文 B：`group-mode-userlist-process-acl-hidden.md`
## Group 模式下 Edit User 的 Process ACL 应固定隐藏

## 需求

- Admin 页面（用户列表）在**单 Group 模式**下（选中 Group ID，Company 栏为空）编辑/新增用户时，即使该用户已经被分配了具体 Company（Group/Company 选择器里选中了如 "OK | OK1"），弹窗右侧的 **Process** ACL 方块列表也不应该展示。
- 只有当页面切到某个具体 Company（Company 栏有值）时，Process ACL 才展示、可编辑。
- 隐藏只是"这次编辑看不到、改不了"，**不代表清空**：该用户原有的 Process 权限数据在数据库里保持不变，切回 Company 视图重新打开同一用户仍能看到并可编辑。

## 根因 / 原有逻辑

Process 列的显隐由 [`UserModal.jsx`](../src/pages/userlist/components/UserModal.jsx) 里的 `showProcessColumn` 决定：

```js
const showProcessColumn = dualTenantPicker ? activeSelectedCompanyIds.length > 0 : !groupPickerMode;
```

- 当前登录角色是 Owner/Admin 时，`dualTenantPicker` 为 `true`，此时只看"这个被编辑用户是否选了至少一个 Company"（`activeSelectedCompanyIds.length > 0`），完全不管**页面当前**是否处于单 Group 模式。
- 所以只要该用户在 Group/Company 选择器里挂了具体 Company（如截图中的 "OK | OK1"），即使列表页当前是 Group 视图（Company 栏为空），Process 区块依然会显示出来 —— 这就是需求里说的"不应该出现却出现了"的情况。

## 修复

新增一个页面级 prop `groupOnlyUserList`（[`UserListPage.jsx`](../src/pages/userlist/UserListPage.jsx) 里已有的同名 `useMemo` 状态，用来判断当前是否处于"单 Group、未选 Company"模式），透传给 `UserModal`，并在 `showProcessColumn` 计算里最先判断它：

```js
// UserModal.jsx
const showProcessColumn = groupOnlyUserList
  ? false
  : dualTenantPicker
    ? activeSelectedCompanyIds.length > 0
    : !groupPickerMode;
```

```jsx
// UserListPage.jsx —— 渲染 <UserModal /> 处新增一个 prop
<UserModal
  ...
  groupPickerMode={!useDualTenantUserPicker && groupOnlyUserList}
  dualTenantPicker={useDualTenantUserPicker}
  groupOnlyUserList={groupOnlyUserList}
  ...
/>
```

`showProcessColumn` 只控制 [该 JSX 块](../src/pages/userlist/components/UserModal.jsx) 是否渲染，不参与 `selectedProcessIds` 状态的加载/提交逻辑，所以：

- 隐藏时，`selectedProcessIds`（编辑弹窗打开时已从后端加载好的该用户 Process 权限）保持原值不变，Save 时会原样提交，数据不会被清空或覆盖。
- 切换回具体 Company 视图后重新打开同一用户的编辑弹窗，`groupOnlyUserList` 变为 `false`，Process 区块恢复正常显示与编辑。

## 影响范围

- 修改文件：
  - [`src/pages/userlist/components/UserModal.jsx`](../src/pages/userlist/components/UserModal.jsx) —— 新增 `groupOnlyUserList` prop，调整 `showProcessColumn` 判断。
  - [`src/pages/userlist/UserListPage.jsx`](../src/pages/userlist/UserListPage.jsx) —— 渲染 `<UserModal />` 时透传 `groupOnlyUserList`。
- 未改动任何提交/保存逻辑，也未改动 Account ACL 列的显隐（本次只针对 Process 列）。
- 建议人工验证：
  1. Owner/Admin 登录，切到单 Group 视图（Company 栏为空），编辑一个已分配了 Company 的用户（如 JJ / OK1），确认 Process 区块不显示。
  2. 切到该用户所属的具体 Company 视图，再次打开同一用户的编辑弹窗，确认 Process 区块正常显示，且原有勾选的 Process（BONUS/COMMISSION/SALARY 等）未丢失。
  3. 在单 Group 视图下保存该用户的其它字段改动（如 Name），确认保存后其 Process 权限未被清空。
