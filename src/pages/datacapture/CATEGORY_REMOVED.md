# Data Capture — Category pills removed

## Why it used to appear

Tenant session flags only expose **Games** / **Bank** (`has_game` / `has_bank`).

`lib/dataCaptureSpringApi.js` previously **injected** `Loan`, `Rate`, and `Money` whenever Games was present.  
`useDataCaptureCategoryPermissions` then set `showPermissionFilter` when `permissions.length > 1`, so the page toolbar rendered:

**Category:** Games | Loan | Rate | Money (| Bank)

Those extra labels were UI-only siblings, not separate tenant flags.

## What changed

| Area | Change |
|------|--------|
| `DataCapturePage.jsx` | Removed the Category toolbar (`data-capture-permission-filter`) entirely |
| `lib/dataCaptureSpringApi.js` | `permissionsFromSessionFlags` returns only `Games` / `Bank`; default is `["Games", "Bank"]` |
| `hooks/useDataCaptureCategoryPermissions.js` | No pill UI / `selectPermission`; auto-picks **Games** (or **Gambling**), else **Bank** |

`selectedPermission` is still passed into form engine / submit for Bank vs Games process loading — it is just no longer user-switchable on this page.

## Pick rules

1. Prefer `Games`, then `Gambling`
2. Else `Bank` (bank-only tenants)
3. Persist choice to `localStorage` key `selectedPermission_tenant_{tenantId}`

## Not in scope

Maintenance / Transaction / Formula pages may still show their own Category controls. This doc applies to **`/datacapture` only**.
