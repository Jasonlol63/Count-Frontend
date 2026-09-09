# Domain page — "No Expiry" permanent tenant + NO SET Confirm guard

> **最后更新**：2026-09-09
> **后端配套改动**：`Count/docs/domain-permanent-expiration.md`（哨兵日期常量、角色校验、
> `updateDomain` 的 NO SET 后端拦截都在那边）。

## 背景

Domain 页面里，`NO SET`（`expiration_date` 为 `null`）会禁用 Edit Domain 的 Confirm 按钮，逼员工给
客户设置到期日。但 `AP(1)`、`IG(5)`、`C168` 这类允许永久免期的内部集团/公司也是 `null`，导致连改
Owner 密码/邮箱都被卡住。方案是新增一个 Admin 及以上角色才能选的 "No Expiry" period，写入约定的
哨兵日期 `9999-12-31`（而不是 `null`），这样 UI 上能区分「主动选择永久」和「还没配置」，同时不需要
后端新增字段或接口。

## 改动 1 — 共享的哨兵值 + Period 计算

[`src/pages/domain/domainHelpers.js`](../src/pages/domain/domainHelpers.js)
- 新增 `PERMANENT_EXPIRATION_DATE = "9999-12-31"`（**必须**和后端
  `Tenant.PERMANENT_EXPIRATION_DATE`（`LocalDate.of(9999, 12, 31)` 序列化后的字符串）保持一致）。
- 新增 `NO_EXPIRY_PERIOD_CODE = "no_expiry"`（仅前端本地用的 period 值，不写入
  `renewal_period` 字典表——那张表是 AutoRenew 客户自助续费 + Domain Fee Price 定价共用的，"No
  Expiry" 不是可购买的续费周期，不该出现在那两处）。
- 新增 `isPermanentExpiration(dateValue)`。
- `calculateExpirationDate(period, startDate)` 遇到 `period === "no_expiry"` 直接返回哨兵值，跳过
  日期加减逻辑。

## 改动 2 — Group/Company Settings 弹窗

[`src/pages/domain/components/CompanySettingsModal.jsx`](../src/pages/domain/components/CompanySettingsModal.jsx)
（`GroupSettingsModal.jsx` 只是它的一层包装，Group/Company 共用同一份逻辑）

- 通过 `useOptionalAuthSession()` 读取当前登录角色，`PERMANENT_EXPIRATION_ROLES = new
  Set(["owner", "partnership", "admin"])` 判断是否有权限看到 "No Expiry" 选项。
- Period 下拉里，只有 Admin 及以上角色才会渲染 `<option value="no_expiry">`，位置排在 **7 Days
  前面**（7 Days 平时选得最少，日常最常用的是 1 Year，这样放能降低误触概率）。
- 新增 `formatExpirationDisplay(dateValue)`：等于哨兵值就显示 `t("noExpiry")`（"No Expiry" /
  "无到期"），否则照常 `formatDate(...)`。到期日展示的三处状态（初始 state、`!period` 时的 fallback、
  选中 period 后重算出的值）都统一走这个函数，不会有个别地方漏掉、直接吐出 `31-12-9999` 这种原始
  日期。

此弹窗同时也被 `AutoRenewPage.jsx`（客户自助 Auto Renew 页）复用，但那边永远传
`commissionOnly`，Period 下拉整块 UI 根本不会渲染——所以 "No Expiry" 不会泄漏给客户自助续费页面。

## 改动 3 — Edit Domain 弹窗的 Selected Groups/Companies 列表

[`src/pages/domain/components/DomainFormModal.jsx`](../src/pages/domain/components/DomainFormModal.jsx)

三处到期日展示（Companies 列表 ×2、Groups 列表 ×1）都换成新增的 `formatExpirationDisplay()`，逻辑
同上。`findMissingExpirationDate`（决定 Confirm 是否被 NO SET 拦截的函数）本来就只判断
`null`/空字符串，哨兵值是个真实字符串，天然不会被这条规则拦住，不用改。

## 改动 4 — Sidebar 到期区块

[`src/utils/expiration/expirationReminder.js`](../src/utils/expiration/expirationReminder.js)

`buildSidebarExpirationFields(expirationDate)` 新增哨兵值分支：命中时直接返回
`{ expiration_hint: "No Expiry", expiration_status: "normal", days_until_expiration: null }`，
不会走真实倒计时算法算出几百万天这种荒谬数字。

[`src/components/AuthenticatedLayout.jsx`](../src/components/AuthenticatedLayout.jsx)

`formatSidebarExpirationHint` 加一条 `hint === "No Expiry"` 分支，映射到新增的 i18n key
`i18n.expNoExpiry`。

`resolveExpirationReminder`（到期前 30 天弹窗提醒）没有改也不需要改——哨兵日期算出的 `daysLeft`
是个巨大的数字，`isWithinExpirationReminderWindow` 天然判 false，永久 tenant 不会弹出续费提醒。

## 改动 5 — i18n

- [`src/translateFile/pages/domainTranslate.js`](../src/translateFile/pages/domainTranslate.js)：
  新增 `noExpiry`（en: "No Expiry" / zh: "无到期"），Period 选项和 Domain 表单里的到期日展示都用这
  一个 key。
- [`src/translateFile/shell/dashboardTranslate.js`](../src/translateFile/shell/dashboardTranslate.js)：
  新增 `expNoExpiry`（en: "No Expiry" / zh: "无到期"），供 Sidebar 用。

## 已知的遗留问题（本次未修）

Sidebar 冷启动（刚登录 / 刷新页面）时，`me.expiration_hint` 来自后端 `SessionUser` payload，但后端
目前并不回传这个字段（只回传 `expiration_date`），所以 `formatSidebarExpirationHint` 在 `!hint` 分支
直接返回 `"-"`；只有切换 Group/Company 触发 `buildSidebarExpirationFields` 重新计算后，才会显示真正
的到期文案（包括这次新加的 "No Expiry"）。这是改动前就存在的行为，不是本次改动引入的问题，先不动——
后续如果要修，需要后端在登录/session 接口里补上 `expiration_hint`/`expiration_status`/
`days_until_expiration` 字段。

## 影响文件
- `src/pages/domain/domainHelpers.js`
- `src/pages/domain/components/CompanySettingsModal.jsx`
- `src/pages/domain/components/DomainFormModal.jsx`
- `src/utils/expiration/expirationReminder.js`
- `src/components/AuthenticatedLayout.jsx`
- `src/translateFile/pages/domainTranslate.js`
- `src/translateFile/shell/dashboardTranslate.js`

## 后端
哨兵常量、角色校验、`updateDomain` 的 NO SET 后端拦截见
[`Count/docs/domain-permanent-expiration.md`](../../Count/docs/domain-permanent-expiration.md)。
