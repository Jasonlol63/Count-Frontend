import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import TransactionHistoryTable from "./components/TransactionHistoryTable.jsx";
import PaymentHistoryExportPdfModal from "./components/PaymentHistoryExportPdfModal.jsx";
import { formatHistoryMoney, formatHistoryBalanceMoney } from "./lib/transactionFormat.js";
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
import { usePaymentHistoryProgressive } from "./hooks/usePaymentHistoryProgressive.js";
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
  const paramsReady = paymentHistoryParamsReady(scope);

  const {
    rows,
    accountMeta: apiAccount,
    isInitialLoading,
    isLoadingMore,
    errorMessage,
    tableReady,
  } = usePaymentHistoryProgressive({
    scope,
    scopeApi,
    enabled: paramsReady,
  });

  /** When older months prepend, keep the viewport anchored on previously visible rows. */
  const scrollAnchorRef = useRef({ len: 0, height: 0 });
  useLayoutEffect(() => {
    if (!rows.length) {
      scrollAnchorRef.current = { len: 0, height: 0 };
      return;
    }
    const el = document.querySelector(
      ".transaction-payment-history-page-root .transaction-history-report-scroll",
    );
    if (!el) return;
    const prev = scrollAnchorRef.current;
    if (rows.length > prev.len && prev.height > 0) {
      const delta = el.scrollHeight - prev.height;
      if (delta > 0) el.scrollTop += delta;
    }
    scrollAnchorRef.current = { len: rows.length, height: el.scrollHeight };
  }, [rows]);

  const accountMeta = apiAccount
    ? {
        ...apiAccount,
        name: resolveHistoryAccountName({
          accountName: scope.accountName,
          accountMeta: apiAccount,
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
            {isInitialLoading ? (
              <div className="transaction-payment-history-loading" aria-live="polite">
                <span className="transaction-payment-history-loading__spinner" aria-hidden="true" />
                <span>{m.loadingHistory}</span>
              </div>
            ) : null}
            {errorMessage && !rows.length ? (
              <p className="transaction-payment-history-error" role="alert">
                {errorMessage}
              </p>
            ) : (
              <div
                className={
                  tableReady
                    ? "transaction-payment-history-table-wrap transaction-payment-history-table-wrap--ready"
                    : "transaction-payment-history-table-wrap"
                }
              >
                <TransactionHistoryTable
                  rows={rows}
                  histMoney={formatHistoryMoney}
                  histBalanceMoney={formatHistoryBalanceMoney}
                  showDescriptionColumn={TRANSACTION_SHOW_DESCRIPTION_COLUMN}
                  m={m}
                  compactHeaders={compactHeaders}
                />
                {isLoadingMore || (errorMessage && rows.length) ? (
                  <div
                    className="transaction-payment-history-load-more"
                    aria-live="polite"
                    role={errorMessage ? "alert" : "status"}
                  >
                    {isLoadingMore ? (
                      <>
                        <span className="transaction-payment-history-loading__spinner" aria-hidden="true" />
                        <span>{m.loadingMoreHistory || m.loadingHistory}</span>
                      </>
                    ) : (
                      <span>{errorMessage}</span>
                    )}
                  </div>
                ) : null}
              </div>
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
