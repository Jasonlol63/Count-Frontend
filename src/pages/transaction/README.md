# Transaction payment page (React)

Route: `/transaction` (see `App.jsx`). Entry: `TransactionPaymentPage.jsx`.

## Where to change what

| Task | Location |
|------|----------|
| Page shell, hook wiring, body classes | `TransactionPaymentPage.jsx` |
| Company/category filters, date range, search UI | `components/TransactionSearchSection.jsx` |
| Add payment / rate / contra form | `components/TransactionAddSection.jsx` |
| Main grid + summary tables | `components/TransactionTablesSection.jsx` |
| Header totals & company switcher | `components/TransactionHeader.jsx` |
| Payment history modal | `components/TransactionHistoryModal.jsx` |
| Account dropdown (from/to) | `components/AccountSelect.jsx` |
| Permissions, categories, accounts, currencies | `hooks/useTransactionData.js` |
| List search, filters, grid state | `hooks/useTransactionSearch.js` |
| Right-side type search | `POST /api/transaction/search` + `runTypeSearch` in `useTransactionSearch.js` |
| Submit payment / rate / invalidate cache | `hooks/useTransactionForm.js` |
| Toast, history query, contra inbox | `hooks/useTransactionUI.js` |
| Date range picker init | `hooks/useTransactionDateRange.js` |
| First-load defaults (dates, currency selection) | `hooks/useTransactionInitialization.js` |
| Cross-tab / localStorage list refresh | `hooks/useTransactionSync.js` |
| Cross-device live sync (SSE) | `lib/transactionRealtime.js` + `deploy/TX_REALTIME.md` |
| PHP API calls + React Query keys | `lib/transactionApi.js` (Spring `/api/transaction/*` + account/currency meta) |
| Money/rate/date formatting (legacy-aligned) | `lib/transactionFormat.js` |
| Grid filters, totals, session keys, W/L logic | `lib/transactionPaymentLogic.js` |
| Submit payload builders | `lib/transactionSubmitHelpers.js` |
| Excel copy with table styles | `lib/transactionExcelCopy.js` |
| Page constants, DMY parse, script loader | `lib/transactionPaymentPageUtils.js` |

## Transaction maintenance

Route: `/transaction-maintenance` — `pages/maintenance/transaction/` (separate from this folder).

## RATE 手动交易逻辑

表单字段 / 即时计算 / description 规则等，仍以 legacy PHP 参考文档为准（不在本仓库内，见
`count168test/docs/transaction-rate-manual-logic.md`、`transaction-rate-service-platform-fee.md`）。

**提交到 Spring Boot 这一段**（payload 映射、leg1/leg2、Middle-Man/Rate-Mul/Platform Fee 字段对齐）：

- [`docs/transaction-rate-springboot-submit.md`](../../../docs/transaction-rate-springboot-submit.md)

## Payment History 表格 WIN/LOSS、CR/DR 列 0.00 显示规则（2026-08-26 撤回误改）

`formatPaymentHistoryMoneyHalfUp`（`lib/transactionFormat.js`，供 `TransactionHistoryTable.jsx` 的
WIN/LOSS、CR/DR 两列用）0.00 一律显示 `"-"`，不显示数字。2026-08-25 commit `eb3f4af` 曾把这条规则改成
"真实交易金额为 0 仍显示 0.00，只有 `"-"`（如 OPENING BALANCE）才继续显示 `-`"，但这个改动是错的，已经
撤回。Balance 列（`formatHistoryBalanceMoney`）和 Transaction 主表格（`formatTransactionGridMoneyHalfUp`）
不受影响，两者本来就是 0.00 显示数字，这次没有改动它们。Export PDF 用的是另一个函数
（`memberPageHelpers.formatPaymentHistoryMoney`），从头到尾没受那次误改影响，一直是 0.00 → `-`。

## 当日 0.00 balance 自动显示

Capture Date 为「今天」单日时，balance=0.00 但当日有 Cr/Dr 或 Win/Loss 动账的账户（如轧平的
CONTRA）在默认视图（不勾任何筛选）下也会自动显示；其他日期/历史数据不受影响，仍需手动勾
「Show all 0 balance」查看。纯前端展示层改动，后端/API 无需改动：

- [`docs/transaction-today-zero-balance-autoshow.md`](../../../docs/transaction-today-zero-balance-autoshow.md)

## Payment History Export PDF — 三处修复（2026-08-26）

Export PDF 功能先后修了三个问题，详见后端仓库 `Count/docs/frontend-springboot-migration.md` 第 35 节、
`Count/docs/known-issues-transaction.md` 第 2 项：

1. **币别选单空白**（"No currencies available for this account"）—— Group 账本账号（无 `companyId`，
   只有 `groupId`）打开弹窗时，`fetchPaymentHistoryExportCurrencies` 未使用 `groupId` 解析 tenantId。
2. **选好币别点 Export PDF 报错**（"Account or company is missing"）—— 同样是 Group 账本场景，
   `fetchMemberReportHistory` 也只看 `companyId`，忽略了 `groupId`。
   以上两处都已改用 `resolveTransactionSpringTenantId({ companyId, groupId })`（从 `lib/transactionApi.js`
   导出），与本来就正常的 `getHistory()` 对齐同一套解析逻辑。
3. **Id Product 列空白**（仅 Data Capture Summary 提交的行，手动交易正常）—— 与 tenantId 无关，是导出
   渲染层 `productCell()` 按 `is_bank_process_transaction` 分支取值，Summary 提交的行该标志位为 true 但
   没有 `card_owner` 值。已改成跟浏览器表格一致的顺序：`row?.product || row?.card_owner || "-"`。

## Styles & i18n

- CSS: `frontend/public/css/transaction.css`, `report-outlined-fields.css`, `userlist.css`
- Translations: `frontend/src/translateFile/pages/transactionTranslate.js`
- Legacy reference: `js/transaction.js`
