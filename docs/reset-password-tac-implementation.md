# Reset Password（Admin/User）— 接回 Spring Boot API + UI 优化

> **范围**：`src/pages/login/resetPassword.js` + `ResetPasswordPage.jsx` +
> `src/translateFile/auth/authTranslate.js` + `public/css/reset-password.css`。**没有新建前端
> 端点** —— Spring 端所需的 `POST /auth/send-reset-tac` / `POST /auth/reset-password` 本次同步
> 在后端从零实现（见 `Count/docs/reset-password-tac-implementation.md`），`authApi.js` 里对应的
> `sendResetTacRequest()` / `resetPasswordRequest()` 之前就已经封装好，只是没人调用。
> **最后更新**：2026-08-27

---

## 1. 起因

`resetPassword.js` 原本调用的是 `POST /api/users/send_reset_tac_api.php` /
`POST /api/users/reset_password_api.php`，这两个 PHP 文件在仓库里已经找不到了——等于这个页面在打一
个不存在的后端。`authApi.js` 里其实已经有写好的 `sendResetTacRequest()` / `resetPasswordRequest()`
打 `/auth/send-reset-tac` / `/auth/reset-password`，只是 `ResetPasswordPage.jsx` 从来没有接上。

---

## 2. 接线改动

| 文件 | 改动 |
|------|------|
| [`resetPassword.js`](../src/pages/login/resetPassword.js) | 整个文件改成薄封装，直接转调 `authApi.sendResetTacRequest()` / `authApi.resetPasswordRequest()`，不再自己 `fetch()` |
| [`ResetPasswordPage.jsx`](../src/pages/login/ResetPasswordPage.jsx) | 表单字段 `companyId` 改名 `tenantCode`（对齐后端 `tenant_code` 参数命名）；提交成功后的登出改用 `authApi.logoutSession()`，不再直连 `api/session/logout_api.php` |
| [`authTranslate.js`](../src/translateFile/auth/authTranslate.js) | `AUTH_API_MESSAGES` 补齐后端新消息的中英对照（`Verification code is invalid or expired`、`Account not found`、冷却提示的动态秒数正则匹配等） |

后端消息统一用 `localizeAuthApiMessage(data.message, lang)` 翻译后再展示，跟登录页 /
`SecondaryPasswordPage.jsx` 的既有模式保持一致。

---

## 3. TAC 发送的 UI 行为

**发送成功/失败都不再弹 `AlertModal`**，改成 TAC 输入框下方的一行内嵌提示（`tac-notice`）：

- 成功：浅绿底 + 绿色边框（`.tac-notice--success`）
- 失败（含后端冷却锁触发的 `BusinessException`）：浅红底 + 红色边框（`.tac-notice--error`）

SEND 按钮加了**客户端 60 秒倒计时锁**（`tacCooldown` state，`setInterval` 每秒 -1），跟后端 Redis
里的 60 秒冷却锁（`Count/docs/reset-password-tac-implementation.md` 第 3 节）对齐，双重防抖：

- 成功发送后按钮变成 `Resend in 56s` / `56 秒后重新发送`，`disabled` 直到倒计时归零
- **修改 tenant_code 或 email 会立刻重置倒计时和提示**（`useEffect` 监听这两个字段）——因为后端冷却
  锁是按 `tenantCode+email` 这一对 key 算的，用户改邮箱后旧的客户端倒计时就该失效，否则会出现"明明
  换了邮箱却还显示禁用"的假状态

样式定义在 [`reset-password.css`](../public/css/reset-password.css)（`.tac-notice` /
`.tac-notice--success` / `.tac-notice--error`）。UI 美化上刻意保持简单——曾经加过图标 + 边框动画的
更"重"的版本，反馈是不如简单的纯色底框好看，已经改回。

---

## 4. 安全相关的 UI 细节

- `send-reset-tac` 成功响应文案固定是"如果该账号存在，验证码已发送"（不管账号是否真的存在），
  前端**原样展示这句话**，不额外拼接"账号已找到"之类的提示——后端刻意不回显账号是否存在，前端也不能
  绕过去自己推断。
- 原本 PHP 版本会在开发模式下把生成的 TAC 直接塞进响应体（`data.tac`）方便本地测试，Spring 版本
  **不再回传明文 TAC**，前端也已经移除了 `if (data.tac) {...}` 那段回显逻辑。

---

## 5. 讨论过但没做的方案：TAC 验证通过才显示密码框

讨论过是否要把 New Password / Confirm Password 两个字段做成"TAC 验证成功之后才出现"的分步表单，
结论是**维持现状（一次性填完，一次提交）**：

- 现在验证 TAC 和改密码是后端同一次 `resetPassword` 调用里原子完成的（见后端文档第 5 节），要做
  分步 UI 就得再加一个"只验证不消费"的接口，多一次网络往返
- 会引入一个尴尬的时间窗口：验证通过、密码框弹出来，用户填了几分钟密码，真正提交时 TAC 可能已经
  过期，需要额外处理"验证过但提交时又失败"的边界情况
- 安全性没有实质提升，纯粹是分步引导的 UX 偏好，优先级低于其他待办

如果之后要做，需要先在后端加一个 verify-only 的端点（不删 Redis key，只读不消费）。

---

## 6. 已知缺口

- Owner 登录那一侧的 Reset Password 尚未实现（`companyPlaceholder` 文案里保留了"或业主代码"的
  措辞，但目前后端只支持 admin/user，owner 走这个页面会查不到账号，回的是同一句"如果账号存在…"，
  不会报错但也不会真的发信）
- 未做端到端人工测试（需要本地 Spring Boot + MySQL + Redis + 真实/假 SMTP 都在跑）：走一遍
  「输入邮箱 → 收验证码 → 改密码 → 用新密码登录」

---

## 7. 参考文件

- [`resetPassword.js`](../src/pages/login/resetPassword.js)
- [`ResetPasswordPage.jsx`](../src/pages/login/ResetPasswordPage.jsx)
- [`authApi.js`](../src/utils/auth/authApi.js)（`sendResetTacRequest` / `resetPasswordRequest` 本身未改动）
- [`authTranslate.js`](../src/translateFile/auth/authTranslate.js)
- [`reset-password.css`](../public/css/reset-password.css)
- 后端对应文档：`Count/docs/reset-password-tac-implementation.md`
