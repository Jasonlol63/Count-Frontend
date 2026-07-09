# Report pages (React)

Routes: `/customer-report`, `/domain-report` (see `App.jsx`).

## Where to change what

| Task | Location |
|------|----------|
| Customer report page shell, filters state, load report | `customer/CustomerReportPage.jsx` |
| Domain report page shell | `domain/DomainReportPage.jsx` |
| Customer API (`customer_report_api.php`, accounts) | `customer/customerReportApi.js` |
| Domain API (`domain_report_api.php`, processes) | `domain/domainReportApi.js` |
| Company permissions, currencies, Bank-only redirect | `shared/reportCompanyApi.js` |
| Amount format / subtotals / toast CSS variant | `shared/reportAmountFormat.js` |
| Group / Company / Currency pills | `shared/ReportGcFilterPanel.jsx` + `shared/useReportGcSwitcher.js` |
| Date range picker | `common/ReportDatePicker.jsx` |
| Customer filters (account, show all) | `customer/CustomerReportFilters.jsx` |
| Domain filters (process) | `domain/DomainReportFilters.jsx` |
| Customer table & currency grouping | `customer/CustomerReportTable.jsx` |
| Domain table & totals row | `domain/DomainReportTable.jsx` |

## Styles & i18n

- Customer CSS: `frontend/public/css/customer_report.css`
- Domain CSS: `frontend/public/css/domain_report.css`
- Shared report fields: `report-outlined-fields.css`
- Translations: `frontend/src/translateFile/pages/reportTranslate.js`
