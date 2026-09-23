/** Shared GC scope for mobile SSE ticket (Dashboard / Transaction publish here). */
export const MOBILE_REALTIME_SCOPE_EVENT = "ec:mobile-realtime-scope";

let currentScope = {};

function scopeKey(scope = {}) {
  return [
    scope.companyId ?? "",
    scope.viewGroup ?? "",
    scope.groupId ?? "",
    scope.groupAggregate ? "1" : "",
    scope.subsidiaryAccountsOnly ? "1" : "",
  ].join("|");
}

export function getMobileRealtimeScope() {
  return { ...currentScope };
}

/**
 * Publish current company/group scope for the SSE ticket.
 * No-op when key unchanged.
 */
export function setMobileRealtimeScope(next = {}) {
  const normalized = {
    companyId:
      next.companyId != null && next.companyId !== "" && Number(next.companyId) > 0
        ? Number(next.companyId)
        : undefined,
    viewGroup: next.viewGroup ? String(next.viewGroup).trim().toUpperCase() : undefined,
    groupId: next.groupId ? String(next.groupId).trim().toUpperCase() : undefined,
    groupAggregate: next.groupAggregate ? true : undefined,
    subsidiaryAccountsOnly: next.subsidiaryAccountsOnly ? true : undefined,
  };
  if (scopeKey(normalized) === scopeKey(currentScope)) return false;
  currentScope = normalized;
  try {
    window.dispatchEvent(new CustomEvent(MOBILE_REALTIME_SCOPE_EVENT));
  } catch {
    /* ignore */
  }
  return true;
}

/** Build ticket scope from mobile dashboard / transaction GC state. */
export function buildMobileRealtimeScopeFromGc({
  companyId,
  selectedGroup,
  groupsAllMode,
  groupAllMode,
} = {}) {
  const cid = Number(companyId);
  const hasCompany = Number.isFinite(cid) && cid > 0;
  const group = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  const groupOnly = Boolean(group && !groupAllMode && !groupsAllMode && !hasCompany);
  const aggregate = Boolean(groupAllMode || (groupsAllMode && groupAllMode));

  if (groupOnly) {
    return {
      companyId: undefined,
      viewGroup: group,
      groupId: group,
      groupAggregate: true,
    };
  }

  if (aggregate && !hasCompany) {
    return {
      companyId: undefined,
      viewGroup: groupsAllMode ? undefined : group || undefined,
      groupId: groupsAllMode ? undefined : group || undefined,
      groupAggregate: true,
    };
  }

  if (hasCompany) {
    return {
      companyId: cid,
      viewGroup: group || undefined,
      subsidiaryAccountsOnly: true,
    };
  }

  return {};
}
