# Ownership page (React)

Entry: `OwnershipPage.jsx` (routed from `App.jsx`).

## Where to change what

| Task | Location |
|------|----------|
| Tabs, toast, conflict modal, bulk bar shell | `OwnershipPage.jsx` |
| Language, company list load, `activeTab` | `shared/useOwnershipPageShell.js` |
| API response helpers | `shared/ownershipHelpers.js` |
| Row edit / save validation (both tabs) | `shared/ownershipRowHelpers.js` |
| Company ownership logic (save, groups, bulk) | `company/useCompanyOwnership.js` |
| Company tab layout | `company/CompanyOwnershipTab.jsx` |
| Group earnings logic | `group/useGroupEarnings.js` |
| Group tab layout | `group/GroupEarningsTab.jsx` |

## Components

- **shared/components/** — `AccountEditorRow`, `OwnAccountSelect`, `ConflictModal`
- **company/components/** — `CompanyCard`, `BulkActionBar`, `PartnerLinkSection`
- **group/components/** — `GroupEarningCard`, `GePartnerSection`

Styles: `frontend/public/css/ownership.css`  
i18n: `frontend/src/translateFile/pages/ownershipTranslate.js`
