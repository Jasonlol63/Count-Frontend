# Sidebar "Exp:" showing "-" on cold load (Group mode AND Company mode)

> **最后更新**：2026-09-09
> **相关历史**：`docs/sidebar-expiration-hint-fix.md`（`refreshSession()` 里 Company 分支的同类问题，
> 2026-08-25 已修）。这次是同一个 bug class 的另一片漏网区域——**冷加载 `bootMe` 那一步**，Group 和
> Company 两种模式都受影响。

## Symptom
1. 选中一个 Group（比如 `AP`）后，Ownership、Data Capture、Transaction Maintenance 这几个页面在冷
   加载/刷新时，Sidebar 的 "Exp:" 一直显示裸的 `-`。
2. 排查过程中发现范围比一开始报的更大：**Company 模式下所有页面**，冷加载/刷新时 Sidebar "Exp:" 也
   全部显示 `-`，不限于上面那三个页面。

Dashboard 页面本身相对不容易复现，原因见下面 Root cause 最后一段。

## Root cause

`SessionUser`（`/auth/current-user`）本身没有 `expiration_hint`/`expiration_status`/
`days_until_expiration` 字段（历史遗留：这些是 PHP `current_user_api.php` 的字段名，Spring 端从来没
有过）。这三个字段**永远**是前端本地通过 `buildSidebarExpirationFields(expirationDate)` 算出来的——
没人主动调这个函数，它们就是 `undefined`，`formatSidebarExpirationHint()` 拿到 falsy `hint` 直接返回
字面量 `"-"`。

冷加载路径（`AuthenticatedLayout.jsx` 挂载时那个 `fetchCurrentUser()` 的 effect）里，`bootMe` 分两种
情况，**两种都没算这三个字段**：

- **纯 Group 模式**：调用 `patchMeFromCompanyContext(u, { ... })` 把 Sidebar 分类（Games/Bank）强制
  成 Group 的固定值，但没有传 `expirationDate`。`patchMeFromCompanyContext` 内部只有
  `ctx.expirationDate !== undefined` 时才会调 `buildSidebarExpirationFields`
  （`src/utils/company/loginScope.js:634`）——没传就直接跳过。
- **Company 模式（含没有任何 GC 筛选的普通登录）**：`bootMe` 直接等于 `u`，**完全没有任何 patch**，
  自然也不会算这三个字段。

`refreshSession()`（`AuthenticatedLayout.jsx`）里 Group-only 和 Company 两个分支其实都**已经**在算
`expirationDate` 并调 `buildSidebarExpirationFields`（Company 分支就是 2026-08-25 那次修的），所以只
要 `refreshSession()` 被触发过一次，`-` 就会被修正。问题是 `refreshSession()` 只在监听到
`eazycount:company-session-updated` / `eazycount:session-refresh-requested` 事件时才会跑
（`AuthenticatedLayout.jsx` 里那个 `useEffect`），而大部分页面挂载时不会主动发这类事件——Dashboard 的
GC 筛选组件会在切换 Group/Company 时主动发，所以同样的 boot-time 空档在 Dashboard 上不容易被注意到；
直接从别的入口进任意页面、或者在任意页面上刷新，就会一直卡在 `-`，因为没人替它触发过
`refreshSession()`。

## Fix

**`src/components/AuthenticatedLayout.jsx`**（`bootMe` 计算）

两个分支都补上跟 `refreshSession()` 对应分支完全一致的 `expirationDate` 解析：

- **Group-only 分支**：给 `patchMeFromCompanyContext` 调用加上 `expirationDate`——优先用
  `resolveSidebarExpirationForFilter({ selectedGroup, companyId: null })`（读 owner-companies 缓存里
  这个 Group 自己的 `expiration_date`），缓存还没预热好就退回 `u.expiration_date ?? null`（session
  payload 自带的、当前登录锚定 tenant 的到期日）。
- **非 Group-only 分支（Company 模式）**：不再直接 `bootMe = u`，改成先算
  `companyExp = resolveSidebarExpirationForFilter({ selectedGroup, companyId: bootCategoryCompanyId })`
  （`bootCategoryCompanyId` 来自持久化的 GC 筛选 `companyId`），同样缓存未命中就退回
  `u.expiration_date ?? null`，然后 `{ ...u, ...buildSidebarExpirationFields(...) }` 合并进去。

这样无论哪种模式，`bootMe` 从第一次渲染起就带着正确算出来的 hint/status/days，不用等某个事件碰巧把它
修正。

## Why this shouldn't recur
现在冷加载（`bootMe`）和事件触发的刷新（`refreshSession()`）在 Group-only、Company 两个分支用的都是
同一段"cache-first、session payload 兜底"逻辑，四条路径（2 种模式 × 2 个触发时机）不会再出现"某几条
传了 `expirationDate`、某几条没传"的不对称。以后要是再加新的 `patchMeFromCompanyContext` 调用点或者
新的 `setMe` 赋值点，记得对齐这个模式——只要没传 `expirationDate`，这三个到期相关字段就会被静默跳过
而不是报错，很容易漏掉，且不会在开发时立刻暴露（要等冷加载才会看到）。

## Files changed
- `src/components/AuthenticatedLayout.jsx`

## 后端
无需改动——问题完全是前端 boot 阶段字段传漏，`/auth/current-user` 一直都在正确返回
`expiration_date`。
