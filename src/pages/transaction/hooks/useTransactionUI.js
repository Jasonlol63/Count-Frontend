import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  loadContraInbox,
  approveContra as approveContraApi,
  rejectContra as rejectContraApi,
  transactionQueryKeys,
} from "../lib/transactionApi.js";
import { buildPaymentHistoryUrl } from "../lib/transactionPaymentHistoryUrl.js";
import { buildPaymentHistoryPopupFeatures } from "../lib/transactionPaymentHistoryPopup.js";

function scopeApiReady(scopeApi) {
  if (!scopeApi) return false;
  const cid = scopeApi.companyId != null ? Number(scopeApi.companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) return true;
  return Boolean(scopeApi.groupId || scopeApi.groupAggregate);
}

export function useTransactionUI() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState([]);
  const [contraInbox, setContraInbox] = useState({ open: false, loading: false, items: [] });
  const closeToastTimer = useRef(null);

  const pushToast = useCallback((message, type = "info") => {
    setToast((prev) => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, type, message }];
      return next.slice(-2);
    });
    if (closeToastTimer.current) clearTimeout(closeToastTimer.current);
    closeToastTimer.current = setTimeout(() => {
      setToast((prev) => prev.slice(1));
    }, 2500);
  }, []);

  const onViewHistory = useCallback(
    (row, dateFrom, dateTo, scopeApi, opts = {}) => {
      if (!row || !scopeApiReady(scopeApi)) return;
      const url = buildPaymentHistoryUrl({ row, dateFrom, dateTo, scopeApi, opts });
      const popupName = `payment_history_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const win = window.open(url, popupName, buildPaymentHistoryPopupFeatures());
      if (win) {
        win.focus();
      } else {
        pushToast("Popup blocked — allow popups for this site", "error");
      }
    },
    [pushToast],
  );

  const refreshContraInboxBadge = useCallback(
    async (scopeApi) => {
      if (!scopeApiReady(scopeApi)) return null;
      setContraInbox((s) => ({ ...s, loading: true }));
      try {
        const res = await queryClient.fetchQuery({
          queryKey: transactionQueryKeys.contraInbox(scopeApi),
          queryFn: ({ signal }) => loadContraInbox({ ...scopeApi, signal }),
          staleTime: 10_000,
          gcTime: 5 * 60_000,
        });
        if (res?.success) {
          setContraInbox((s) => ({ ...s, loading: false, items: Array.isArray(res.data) ? res.data : [] }));
        } else {
          setContraInbox((s) => ({ ...s, loading: false, items: [] }));
        }
        return res;
      } catch {
        setContraInbox((s) => ({ ...s, loading: false }));
        return null;
      }
    },
    [queryClient],
  );

  const approveContraMutation = useMutation({
    mutationFn: ({ id, scopeApi }) => approveContraApi({ transactionId: id, ...scopeApi }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInboxRoot() });
    },
  });

  const rejectContraMutation = useMutation({
    mutationFn: ({ id, scopeApi }) => rejectContraApi({ transactionId: id, ...scopeApi }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInboxRoot() });
    },
  });

  const onApproveContra = useCallback(
    async (id, scopeApi, onSearch) => {
      if (!id || !scopeApiReady(scopeApi)) return null;
      try {
        const res = await approveContraMutation.mutateAsync({ id, scopeApi });
        if (res?.success) {
          pushToast("Contra approved", "success");
          await refreshContraInboxBadge(scopeApi);
          if (onSearch) await onSearch({ silent: false });
        } else {
          pushToast(res?.message || "Failed to approve contra", "error");
        }
        return res;
      } catch (e) {
        pushToast(e.message, "error");
        return null;
      }
    },
    [approveContraMutation, pushToast, refreshContraInboxBadge],
  );

  const onRejectContra = useCallback(
    async (id, scopeApi) => {
      if (!id || !scopeApiReady(scopeApi)) return null;
      try {
        const res = await rejectContraMutation.mutateAsync({ id, scopeApi });
        if (res?.success) {
          pushToast("Contra rejected", "success");
          await refreshContraInboxBadge(scopeApi);
        } else {
          pushToast(res?.message || "Failed to reject contra", "error");
        }
        return res;
      } catch (e) {
        pushToast(e.message, "error");
        return null;
      }
    },
    [rejectContraMutation, pushToast, refreshContraInboxBadge],
  );

  return {
    toast,
    contraInbox,
    setContraInbox,
    pushToast,
    onViewHistory,
    refreshContraInboxBadge,
    onApproveContra,
    onRejectContra,
  };
}
