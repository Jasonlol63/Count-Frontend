# Sidebar Expiration Hint Fix (Company view showing "-")

## Symptom
Sidebar "Exp:" countdown showed the correct value under a Group tab (e.g. `12m 5d left`),
but switching to a Company tab under that group showed a bare `"-"`.

## Root cause
`SessionUser` (Spring Boot `/auth/current-user`) only has an `expiration_date` field — it has
**no** `expiration_hint` / `expiration_status` / `days_until_expiration` fields. Those are
leftover PHP `current_user_api.php` field names that the frontend never stopped expecting.

`refreshSession()` in `AuthenticatedLayout.jsx` had two branches:

- **Group-only branch**: computed the hint entirely client-side via
  `buildSidebarExpirationFields(expirationDate)`, never touching the server payload — worked
  correctly.
- **Company branch**: copied `data.expiration_hint` / `data.expiration_status` /
  `data.days_until_expiration` straight from the `/auth/current-user` response. Since the
  backend never sends these, they were always `undefined`, and
  `formatSidebarExpirationHint()` fell back to the literal `"-"`.

Additionally, `buildOwnerCompaniesCache` (the tenant-accessible cache the sidebar reads
`expiration_date` from) was never invalidated after actions that change a tenant's expiry
(auto-renew approval, Domain company/group settings save) — so even after fixing the hint
computation, a freshly renewed date could still show stale until a full page reload.

## Fix
1. **`src/components/AuthenticatedLayout.jsx`** — `refreshSession()` no longer reads
   `expiration_hint`/`expiration_status`/`days_until_expiration` off the server payload in
   either branch. Both Group and Company branches now always derive these locally via
   `buildSidebarExpirationFields(expirationDate)`, where `expirationDate` prefers the cached
   tenant-accessible row (`resolveSidebarExpirationForFilter`) and falls back to the session
   payload's own `data.expiration_date` (always correct for the tenant `data` represents) when
   the cache isn't populated yet.
2. **`formatSidebarExpirationHint()`** — added a mapping for the `"Expired"` sentinel to
   `i18n.expExpired` so it's localized (previously leaked raw English on the Chinese UI).
3. **`src/translateFile/shell/dashboardTranslate.js`** — `expNoDate` wording changed to
   "No Set" / "未设置" (previously "No expiry" / "无到期"); added `expExpired`: "Expired" /
   "已过期". This makes the sidebar distinguish:
   - Tenant has an expiration date in the past → **Expired**
   - Tenant has never had an expiration date set → **No Set**
4. **`src/utils/company/companySessionEvents.js`** — `notifySessionRefreshRequested()` now
   clears the owner-companies cache and kicks off a refetch before dispatching the refresh
   event, so any Domain settings save that changes a tenant's expiry is reflected immediately.
5. **`src/pages/autorenew/AutoRenewPage.jsx`** — `confirmApproveRow()` now calls
   `notifySessionRefreshRequested()` after a successful approval, for the same reason.

## Why this shouldn't recur
Expiration display now has exactly one computation path
(`buildSidebarExpirationFields(expirationDate)`) used everywhere, and exactly one data source
for `expirationDate` per tenant (tenant-accessible cache, with the session payload's own
`expiration_date` as a same-tenant fallback). No code path trusts server-provided hint/status
fields that don't exist on the backend DTO. Any future flow that changes a tenant's expiry
should call `notifySessionRefreshRequested()` (or at minimum `clearOwnerCompaniesCache()`) so
the cache doesn't go stale.

## Files changed
- `src/components/AuthenticatedLayout.jsx`
- `src/translateFile/shell/dashboardTranslate.js`
- `src/utils/company/companySessionEvents.js`
- `src/pages/autorenew/AutoRenewPage.jsx`

## Backend
No backend changes required — `/auth/current-user` and `/auth/tenant-accessible` already
return correct `expiration_date` values; the bug was frontend-only (wrong field trust +
missing cache invalidation).
