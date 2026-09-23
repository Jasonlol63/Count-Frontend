import { useEffect, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import {
  PERIOD_PRESET_KEYS,
  daysInclusive,
  periodPresetRange,
  todayYmd,
} from "../../lib/dashboardDateUtils.js";
import {
  DateRangeCalendarSheet,
  DateRangeRow,
  Pill,
  Section,
} from "../dashboard/FilterSheet.jsx";
import "../transaction/add-transaction-sheet.css";
import "../account/account.css";
import "./member.css";

function matchPreset(fromYmd, toYmd) {
  for (const key of PERIOD_PRESET_KEYS) {
    const range = periodPresetRange(key);
    if (range && range.dateFrom === fromYmd && range.dateTo === toYmd) return key;
  }
  return "";
}

function Sheet({ open, title, onClose, children, footer = null }) {
  useOverlayLock(open, onClose);
  return (
    <div
      className={`m-sheet-overlay${open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"}`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button type="button" className="m-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`m-sheet-panel m-sheet-panel--tall${open ? " m-sheet-panel--open" : " m-sheet-panel--closed"}`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>
        <header className="m-sheet-header">
          <h2 className="m-sheet-title">{title}</h2>
          <button type="button" className="m-sheet-close tap-scale" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="m-sheet-body m-sheet-body--spaced">{children}</div>
        {footer ? <footer className="m-account-sheet-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export default function MemberFilterSheet({
  open,
  onClose,
  t,
  companies,
  companyId,
  linkedAccounts,
  viewAccountId,
  dateFromYmd,
  dateToYmd,
  availableCurrencies,
  isAllSelected,
  selectedCurrencies,
  onApply,
  onSwitchCompany,
  onSwitchAccount,
  onSetCurrencyAll,
  onToggleCurrency,
}) {
  const [from, setFrom] = useState(dateFromYmd);
  const [to, setTo] = useState(dateToYmd);
  const [activePreset, setActivePreset] = useState(() => matchPreset(dateFromYmd, dateToYmd));
  const [rangeOpen, setRangeOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFrom(dateFromYmd);
    setTo(dateToYmd);
    setActivePreset(matchPreset(dateFromYmd, dateToYmd));
    setRangeOpen(false);
  }, [open, dateFromYmd, dateToYmd]);

  const span = daysInclusive(from, to);
  const daysLabel = (t("daysCount") || "{n} days").replace("{n}", String(span));

  return (
    <>
      <Sheet
        open={open}
        title={t("filters")}
        onClose={onClose}
        footer={
          <button
            type="button"
            className="m-account-primary-btn tap-scale"
            onClick={() => {
              void onApply?.({ fromYmd: from, toYmd: to });
              onClose?.();
            }}
          >
            {t("applyFilters")}
          </button>
        }
      >
        <Section
          title={t("dateRange")}
          trailing={
            span > 0 ? (
              <span
                className={`m-filter-span-badge${
                  activePreset ? " m-filter-span-badge--preset" : " m-filter-span-badge--custom"
                }`}
              >
                {activePreset ? daysLabel : `${t("customRange")} · ${daysLabel}`}
              </span>
            ) : null
          }
        >
          <DateRangeRow
            fromLabel={t("from")}
            toLabel={t("toDate")}
            dateFrom={from}
            dateTo={to}
            active={rangeOpen}
            onOpen={() => setRangeOpen(true)}
          />
        </Section>

        <Section title={t("quickSelect")}>
          <div className="m-filter-pill-wrap">
            {PERIOD_PRESET_KEYS.map((key) => (
              <Pill
                key={key}
                active={activePreset === key}
                onClick={() => {
                  const range = periodPresetRange(key);
                  if (!range) return;
                  setActivePreset(key);
                  setFrom(range.dateFrom);
                  setTo(range.dateTo);
                }}
              >
                {t(key)}
              </Pill>
            ))}
          </div>
        </Section>

        {companies.length > 1 ? (
          <Section title={t("company")}>
            <div className="m-filter-pill-wrap">
              {companies.map((c) => {
                const id = Number(c.id || c.company_db_id || 0);
                const code = String(c.company_id || c.company_code || id).toUpperCase();
                const active = id === Number(companyId);
                return (
                  <Pill key={id || code} active={active} onClick={() => void onSwitchCompany?.(id, code)}>
                    {code}
                  </Pill>
                );
              })}
            </div>
          </Section>
        ) : null}

        {linkedAccounts.length > 0 ? (
          <Section title={t("account")}>
            <div className="m-filter-pill-wrap">
              {linkedAccounts.map((a) => {
                const active = Number(a.id) === Number(viewAccountId);
                const code = String(a.account_id || a.id).toUpperCase();
                return (
                  <Pill
                    key={a.id}
                    active={active}
                    onClick={() => void onSwitchAccount?.(a.id, a.account_id, a.name)}
                  >
                    {code}
                  </Pill>
                );
              })}
            </div>
          </Section>
        ) : null}

        <Section title={t("currency")}>
          <div className="m-filter-pill-wrap">
            {availableCurrencies.length > 1 ? (
              <Pill active={isAllSelected} onClick={() => onSetCurrencyAll?.()}>
                {t("all")}
              </Pill>
            ) : null}
            {availableCurrencies.map((code) => {
              const active = !isAllSelected && selectedCurrencies.includes(code);
              const solo = availableCurrencies.length === 1 && selectedCurrencies.includes(code);
              return (
                <Pill
                  key={code}
                  active={active || solo || (availableCurrencies.length === 1 && isAllSelected)}
                  onClick={() => onToggleCurrency?.(code)}
                >
                  {code}
                </Pill>
              );
            })}
          </div>
        </Section>
      </Sheet>

      <DateRangeCalendarSheet
        open={rangeOpen}
        onClose={() => setRangeOpen(false)}
        dateFrom={from}
        dateTo={to}
        maxYmd={todayYmd()}
        labels={{
          selectDateRange: t("selectDateRange"),
          rangePickHint: t("rangePickHint"),
          from: t("from"),
          toDate: t("toDate"),
          today: t("today"),
          clear: t("clear"),
          done: t("done"),
          close: t("closeMenu") || t("close") || "Close",
        }}
        onApply={(nextFrom, nextTo) => {
          setFrom(nextFrom);
          setTo(nextTo);
          setActivePreset("");
        }}
      />
    </>
  );
}
