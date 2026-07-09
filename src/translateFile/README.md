# Translations (en / zh)

Language state: `localStorage.login_lang`, `utils/i18n/useLoginLang.js`, event `eazycount:language-updated`.

## Where to change what

| Task | Location |
|------|----------|
| Sidebar, dashboard chrome, shared date labels | `shell/dashboardTranslate.js` (`DASHBOARD_I18N`) |
| Login / reset password / secondary verify | `auth/authTranslate.js` |
| Maintenance pages | `pages/maintenanceTranslate.js` |
| Member (falls back to dashboard + maintenance keys) | `pages/memberTranslate.js` |
| Account list | `pages/accountTranslate.js` |
| Bank process list | `pages/bankProcessTranslate.js` |
| Other business pages | `pages/*Translate.js` |
| `getXxxText` helper | `shared/i18nHelpers.js` (`createGetText`, `interpolate`) |

## Folder layout

```
translateFile/
  README.md
  shared/i18nHelpers.js
  auth/authTranslate.js          # LOGIN_I18N, RESET_PASSWORD_I18N, SECONDARY_VERIFY_I18N
  shell/dashboardTranslate.js    # global shell / sidebar
  pages/                         # one dictionary per feature page
```

## Adding strings

1. Add keys under both `en` and `zh` in the page dictionary.
2. Use `export const getFooText = createGetText(FOO_I18N)` unless you need custom fallback (see `memberTranslate.js`, `bankProcessTranslate.js`).
3. For API error toasts, keep `translateXxxApiMessage` in the same page file.

## Member fallback chain

`getMemberText` resolves: `MEMBER_I18N` → `DASHBOARD_I18N` → `MAINTENANCE_I18N` → key name.
