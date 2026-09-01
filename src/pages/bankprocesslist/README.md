# Bank Process list page (React)

Route: `/bank-process-list` (see `App.jsx`). Entry: `BankProcessListPage.jsx`.

## Money precision (Post → Transaction)

Bank Process 入账金额：**DB 存 6 位**，前端 Half Up **仅展示 2 位**。详见后端 `docs/frontend-springboot-migration.md` 第27节。

## 前端 UI / 效能优化记录

Filter chips 收合行为、窄屏响应式、Date range 跨页面污染、modal 滚动效能，详见 [`docs/bankprocess-list-ui-optimizations.md`](../../../docs/bankprocess-list-ui-optimizations.md)。

## Where to change what

| Task | Location |
|------|----------|
| Page shell, modals, table layout (JSX) | `BankProcessListPage.jsx` |
| State, API calls, filters, form/accounting logic | `hooks/useBankProcessListPage.js` |
| Main grid | `components/BankProcessTable.jsx` |
| Status / Official / E-Invoice / Block | `components/BankProcessStatusControl.jsx` |
| Add / edit process form shell | `components/BankProcessFormModal.jsx` |
| Form fields, account pickers, dates | `components/bankProcessFormFields.jsx` |
| Country / bank / profit / accounting / resend modals | `components/*Modal.jsx`, `bankProcessTextModals.jsx` |
| Money, contract, sort, filters (legacy-aligned) | `lib/bankProcessHelpers.js` |

## Bank process maintenance

Route: `/bankprocess-maintenance` — `pages/maintenance/bankprocess/` (separate folder).

## Shared with process list

- Delete confirm modal, add icon: `pages/processlist/components/`
- Company dedupe helper: `processlist/processListHelpers.js`
- Non-bank company redirect: `processlist/processRoutePrefetch.js`

## Styles & i18n

- CSS: `frontend/public/css/processCSS.css`, `processlist.css`, `accountCSS.css`, `account-list.css`, `userlist.css`, `date-range-picker.css`
- Translations: `frontend/src/translateFile/pages/bankProcessTranslate.js`
- Legacy reference: `js/bank_process_list.js`
