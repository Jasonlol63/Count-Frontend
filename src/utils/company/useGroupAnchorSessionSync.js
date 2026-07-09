import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { notifyCompanySessionUpdated } from "./companySessionEvents.js";
import { syncCompanySessionApi } from "./companySessionSync.js";
import {
  buildDashboardSidebarNotifyOptions,
  companyRowIsGroupEntity,
  dashboardGcFiltersEqual,
  notifyDashboardGroupFilterChanged,
  pickGroupAnchorCompany,
  readPersistedDashboardGcFilter,
} from "./sharedCompanyFilter.js";

function isGroupOnlyFilterUi(selectedGroup, companyId) {
  if (!selectedGroup) return false;
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  return !(Number.isFinite(cid) && cid > 0);
}

function parsePositiveCompanyId(companyId) {
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  return Number.isFinite(cid) && cid > 0 ? cid : null;
}

/**
 * Group-only UI keeps company unselected. Only sync a group-entity row (AP/IG) to PHP session
 * when one exists — never sync a subsidiary anchor (e.g. C168) to avoid company data bleed.
 */
export function useGroupAnchorSessionSync({
  companies = [],
  selectedGroup,
  companyId,
  sessionCompanyId = null,
  enabled = true,
  notifyOnSync = true,
  /** When false, skip layout filter broadcast (page owns cross-page notify). */
  broadcastFilterChanged = true,
}) {
  const ref = useRef({ group: null, companyId: null });
  const prevCompanyIdRef = useRef(parsePositiveCompanyId(companyId));

  const needsAnchorSession = useMemo(() => {
    if (!enabled) return false;
    return isGroupOnlyFilterUi(selectedGroup, companyId);
  }, [enabled, selectedGroup, companyId]);

  const anchorId = useMemo(() => {
    if (!needsAnchorSession) return null;
    const g = String(selectedGroup || "").trim().toUpperCase();
    const anchor = pickGroupAnchorCompany(companies, g);
    if (!anchor || !companyRowIsGroupEntity(anchor, g)) {
      // Group-only: never write subsidiary (e.g. C168) into PHP session — prevents data/currency bleed.
      return null;
    }
    const id = anchor?.id != null ? Number(anchor.id) : Number.NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [needsAnchorSession, companies, selectedGroup]);

  const [anchorSessionReady, setAnchorSessionReady] = useState(
    () => !isGroupOnlyFilterUi(selectedGroup, companyId),
  );

  const applyReadyFromRef = useCallback((group, id) => {
    const g = group ? String(group).trim().toUpperCase() : "";
    const aid = id != null ? Number(id) : Number.NaN;
    if (g && Number.isFinite(aid) && aid > 0 && ref.current.group === g && ref.current.companyId === aid) {
      setAnchorSessionReady(true);
      return true;
    }
    return false;
  }, []);

  // Group tab changed (e.g. IG → AP): force re-sync anchor session for the new group.
  useLayoutEffect(() => {
    const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
    if (ref.current.group && g && ref.current.group !== g) {
      ref.current = { group: null, companyId: null };
      setAnchorSessionReady(false);
    }
  }, [selectedGroup]);

  // Selecting a subsidiary changes PHP session — invalidate cached anchor sync.
  useLayoutEffect(() => {
    const prev = prevCompanyIdRef.current;
    const next = parsePositiveCompanyId(companyId);
    prevCompanyIdRef.current = next;

    if (next != null) {
      ref.current = { group: null, companyId: null };
      return;
    }

    if (prev != null && next == null && selectedGroup) {
      ref.current = { group: null, companyId: null };
      setAnchorSessionReady(false);
    }
  }, [companyId, selectedGroup]);

  useEffect(() => {
    if (!needsAnchorSession) {
      setAnchorSessionReady(true);
      return;
    }
    if (!anchorId) {
      setAnchorSessionReady((companies?.length ?? 0) === 0);
      return;
    }

    const g = String(selectedGroup).trim().toUpperCase();
    if (applyReadyFromRef(g, anchorId)) {
      return;
    }

    let cancelled = false;
    const filterAtStart = readPersistedDashboardGcFilter();
    setAnchorSessionReady(false);
    (async () => {
      const json = await syncCompanySessionApi(anchorId, g);
      if (cancelled) {
        applyReadyFromRef(g, anchorId);
        return;
      }
      const filterNow = readPersistedDashboardGcFilter();
      if (
        !filterNow.groupOnly ||
        filterNow.selectedGroup !== g ||
        !dashboardGcFiltersEqual(filterAtStart, filterNow)
      ) {
        setAnchorSessionReady(true);
        return;
      }
      if (json?.success) {
        ref.current = { group: g, companyId: anchorId };
        const data = json.data ?? {};
        if (broadcastFilterChanged) {
          notifyDashboardGroupFilterChanged(
            g,
            null,
            buildDashboardSidebarNotifyOptions(null, g),
          );
        }
        if (notifyOnSync) {
          notifyCompanySessionUpdated(data);
        }
      }
      setAnchorSessionReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    needsAnchorSession,
    anchorId,
    selectedGroup,
    companies,
    applyReadyFromRef,
    notifyOnSync,
    broadcastFilterChanged,
  ]);

  const resetAnchorSessionRef = useCallback(() => {
    ref.current = { group: null, companyId: null };
    setAnchorSessionReady(false);
  }, []);

  const markAnchorSynced = useCallback((group, id) => {
    const g = group ? String(group).trim().toUpperCase() : null;
    const cid = id != null ? Number(id) : null;
    ref.current = {
      group: g,
      companyId: Number.isFinite(cid) && cid > 0 ? cid : null,
    };
    setAnchorSessionReady(true);
  }, []);

  return {
    resetAnchorSessionRef,
    markAnchorSynced,
    anchorSessionReady: !needsAnchorSession || anchorSessionReady,
  };
}
