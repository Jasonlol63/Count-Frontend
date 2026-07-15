import { useEffect } from "react";
import {
  TX_LIST_INVALIDATE_LS_KEY,
  TX_LIST_INVALIDATE_HANDLED_KEY,
  TX_DATA_CHANGED_EVENT,
  buildTxListSessionKey,
} from "../lib/transactionPaymentLogic.js";
import { clearTxSearchCache } from "../../../utils/transaction/transactionSearchCache.js";
import {
  transactionScopeApiParams,
  transactionScopeCacheCompanyKey,
  transactionScopeIsReady,
} from "../lib/transactionScope.js";

function readInvalidateHandledTs() {
  try {
    return parseInt(sessionStorage.getItem(TX_LIST_INVALIDATE_HANDLED_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function markInvalidateHandled(ts) {
  try {
    sessionStorage.setItem(TX_LIST_INVALIDATE_HANDLED_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

export function useTransactionSync({
  filterSnapshot,
  transactionScope,
  effectiveDateFrom,
  effectiveDateTo,
  selectedCategories,
  searchState,
  showAllCurrencies,
  selectedCurrencies,
  lastSearchCommitMsRef,
  runSearch,
  loading,
  forbidden,
  canApproveContra,
  refreshContraInboxBadge,
  initialSearchDoneRef,
}) {
  useEffect(() => {
    let retryTimer = null;
    let refreshInFlight = false;
    const queueRetry = () => {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        refreshFromInvalidate();
      }, 650);
    };

    const refreshFromInvalidate = () => {
      const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || "0", 10) || 0;
      const handledTs = readInvalidateHandledTs();
      if (!invalidateTs || invalidateTs <= handledTs) return;
      if (!effectiveDateFrom || !effectiveDateTo) {
        queueRetry();
        return;
      }
      if (!showAllCurrencies && selectedCurrencies.length === 0) {
        queueRetry();
        return;
      }
      if (refreshInFlight) return;
      refreshInFlight = true;
      clearTxSearchCache();
      try {
        const key = buildTxListSessionKey({
          companyId: transactionScopeCacheCompanyKey(transactionScope),
          dateFrom: effectiveDateFrom,
          dateTo: effectiveDateTo,
          selectedCategories,
          showInactive: searchState.showPaymentOnly,
          showCaptureOnly: searchState.showCaptureOnly,
          hideZeroBalance: !searchState.showZeroBalance,
          showAllCurrencies,
          selectedCurrencies,
        });
        if (key) sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      void Promise.resolve(runSearch?.({ silent: true, forceRefresh: true }))
        .then(() => {
          markInvalidateHandled(invalidateTs);
          if (lastSearchCommitMsRef) {
            lastSearchCommitMsRef.current = Date.now();
          }
        })
        .finally(() => {
          refreshInFlight = false;
        });
    };

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      refreshFromInvalidate();
    };
    const onStorage = (e) => {
      if (!e || e.key !== TX_LIST_INVALIDATE_LS_KEY) return;
      refreshFromInvalidate();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    window.addEventListener(TX_DATA_CHANGED_EVENT, refreshFromInvalidate);
    // Same-tab navigate-back: apply pending invalidate immediately (don't wait for 5s poll).
    refreshFromInvalidate();
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshFromInvalidate();
    }, 5000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TX_DATA_CHANGED_EVENT, refreshFromInvalidate);
      clearInterval(poll);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    transactionScopeCacheCompanyKey(transactionScope),
    effectiveDateFrom,
    effectiveDateTo,
    selectedCategories,
    searchState.showPaymentOnly,
    searchState.showCaptureOnly,
    searchState.showZeroBalance,
    showAllCurrencies,
    selectedCurrencies,
    lastSearchCommitMsRef,
    runSearch,
  ]);

  useEffect(() => {
    const scopeApi = transactionScopeApiParams(transactionScope);
    if (loading || forbidden || !canApproveContra || !transactionScopeIsReady(transactionScope)) return;

    const pollContra = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshContraInboxBadge?.(scopeApi);
    };

    let interval = null;
    const startPolling = () => {
      void pollContra();
      interval = setInterval(pollContra, 20000);
    };

    if (initialSearchDoneRef?.current) {
      startPolling();
      return () => {
        if (interval) clearInterval(interval);
      };
    }

    const waitId = setInterval(() => {
      if (!initialSearchDoneRef?.current) return;
      clearInterval(waitId);
      startPolling();
    }, 150);

    return () => {
      clearInterval(waitId);
      if (interval) clearInterval(interval);
    };
  }, [loading, forbidden, canApproveContra, transactionScope, refreshContraInboxBadge, initialSearchDoneRef]);
}
