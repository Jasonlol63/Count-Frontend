import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import TransactionHistoryTable from "./components/TransactionHistoryTable.jsx";
import PaymentHistoryExportPdfModal from "./components/PaymentHistoryExportPdfModal.jsx";
import { formatHistoryMoney, formatHistoryBalanceMoney } from "./lib/transactionFormat.js";
import { getHistory, transactionQueryKeys } from "./lib/transactionApi.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import {
  paymentHistoryParamsReady,
  paymentHistoryTitle,
  resolveHistoryAccountName,
  resolvePaymentHistoryScope,
  paymentHistoryScopeApiParams,
  stripPaymentHistoryUrlQuery,
} from "./lib/transactionPaymentHistoryUrl.js";
import { TRANSACTION_SHOW_DESCRIPTION_COLUMN } from "./lib/transactionPaymentPageUtils.js";
import "../../../public/css/transaction.css";
import "../../../public/css/portal-tooltip.css";
import "../../../public/css/date-range-picker.css";
import "../../../public/css/report-outlined-fields.css";
import "./transactionPaymentHistoryPage.css";
import "./components/PaymentHistoryExportButton.css";
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

  const { isPopup, splitScreen, compactHeaders } = usePaymentHistoryLayoutMode();
  const [exportPdfOpen, setExportPdfOpen] = useState(false);
  const onOpenExportPdf = useCallback(() => setExportPdfOpen(true), []);
  const onCloseExportPdf = useCallback(() => setExportPdfOpen(false), []);

  useLayoutEffect(() => {
    stripPaymentHistoryUrlQuery();
    document.body.classList.add("dashboard-page", "transaction-page", "transaction-payment-history-page");
    if (isPopup) {
      document.body.classList.add("transaction-payment-history-page--popup");
    }
    if (splitScreen) {
      document.body.classList.add("transaction-payment-history-page--popup-compact");
    }
    clearInlineScrollLock();
    return () => {
      document.body.classList.remove(
        "transaction-page",
        "transaction-payment-history-page",
        "transaction-payment-history-page--popup",
        "transaction-payment-history-page--popup-compact",
        "page-ready",
      );
    };
  }, [isPopup, splitScreen]);

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
      pureTypeSearch: scope.pureTypeSearch,
    }),
    queryFn: ({ signal }) =>
      getHistory({
        ...scopeApi,
        accountId: scope.accountDbId,
        dateFrom: scope.dateFrom,
        dateTo: scope.dateTo,
        currency: scope.currency,
        virtualCompanyCode: scope.virtualCompanyCode,
        pureTypeSearch: scope.pureTypeSearch,
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
              <div className="transaction-payment-history-header__text">
                <h3 id="modal_title">{title}</h3>
              </div>
              <button
                type="button"
                className="transaction-payment-history-export-btn"
                aria-label={m.exportPdf}
                title={m.exportPdf}
                onClick={onOpenExportPdf}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path
                    d="M12 3v10M8 9l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="transaction-payment-history-export-btn__label">PDF</span>
              </button>
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
      <PaymentHistoryExportPdfModal
        open={exportPdfOpen}
        onClose={onCloseExportPdf}
        scope={scope}
        accountTitle={title}
      />
    </div>
  );
}
