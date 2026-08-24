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

## 3. Delete / Save Draft（2026-08-24 追加更新：§3.1 的 Delete 结论已被推翻，见下）

> **本节 §3.1 原先的结论已过时，被同日晚些时候的另一轮改动推翻。** 保留下面的历史记录是为了让人理解
> 当时为什么会做出"两个都删掉"的判断，但实际执行只清掉了 `save_draft`；`delete` 后来被重新评估为
> **真实需要的功能**，并补齐了完整的 Spring 实现（见 §3.2）。

查过后端源码（`Count/backend/.../controller/AutoRenewController.java` +
`service/AutoRenewService.java`），当初只有：

```
POST /api/auto-renew/list
POST /api/auto-renew/reject
POST /api/auto-renew/approve
```

**没有 `/delete` 也没有 `/save_draft`**。这两个动作（列表里"删除/撤销已处理记录"按钮、以及从未在 UI
上实际调用过的草稿保存）当时**保留调用旧的 `api/subscription/auto_renew_api.php`**（`autoRenewLogic.js`
里的 `postAutoRenewLegacy`），在当前环境本来就是不通的——`utils/core/apiUrl.js` 里遗留的 rewrite 规则
会把它错误地转发到 `/api/auto-renew/list`，不是这轮改动引入的新问题，只是没有把它伪装成"已迁移"。

### 3.1（历史记录，已被 §3.2 推翻）原定案：两者都不迁移到 Spring，直接清掉

`count168test`（旧版 PHP 全码库）里追过来源后确认：

- **`save_draft`**：`api/includes/auto_renew.php` 的 `auto_renew_save_draft()` 有实现，旧版前端
  `autoRenewLogic.js` 也导出了 `saveAutoRenewDraft()` 封装它——但**全仓库（网页版 + `c168_mobile`）没有
  任何 UI 调用过这个函数**，纯粹是当年写好了却没接上任何按钮的死代码。页面上看起来像"草稿"的那部分
  交互（选 period / from-account / to-account）其实是 `AutoRenewPage.jsx` 里的 `rowDrafts`
  纯前端 `useState`，切 tab、刷新列表就会被清空，从来没有打这个 API 持久化过。**结论仍然有效：不用
  补 Spring 端点，前端这段死代码直接删。**（已执行，见 §3.2）
- ~~**`delete`**：因为 `apiUrl.js` 的 rewrite 规则把请求错误转发到 `/api/auto-renew/list`，按钮当时
  已经打不到旧 PHP 后端，判断为"没有被判定为要继续支持"，倾向直接删掉调用代码。~~
  **此结论被推翻**：Delete 是真实需要的业务功能——approved 记录要能回滚 chargeDomainFee 写入的
  transaction 并把到期日还原到审批前的快照，rejected 记录要能打回 pending 重新审批。已经在后端补齐
  完整实现，不再是"已经坏掉不用管"的状态。

### 3.2 已执行（2026-08-24 追加）

- **`save_draft`**：确认删除。`autoRenewLogic.js` 里的 `saveAutoRenewDraft()`、`postAutoRenewLegacy()`
  两个函数已删除（`postAutoRenewLegacy` 唯一的调用方就是 `saveAutoRenewDraft`，一并清掉）。
  `AutoRenewMapper.xml` 里对应的孤儿 `saveDraft`（从未在 `AutoRenewDao.java` 里声明过，没人调用）
  也一并删除。`apiUrl.js` 里 `api/subscription/auto_renew_api.php` → `api/auto-renew/list` 的
  rewrite 规则确认没有任何调用方后一并删除。`rowDrafts` 前端草稿 state（Approve 前的临时选值）
  跟 save_draft 无关，未受影响。
- **`delete`**：**没有删除**，反而补齐了完整的 Spring 实现（新增 `POST /api/auto-renew/delete`）：
  - 新增 `tenant_auto_renew_request_transaction` 关联表，记录 approve 时 `chargeDomainFee` 生成的
    每一条 transaction（一次 approve 可能产生多条：付款 + 佣金分成 + 净利润），供 delete 时精确删除，
    不用像旧版 PHP 那样靠日期/描述启发式反查。
  - `AutoRenewServiceImpl.deleteRequest(requestId)`：`approved` 分支删关联 transaction + 校验到期日
    未被后续操作覆盖 + 还原到 `expiration_snapshot` + 状态打回 `pending`；`rejected` 分支只需要把状态
    打回 `pending`（reject 从没动过 transaction/到期日）。
  - `autoRenewLogic.js` 的 `deleteAutoRenew()` 改打 `POST /api/auto-renew/delete`，不再依赖那条
    已删除的 legacy rewrite 规则。
  - 详见后端仓库对应改动（`AutoRenewController.java`/`AutoRenewServiceImpl.java`/
    `AutoRenewMapper.xml`/`schema.sql`/`migrate_auto_renew_delete.sql`）。

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
  6. （2026-08-24 追加）Delete/撤销按钮——Network 面板应看到 `POST /api/auto-renew/delete`：
     approved 行点击后 transaction 被删、到期日还原、状态回到 pending；rejected 行点击后状态直接
     回到 pending。

---

## 5. 备份

> 2026-08-24 追加：本文档提到"已复制到 `Count/docs/autorenew-springboot-rewire.md`"，但该路径
> 实际不存在，此前的备份步骤未真正执行，仅记录于此以免误导。`Count/docs/frontend-springboot-migration.md`
> §7（Auto Renew 页面）保留最新状态，Delete 相关的缺口记录（原 §7.4）已随本次改动更新。
