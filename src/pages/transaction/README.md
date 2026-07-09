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
| Submit payment / rate / invalidate cache | `hooks/useTransactionForm.js` |
| Toast, history query, contra inbox | `hooks/useTransactionUI.js` |
| Date range picker init | `hooks/useTransactionDateRange.js` |
| First-load defaults (dates, currency selection) | `hooks/useTransactionInitialization.js` |
| Cross-tab / localStorage list refresh | `hooks/useTransactionSync.js` |
| PHP API calls + React Query keys | `lib/transactionApi.js` |
| Money/rate/date formatting (legacy-aligned) | `lib/transactionFormat.js` |
| Grid filters, totals, session keys, W/L logic | `lib/transactionPaymentLogic.js` |
| Submit payload builders | `lib/transactionSubmitHelpers.js` |
| Excel copy with table styles | `lib/transactionExcelCopy.js` |
| Page constants, DMY parse, script loader | `lib/transactionPaymentPageUtils.js` |

## Transaction maintenance

Route: `/transaction-maintenance` — `pages/maintenance/transaction/` (separate from this folder).

## Styles & i18n

- CSS: `frontend/public/css/transaction.css`, `report-outlined-fields.css`, `userlist.css`
- Translations: `frontend/src/translateFile/pages/transactionTranslate.js`
- Legacy reference: `js/transaction.js`
