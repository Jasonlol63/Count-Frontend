# Transaction 页 — 接线 / port 记录

> **本文档由 2 份合并而成**（2026-09-22）。
>
> | 顺序 | 来源文档 | 定位 |
> |---|---|---|
> | 1 | `transaction-contra-inbox-approval.md` | 功能接线 —— Contra Inbox 审批流程的前端部分（后端见 `Count/docs/` 同名文件） |
> | 2 | `transaction-legacy-frontend-port-20260905.md` | port 记录（2026-09-05）—— 从 legacy PHP 前端搬过来的纯前端 UI/计算/文案修复 |
>
> **不在本文档内的 Transaction 相关文档**（各自独立，因为它们是被代码引用的现行契约/行为说明）：
> - `transaction-rate-springboot-submit.md` —— RATE 提交 → Spring 的字段映射（**现行契约**）
> - `transaction-today-zero-balance-autoshow.md` —— 交易列表自动展示今日 0.00 余额行

---
---

# 1. Transaction：Contra Inbox 审批流程 — 前端接线
## Transaction：Contra Inbox 审批流程 — 前端接线

后端设计/实现细节见 `Count` 仓库的
[`docs/transaction-contra-inbox-approval.md`](../../Count/docs/transaction-contra-inbox-approval.md)。
这份文档只记录**前端**部分。

### 背景

Contra Inbox 的 UI 壳子（badge、popover、approve/reject 按钮、reject 确认弹窗）和状态机
（`useTransactionUI.js` 的 `contraInbox` state、`approveContraMutation`/`rejectContraMutation`）
早就搭好了，只是 `transactionApi.js` 里对应的三个函数是写死的 stub：

```js
export async function loadContraInbox() {
  return { success: true, data: [] };
}
export async function approveContra() {
  return { success: false, message: "Contra approval is not available", data: null };
}
export async function rejectContra() {
  return { success: false, message: "Contra rejection is not available", data: null };
}
```

`useTransactionForm.js` 里甚至已经写好了提交后 PENDING 分支的 toast 逻辑
（`m.submittedWaitingApproval`、跳过 focus 刷新），只是驱动它的 `approval_status` 字段被
`normalizeSpringSubmitResponse` 写死成了 `"APPROVED"`。这次改动就是把这几处 stub/写死值换成真实
后端调用，UI 和状态机本身**没有改动**。

### 改动 1：提交响应的 approval_status 改成读真实值

[`transactionSubmitNormalize.js`](../src/pages/transaction/lib/transactionSubmitNormalize.js)：

```diff
- approval_status: "APPROVED",
+ approval_status: String(d.approvalStatus || "APPROVED").toUpperCase(),
```

`d.approvalStatus` 是后端 `TransactionSubmitDTO.approvalStatus`（新增字段，见后端文档），提交
成功后会带上这次提交的最终状态（`APPROVED`/`PENDING`）。这一步不改的话，即使后端已经把交易判成
PENDING，前端也永远显示"直接生效"，`useTransactionForm.js` 里现成的 PENDING toast 逻辑永远不会
触发。

### 改动 2：三个 Contra Inbox API 函数接上真实端点

[`transactionApi.js`](../src/pages/transaction/lib/transactionApi.js)：

```
loadContraInbox({ companyId, groupId, signal }) → POST api/pending   {tenantId}
approveContra({ transactionId, companyId, groupId })  → POST api/approved  {tenantId, id}
rejectContra({ transactionId, companyId, groupId })   → POST api/rejected  {tenantId, id}
```

新增一个 `normalizeContraInboxRow(row)` 辅助函数，把后端 `TransactionContraInboxDTO` 的
camelCase 字段（`id`/`transactionType`/`transactionDate`/`toAccountCode`/`fromAccountCode`/
`currencyCode`/`createdBy`）转成 `TransactionHeader.jsx` 现成渲染逻辑读取的旧 snake_case 字段名
（`transaction_id`/`from_account_code`/`to_account_code`/`currency`/`submitted_by`/
`created_by`）——这个映射是对着 `TransactionHeader.jsx` 里实际的 `it.xxx` 读取逐个核对过的，不是
猜的。

**遵循"字段校验全部跟着后端走"**：这三个函数只做两件事——① 用现成的
`resolveTransactionSpringTenantId` 拼出 `tenantId`（这是构造请求的必需项，不是业务规则）；② 把
后端返回的 `message` 原样透传给 toast。没有在前端复刻任何角色/日期之类的业务判断——那些全部由
后端的 `AccessControlUtils`/`TransactionContraInboxServiceImpl` 负责，前端只负责显示结果。

### 已知限制（后端范围尚未覆盖，前端暂时也就没法做）

- **不支持跨公司分组聚合**：`loadContraInbox` 的 query key 里其实带了 `viewGroup`/`groupId`/
  `groupAggregate`（跟 Search/History 页一致的形状），但目前只把 `companyId`/`groupId` 解析成
  单一 `tenantId` 传给后端（跟 `getHistory`/`submitTransaction` 用的是同一个
  `resolveTransactionSpringTenantId`），后端 `listPending` 也只支持单租户查询——效果上 Contra
  Inbox 目前只会显示当前选中公司自己的待审批交易，看不到"整个 Group 汇总"的视图。
- **没有日期/币种筛选**：后端 `findPendingRows` 直接返回该租户全部 PENDING 行，前端也没有额外
  加筛选 UI。

### 涉及文件

- `src/pages/transaction/lib/transactionSubmitNormalize.js` —— `approval_status` 改读真实值。
- `src/pages/transaction/lib/transactionApi.js` —— `loadContraInbox`/`approveContra`/
  `rejectContra` 接上真实端点，新增 `normalizeContraInboxRow`。

以下文件本次**没有改动**，只是确认过它们已经是完整可用的，列出来方便日后排查：

- `src/pages/transaction/hooks/useTransactionForm.js` —— 提交后的 PENDING/APPROVED 分支 toast。
- `src/pages/transaction/hooks/useTransactionUI.js` —— `contraInbox` state、approve/reject
  mutation、`refreshContraInboxBadge`。
- `src/pages/transaction/components/TransactionHeader.jsx` —— badge/popover UI、reject 确认弹窗。
- `src/pages/transaction/TransactionPaymentPage.jsx` —— `canApproveContra`
  （`["manager","admin","owner"]`，跟后端 `AccessControlUtils.isManualTransactionApprovalExempt`
  的角色集合一致）、把 `ui.onApproveContra`/`ui.onRejectContra` 包装成 `TransactionHeader` 期待
  的单参数调用形式。

---
---

# 2. Port 自 legacy PHP 前端的 UI/UX 修复（2026-09-05）
## Port 自 legacy PHP 前端的 UI/UX 修复（2026-09-05）

> 来源：`count168test`（legacy PHP 版 React 前端，路径见项目外 `../count168test`）9/2–9/4 期间的一批
> 优化，接续上一次 `port(bank-process): sync UI/perf fixes from legacy PHP frontend`（commit `0e12b43`，
> 见 `docs/bankprocess-list-ui-optimizations.md`）之后未 port 的部分。
>
> 范围限定：只 port **legacy 那边跟 Spring Boot 后端无关的纯前端 UI/计算/文案修复**。legacy 仓库同期还有
> 若干 PHP 后端 API 改动（`api/processes/process_accounting_inbox_api.php`、
> `api/transactions/resend_accounting_due_api.php`、`api/transactions/history_api.php`）和一批
> `c168_mobile/` 独立移动端 UI 大改（`0.5 mobile UI overhaul`）——这两类都不在本次范围内：前者是
> legacy 自己的 PHP 后端，跟 Spring 后端无关；后者是独立的 mobile app，Count-frontend 没有对应产物。
> RATE 计算/文案的两处修复见 [`transaction-rate-springboot-submit.md`](transaction-rate-springboot-submit.md) §5.1
> （因为它跟 Spring 提交映射是同一份文件、同一个上下文，写在那边更合适）。

### 1. Transaction 页 Capture Date 选择器：SPA 路由直达时可能永久失效

**文件**：`src/pages/transaction/hooks/useTransactionDateRange.js`

**问题**：`#calendar-popup` 存在 unconditional 渲染，但触发按钮所在的 `TransactionSearchSection`（`#date-range-picker`
元素）被 `surfaceReady`（等 GC package 数据）挡住，挂载比 `#calendar-popup` 晚。原来的 init 逻辑是一次性
`async` IIFE，如果调用时机撞上这个挂载竞态（尤其是登录后首次 SPA 路由直达本页，`AuthenticatedLayout`/
`AnimatedOutlet` 还没 resolve 完），`init()` 会直接静默放弃，且没有任何后续重试——用户只能手动刷新页面
才能修好 Capture Date。

**修复**：把一次性 IIFE 改成 `tryInit()` 函数 + `MutationObserver` 兜底：
- `tryInit()` 现在多检查一个 `#date-range-picker` 是否已经挂载（不仅仅是 `#calendar-popup`）。
- 首次调用失败时，用 `MutationObserver` 监听 `document.body` 的子树变化，元素出现后自动重试一次
  `tryInit()`，成功后立即断开 observer；组件卸载时也会断开，避免泄漏。

### 2. Payment History PDF 导出：中文字体发灰/变细

**文件**：`src/pages/transaction/lib/paymentHistoryMemberReportExport.js`

**问题一（发灰）**：所有正文/表尾文字颜色用的是 `[15, 23, 42]`（深蓝灰），中文字符渲染出来比英文明显灰、
对比度不够——统一改成纯黑 `[0, 0, 0]`（`styles.textColor`、`footStyles.textColor`，以及 Description/
Remark/金额列等各处内联覆写）。

**问题二（变细/发虚）**：中文字体（`NotoSansCJKsc-VF.ttf`，可变字体）只嵌入了一份 Regular master 就同时
注册成 `"normal"` 和 `"bold"` 两个 style——但 jsPDF 的字体嵌入只认经典 TrueType 大纲（glyf/loca），不支持
可变字体的 `fvar`/`wght` 轴，所以请求 "bold" 时永远只会拿到同一份 Regular 的细字形，跟旁边真正加粗的英文
放在一起显得又灰又细。

**修复**：额外加载一份真正的静态 Bold TrueType 字重（`NotoSansSC-Bold.ttf`，Google Fonts 提供，同一
Noto Sans SC 字源切出来的 Weight 700 版本），单独注册为该字体族的 `"bold"` style：
- 新增 `PDF_CJK_BOLD_FONT_FILE` / `PDF_CJK_BOLD_FONT_URLS` 常量、`pdfCjkBoldFontBase64Promise` 缓存。
- `fetchPdfCjkFontBase64()` 泛化重命名为 `fetchPdfFontBase64(urls)`（现在两种字体共用同一个抓取函数）。
- 新增 `addFontToVfsOnce(doc, file, base64)` 去重 `addFileToVFS` 调用。
- `ensurePdfExportFont()`：Regular 字体加载失败直接 fail（跟以前一样）；Bold 字体加载失败则 **降级**回退到
  用 Regular 文件注册 "bold" style（还是细，但导出不会因为网络问题整个失败）。
- 因为现在有真 Bold 字形了，之前为了"避免合成加粗显灰"而对 CJK 单元格降级成 `fontStyle: "normal"` 的
  临时处理（`isCjkCell ? "normal" : "bold"`）全部撤掉，中文/非中文单元格统一用 `"bold"`。

### 3. 涉及文件

- `src/pages/transaction/hooks/useTransactionDateRange.js`
- `src/pages/transaction/lib/paymentHistoryMemberReportExport.js`
- （RATE 计算/文案两处修复见 `transaction-rate-springboot-submit.md` §5.1，涉及
  `src/pages/transaction/lib/transactionSubmitHelpers.js`）

### 4. 未 port 的部分（记录原因，避免以后重复调查）

| Legacy commit | 内容 | 不 port 的原因 |
|---|---|---|
| `ef11ffc1a` | `process_accounting_inbox_api.php`：过期 active 合约继续计费 | legacy PHP 后端逻辑，跟 Spring 后端无关 |
| `c6a75c17c` | `resend_accounting_due_api.php`：resend 报错 | 同上 |
| `a1d5da2a7` / `1f28b6801`(部分) / `7fe7cb6d7` | `history_api.php`：middle man desc 反复改了又撤回，最终净效果=无变化 | 同上，且净 diff 为 0 |
| `a8957ccf7` | `BankProcessTable.jsx`：Day End 未填时用合约期限推算隐含到期日 | **Count-frontend 已经有**（上一次 `4daeca6` port 已覆盖同一段 `getContractStateClass`/`renderBankContract` 逻辑），逐行核对过一致，无需改动 |
| `e76567a33` 及其相关 merge | `0.5 mobile UI overhaul` | 完全在 `c168_mobile/` 独立移动端 app 里，Count-frontend 没有对应的 mobile 产物 |
