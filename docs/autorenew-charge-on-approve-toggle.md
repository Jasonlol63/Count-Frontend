# Auto Renew — per-row "Charge" toggle on Approve

> **范围**：full-stack feature (backend + frontend); the complete writeup lives in
> `Count/docs/autorenew-charge-on-approve-toggle.md`. This file lists only the frontend
> pieces for quick lookup from this repo.

Each pending row on the Auto Renew page now has its own "Charge" toggle (between the
Period and Status columns), styled like Domain page's `CompanySettingsModal.jsx`
charge-on-save switch. When off, approving that row extends the tenant's expiration date
without creating a Domain Fee / Commission payment — same `DomainFeeChargeService` code
path as Domain page's "charge on save", just gated per auto-renew request instead of
per tenant save.

## Frontend files touched
- `src/pages/autorenew/AutoRenewPage.jsx` — new "Charge" column/header, per-row switch
  (only for pending/editable rows), draft state `chargeOnApprove`, approve confirm
  dialog message now charge-state-aware (`confirmApprove` vs `confirmApproveNoCharge`).
- `src/pages/autorenew/autoRenewPageHelpers.js` — `getRowDraftValues()` now returns
  `chargeOnApprove` (default `true`).
- `src/pages/autorenew/autoRenewLogic.js` — `approveAutoRenew({ requestId, period,
  chargeOnApprove })` sends `charge_on_approve` in the POST body to
  `api/auto-renew/approve`.
- `src/translateFile/pages/autoRenewTranslate.js` — new en/zh strings: `colCharge`,
  `on`, `off`, `chargeToggleAria`, `confirmApproveNoCharge`.
- `public/css/auto_renew.css` — table grid widened from 8/9 columns to 9/10 (no-submitter /
  with-submitter) across every responsive breakpoint (desktop, ≤1280px, 1025–1440px
  13-inch override, ≤1024 tablet, en/zh variants); `--auto-renew-table-min-width` and each
  breakpoint's horizontal-scroll `min-width` threshold bumped up to make room.

## Backend
See `Count/docs/autorenew-charge-on-approve-toggle.md` for the actual approve-flow change
(`AutoRenewApprovalRequest.java`, `AutoRenewController.java`,
`AutoRenewService(.java/Impl.java)`) — new `charge_on_approve` request field (defaults to
`true` when omitted), which wraps the existing `domainFeeChargeService.chargeDomainFee(...)`
call in an `if`.
