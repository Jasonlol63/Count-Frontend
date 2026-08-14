import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DASHBOARD_GROUP_FILTER_EVENT,
  clearOwnerCompaniesCache,
  readAccessibleGroupIds,
  readPersistedDashboardGcFilter,
} from "../../utils/company/sharedCompanyFilter.js";
import { transactionQueryKeys } from "../../pages/transaction/lib/transactionApi.js";
import {
  notifyTransactionListInvalidated,
  TX_DATA_CHANGED_EVENT,
} from "../../pages/transaction/lib/transactionPaymentLogic.js";
import { dataCaptureQueryKeys } from "../../pages/datacapture/lib/dataCaptureApi.js";
import { clearAccountListRouteWarmCache } from "../../pages/account/accountRoutePrefetch.js";
import { clearProcessListRouteWarmCaches } from "../../pages/processlist/processRoutePrefetch.js";
import { clearAllOwnershipCompaniesCache } from "../../pages/ownership/ownershipRoutePrefetch.js";
import { clearAllAutoRenewListCache } from "../../pages/autorenew/autoRenewRoutePrefetch.js";
import { onRealtimeInvalidate, REALTIME_DOMAINS, REALTIME_RECONNECT_EVENT } from "./realtimeEvents.js";
import { subscribeAppRealtime } from "./subscribeAppRealtime.js";

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
 * One SSE connection for the authenticated shell.
 * Invalidates TanStack Query caches + leaves window event for manual-fetch pages.
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
    return onRealtimeInvalidate("*", (detail) => {
      const domain = String(detail.domain || "");
      const source = String(detail.source || "");

      if (domain === REALTIME_DOMAINS.LEDGER || detail.type === "ledger_changed") {
        clearAllAutoRenewListCache();
        notifyTransactionListInvalidated("realtime_ledger");
        void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
        void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInboxRoot() });
        return;
      }

      if (domain === REALTIME_DOMAINS.ACCOUNTS) {
        clearAccountListRouteWarmCache();
        void queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey?.[0];
            return (
              k === "tx-accounts" ||
              k === "tx-company-currencies" ||
              k === "tx-scope-account-currencies"
            );
          },
        });
        // User Acc whitelist changed — also drop ledger caches (belt if ledger publish missed).
        if (source === "user_account_permissions" || source === "update_permissions") {
          clearAllAutoRenewListCache();
          notifyTransactionListInvalidated(`realtime_${source}`);
          void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
          void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInboxRoot() });
        }
        return;
      }

      if (domain === REALTIME_DOMAINS.PROCESSES) {
        clearProcessListRouteWarmCaches();
        void queryClient.invalidateQueries({ queryKey: dataCaptureQueryKeys.root() });
        return;
      }

      if (domain === REALTIME_DOMAINS.OWNERSHIP) {
        clearAllOwnershipCompaniesCache();
        clearOwnerCompaniesCache();
        return;
      }

      const invalidateLedgerCaches = (tag) => {
        clearAllAutoRenewListCache();
        notifyTransactionListInvalidated(tag);
        void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
        void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInboxRoot() });
      };

      /** Maintenance / capture writes that change balances — belt if ledger publish missed. */
      const LEDGER_TOUCHING_SOURCES = new Set([
        "capture_delete",
        "capture_update",
        "payment_delete",
        "payment_update",
        "bankprocess_delete",
        "transaction_delete",
        "post_to_transaction",
        "restore",
        "domain_fee_create",
        "domain_fee_update",
        "summary_submit",
      ]);

      if (domain === REALTIME_DOMAINS.DATACAPTURE) {
        void queryClient.invalidateQueries({ queryKey: dataCaptureQueryKeys.root() });
        void queryClient.invalidateQueries({
          predicate: (q) => q.queryKey?.[0] === "summary",
        });
        if (LEDGER_TOUCHING_SOURCES.has(source)) {
          invalidateLedgerCaches(`realtime_${source}`);
        }
        return;
      }

      if (domain === REALTIME_DOMAINS.USERS) {
        void queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey?.[0];
            return k === "users" || k === "user-list" || k === "useraccess";
          },
        });
        return;
      }

      if (domain === REALTIME_DOMAINS.MAINTENANCE) {
        if (LEDGER_TOUCHING_SOURCES.has(source)) {
          invalidateLedgerCaches(`realtime_${source}`);
        }
        return;
      }

      if (domain === REALTIME_DOMAINS.DOMAIN) {
        if (LEDGER_TOUCHING_SOURCES.has(source) || /fee/.test(source)) {
          invalidateLedgerCaches(`realtime_${source || "domain"}`);
        }
        return;
      }

      // Announcements / app: pages listen via useRealtimeDomain.
    });
  }, [queryClient]);

  return null;
}
