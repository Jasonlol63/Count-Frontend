# Transaction：Contra Inbox 审批流程 — 前端接线

后端设计/实现细节见 `Count` 仓库的
[`docs/transaction-contra-inbox-approval.md`](../../Count/docs/transaction-contra-inbox-approval.md)。
这份文档只记录**前端**部分。

## 背景

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

## 改动 1：提交响应的 approval_status 改成读真实值

[`transactionSubmitNormalize.js`](../src/pages/transaction/lib/transactionSubmitNormalize.js)：

```diff
- approval_status: "APPROVED",
+ approval_status: String(d.approvalStatus || "APPROVED").toUpperCase(),
```

`d.approvalStatus` 是后端 `TransactionSubmitDTO.approvalStatus`（新增字段，见后端文档），提交
成功后会带上这次提交的最终状态（`APPROVED`/`PENDING`）。这一步不改的话，即使后端已经把交易判成
PENDING，前端也永远显示"直接生效"，`useTransactionForm.js` 里现成的 PENDING toast 逻辑永远不会
触发。

## 改动 2：三个 Contra Inbox API 函数接上真实端点

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

## 已知限制（后端范围尚未覆盖，前端暂时也就没法做）

- **不支持跨公司分组聚合**：`loadContraInbox` 的 query key 里其实带了 `viewGroup`/`groupId`/
  `groupAggregate`（跟 Search/History 页一致的形状），但目前只把 `companyId`/`groupId` 解析成
  单一 `tenantId` 传给后端（跟 `getHistory`/`submitTransaction` 用的是同一个
  `resolveTransactionSpringTenantId`），后端 `listPending` 也只支持单租户查询——效果上 Contra
  Inbox 目前只会显示当前选中公司自己的待审批交易，看不到"整个 Group 汇总"的视图。
- **没有日期/币种筛选**：后端 `findPendingRows` 直接返回该租户全部 PENDING 行，前端也没有额外
  加筛选 UI。

## 涉及文件

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
