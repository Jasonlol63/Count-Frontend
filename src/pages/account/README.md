# Account list page (React)

Route: `/account-list` (see `App.jsx`). Entry: `AccountListPage.jsx`.

## Where to change what

| Task | Location |
|------|----------|
| Page shell, boot/company-group scope wiring, all handlers (add/edit/delete/toggle/currency/link) | `AccountListPage.jsx` |
| Spring `/api/account/*` + `/api/currency/*` calls, request/response shape mapping | `accountListApi.js` |
| Pure client-side logic (roles ordering, picker filtering, cache keys) | `accountLogic.js` |
| Sidebar hover-warm cache | `accountRoutePrefetch.js` |
| Add/Edit account form, company picker (checkbox / group radio) | `../../components/AccountModal.jsx` |
| Confirm-delete, Currency Setting, Link Account modals | `components/accountModals.jsx` |
| Translations, API error message parsing | `../../translateFile/pages/accountTranslate.js` |

## Spring migration (2026-08)

The page now calls the Spring backend exclusively — no `api/accounts/*.php` / `api/editdata/*.php` calls remain anywhere in this folder. Those PHP-style paths had **no backend implementation at all** (no PHP host, no matching Spring `@RequestMapping`); they were 404ing silently before this pass.

**Endpoints used**

- `POST /api/account/list|add|update|updateStatus|delete` and `/api/account/link*` (`UserController`) — accounts + account-to-account linking.
- `POST /api/currency/available|add|delete` and `/api/currency/account/linked-accounts[-update]` (`CurrencyController`) — per-account currency picker + the Currency Setting screen.

Both are strictly **single-tenant** (`tenant_id` / `scopeTenantId` — a real Company-type tenant id, never a bare Group id; see the backend's `docs/frontend-springboot-migration.md` 第23节). There is no `group_id` / `group_only` concept server-side, so:

- A single company view hits `/api/account/list` directly.
- "Company all" / "Groups all" / a bare group-only view all merge per-tenant across the ids `useGcFilterWithAllModes` already resolves (`fetchMergedAccountLists`) — no separate group-aware endpoint needed.
- **Group-only Add/Edit** (accounts attributed to a Group tab itself) resolves to that group's *anchor company* tenant (the Company-type row whose code equals the group code) — same trick the page already used for `scopeCompanyId`. It is **not** a literal Group-type tenant; the backend's `assertCompanyTenants` rejects those outright.
- Multi-company accounts: `tenantIds` (from the "Choose companies" picker) is sent on every add/update; currency links (`currencyIds`) are synced server-side as part of that same call — there is no separate add/remove-currency-link request during save anymore.
- Bulk delete loops one `/api/account/delete` call per selected row (each resolved to its own `scope_tenant_id`), since the Spring endpoint takes one account at a time.

**Known gaps vs. the old (dead) PHP flow — accepted, not backfilled**

- **No "force delete" for an in-use currency.** `/api/currency/delete` always blocks when a currency is linked to any account; there's no override param. The old force-delete confirm UI is now unreachable dead code (kept harmless, never triggered) rather than removed, in case a backend override gets added later.
- **No dynamic per-company "roles" list.** The old `editdata_api.php` roles lookup never had a Spring equivalent either (confirmed no matching backend query exists). The Add/Edit role dropdown has always effectively been the static `ROLE_PRIORITY` fallback in `accountLogic.js`; the dead fetch was just removed.
- **Sidebar hover-prefetch for a group-only view is a no-op.** `/api/account/list` has no group-aware variant, so there's nothing to warm client-side without the full company list loaded yet. The page itself still loads correctly; it just doesn't get a hover head-start in that one case.

## Styles & i18n

- CSS: `frontend/public/css/account-list.css`, `accountCSS.css`, `userlist.css`, `list-badge-scale.css`
- Translations: `frontend/src/translateFile/pages/accountTranslate.js`
