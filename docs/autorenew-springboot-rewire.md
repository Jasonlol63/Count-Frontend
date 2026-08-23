# Auto Renew 页面 — 接回 Spring Boot API

> **范围**：`src/pages/autorenew/`（`autoRenewLogic.js` / `autoRenewTenantSettings.js`）+
> `src/utils/autoRenew/autoRenewPendingSync.js` + `src/pages/autorenew/AutoRenewPage.jsx`（Approve
> 提交参数）。**没有改动任何后端代码** —— 所需的 `/api/auto-renew/*` 端点已存在
> （`AutoRenewController`），Comm 设置弹窗复用的是 Domain 迁移（见
> `domain-springboot-rewire.md`）时已经接好的 `domainApi.js`。
> **最后更新**：2026-08-24

---

## 1. 修复总览

| 能力 | 旧 PHP 端点 | 新 Spring 端点 | 改动文件 |
|------|-------------|-----------------|----------|
| 列表 / 统计 / pending 数 | `POST api/subscription/auto_renew_api.php`（`action:list`） | `fetchAutoRenewApprovals()` → `POST /api/auto-renew/list` | `autoRenewLogic.js` |
| 拒绝续费 | `POST auto_renew_api.php`（`action:reject`） | `rejectAutoRenew()` → `POST /api/auto-renew/reject` | `autoRenewLogic.js` |
| 通过续费 | `POST auto_renew_api.php`（`action:approve`，带 `from_account_id`/`to_account_id`） | `approveAutoRenew()` → `POST /api/auto-renew/approve`，**只传 `request_id` + `period`**（后端自己按 C168 账户解析 from/to，见下方"字段校验"） | `autoRenewLogic.js`, `AutoRenewPage.jsx` |
| 侧边栏 pending 徽章轮询 | `POST auto_renew_api.php`（`action:pending_count`） | 直接 `POST /api/auto-renew/list`（`action:pending_count`），不再经旧 rewrite 表 | `autoRenewPendingSync.js` |
| Comm 设置弹窗：打开时加载 group/company 详情 | `POST api/domain/domain_api.php`（`get_groups`/`get_companies`） | `fetchDomainList(ownerId)` → `POST /api/domain/list?ownerId=`，从聚合返回的 `groups_full`/`companies_full` 里按 code 匹配 | `autoRenewTenantSettings.js` |
| Comm 设置弹窗：Price 预览 | `POST domain_api.php`（`get_domain_fee_settings`） | `fetchDomainFeeSettings()` → `POST /api/domain/list-fee` | `autoRenewTenantSettings.js` |
| Comm 设置弹窗：保存 Share % | 已经是 Spring（Domain 迁移时接好） | `updateTenantSetting()` → `PUT /api/domain/update-setting`（`commissionOnly` 模式） | 未改动（`CompanySettingsModal.jsx`/`GroupSettingsModal.jsx`） |

---

## 2. 字段校验 / tenant 解析都交给后端

- **列表/审批的 tenant 归属**：`request_id`、`period` 以外不再由前端拼装校验逻辑；能否
  Approve（`canApproveRow`）仍由前端做 UI 层的按钮禁用判断（period 是否选、
  `default_from_account_id`/`default_to_account_id` 是否存在、价格是否 > 0），但这只是禁用态展示，
  真正的账户解析、金额计算、写账都在 `AutoRenewServiceImpl.approveRequest` 里用后端当前数据重新算一遍
  ——前端算错也不会污染数据，最多是按钮该亮没亮。
- **Comm 设置弹窗的 tenant 归属**：`ownerId` 现在是从 `fetchDomainList(ownerId)` 的查询参数传入，由
  Spring 按登录态 + `ownerId` 过滤返回该 owner 名下的 tenant，前端不再自己拼 `owner_id` 去 PHP 查询
  过滤；`code` 匹配（group_code / company_id）只是在返回结果里定位具体那一行，不构成校验。
- **保存 Share %**：`updateTenantSetting()` 提交时带 `id`（真实 tenant id，来自 `fetchDomainList`
  聚合行），后端按 `id` 定位 tenant、校验 owner 归属，不接受前端自报的 owner/tenant 关系。

---

## 3. 已知缺口：Delete / Save Draft 没有 Spring 端点

查过后端源码（`Count/backend/.../controller/AutoRenewController.java` +
`service/AutoRenewService.java`），目前只有：

```
POST /api/auto-renew/list
POST /api/auto-renew/reject
POST /api/auto-renew/approve
```

**没有 `/delete` 也没有 `/save_draft`**。这两个动作（列表里"删除/撤销已处理记录"按钮、以及从未在 UI
上实际调用过的草稿保存）本次**保留调用旧的 `api/subscription/auto_renew_api.php`**（`autoRenewLogic.js`
里的 `postAutoRenewLegacy`），在当前环境本来就是不通的——`utils/core/apiUrl.js` 里遗留的 rewrite 规则
会把它错误地转发到 `/api/auto-renew/list`，不是本次改动引入的新问题，只是没有把它伪装成"已迁移"。

**要让 Delete 生效，需要后端补一个 `/api/auto-renew/delete` 接口**（对齐
`Count/docs/frontend-springboot-migration.md` §7.4/§11.5 记录的缺口：Delete/回滚还没接 Spring
approve 写入的多笔 Domain Fee 行）。

---

## 4. 验证清单

- 前端 `npm run build` 通过（无 import/语法错误，已确认）。
- 待人工验证（需要本地 Spring Boot + 前端都在跑，且有 C168 运营测试账号）：
  1. 列表加载（Pending/Approved/Rejected/All 四个 tab，Company/Group 两个页签），Network 面板只看到
     `POST /api/auto-renew/list`，无 `.php`。
  2. Approve：选 period → 提交，Network 看到 `POST /api/auto-renew/approve`（body 只有
     `request_id`/`period`），到期日与记账结果符合预期。
  3. Reject。
  4. Comm 设置弹窗：打开加载、Share % 保存。
  5. 侧边栏 pending 徽章数字与列表页 tab 计数一致。
  6. （已知会失败，非本次引入）Delete/撤销按钮——确认失败提示，不是本次改动的回归。

---

## 5. 备份

同一份记录已复制到后端仓库 `Count/docs/autorenew-springboot-rewire.md`，并在
`Count/docs/frontend-springboot-migration.md` §4.7 更新了状态。
