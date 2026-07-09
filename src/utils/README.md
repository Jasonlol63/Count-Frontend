# Shared frontend utilities

## Folder layout

| Folder | Modules | Typical use |
|--------|---------|-------------|
| `core/` | `apiUrl.js`, `injectStylesheet.js`, `unsetWindowProperty.js` | SPA paths, static CSS, legacy `window` cleanup |
| `i18n/` | `useLoginLang.js` | EN/中 toggle sync |
| `date/` | `dateUtils.js`, `dateRangePicker.js` | DMY/YMD parsing; shared calendar (`ensureMaintenanceDateRangePicker`) |
| `money/` | `decimalEngine.js`, `moneyDecimal.js` | Decimal.js config + `MoneyDecimal` |
| `company/` | `sharedCompanyFilter.js`, `companySessionEvents.js` | Group/company filter session + `notifyCompanySessionUpdated` |
| `dashboard/` | `dashboardMerge.js`, `frankfurterRates.js` | Transaction dashboard only |
| `maintenance/` | `maintenanceStylesheets.js` | Maintenance sub-page CSS swap |
| `capture/` | `dataCaptureRoundStorage.js` | Clear capture `localStorage` keys (layout nav) |
| `audit/` | `partnershipAuditReadOnly.js` | Partnership audit read-only lock |
| `input/` | `sanitizeCapitalLettersOnly.js` | Bank/country name input |

## Import examples

```javascript
import { buildApiUrl, assetUrl } from "../../utils/core/apiUrl.js";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { ensureMaintenanceDateRangePicker } from "../../utils/date/dateRangePicker.js";
import { MoneyDecimal } from "../../utils/money/moneyDecimal.js";
```

## Notes

- `dateRangePicker.js` is used outside Maintenance (dashboard, member, reports, bank process) — name kept for legacy `window.MaintenanceDateRangePicker`.
- Do not change `localStorage` keys in `capture/dataCaptureRoundStorage.js` without updating PHP/legacy JS.
