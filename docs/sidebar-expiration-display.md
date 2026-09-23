# Sidebar "Exp:" 显示 `-`（同一个 bug class 的两片区域，均已修复）

> **本文档由两份合并而成**（2026-09-22）：`sidebar-expiration-hint-fix.md`（2026-08-25）+
> `sidebar-group-boot-expiration-fix.md`（2026-09-09）。后者原文开头就写明"相关历史：前者，同一个
> bug class 的另一片漏网区域"，所以合成一份专题记录。
>
> 下面先给**结论速览**，再**完整保留两份原文**（含排查过程，以及各自"Why this shouldn't recur"
> 那段——那部分解释了怎么防止再犯，有独立价值）。

## 结论速览

**共同根因**：`SessionUser`（Spring `/auth/current-user`）**没有** `expiration_hint` /
`expiration_status` / `days_until_expiration` 这三个字段——它们是 PHP `current_user_api.php`
的遗留字段名，Spring 端从来没有过。这三个值**必须由前端**调
`buildSidebarExpirationFields(expirationDate)` 现算；没调就是 `undefined`，
`formatSidebarExpirationHint()` 拿到 falsy 值直接返回字面量 `"-"`。

同一个 bug class 的两片区域：

| # | 触发场景 | 漏在哪 | 修复日期 |
|---|---|---|---|
| 1 | Group 标签下切到 **Company** 标签 | `refreshSession()` 的 **Company 分支直接照抄服务端响应**里那三个字段（永远 `undefined`）；而 Group-only 分支是本地算的、所以只有 Company 分支出问题。**另外还叠了一个独立问题**：`buildOwnerCompaniesCache`（sidebar 读 `expiration_date` 的来源）在续期/改到期日之后**没有失效**——续期成功、Domain 改了公司/集团到期日之后，即便 hint 算对了也仍显示旧值，直到整页刷新 | 2026-08-25 |
| 2 | **冷加载 / 刷新**（`bootMe` 那一步），**Group 与 Company 两种模式都**受影响 | 挂载时那个 `fetchCurrentUser()` effect 的**两种分支都没算**这三个字段。纯 Group 模式走 `patchMeFromCompanyContext(u, { ... })` 但**没传 `expirationDate`**，而该函数只在 `ctx.expirationDate !== undefined` 时才调用 `buildSidebarExpirationFields`（`src/utils/company/loginScope.js:634`），没传就直接跳过 | 2026-09-09 |

> 具体改了哪些文件、每个改动点的取舍，见下面两份原文各自的 **Files changed / 改动文件** 小节。

---
---

# 原文 A：`sidebar-expiration-hint-fix.md`（2026-08-25）
## Sidebar Expiration Hint Fix (Company view showing "-")

## Symptom
Sidebar "Exp:" countdown showed the correct value under a Group tab (e.g. `12m 5d left`),
but switching to a Company tab under that group showed a bare `"-"`.

## Root cause
`SessionUser` (Spring Boot `/auth/current-user`) only has an `expiration_date` field — it has
**no** `expiration_hint` / `expiration_status` / `days_until_expiration` fields. Those are
leftover PHP `current_user_api.php` field names that the frontend never stopped expecting.

`refreshSession()` in `AuthenticatedLayout.jsx` had two branches:

- **Group-only branch**: computed the hint entirely client-side via
  `buildSidebarExpirationFields(expirationDate)`, never touching the server payload — worked
  correctly.
- **Company branch**: copied `data.expiration_hint` / `data.expiration_status` /
  `data.days_until_expiration` straight from the `/auth/current-user` response. Since the
  backend never sends these, they were always `undefined`, and
  `formatSidebarExpirationHint()` fell back to the literal `"-"`.

Additionally, `buildOwnerCompaniesCache` (the tenant-accessible cache the sidebar reads
`expiration_date` from) was never invalidated after actions that change a tenant's expiry
(auto-renew approval, Domain company/group settings save) — so even after fixing the hint
computation, a freshly renewed date could still show stale until a full page reload.

## Fix
1. **`src/components/AuthenticatedLayout.jsx`** — `refreshSession()` no longer reads
   `expiration_hint`/`expiration_status`/`days_until_expiration` off the server payload in
   either branch. Both Group and Company branches now always derive these locally via
   `buildSidebarExpirationFields(expirationDate)`, where `expirationDate` prefers the cached
   tenant-accessible row (`resolveSidebarExpirationForFilter`) and falls back to the session
   payload's own `data.expiration_date` (always correct for the tenant `data` represents) when
   the cache isn't populated yet.
2. **`formatSidebarExpirationHint()`** — added a mapping for the `"Expired"` sentinel to
   `i18n.expExpired` so it's localized (previously leaked raw English on the Chinese UI).
3. **`src/translateFile/shell/dashboardTranslate.js`** — `expNoDate` wording changed to
   "No Set" / "未设置" (previously "No expiry" / "无到期"); added `expExpired`: "Expired" /
   "已过期". This makes the sidebar distinguish:
   - Tenant has an expiration date in the past → **Expired**
   - Tenant has never had an expiration date set → **No Set**
4. **`src/utils/company/companySessionEvents.js`** — `notifySessionRefreshRequested()` now
   clears the owner-companies cache and kicks off a refetch before dispatching the refresh
   event, so any Domain settings save that changes a tenant's expiry is reflected immediately.
5. **`src/pages/autorenew/AutoRenewPage.jsx`** — `confirmApproveRow()` now calls
   `notifySessionRefreshRequested()` after a successful approval, for the same reason.

## Why this shouldn't recur
Expiration display now has exactly one computation path
(`buildSidebarExpirationFields(expirationDate)`) used everywhere, and exactly one data source
for `expirationDate` per tenant (tenant-accessible cache, with the session payload's own
`expiration_date` as a same-tenant fallback). No code path trusts server-provided hint/status
fields that don't exist on the backend DTO. Any future flow that changes a tenant's expiry
should call `notifySessionRefreshRequested()` (or at minimum `clearOwnerCompaniesCache()`) so
the cache doesn't go stale.

## Files changed
- `src/components/AuthenticatedLayout.jsx`
- `src/translateFile/shell/dashboardTranslate.js`
- `src/utils/company/companySessionEvents.js`
- `src/pages/autorenew/AutoRenewPage.jsx`

## Backend
No backend changes required — `/auth/current-user` and `/auth/tenant-accessible` already
return correct `expiration_date` values; the bug was frontend-only (wrong field trust +
missing cache invalidation).

---
---

# 原文 B：`sidebar-group-boot-expiration-fix.md`（2026-09-09）
## Sidebar "Exp:" showing "-" on cold load (Group mode AND Company mode)

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
