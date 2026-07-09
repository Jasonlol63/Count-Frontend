# Transaction dashboard page (React)

Route: `/dashboard` (see `App.jsx`). Entry: `TransactionDashboardPage.jsx` (re-exported from `pages/TransactionDashboardPage.jsx`).

## Where to change what

| Task | Location |
|------|----------|
| Page shell, hook wiring | `TransactionDashboardPage.jsx` |
| Session, company/group, dashboard API, KPI/chart derived state | `hooks/useDashboardPage.js` |
| Date range picker + calendar presets | `hooks/useDashboardDateRange.js` |
| Language / i18n | `hooks/useDashboardLang.js` |
| Filter bar (date, group, company, currency) | `components/DashboardFilterPanel.jsx` |
| KPI cards | `components/DashboardKpiGrid.jsx`, `components/DashboardKpiCard.jsx` |
| Trend area chart | `components/DashboardTrendChart.jsx` |
| Earnings pie + currency breakdown | `components/DashboardEarningsSummary.jsx` |
| Company access modal | `components/DashboardCompanyAccessModal.jsx` |
| Calendar popup markup | `components/DashboardCalendarPopup.jsx` |
| KPI math | `lib/dashboardKpi.js` |
| Chart rows / axis helpers | `lib/dashboardChart.jsx` |
| Earnings pie / company list helpers | `lib/dashboardEarnings.js` |
| Date helpers | `lib/dashboardDateUtils.js` |
| Colors / API constant | `lib/dashboardConstants.js` |
| Group merge (multi-company) | `utils/dashboard/dashboardMerge.js` |
| FX rates | `utils/dashboard/frankfurterRates.js` |

## Styles & i18n

- CSS: `frontend/public/css/transaction.css`, `userlist.css`, `report-outlined-fields.css`, `date-range-picker.css`
- Translations: `frontend/src/translateFile/shell/dashboardTranslate.js`
