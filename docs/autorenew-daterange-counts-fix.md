# Auto Renew — Date-range counts/list mismatch fix (chip reorder)

> **最后更新**：2026-09-01
> **范围**：mostly a backend fix (see `Count/docs/autorenew-daterange-counts-fix.md`) — this
> repo only got the filter-chip reorder below. No API call changes were needed.

## Symptom
Picking a date range on the Auto Renew page didn't change the Pending/Approved/Rejected/Show
All badge counts, and Show All could show an empty table even when the badge said otherwise.
Root cause and fix are entirely on the backend (`AutoRenewMapper.xml` / `AutoRenewService*` /
`AutoRenewDao` in `Count/backend`) — `fetchAutoRenewApprovals()` in `autoRenewLogic.js` was
already sending `date_from`/`date_to` on every request, so no frontend call-site changes were
needed. Full writeup: `Count/docs/autorenew-daterange-counts-fix.md`.

## Fix (this repo)
`src/pages/autorenew/AutoRenewPage.jsx` — reordered the four `<FilterChip>` elements from
`Pending, Approved, Rejected, Show All` to `Show All, Pending, Approved, Rejected`. The
default `statusFilter` state (`useState("pending")`) is unchanged, so Pending is still the
tab selected on first load — only the chips' left-to-right order changed.

## Files changed
- `src/pages/autorenew/AutoRenewPage.jsx`

## Backend
See `Count/docs/autorenew-daterange-counts-fix.md` for the actual counts/list fix
(`AutoRenewMapper.xml`, `AutoRenewDao.java`, `AutoRenewService(.java/Impl.java)`,
`AutoRenewController.java`).
