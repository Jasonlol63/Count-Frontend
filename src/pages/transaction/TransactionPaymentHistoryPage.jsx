import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import TransactionHistoryTable from "./components/TransactionHistoryTable.jsx";
import { formatHistoryMoney, formatHistoryBalanceMoney } from "./lib/transactionFormat.js";
import { getHistory, transactionQueryKeys } from "./lib/transactionApi.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import {
  paymentHistoryParamsReady,
  paymentHistoryTitle,
  resolveHistoryAccountName,
  resolvePaymentHistoryScope,
  paymentHistoryScopeApiParams,
} from "./lib/transactionPaymentHistoryUrl.js";
import { TRANSACTION_SHOW_DESCRIPTION_COLUMN } from "./lib/transactionPaymentPageUtils.js";
import "../../../public/css/transaction.css";
import "../../../public/css/portal-tooltip.css";
import "./transactionPaymentHistoryPage.css";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { TRANSACTION_I18N } from "../../translateFile/pages/transactionTranslate.js";
import { clearInlineScrollLock } from "../../utils/layout/clearInlineScrollLock.js";
import { usePaymentHistoryLayoutMode } from "./hooks/usePaymentHistoryLayoutMode.js";

export default function TransactionPaymentHistoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scope = useMemo(() => resolvePaymentHistoryScope(searchParams), [searchParams]);
  const lang = useLoginLang();
  const m = useMemo(() => TRANSACTION_I18N[lang] || TRANSACTION_I18N.en, [lang]);

  const onClose = useCallback(() => {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.focus();
      }
    } catch {
      /* ignore cross-origin opener */
    }
    window.close();
    // Browsers block close() on user-opened tabs — fall back to in-app navigation.
    window.setTimeout(() => {
      if (!window.closed) {
        navigate(spaPath("transaction"), { replace: true });
      }
    }, 150);
  }, [navigate]);

  const { splitScreen, compactHeaders } = usePaymentHistoryLayoutMode();

  useLayoutEffect(() => {
    document.body.classList.add("dashboard-page", "transaction-page", "transaction-payment-history-page");
    if (splitScreen) {
      document.body.classList.add("transaction-payment-history-page--popup");
    }
    clearInlineScrollLock();
    return () => {
      document.body.classList.remove(
        "transaction-page",
        "transaction-payment-history-page",
        "transaction-payment-history-page--popup",
        "page-ready",
      );
    };
  }, [splitScreen]);

  const initialTitle = useMemo(
    () =>
      paymentHistoryTitle({
        accountCode: scope.accountCode,
        accountName: scope.accountName,
      }),
    [scope.accountCode, scope.accountName],
  );

  const scopeApi = useMemo(() => paymentHistoryScopeApiParams(scope), [scope]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: transactionQueryKeys.history({
      companyId: scopeApi.companyId,
      viewGroup: scopeApi.viewGroup,
      groupId: scopeApi.groupId,
      groupAggregate: scopeApi.groupAggregate,
      accountDbId: scope.accountDbId,
      dateFrom: scope.dateFrom,
      dateTo: scope.dateTo,
      currency: scope.currency,
      virtualCompanyCode: scope.virtualCompanyCode,
      subsidiaryAccountsOnly: scopeApi.subsidiaryAccountsOnly,
    }),
    queryFn: ({ signal }) =>
      getHistory({
        ...scopeApi,
        accountId: scope.accountDbId,
        dateFrom: scope.dateFrom,
        dateTo: scope.dateTo,
        currency: scope.currency,
        virtualCompanyCode: scope.virtualCompanyCode,
        signal,
      }),
    enabled: paymentHistoryParamsReady(scope),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const paramsReady = paymentHistoryParamsReady(scope);
  const rows = data?.success && Array.isArray(data.data) ? data.data : [];
  const accountMeta = data?.account
    ? {
        ...data.account,
        name: resolveHistoryAccountName({
          accountName: scope.accountName,
          accountMeta: data.account,
          accountCode: scope.accountCode,
        }),
      }
    : null;
  const title = accountMeta
    ? paymentHistoryTitle({
        accountCode: scope.accountCode,
        accountName: scope.accountName,
        accountMeta,
      })
    : initialTitle;
  const errorMessage = isError ? error?.message || "Failed to load history" : data?.success === false ? data?.message : null;

  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);

  if (!paramsReady) {
    return <Navigate to={spaPath("transaction")} replace />;
  }

  return (
    <div className="transaction-payment-history-page-root">
      <div className="transaction-payment-history-main">
        <div className="transaction-modal-content transaction-history-modal transaction-payment-history-panel">
          <div className="transaction-modal-header transaction-payment-history-header">
            <div className="transaction-payment-history-header__brand">
              <div className="transaction-payment-history-header__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M7 3h8l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                  <path d="M15 3v5h5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                  <path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </div>
              <div className="transaction-payment-history-header__text">
                <h3 id="modal_title">{title}</h3>
              </div>
            </div>
            <button
              type="button"
              className="transaction-modal-close transaction-payment-history-close"
              aria-label={m.close}
              onClick={onClose}
            >
              &times;
            </button>
          </div>
          <div className="transaction-modal-body transaction-payment-history-body">
            {isLoading ? (
              <div className="transaction-payment-history-loading" aria-live="polite">
                <span className="transaction-payment-history-loading__spinner" aria-hidden="true" />
                <span>{m.loadingHistory}</span>
              </div>
            ) : null}
            {errorMessage ? (
              <p className="transaction-payment-history-error" role="alert">
                {errorMessage}
              </p>
            ) : (
              <TransactionHistoryTable
                rows={rows}
                histMoney={formatHistoryMoney}
                histBalanceMoney={formatHistoryBalanceMoney}
                showDescriptionColumn={TRANSACTION_SHOW_DESCRIPTION_COLUMN}
                m={m}
                compactHeaders={compactHeaders}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
