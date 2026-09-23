# Account Ownership — account picker showing unrelated groups / duplicate & inconsistent group label fix

> **最后更新**：2026-09-02

## Symptom
On the Account Ownership page, opening the "ACCOUNT" dropdown for a company's allocation
row showed **every GROUP-type tenant in the system** as a candidate shareholder — e.g.
company `C168` (which only belongs to group `AP`) also showed `Group: IG` as a selectable
option, even though `C168` has no relation to `IG`. Independent companies (no group) were
similarly at risk of showing group options they shouldn't.

After the first fix, a second symptom appeared: for a company already holding 100%
allocated to its own group (e.g. `C168` → `AP`), the dropdown showed **two** entries that
both clearly meant "AP" — one plain `AP` (the already-selected/persisted value) and one
`Group: AP` (a new, seemingly-duplicate candidate).

After deduping that, a third, smaller inconsistency remained: the currently-selected group
value rendered as plain `IG` / `AP` (no prefix) while every other, not-yet-selected group
candidate rendered as `Group: IG` / `Group: AP` — same entity, two different label formats
depending on whether it happened to already be selected.

## Root cause

### 1. Wrong join key — `owner_id` instead of `parent_id` (backend)
`getShareholderCandidates` (section ③, "候选股东下拉列表") in
`backend/src/main/resources/mybatis/TenantOwnership.xml` built the GROUP-candidate list by
joining `tenant g` to the target company on **`g.owner_id = t.owner_id`** — i.e. "any active
GROUP tenant that shares the same ultimate owner as this company." Since one owner can own
several groups, this returned every group under that owner instead of just the company's
actual parent group. The correct membership relation is `tenant.parent_id` (confirmed by
`Tenant.java`'s `parentId` field and the join/leave-group endpoint
`TenantOwnershipServiceImpl.updateTenantParentId()`).

**Fix (backend):** join on `t.parent_id = g.id` instead. An independent company
(`parent_id IS NULL`) now naturally yields zero group rows; a grouped company yields exactly
its one parent group.

### 2. Frontend fallback fabricated a mismatched id, producing a duplicate
`Count-frontend/src/pages/ownership/company/useCompanyOwnership.js` (`loadCompanyState`)
had a leftover safety-net for the pre-fix backend (which never returned the company's own
group as a candidate):

```js
const compGid = compData?.group_id || "";
...
if (compGid && !accounts.some((a) => String(a.id) === `G_${compGid}`)) {
  accounts.push({ id: `G_${compGid}`, account_name: `Group: ${compGid}`, ... });
}
```

`company.group_id` holds the group's **business code** (e.g. `"AP"`), not its numeric
`tenant.id`. Every real group option — both from the candidates API and from the company's
already-persisted ownership row — uses the numeric-id format `G_<tenant.id>` (e.g.
`G_108`). The fallback's fabricated `G_AP` never matches that real id, so it could never be
deduplicated against it. Once the backend fix above started correctly returning the
company's group as a normal candidate, this stale fallback kept injecting its own
mismatched-id copy on top, producing the visible "AP" + "Group: AP" duplicate.

(A second hypothesis — that `AP` was a *separate* `owner`-table row coincidentally sharing
the code `AP` with the group tenant — was checked directly against `count_real` data and
ruled out: `C168`'s persisted allocation row is `owner_type='group'`,
`partner_tenant_id=108` (the `AP` group tenant), i.e. the exact same entity as the group
candidate, just rendered via a different query with a different label. There is no separate
`owner` row named `AP`.)

### 3. Label built by two different queries, only one of which added the prefix
`getShareholderCandidates` (section ③, candidate list) always labeled group rows as
`CONCAT('Group: ', g.code)`. But the *currently selected/persisted* row for a tenant comes
from a different query — `getActiveOwnershipList` / `getHistoricalOwnershipList` — whose
`accountName` for `owner_type='group'` was just `t_partner.code` (no prefix). Same
underlying entity, two queries, two label formats depending on which one happened to
produce it.

## Fix

**`backend/src/main/resources/mybatis/TenantOwnership.xml`**
- `getShareholderCandidates`, section ③ — join changed from `g.owner_id = t.owner_id` to
  `g.id = t.parent_id`:
  ```sql
  -- before
  FROM tenant g
           JOIN tenant t ON t.id = #{tenantId}
  WHERE g.tenant_type = 'GROUP' AND g.status = 'ACTIVE' AND g.owner_id = t.owner_id

  -- after
  FROM tenant t
           JOIN tenant g ON g.id = t.parent_id
  WHERE t.id = #{tenantId} AND g.tenant_type = 'GROUP' AND g.status = 'ACTIVE'
  ```
- `getActiveOwnershipList` and `getHistoricalOwnershipList` — `accountName` for
  `owner_type = 'group'` changed from `t_partner.code` to `CONCAT('Group: ', t_partner.code)`,
  matching the candidate list's label format so the same group always displays identically
  whether it's the current selection or a fresh candidate.

**`Count-frontend/src/pages/ownership/company/useCompanyOwnership.js`** —
`loadCompanyState`: removed the `compData`/`compGid` lookup and the `G_${compGid}` fallback
`push` entirely; the picker now trusts the `available-accounts` response as-is (it already
includes the company's real parent group after the backend fix, correctly labeled). Dropped
the now-unused `allCompanies` dependency from the surrounding `useCallback`.

## Why this shouldn't recur
The candidate list is now scoped by the same `parent_id` relationship the rest of the
codebase already uses as the source of truth for group membership (join/leave-group,
`Tenant.parentId`), so there's a single place that decides "which group does this company
belong to." The frontend no longer independently guesses at a group's id from its code, so
there's no second, differently-formatted id that can drift out of sync with what the backend
returns. And both queries that can produce a GROUP-type ownership row now build the display
label the same way (`CONCAT('Group: ', code)`), so there's no longer a path where the same
entity's label depends on which query happened to return it.

## Verification
Checked directly against `count_real`: `tenant` rows `C168` (id 77, `parent_id=108`),
`AP` (id 108, GROUP), `IG` (id 109, GROUP) — confirms `C168`'s only valid parent is `AP`.
`tenant_ownership` row for `C168` (`owner_type='group'`, `partner_tenant_id=108`,
`percentage=100`) confirms the persisted selection and the corrected candidate both resolve
to the same `G_108` entity. Manual UI verification of the dropdown (no unrelated groups, no
duplicate, consistent `Group: X` labeling) still pending a live pass after deploy.

## Files changed
- `backend/src/main/resources/mybatis/TenantOwnership.xml`
- `Count-frontend/src/pages/ownership/company/useCompanyOwnership.js`
