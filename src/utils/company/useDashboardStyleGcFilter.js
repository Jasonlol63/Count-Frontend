import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  companiesForCompanyPicker,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  isDashboardGroupOnlyMode,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  clearDashboardGroupFilterKeepCompany,
  persistDashboardGroupFilter,
  pickDefaultCompanyForGroup,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyPickWhenSwitchingGroup,
  resolveCompanyWhenClosingGroup,
  sortedUniqueGroupIds,
} from "./sharedCompanyFilter.js";
import { peekCompanySessionFlags } from "./companySessionFlagsCache.js";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
  resolveVisibleGroupIds,
} from "./loginScope.js";
import { useGroupAnchorSessionSync } from "./useGroupAnchorSessionSync.js";

/**
 * Dashboard-aligned Group / Company filter: single group selection, company can be cleared,
 * sidebar Process hidden when group-only (via notifyDashboardGroupFilterChanged).
 */
export function useDashboardStyleGcFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  onSelectCompany,
  /** Sync optimistic UI (set company id, apply cache) before background session sync. */
  onPrepareCompanySelect,
  onClearCompany,
  /** Company login: after user deselects the active group pill (company unchanged). */
  onDeselectGroup,
  switchingCompany = false,
  preferredCompanyId = null,
  /** When false, picking a group clears company (default — shared across all pages). */
  selectFirstCompanyOnGroupChange = false,
  sessionCompanyId = null,
  /** Data Capture uses custom anchor sync (gambling redirect). */
  enableGroupAnchorSession = true,
  /** When false, do not auto-select first company while group is set and company is cleared. */
  autoPickCompanyWhenEmpty = true,
  /** Maintenance pages: allow group-only scope even for owner login (no auto-pick subsidiary). */
  forceAllowGroupOnly = false,
  /**
   * When false, re-clicking the already-selected group pill does not clear company
   * (user clears via the active company pill instead).
   */
  clearCompanyOnActiveGroupReselect = true,
  /** When false, skip layout broadcast on selectedGroup/companyId changes (page handles manually). */
  broadcastFilterToLayout = true,
  /** Current user from AuthSessionContext — enforces group vs company login rules. */
  me = null,
}) {
  const activeGroup = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  const allowGroupOnly =
    canUseGroupOnlyMode(me, activeGroup) || (forceAllowGroupOnly && canUseGroupOnlyMode(me));
  const allowClearCompany =
    canClearCompanySelection(me, activeGroup) ||
    (forceAllowGroupOnly && canUseGroupOnlyMode(me, activeGroup));

  const onSelectCompanyRef = useRef(onSelectCompany);
  const onPrepareCompanySelectRef = useRef(onPrepareCompanySelect);
  useEffect(() => {
    onSelectCompanyRef.current = onSelectCompany;
  }, [onSelectCompany]);
  useEffect(() => {
    onPrepareCompanySelectRef.current = onPrepareCompanySelect;
  }, [onPrepareCompanySelect]);

  const { resetAnchorSessionRef, markAnchorSynced } = useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId,
    enabled: enableGroupAnchorSession,
    broadcastFilterChanged: broadcastFilterToLayout,
  });

  const groupIds = useMemo(
    () => resolveVisibleGroupIds(sortedUniqueGroupIds(companies), me, companies),
    [companies, me]
  );

  const companiesForPicker = useMemo(() => {
    const list = companiesForCompanyPicker(companies, selectedGroup, groupIds);
    return excludeGroupLabelsFromCompanyPicker(
      dedupeOwnerCompaniesByCode(list, preferredCompanyId ?? companyId),
      groupIds
    );
  }, [companies, selectedGroup, groupIds, preferredCompanyId, companyId]);

  const handlePickGroup = useCallback(
    async (gid) => {
      if (switchingCompany) return;
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      /** Group login: stay group-only when switching tabs; never auto-pick a subsidiary. */
      if (allowGroupOnly && !selectFirstCompanyOnGroupChange) {
        if (g === selectedGroup && companyId != null) {
          if (clearCompanyOnActiveGroupReselect) {
            persistDashboardFilterState(g, null, { allowGroupOnly: true });
            resetAnchorSessionRef();
            onClearCompany?.(g);
            notifyDashboardGroupFilterChanged(g, null);
          }
          return;
        }
        persistDashboardGroupFilter(g);
        setSelectedGroup(g);
        persistDashboardFilterState(g, null, { allowGroupOnly: true });
        resetAnchorSessionRef();
        onClearCompany?.(g);
        notifyDashboardGroupFilterChanged(g, null);
        return;
      }

      if (g === selectedGroup) {
        if (!canUseGroupOnlyMode(me)) {
          const target = resolveCompanyWhenClosingGroup(companies, companyId, groupIds);
          persistDashboardGroupFilter(null);
          setSelectedGroup(null);
          if (target?.id && Number(target.id) !== Number(companyId)) {
            persistDashboardFilterState(null, target.id, { allowGroupOnly: false });
            markAnchorSynced(null, target.id);
            const prepare = onPrepareCompanySelectRef.current;
            if (prepare) prepare(target);
            else setSelectedGroup(null);
            notifyDashboardGroupFilterChanged(null, target.id, {
              companyCode: target.company_id,
              ignoreGroupOnly: true,
              ...(() => {
                const cached = peekCompanySessionFlags(Number(target.id));
                return cached
                  ? {
                      hasGambling: Boolean(cached.has_gambling),
                      hasBank: Boolean(cached.has_bank),
                    }
                  : {};
              })(),
            });
            const select = onSelectCompanyRef.current;
            if (select) void select(target);
          } else if (companyId != null) {
            clearDashboardGroupFilterKeepCompany(companyId);
            onDeselectGroup?.(companyId);
          } else {
            persistDashboardFilterState(null, null, { allowGroupOnly: false });
            notifyDashboardGroupFilterChanged(null, null);
          }
          return;
        }
        if (companyId != null) return;
      }

      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, { me, preferredCompanyId: null }) ??
        pickDefaultCompanyForGroup(companies, g, { me, preferredCompanyId: companyId });
      if (pick) {
        persistDashboardGroupFilter(g);
        persistDashboardFilterState(g, pick.id, { allowGroupOnly: false });
        markAnchorSynced(g, pick.id);
        const prepare = onPrepareCompanySelectRef.current;
        if (prepare) prepare(pick);
        else setSelectedGroup(g);
        notifyDashboardGroupFilterChanged(g, pick.id, {
          companyCode: pick.company_id,
          ignoreGroupOnly: true,
          ...(() => {
            const cached = peekCompanySessionFlags(Number(pick.id));
            return cached
              ? {
                  hasGambling: Boolean(cached.has_gambling),
                  hasBank: Boolean(cached.has_bank),
                }
              : {};
          })(),
        });
        const select = onSelectCompanyRef.current;
        if (select) void select(pick);
        return;
      }

      persistDashboardGroupFilter(g);
      setSelectedGroup(g);
    },
    [
      switchingCompany,
      selectedGroup,
      companies,
      groupIds,
      setSelectedGroup,
      onPrepareCompanySelect,
      onSelectCompany,
      onClearCompany,
      onDeselectGroup,
      selectFirstCompanyOnGroupChange,
      resetAnchorSessionRef,
      allowGroupOnly,
      clearCompanyOnActiveGroupReselect,
      companyId,
      me,
      markAnchorSynced,
    ]
  );

  useLayoutEffect(() => {
    if (allowGroupOnly || !autoPickCompanyWhenEmpty || !selectedGroup || companyId != null) return;
    const pick = pickDefaultCompanyForGroup(companies, selectedGroup, { me, preferredCompanyId: companyId });
    if (!pick) return;
    persistDashboardFilterState(selectedGroup, pick.id, { allowGroupOnly: false });
    markAnchorSynced(selectedGroup, pick.id);
    notifyDashboardGroupFilterChanged(selectedGroup, pick.id);
    const select = onSelectCompanyRef.current;
    if (select) void select(pick);
  }, [
    allowGroupOnly,
    autoPickCompanyWhenEmpty,
    selectedGroup,
    companyId,
    companies,
    me,
    markAnchorSynced,
  ]);

  const handlePickCompany = useCallback(
    async (c) => {
      if (switchingCompany || !c?.id) return;

      const id = Number(c.id);
      const gid = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const sel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
      const isActive = companyId != null && Number(companyId) === id;

      if (isActive) {
        if (!allowClearCompany) return;
        const g = sel || gid;
        persistDashboardFilterState(g, null, { allowGroupOnly: true });
        resetAnchorSessionRef();
        onClearCompany?.(g);
        notifyDashboardGroupFilterChanged(g, null);
        return;
      }

      const nextGroup = gid || null;
      persistDashboardFilterState(nextGroup, id, {
        allowGroupOnly: allowGroupOnly && canUseGroupOnlyMode(me),
      });
      markAnchorSynced(nextGroup, id);
      const prepare = onPrepareCompanySelectRef.current;
      if (prepare) {
        prepare(c);
      } else if (nextGroup) {
        persistDashboardGroupFilter(nextGroup);
        setSelectedGroup(nextGroup);
      } else {
        persistDashboardGroupFilter(null);
        setSelectedGroup(null);
      }
      const notifyOpts = { companyCode: c.company_id, ignoreGroupOnly: true };
      const cachedFlags = peekCompanySessionFlags(id);
      if (cachedFlags) {
        notifyOpts.hasGambling = Boolean(cachedFlags.has_gambling);
        notifyOpts.hasBank = Boolean(cachedFlags.has_bank);
      }
      notifyDashboardGroupFilterChanged(nextGroup, id, notifyOpts);
      const select = onSelectCompanyRef.current;
      if (select) void select(c);
    },
    [
      switchingCompany,
      companyId,
      selectedGroup,
      setSelectedGroup,
      onPrepareCompanySelect,
      onSelectCompany,
      onClearCompany,
      resetAnchorSessionRef,
      markAnchorSynced,
      allowClearCompany,
      allowGroupOnly,
    ]
  );

  useLayoutEffect(() => {
    if (!broadcastFilterToLayout) return;
    const cid = isDashboardGroupOnlyMode() ? null : companyId;
    notifyDashboardGroupFilterChanged(selectedGroup, cid);
  }, [selectedGroup, companyId, broadcastFilterToLayout]);

  return {
    groupIds,
    companiesForPicker,
    handlePickGroup,
    handlePickCompany,
    allowGroupOnly,
    allowClearCompany,
  };
}
