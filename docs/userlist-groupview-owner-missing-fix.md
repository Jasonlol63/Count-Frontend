# Admin 用户列表：新建 Group 后单 Group 视图看不到自己数据

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
