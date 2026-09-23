import { useCallback, useEffect, useMemo, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import {
  buildMemberReportFilename,
  downloadMemberReportPdf,
  exportCurrencyCodes,
  fetchMemberReportHistory,
  fetchPaymentHistoryExportCurrencies,
  resolveExportCurrenciesDefault,
  ymdRangeToDmy,
} from "../../lib/paymentHistoryExport.js";

export default function ExportPdfSheet({
  open,
  onClose,
  m,
  scope,
  accountCode,
  accountName,
  lang = "en",
}) {
  useOverlayLock(open, onClose);
  const [dateFromYmd, setDateFromYmd] = useState(scope?.dateFrom || "");
  const [dateToYmd, setDateToYmd] = useState(scope?.dateTo || "");
  const [currencies, setCurrencies] = useState([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDateFromYmd(scope?.dateFrom || "");
    setDateToYmd(scope?.dateTo || "");
    setError("");
  }, [open, scope?.dateFrom, scope?.dateTo]);

  useEffect(() => {
    if (!open) return undefined;
    const accountId = scope?.accountDbId;
    const companyId = scope?.companyId;
    const groupId = scope?.groupId || "";
    if (!accountId || (!companyId && !groupId)) {
      setCurrencies([]);
      return undefined;
    }
    const ac = new AbortController();
    setLoadingCurrencies(true);
    (async () => {
      try {
        const list = await fetchPaymentHistoryExportCurrencies(accountId, companyId, ac.signal, groupId);
        if (ac.signal.aborted) return;
        setCurrencies(list);
        const def = resolveExportCurrenciesDefault(scope?.currency, list);
        setIsAllSelected(def.isAllSelected);
        setSelectedCurrencies(def.codes);
      } catch (err) {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setError(m.exportPdfLoadCurrenciesFailed);
        setCurrencies([]);
      } finally {
        if (!ac.signal.aborted) setLoadingCurrencies(false);
      }
    })();
    return () => ac.abort();
  }, [
    open,
    scope?.accountDbId,
    scope?.companyId,
    scope?.groupId,
    scope?.currency,
    m.exportPdfLoadCurrenciesFailed,
  ]);

  const exportCodes = useMemo(
    () => exportCurrencyCodes(isAllSelected, selectedCurrencies, currencies),
    [isAllSelected, selectedCurrencies, currencies],
  );

  const toggleCurrency = (code) => {
    setIsAllSelected(false);
    setSelectedCurrencies((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const handleExport = useCallback(async () => {
    const accountId = scope?.accountDbId;
    const groupId = scope?.groupId || "";
    const { dateFrom, dateTo } = ymdRangeToDmy(dateFromYmd, dateToYmd);
    if (!dateFrom || !dateTo) {
      setError(m.pleaseSelectDateRange);
      return;
    }
    if (!exportCodes.length) {
      setError(m.pleaseSelectAtLeastOneCurrency);
      return;
    }
    if (!accountId || (!scope?.companyId && !groupId)) {
      setError(m.exportPdfMissingAccount);
      return;
    }
    setExporting(true);
    setError("");
    try {
      const sections = await Promise.all(
        exportCodes.map(async (currency) => {
          const rows = await fetchMemberReportHistory({
            accountId,
            companyId: scope.companyId,
            groupId,
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
        filename: buildMemberReportFilename({
          accountCode,
          currencies: exportCodes,
          dateFrom,
          dateTo,
        }),
        title: m.exportPdfTitle,
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
    m,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col justify-end bg-slate-900/45 backdrop-blur-[2px]">
      <button type="button" className="min-h-0 flex-1" aria-label={m.close} onClick={onClose} />
      <div className="flex max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-[15px] font-bold text-slate-900">{m.exportPdf}</p>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500"
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <p className="text-[11px] leading-relaxed text-slate-500">{m.exportPdfHint}</p>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{m.from}</span>
              <input
                type="date"
                value={dateFromYmd}
                max={dateToYmd || undefined}
                onChange={(e) => setDateFromYmd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-semibold"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{m.to}</span>
              <input
                type="date"
                value={dateToYmd}
                min={dateFromYmd || undefined}
                onChange={(e) => setDateToYmd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-semibold"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {m.exportPdfCurrency}
            </p>
            {loadingCurrencies ? (
              <p className="text-[13px] text-slate-500">{m.loading}</p>
            ) : currencies.length === 0 ? (
              <p className="text-[13px] text-rose-600">{m.exportPdfNoCurrencies}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {currencies.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAllSelected(true);
                      setSelectedCurrencies([]);
                    }}
                    className={`tap-scale rounded-xl px-3 py-2 text-[11px] font-bold ${
                      isAllSelected ? "bg-[linear-gradient(180deg,#63c4ff,#0d60ff)] text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {m.all}
                  </button>
                ) : null}
                {currencies.map((code) => {
                  const active = !isAllSelected && selectedCurrencies.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleCurrency(code)}
                      className={`tap-scale rounded-xl px-3 py-2 text-[11px] font-bold ${
                        active || (currencies.length === 1 && selectedCurrencies.includes(code))
                          ? "bg-[linear-gradient(180deg,#63c4ff,#0d60ff)] text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{error}</p>
          ) : null}
        </div>

        <div
          className="flex gap-2 border-t border-slate-100 px-4 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <button
            type="button"
            disabled={exporting}
            onClick={onClose}
            className="tap-scale flex-1 rounded-2xl bg-slate-100 py-3.5 text-[14px] font-bold text-slate-600"
          >
            {m.exportPdfCancel}
          </button>
          <button
            type="button"
            disabled={exporting || loadingCurrencies || exportCodes.length === 0}
            onClick={() => void handleExport()}
            className="tap-scale flex-[2] rounded-2xl bg-[linear-gradient(180deg,#63c4ff,#0d60ff)] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {exporting ? m.exportPdfExporting : m.exportPdf}
          </button>
        </div>
      </div>
    </div>
  );
}
