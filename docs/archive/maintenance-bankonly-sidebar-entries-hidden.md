# Maintenance sidebar — hide Transaction/Formula entries for bank-only companies

> **最后更新**：2026-09-01（改动实际提交于 commit `df0b70c5c05808e31e0973f45f5a4fad89b3dde9`，
> "Wire Announcement/Maintenance to Spring Boot JSON API, drop unsupported mode toggle"，
> 这一小块 sidebar 改动是该提交里跟 Announcement API 迁移无关的顺带修复）

## Symptom
Bank-only tenants (`company_has_bank === true`, `company_has_gambling === false`) still saw
**Transaction Maintenance** and **Formula Maintenance** as sidebar entries under the
Maintenance flyout menu, even though those two pages operate on Games-oriented
process/transaction data that doesn't apply to a bank-only company. Elsewhere in the same
sidebar, bank-only companies already get routed to `bank-process-list` instead of
`process-list` (`processSpaPath`, line ~1307) and have their own dedicated **Bank Process**
maintenance entry (`showBankprocessMaintenance`) — Transaction/Formula Maintenance were the
two entries that hadn't been gated the same way.

## Fix
`src/components/AuthenticatedLayout.jsx`:
- Added `const isBankOnlyCategory = Boolean(me?.company_has_bank) && !me?.company_has_gambling;`
  (line ~1290).
- Added `&& !isBankOnlyCategory` to the existing visibility conditions for the
  **Transaction Maintenance** (`/transaction-maintenance`) and **Formula Maintenance**
  (`/formula-maintenance`) sidebar links (lines ~1708-1710 and ~1728-1730). Both entries were
  already gated by `(company_has_gambling || company_has_bank) && (showFullMaintenanceMenu ||
  showLimitedMaintenanceMenu)`; this just adds the bank-only exclusion on top.
- **Payment Maintenance** (`/payment-maintenance`) and **Bank Process Maintenance**
  (`/bankprocess-maintenance`) were left untouched — both remain visible for bank-only
  companies (Payment Maintenance is generic; Bank Process Maintenance is the bank-only
  equivalent of Transaction/Formula Maintenance).

## Why this shouldn't recur
The gate follows the same `company_has_bank && !company_has_gambling` shape already used by
`processSpaPath` a few lines below it in the same component, so any future "bank-only vs.
gambling" routing/visibility decision in this file has a precedent to copy rather than
re-deriving the condition.

## Files changed
- `src/components/AuthenticatedLayout.jsx`

## Backend
No backend changes — purely a sidebar visibility gate based on fields already present on the
session (`company_has_bank`, `company_has_gambling`).
