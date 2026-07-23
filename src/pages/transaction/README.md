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
| Right-side type search (all-time transaction rows) | `api/transactions/type_transaction_search_api.php` + `runTypeSearch` in `useTransactionSearch.js` |
| Submit payment / rate / invalidate cache | `hooks/useTransactionForm.js` |
| **Submit → Spring** | `lib/transactionApi.js` → `POST /api/transaction/submit` |
| Spring submit request/response adapter | `lib/transactionSubmitNormalize.js`（PAYMENT / CLAIM / CLEAR / CONTRA / ADJUSTMENT / PROFIT / RATE） |
| Toast, history query, contra inbox | `hooks/useTransactionUI.js` |
| Date range picker init | `hooks/useTransactionDateRange.js` |
| First-load defaults (dates, currency selection) | `hooks/useTransactionInitialization.js` |
| Cross-tab / localStorage list refresh | `hooks/useTransactionSync.js` |
| PHP API calls + React Query keys | `lib/transactionApi.js`（Search/History/Meta → Spring；**PAYMENT/CLAIM/CLEAR/CONTRA/ADJUSTMENT/PROFIT/RATE Submit → Spring**；其余仍 PHP） |
| Money/rate/date formatting (legacy-aligned) | `lib/transactionFormat.js` |
| Grid filters, totals, session keys, W/L logic | `lib/transactionPaymentLogic.js` |
| Submit payload builders | `lib/transactionSubmitHelpers.js`（RATE：`buildRatePayload` → leg1/leg2 + 可选 Middle-Man） |
| Excel copy with table styles | `lib/transactionExcelCopy.js` |
| Page constants, DMY parse, script loader | `lib/transactionPaymentPageUtils.js` |

## Spring submit notes

- **Types**：`PAYMENT` / `CLAIM` / `CLEAR` / `CONTRA` / `ADJUSTMENT` / `PROFIT` / `RATE` → `buildSpringSubmitRequest` in `transactionSubmitNormalize.js`.
- **Legacy field mapping**：`account_id` = To；`from_account_id` = From（ADJUSTMENT 不带 From）。
- **RATE**：两腿字段 `leg1_*` / `leg2_*`。Middle-Man：账户 +（rate multiplier 和/或 fee 第一币）；可只填其一或都填；History 两条 MARKUP（rate 数字 / fee 用 X）。
- **PROFIT**：与转账类型相同方向（From + / To −），走 `win_loss` 乐观更新；不再拆成 WIN/LOSE 再提交。

### Block-comment pitfall (`transactionSubmitNormalize.js`)

在 `/** ... */` 注释里**不要**写含 `*/` 的文本（例如 `leg1*/leg2*`）。`*/` 会提前结束注释，Vite 会报：

`Failed to parse source for import analysis because the content contains invalid JS syntax`

应写成 `leg1_* / leg2_*` 或其它不含 `*/` 的写法。

## Transaction maintenance

Route: `/transaction-maintenance` — `pages/maintenance/transaction/` (separate from this folder).

## Styles & i18n

- CSS: `frontend/public/css/transaction.css`, `report-outlined-fields.css`, `userlist.css`
- Translations: `frontend/src/translateFile/pages/transactionTranslate.js`
- Legacy reference: `js/transaction.js`
