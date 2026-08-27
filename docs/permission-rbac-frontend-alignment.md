# Admin 权限体系 — 前端对齐（2026-08-27）

> 配套后端记录：`Count/docs/admin-permission-rbac-hierarchy.md`
> 背景：后端补上了 Admin 页面的角色层级校验、Partnership/Audit 的 `read_only` 全局写操作拦截，
> 这次是把前端跟着核对一遍，修掉了几处「按钮能点、提交却被后端拒绝」或「入口跟后端权限对不上」的
> 不一致，而不是新做一套前端权限系统——真正的防线始终在后端，前端这些改动都是 UX 层面的提前拦截。

## 结论先行：`ROLE_HIERARCHY` 本身没问题

审计一度以为 `src/pages/userlist/userListLogic.js` 的 `ROLE_HIERARCHY` 跟后端 `user_role.hierarchy_level`
矛盾（后端曾经把 Partnership 排最低）。重新核对后发现是**后端**那份错了，前端这份从一开始就是对的：

```js
export const ROLE_HIERARCHY = {
  owner: 0,
  partnership: 1,
  admin: 2,
  manager: 3,
  supervisor: 4,
  accountant: 5,
  audit: 6,
  "customer service": 7,
  company: 8,
};
```

跟后端这次改完的 `OWNER(1) > PARTNERSHIP(2) > ADMIN(3) > MANAGER(4) > SUPERVISOR(5) > 其余(6-8)`
顺序一致（只是从 0 起还是从 1 起的差异，相对顺序相同）。**这个常量本身未改动。**

## 改了什么

### 1. `userListLogic.js` — `computeRowCapabilities`：编辑权限漏了同级/更高权限的锁

**位置：** `src/pages/userlist/userListLogic.js`

**问题：** 原逻辑对「同级」「更高权限」目标只锁了 `canDelete`，`canEditDelete` 还是 `true`。
比如 Admin 打开 Partnership 的编辑弹窗是可以点进去的，改完提交才会被后端
`AccessControlUtils.assertCanManageAdminTarget` 拒绝，体验上是先能编辑、保存时才报错。

**修复：**

```js
} else if (isSameLevel || isHigherLevel) {
  // 同级或更高权限的目标：编辑也一并锁定，不只是禁止删除
  canEditDelete = false;
  canDelete = false;
}
```

### 2. `userListLogic.js` — `getUserEditFieldLocks`：自己编辑自己时 role 字段没锁

**位置：** 同上

**问题：** 原逻辑 `role: isSame || isLower` 里 `isSame`/`isLower` 都显式排除了 `isSelf`，
导致「编辑自己」这个分支下 role 字段反而是**可编辑**的——跟后端新规则「自己不能改自己的角色，
防止自我提权」矛盾。

**修复：** `role: isSelf || isSame || isLower`（其余字段如 name/email/password 不受影响，自己仍然
可以改这些基础信息，符合「self 只能改基础信息」的规则）。

### 3. Ownership 页面 `readOnlyMode` 从死代码变成真实计算

**位置：** `src/pages/ownership/shared/useOwnershipPageShell.js`

**问题：** `readOnlyMode` 是一个 `useState(false)`，全仓库只有两处引用它的 setter，且都只会把它设回
`false`——从未被真正置为 `true`。下游 `useCompanyOwnership.js`/`useGroupEarnings.js` 里一堆
「Read-only: only owner can modify ownership」的提示、按钮 `disabled={readOnlyMode}` 全部形同虚设。

**修复：** 改成从当前登录用户的会话数据实时算出来，跟应用里其它页面（如 `ProcessListPage`）用的是
同一套判断逻辑，风格保持一致：

```js
const sessionMe = useOptionalAuthSession()?.me ?? null;
const readOnlyMode = !canAccessPermission(sessionMe, "ownership") || isPartnershipAuditReadOnlyLocked(sessionMe);
```

- `canAccessPermission(me, "ownership")`（`src/utils/auth/sidebarPermissions.js`）：角色/权限层面
  能不能碰 Ownership。
- `isPartnershipAuditReadOnlyLocked(sessionMe)`（`src/utils/audit/partnershipAuditReadOnly.js`）：
  Partnership/Audit 账号且 `read_only=1` 时的全局只读拦截，跟 Process 列表页等其它页面用的是同一个
  工具函数。

同时删掉了 `fetchCompanies` 里那句一直在把状态强制设回 `false` 的 `setReadOnlyMode(false)`
（连带 `useState`/`setReadOnlyMode` 一起移除，改成 `const` 派生值）。

### 4. Admin 角色补上 Ownership 权限（跟后端 `user_role_permission` 对齐）

**位置：** `src/utils/auth/sidebarPermissions.js`、`src/pages/userlist/userListLogic.js`

**问题：** 后端 `schema.sql` 里 `user_role_permission` 默认给 `OWNER`、`PARTNERSHIP`、`ADMIN`
三个角色都发了 `OWNERSHIP` 侧边栏权限，`TenantOwnershipServiceImpl.canModifyOwnership()` 的判断
（`role==owner` 或 `permissions` 含 `ownership`）本来就认 Admin。但前端 `roleSupportsOwnershipPermission`
一直只认 `owner`/`partnership`，导致 Admin 账号即使后端会放行，前端也完全不显示 Ownership 入口、
员工列表里给 Admin 分配权限时也看不到 Ownership 复选框。

**修复：** 两个文件里的 `roleSupportsOwnershipPermission` 都加上 `"admin"`：

```js
export function roleSupportsOwnershipPermission(role) {
  const r = normRole(role);
  return r === "owner" || r === "partnership" || r === "admin";
}
```

同步把 `userListLogic.js` 里 `getCurrentUserRolePermissions`、`getRoleTemplateSidebarList`、
`getFinalPermissionsForCreation` 三处 `admin` 角色的权限模板也加上 `"ownership"`——否则入口能显示了，
但新建/编辑 Admin 账号时默认不会勾选、上级角色也没法帮 Admin 勾选这个权限。

## 没有改动、但顺带核对过的地方

- `src/utils/auth/sidebarPermissions.js` 其余函数（`canAccessPermission`/`canShowReportInSidebar` 等）
  完全依赖后端返回的 `me.permissions`/`me.menu`，Customer Service 被后端收回 `ADMIN` 权限后这里会
  自动生效，不需要额外改动。
- `getAvailableRolesForEdit` 里 Supervisor（`currentLevel >= 4`）被整体挡在「修改角色」下拉框之外，
  这是既有行为（跟这次任务无关，没有改动）——Supervisor 仍然可以编辑下级的姓名/邮箱等基础字段，
  只是不能通过这个下拉框重新指定角色。

## 验证

- `npx vite build` 通过（两轮改动各跑了一次，均无报错）。
- 未跑真实浏览器端到端测试，建议实际登录几个不同角色（Partnership + read_only 开/关、Admin、
  Manager、Supervisor）走一遍 Admin 页面的增删改和 Ownership 页面，确认前端按钮状态跟后端返回的
  错误信息一致。
