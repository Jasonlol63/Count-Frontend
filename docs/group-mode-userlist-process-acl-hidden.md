# Group 模式下 Edit User 的 Process ACL 应固定隐藏

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
