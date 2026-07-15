import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { portalToDocumentBody } from "../../../components/ProcessModalPortal.jsx";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { TRANSACTION_I18N } from "../../../translateFile/pages/transactionTranslate.js";
import { MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";
import ReportDatePicker from "../../report/common/ReportDatePicker.jsx";
import {
  buildMaintenancePeriodPresets,
  parseDmy,
} from "../../maintenance/shared/maintenanceDateHelpers.js";
import {
  closeMaintenanceCalendarPopup,
  ensureMaintenanceDateRangePicker,
} from "../../../utils/date/dateRangePicker.js";
import {
  buildMemberReportFilename,
  downloadMemberReportPdf,
  exportCurrencyCodes,
  fetchMemberReportHistory,
  fetchPaymentHistoryExportCurrencies,
  resolveExportCurrenciesDefault,
  ymdRangeToDmy,
} from "../lib/paymentHistoryMemberReportExport.js";
import { applyCurrencyToggle, splitWinLossAccountBands } from "../../member/memberPageHelpers.js";
import "./PaymentHistoryExportPdfModal.css";

function ExportPdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export default function PaymentHistoryExportPdfModal({
  open,
  onClose,
  scope,
  accountTitle,
  messages,
  pickerInstanceId = "",
  shareCalendarPopup = false,
}) {
  const lang = useLoginLang();
  const defaultM = useMemo(() => TRANSACTION_I18N[lang] || TRANSACTION_I18N.en, [lang]);
  const m = useMemo(() => ({ ...defaultM, ...messages }), [defaultM, messages]);
  const maintenanceLocale = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const periodPresets = useMemo(() => buildMaintenancePeriodPresets(maintenanceLocale), [maintenanceLocale]);

  const initialFromYmd = useMemo(() => parseDmy(scope?.dateFrom || ""), [scope?.dateFrom]);
  const initialToYmd = useMemo(() => parseDmy(scope?.dateTo || ""), [scope?.dateTo]);

  const accountCode = String(scope?.accountCode || "").trim();
  const accountName = String(scope?.accountName || "").trim();
  const accountContextLabel = useMemo(() => {
    if (accountCode && accountName && accountName !== accountCode) {
      return { code: accountCode, name: accountName };
    }
    if (accountCode) return { code: accountCode, name: "" };
    const fallback = String(accountTitle || "").trim();
    return fallback ? { code: fallback, name: "" } : null;
  }, [accountCode, accountName, accountTitle]);

  const [dateFromYmd, setDateFromYmd] = useState(initialFromYmd);
  const [dateToYmd, setDateToYmd] = useState(initialToYmd);
  const [currencies, setCurrencies] = useState([]);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const exportModalTitle = useMemo(() => {
    const code = accountContextLabel?.code || "";
    const reportTitle = String(m.exportPdfTitle || "WIN/LOSE REPORT").trim();
    if (code) return `${code} - ${reportTitle}`;
    return reportTitle;
  }, [accountContextLabel, m.exportPdfTitle]);

  const exportCodes = useMemo(
    () => exportCurrencyCodes(isAllSelected, selectedCurrencies, currencies),
    [isAllSelected, selectedCurrencies, currencies],
  );

  const currencySelectionRequired = currencies.length > 0 && !loadingCurrencies && exportCodes.length === 0;

  const currencyButtonsRef = useRef(null);
  const currencyMeasureRef = useRef(null);
  const [currencyLayout, setCurrencyLayout] = useState({ containerWidth: 0, segmentWidths: [] });

  const currencyCells = useMemo(() => {
    const codes = Array.isArray(currencies) ? currencies : [];
    const cells = [];
    if (codes.length > 1) cells.push({ type: "all" });
    codes.forEach((code) => cells.push({ type: "code", code }));
    return cells;
  }, [currencies]);

  const currencyFilterBands = useMemo(
    () =>
      splitWinLossAccountBands(
        currencyCells,
        currencyLayout.segmentWidths,
        currencyLayout.containerWidth,
      ),
    [currencyCells, currencyLayout.containerWidth, currencyLayout.segmentWidths],
  );

  useLayoutEffect(() => {
    if (!open) return undefined;
    const container = currencyButtonsRef.current;
    const measure = currencyMeasureRef.current;
    if (!container || !measure) return undefined;

    const update = () => {
      const containerWidth = Math.max(container.clientWidth, 0);
      const buttons = measure.querySelectorAll("button.user-gc-segment");
      const segmentWidths = Array.from(buttons).map((btn) => btn.offsetWidth);
      setCurrencyLayout((prev) => {
        if (
          prev.containerWidth === containerWidth
          && prev.segmentWidths.length === segmentWidths.length
          && prev.segmentWidths.every((w, i) => w === segmentWidths[i])
        ) {
          return prev;
        }
        return { containerWidth, segmentWidths };
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [open, currencyCells, isAllSelected, selectedCurrencies, m.all]);

  useEffect(() => {
    if (!open) closeMaintenanceCalendarPopup();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.bindPickers?.();
  }, [open, pickerInstanceId]);

  useEffect(() => {
    if (!open) return;
    setDateFromYmd(initialFromYmd);
    setDateToYmd(initialToYmd);
    setError("");
  }, [open, initialFromYmd, initialToYmd]);

  useEffect(() => {
    if (!open) return undefined;
    const accountId = scope?.accountDbId;
    const companyId = scope?.companyId;
    if (!accountId || !companyId) {
      setCurrencies([]);
      setIsAllSelected(true);
      setSelectedCurrencies([]);
      return undefined;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingCurrencies(true);
    setError("");
    void fetchPaymentHistoryExportCurrencies(accountId, companyId, controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        const defaults = resolveExportCurrenciesDefault(scope?.currency, list);
        setCurrencies(list);
        setIsAllSelected(defaults.isAllSelected);
        setSelectedCurrencies(defaults.codes);
      })
      .catch((err) => {
        if (err?.name === "AbortError" || controller.signal.aborted) return;
        setCurrencies([]);
        setIsAllSelected(true);
        setSelectedCurrencies([]);
        setError(err?.message || m.exportPdfLoadCurrenciesFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCurrencies(false);
      });
    return () => controller.abort();
  }, [open, scope?.accountDbId, scope?.companyId, scope?.currency, m.exportPdfLoadCurrenciesFailed]);

  const handleRangeChange = useCallback((fromYmd, toYmd) => {
    setDateFromYmd(fromYmd || "");
    setDateToYmd(toYmd || "");
    setError("");
  }, []);

  const handleToggleCurrency = useCallback(
    (code) => {
      const next = applyCurrencyToggle(currencies, isAllSelected, selectedCurrencies, code);
      setIsAllSelected(next.isAllSelected);
      setSelectedCurrencies(next.selectedCurrencies);
      setError("");
    },
    [currencies, isAllSelected, selectedCurrencies],
  );

  const handleSelectAllCurrencies = useCallback(() => {
    setIsAllSelected(true);
    setSelectedCurrencies([]);
    setError("");
  }, []);

  const handleExport = useCallback(async () => {
    const accountId = scope?.accountDbId;
    const { dateFrom, dateTo } = ymdRangeToDmy(dateFromYmd, dateToYmd);
    const codes = exportCodes;
    if (!dateFrom || !dateTo) {
      setError(m.pleaseSelectDateRange);
      return;
    }
    if (!codes.length) {
      setError(m.pleaseSelectCurrency);
      return;
    }
    if (!accountId || !scope?.companyId) {
      setError(m.exportPdfMissingAccount);
      return;
    }
    const filename = buildMemberReportFilename({
      accountCode,
      currencies: codes,
      dateFrom,
      dateTo,
    });
    setExporting(true);
    setError("");
    try {
      const sections = await Promise.all(
        codes.map(async (currency) => {
          const rows = await fetchMemberReportHistory({
            accountId,
            companyId: scope.companyId,
            dateFrom,
            dateTo,
            currency,
          });
          return { currency, rows };
        }),
      );
      await downloadMemberReportPdf({
        sections,
        accountCode,
        accountName,
        dateFrom,
        dateTo,
        lang,
        filename,
      });
      onClose?.();
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError(err?.message || m.exportPdfFailed);
    } finally {
      setExporting(false);
    }
  }, [
    scope,
    dateFromYmd,
    dateToYmd,
    exportCodes,
    accountCode,
    accountName,
    lang,
    m,
    onClose,
  ]);

  if (!open) return null;

  return portalToDocumentBody(
    <div
      className="transaction-payment-history-export-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-history-export-title"
    >
      <button
        type="button"
        className="transaction-payment-history-export-overlay__backdrop"
        aria-label={m.close}
        disabled={exporting}
        onClick={() => {
          closeMaintenanceCalendarPopup();
          onClose?.();
        }}
      />
      <div className="transaction-payment-history-export-modal">
        <div className="transaction-payment-history-export-modal__header">
          <div className="transaction-payment-history-export-modal__heading">
            <h3 id="payment-history-export-title">{exportModalTitle}</h3>
          </div>
          <button
            type="button"
            className="transaction-modal-close transaction-payment-history-export-modal__close"
            aria-label={m.close}
            disabled={exporting}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="transaction-payment-history-export-modal__body">
          <div className="transaction-payment-history-export-modal__form">
            <span className="transaction-payment-history-export-modal__inline-label transaction-payment-history-export-modal__inline-label--date">
              {m.exportPdfDateRange}:
            </span>
            <div className="transaction-payment-history-export-modal__inline-control transaction-payment-history-export-modal__inline-control--date">
              <ReportDatePicker
                dateFrom={dateFromYmd}
                dateTo={dateToYmd}
                onRangeChange={handleRangeChange}
                containerClass="transaction-payment-history-export-date"
                label=""
                placeholder={m.exportPdfSelectDateRange}
                selectEndDateHint={m.exportPdfSelectEndDate}
                captureDateStyle
                instanceId={pickerInstanceId}
                shareCalendarPopup={shareCalendarPopup}
                periodPresets={periodPresets}
                periodShortcutsAria={m.exportPdfPeriod}
                monthLabels={m.monthsShort}
                weekdaysShort={m.weekdaysShort}
              />
            </div>
            <p className="transaction-payment-history-export-modal__field-hint">{m.exportPdfHint}</p>

            <span className="transaction-payment-history-export-modal__inline-label transaction-payment-history-export-modal__inline-label--currency">
              {m.exportPdfCurrency}:
            </span>
            <div className="transaction-payment-history-export-modal__inline-control transaction-payment-history-export-modal__inline-control--currency">
                {loadingCurrencies ? (
                  <p className="transaction-payment-history-export-modal__loading">{m.loading}</p>
                ) : currencies.length === 0 ? (
                  <p className="transaction-payment-history-export-modal__empty">{m.exportPdfNoCurrencies}</p>
                ) : (
                  <div
                    className="transaction-payment-history-export-modal__currency-pills user-gc-inline-pills"
                    ref={currencyButtonsRef}
                    role="group"
                    aria-label={m.exportPdfCurrency}
                  >
                    <div
                      ref={currencyMeasureRef}
                      className="transaction-payment-history-export-modal__currency-measure"
                      aria-hidden="true"
                    >
                      {currencyCells.map((cell) =>
                        cell.type === "all" ? (
                          <button key="export-ccy-measure-all" type="button" tabIndex={-1} className="user-gc-segment">
                            {m.all || "ALL"}
                          </button>
                        ) : (
                          <button
                            key={`export-ccy-measure-${cell.code}`}
                            type="button"
                            tabIndex={-1}
                            className="user-gc-segment"
                          >
                            {cell.code}
                          </button>
                        ),
                      )}
                    </div>
                    {currencyFilterBands.map((band, segIdx) => (
                      <div
                        key={`export-ccy-band-${segIdx}`}
                        className="user-gc-segment-group transaction-payment-history-export-modal__currency-segments"
                        style={{
                          width: "fit-content",
                          maxWidth: "100%",
                        }}
                      >
                        {band.map((cell) =>
                          cell.type === "all" ? (
                            <button
                              key="all"
                              type="button"
                              className={`user-gc-segment${isAllSelected ? " is-on" : ""}`}
                              data-currency-code="ALL"
                              onClick={handleSelectAllCurrencies}
                            >
                              {m.all || "ALL"}
                            </button>
                          ) : (
                            <button
                              key={cell.code}
                              type="button"
                              className={`user-gc-segment${
                                !isAllSelected && selectedCurrencies.includes(cell.code) ? " is-on" : ""
                              }`}
                              data-currency-code={cell.code}
                              onClick={() => handleToggleCurrency(cell.code)}
                            >
                              {cell.code}
                            </button>
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                )}
              {currencySelectionRequired ? (
                <p className="transaction-payment-history-export-modal__currency-warn" role="alert">
                  {m.pleaseSelectCurrency}
                </p>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="transaction-payment-history-export-modal__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="transaction-payment-history-export-modal__actions">
          <button
            type="button"
            className="transaction-payment-history-export-modal__btn transaction-payment-history-export-modal__btn--ghost"
            disabled={exporting}
            onClick={onClose}
          >
            {m.exportPdfCancel}
          </button>
          <button
            type="button"
            className="transaction-payment-history-export-modal__btn transaction-payment-history-export-modal__btn--primary"
            disabled={exporting || loadingCurrencies || exportCodes.length === 0}
            onClick={() => void handleExport()}
          >
            <ExportPdfIcon />
            <span>{exporting ? m.exportPdfExporting : m.exportPdf}</span>
          </button>
        </div>
      </div>
    </div>,
  );
}
