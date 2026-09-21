import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DASHBOARD_GROUP_FILTER_EVENT,
  readAccessibleGroupIds,
  readPersistedDashboardGcFilter,
} from "../../utils/company/sharedCompanyFilter.js";
import { TX_DATA_CHANGED_EVENT } from "../../pages/transaction/lib/transactionPaymentLogic.js";
import { transactionQueryKeys } from "../../pages/transaction/lib/transactionApi.js";
import { onRealtimeInvalidate, REALTIME_RECONNECT_EVENT } from "./realtimeEvents.js";
import { subscribeAppRealtime } from "./subscribeAppRealtime.js";
import { runRealtimeInvalidationRule } from "./realtimeInvalidationRules.js";

/** Fallback when accessible_group_ids not hydrated yet (never usernames like JK). */
const REALTIME_FALLBACK_GROUP_CODES = new Set(["AP", "IG"]);

/** Only emit known accessible group codes (never usernames like JK). */
function resolveRealtimeViewGroup(selectedGroup) {
  const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (!g || !/^[A-Z0-9]{1,8}$/.test(g)) return "";
  const accessible = readAccessibleGroupIds();
  if (accessible.length > 0) {
    return accessible.includes(g) ? g : "";
  }
  return REALTIME_FALLBACK_GROUP_CODES.has(g) ? g : "";
}

function scopeParamsFromFilter() {
  const filter = readPersistedDashboardGcFilter() || {};
  const companyId =
    filter.companyId != null && filter.companyId !== ""
      ? Number(filter.companyId)
      : null;
  const viewGroup = resolveRealtimeViewGroup(filter.selectedGroup);
  const hasCompany = Number.isFinite(companyId) && companyId > 0;
  const groupOnly = !hasCompany && Boolean(viewGroup);

  return {
    companyId: groupOnly ? undefined : hasCompany ? companyId : undefined,
    viewGroup: viewGroup || undefined,
    groupId: viewGroup || undefined,
    groupAggregate: groupOnly ? true : undefined,
  };
}

/**
 * One WebSocket connection for the authenticated shell. Invalidates TanStack Query caches per
 * the rule table in realtimeInvalidationRules.js, and leaves a window event for pages that
 * subscribe directly via useRealtimeDomain (announcements, individual maintenance pages, ...).
 */
export default function AppRealtimeBridge() {
  const queryClient = useQueryClient();
  const ctlRef = useRef(null);

  useEffect(() => {
    const ctl = subscribeAppRealtime({
      getScopeParams: scopeParamsFromFilter,
    });
    ctlRef.current = ctl;

    let filterTimer = null;
    const onFilter = () => {
      // Dashboard/company session sync can fire this many times in one paint.
      if (filterTimer) clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        filterTimer = null;
        ctl.reconnect();
      }, 300);
    };
    window.addEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilter);
    const onForceReconnect = () => ctl.reconnect({ force: true });
    window.addEventListener(REALTIME_RECONNECT_EVENT, onForceReconnect);

    return () => {
      window.removeEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilter);
      window.removeEventListener(REALTIME_RECONNECT_EVENT, onForceReconnect);
      if (filterTimer) clearTimeout(filterTimer);
      ctl.stop();
      ctlRef.current = null;
    };
  }, []);

  // Same-tab writers (maintenance delete, process post, etc.) call notifyTransactionListInvalidated
  // while Transaction may be unmounted — drop RQ search cache so remount cannot paint stale rows.
  useEffect(() => {
    const dropLedgerQueryCaches = () => {
      void queryClient.invalidateQueries({
        queryKey: transactionQueryKeys.searchRoot(),
        refetchType: "none",
      });
      void queryClient.invalidateQueries({
        queryKey: transactionQueryKeys.contraInboxRoot(),
        refetchType: "none",
      });
    };
    window.addEventListener(TX_DATA_CHANGED_EVENT, dropLedgerQueryCaches);
    return () => window.removeEventListener(TX_DATA_CHANGED_EVENT, dropLedgerQueryCaches);
  }, [queryClient]);

  useEffect(() => {
    return onRealtimeInvalidate("*", (detail) => runRealtimeInvalidationRule(queryClient, detail));
  }, [queryClient]);

  return null;
}
