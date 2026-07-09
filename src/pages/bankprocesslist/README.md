# Bank Process list page (React)

Route: `/bank-process-list` (see `App.jsx`). Entry: `BankProcessListPage.jsx`.

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
