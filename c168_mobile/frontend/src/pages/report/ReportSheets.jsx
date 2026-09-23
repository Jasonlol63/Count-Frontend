import { useEffect, useMemo, useRef, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import {
  PERIOD_PRESET_KEYS,
  daysInclusive,
  formatRangeLabel,
  periodPresetRange,
  todayYmd,
} from "../../lib/dashboardDateUtils.js";
import {
  companiesForPicker,
  resolveCompanyPickForGroup,
} from "../../lib/dashboardScope.js";
import { orderCurrencyCodesForCompany } from "../../lib/currencyOrder.js";
import { fetchCustomerAccounts, fetchDomainProcesses, fetchReportCurrencies } from "../../lib/reportApi.js";
import { dashboardLabel } from "../../translateFile/dashboardTranslate.js";
import {
  DateRangeCalendarSheet,
  DateRangeRow,
  Pill,
  Section,
} from "../dashboard/FilterSheet.jsx";
import { MaintenanceFilterBar } from "../maintenance/MaintenanceSheets.jsx";

export { MaintenanceFilterBar as ReportFilterBar };

function buildDraft({
  dateFrom,
  dateTo,
  activePreset,
  groupMode,
  groupsAllMode = false,
  selectedGroup,
  companyId,
  processId = "",
  accountId = "",
  showAll = false,
  selectedCurrencies = [],
  showAllCurrencies = false,
}) {
  return {
    dateFrom,
    dateTo,
    activePreset: activePreset || "",
    groupMode: Boolean(groupMode) && !groupsAllMode,
    groupsAllMode: Boolean(groupsAllMode),
    groupId: groupsAllMode ? null : selectedGroup || null,
    companyId: groupsAllMode ? null : companyId ?? null,
    processId: processId ?? "",
    accountId: accountId ?? "",
    showAll: Boolean(showAll),
    selectedCurrencies: Array.isArray(selectedCurrencies) ? [...selectedCurrencies] : [],
    showAllCurrencies: Boolean(showAllCurrencies),
  };
}

function draftScope(draft, allowedGroupIds = []) {
  if (draft.groupsAllMode) {
    return {
      mode: "groupsAll",
      companyId: null,
      groupId: null,
      groupIds: [...allowedGroupIds],
    };
  }
  if (draft.groupMode && draft.groupId) {
    return { mode: "group", companyId: null, groupId: draft.groupId };
  }
  const cid = Number(draft.companyId);
  return {
    mode: "company",
    companyId: Number.isFinite(cid) && cid > 0 ? cid : null,
    groupId: draft.groupId,
  };
}

/**
 * Report filter sheet — date + GC + Domain process / Customer account+currency+Show All.
 */
export function ReportFilterSheet({
  open,
  onClose,
  i18n,
  variant = "domain",
  dateFrom,
  dateTo,
  activePreset = "",
  groupMode = false,
  groupsAllMode = false,
  selectedGroup = null,
  companyId = null,
  companies = [],
  groupIds = [],
  allowedGroupIds = [],
  processId = "",
  accountId = "",
  showAll = false,
  selectedCurrencies = [],
  showAllCurrencies = false,
  onApply,
}) {
  const bodyRef = useRef(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    buildDraft({
      dateFrom,
      dateTo,
      activePreset,
      groupMode,
      groupsAllMode,
      selectedGroup,
      companyId,
      processId,
      accountId,
      showAll,
      selectedCurrencies,
      showAllCurrencies,
    }),
  );
  const [processOptions, setProcessOptions] = useState([]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  useOverlayLock(open, onClose);

  const isCustomer = variant === "customer";

  useEffect(() => {
    if (!open) {
      setRangeOpen(false);
      return;
    }
    setDraft(
      buildDraft({
        dateFrom,
        dateTo,
        activePreset,
        groupMode,
        groupsAllMode,
        selectedGroup,
        companyId,
        processId,
        accountId,
        showAll,
        selectedCurrencies,
        showAllCurrencies,
      }),
    );
    bodyRef.current?.scrollTo?.({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scope = draftScope(draft, allowedGroupIds);
  const scopeKey =
    scope.mode === "groupsAll"
      ? `groupsAll:${(scope.groupIds || []).join(",")}`
      : `${scope.mode}:${scope.companyId ?? ""}:${scope.groupId ?? ""}`;

  useEffect(() => {
    if (!open) return undefined;
    const ac = new AbortController();
    if (!isCustomer) {
      fetchDomainProcesses(scope, { signal: ac.signal })
        .then((list) => setProcessOptions(list))
        .catch((e) => {
          if (e?.name !== "AbortError") setProcessOptions([]);
        });
    } else {
      Promise.all([
        fetchCustomerAccounts(scope, { signal: ac.signal }).catch((e) => {
          if (e?.name === "AbortError") throw e;
          return [];
        }),
        fetchReportCurrencies(scope, { signal: ac.signal })
          .then(async (currencies) => {
            const codes = (currencies || [])
              .map((c) => String(c?.code || c?.currency || c).trim().toUpperCase())
              .filter((code) => /^[A-Z]{3}$/.test(code));
            const orderCid =
              Number(scope.companyId) > 0
                ? Number(scope.companyId)
                : Number(
                    companiesForPicker(companies, {
                      selectedGroup: scope.groupId,
                      groupsAllMode: scope.mode === "groupsAll",
                    })?.[0]?.id,
                  ) || 0;
            const ordered = await orderCurrencyCodesForCompany(codes, orderCid, ac.signal);
            // Keep objects but reorder to company display order (not A–Z).
            const byCode = new Map(
              (currencies || []).map((row) => [
                String(row?.code || row?.currency || row)
                  .trim()
                  .toUpperCase(),
                row,
              ]),
            );
            return ordered.map((code) => byCode.get(code) || { code });
          })
          .catch((e) => {
            if (e?.name === "AbortError") throw e;
            return [];
          }),
      ])
        .then(([accounts, currencies]) => {
          setAccountOptions(accounts);
          setCurrencyOptions(currencies);
        })
        .catch((e) => {
          if (e?.name !== "AbortError") {
            setAccountOptions([]);
            setCurrencyOptions([]);
          }
        });
    }
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCustomer, scopeKey]);

  const pickable = companiesForPicker(companies, {
    selectedGroup: draft.groupId,
    groupsAllMode: draft.groupsAllMode,
    preferredCompanyId: draft.companyId,
  });
  const showGroupsAllPill = allowedGroupIds.length > 1;

  const pickDraftGroupsAll = () => {
    setDraft((prev) => ({
      ...prev,
      groupsAllMode: true,
      groupMode: false,
      groupId: null,
      companyId: null,
      processId: "",
      accountId: "",
    }));
  };

  const pickDraftGroup = (gid) => {
    setDraft((prev) => {
      if (allowedGroupIds.includes(gid)) {
        return {
          ...prev,
          groupsAllMode: false,
          groupMode: true,
          groupId: gid,
          companyId: null,
          processId: "",
          accountId: "",
        };
      }
      const pick = resolveCompanyPickForGroup(companies, gid, prev.companyId);
      return {
        ...prev,
        groupsAllMode: false,
        groupMode: false,
        groupId: gid,
        companyId: pick?.id ?? prev.companyId,
        processId: "",
        accountId: "",
      };
    });
  };

  const thisMonth = periodPresetRange("thisMonth") || { dateFrom: todayYmd(), dateTo: todayYmd() };

  // Preserve company / API order — never A–Z sort (matches desktop per-company order).
  const currencyCodes = useMemo(
    () => [
      ...new Set(
        currencyOptions
          .map((c) => String(c.code || c.currency || c).trim().toUpperCase())
          .filter((code) => /^[A-Z]{3}$/.test(code)),
      ),
    ],
    [currencyOptions],
  );

  const defaultCurrencyCode = useMemo(() => {
    if (!currencyCodes.length) return "MYR";
    if (currencyCodes.includes("MYR")) return "MYR";
    return currencyCodes[0];
  }, [currencyCodes]);

  // Customer report: seed a concrete currency (MYR / first) — never leave "All currencies".
  useEffect(() => {
    if (!open || !isCustomer || !currencyCodes.length) return;
    setDraft((prev) => {
      const cur = prev.selectedCurrencies.map((c) => String(c).toUpperCase());
      const valid = cur.filter((c) => currencyCodes.includes(c));
      if (valid.length > 0 && !prev.showAllCurrencies) {
        if (valid.length === cur.length) return prev;
        return { ...prev, selectedCurrencies: valid, showAllCurrencies: false };
      }
      return {
        ...prev,
        selectedCurrencies: [defaultCurrencyCode],
        showAllCurrencies: false,
      };
    });
  }, [open, isCustomer, currencyCodes, defaultCurrencyCode]);

  const handleReset = () => {
    setDraft((prev) => ({
      ...prev,
      dateFrom: thisMonth.dateFrom,
      dateTo: thisMonth.dateTo,
      activePreset: "thisMonth",
      processId: "",
      accountId: "",
      showAll: false,
      selectedCurrencies: isCustomer ? [defaultCurrencyCode] : [],
      showAllCurrencies: false,
    }));
  };

  const toggleCurrency = (code) => {
    const upper = String(code || "").toUpperCase();
    setDraft((prev) => {
      const cur = prev.selectedCurrencies.map((c) => String(c).toUpperCase());
      const next = cur.includes(upper) ? cur.filter((c) => c !== upper) : [...cur, upper];
      // Keep at least one currency selected (no All-currencies mode on mobile Customer Report).
      if (isCustomer && next.length === 0) return { ...prev, showAllCurrencies: false };
      return { ...prev, selectedCurrencies: next, showAllCurrencies: false };
    });
  };

  const handleApply = () => {
    const currencies = draft.selectedCurrencies
      .map((c) => String(c).toUpperCase())
      .filter(Boolean);
    const customerCurrencies =
      currencies.length > 0 ? currencies : isCustomer ? [defaultCurrencyCode] : [];
    onApply?.({
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo,
      activePreset: draft.activePreset,
      scope: draftScope(draft, allowedGroupIds),
      processId: draft.processId,
      accountId: draft.accountId,
      showAll: draft.showAll,
      selectedCurrencies: isCustomer ? customerCurrencies : draft.selectedCurrencies,
      showAllCurrencies: isCustomer
        ? false
        : draft.showAllCurrencies || draft.selectedCurrencies.length === 0,
    });
    onClose?.();
  };

  const span = daysInclusive(draft.dateFrom, draft.dateTo);
  const daysLabel = (i18n.daysCount || "{n} days").replace("{n}", String(span));

  return (
    <div
      className={`m-sheet-overlay${open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"}`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button type="button" aria-label="Close filter" onClick={onClose} className="m-sheet-backdrop" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.filter}
        className={`m-sheet-panel${open ? " m-sheet-panel--open" : " m-sheet-panel--closed"}`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>

        <div className="m-sheet-header">
          <h2 className="m-sheet-title">{i18n.filter}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="m-sheet-close tap-scale">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div ref={bodyRef} className="m-sheet-body m-sheet-body--spaced">
          <Section
            title={i18n.dateRange}
            trailing={
              span > 0 ? (
                <span
                  className={`m-filter-span-badge${
                    draft.activePreset ? " m-filter-span-badge--preset" : " m-filter-span-badge--custom"
                  }`}
                >
                  {draft.activePreset ? daysLabel : `${i18n.customRange} · ${daysLabel}`}
                </span>
              ) : null
            }
          >
            <DateRangeRow
              fromLabel={i18n.from}
              toLabel={i18n.toDate}
              dateFrom={draft.dateFrom}
              dateTo={draft.dateTo}
              active={rangeOpen}
              onOpen={() => setRangeOpen(true)}
            />
          </Section>

          <Section title={i18n.quickSelect}>
            <div className="m-filter-pill-wrap">
              {PERIOD_PRESET_KEYS.map((key) => (
                <Pill
                  key={key}
                  active={draft.activePreset === key}
                  onClick={() => {
                    const range = periodPresetRange(key);
                    if (!range) return;
                    setDraft((prev) => ({
                      ...prev,
                      activePreset: key,
                      dateFrom: range.dateFrom,
                      dateTo: range.dateTo,
                    }));
                  }}
                >
                  {dashboardLabel(i18n, key)}
                </Pill>
              ))}
            </div>
          </Section>

          {groupIds.length > 0 && (
            <Section title={i18n.groupId}>
              <div className="m-filter-pill-wrap">
                {showGroupsAllPill ? (
                  <Pill tone="violet" active={draft.groupsAllMode} onClick={pickDraftGroupsAll}>
                    {i18n.all}
                  </Pill>
                ) : null}
                {groupIds.map((gid) => (
                  <Pill
                    key={gid}
                    tone="violet"
                    active={!draft.groupsAllMode && draft.groupId === gid}
                    onClick={() => pickDraftGroup(gid)}
                  >
                    {gid}
                  </Pill>
                ))}
              </div>
              {showGroupsAllPill ? (
                <p className="m-filter-hint">
                  {i18n.groupHint || "Tap a group for group-only · All merges allowed groups"}
                </p>
              ) : null}
            </Section>
          )}

          <Section title={i18n.company}>
            <div className="m-filter-pill-wrap">
              {pickable.map((c) => {
                const label = String(c.company_id).toUpperCase();
                const draftRow = companies.find((row) => Number(row.id) === Number(draft.companyId));
                const draftCode = String(draftRow?.company_id || "").trim().toUpperCase();
                const active =
                  !draft.groupsAllMode &&
                  !draft.groupMode &&
                  (Number(draft.companyId) === Number(c.id) || (draftCode && draftCode === label));
                return (
                  <Pill
                    key={label}
                    active={active}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        groupsAllMode: false,
                        groupMode: false,
                        companyId: c.id,
                        groupId: c.group_id ? String(c.group_id).trim().toUpperCase() : null,
                        processId: "",
                        accountId: "",
                      }))
                    }
                  >
                    {label}
                  </Pill>
                );
              })}
            </div>
          </Section>

          {!isCustomer ? (
            <Section title={i18n.process}>
              <label className="m-mt-field">
                <select
                  value={draft.processId === "" || draft.processId == null ? "" : String(draft.processId)}
                  onChange={(e) => setDraft((prev) => ({ ...prev, processId: e.target.value }))}
                >
                  <option value="">{i18n.allProcess}</option>
                  {processOptions.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {p.display_text || p.process || p.id}
                    </option>
                  ))}
                </select>
              </label>
            </Section>
          ) : (
            <>
              <Section title={i18n.account}>
                <label className="m-mt-field">
                  <select
                    value={draft.accountId === "" || draft.accountId == null ? "" : String(draft.accountId)}
                    onChange={(e) => setDraft((prev) => ({ ...prev, accountId: e.target.value }))}
                  >
                    <option value="">{i18n.allAccounts}</option>
                    {accountOptions.map((a) => {
                      const id = String(a.id ?? "");
                      if (!id) return null;
                      const label =
                        a.display_text ||
                        `${a.account_id || id}${a.name ? ` (${a.name})` : ""}`;
                      return (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </Section>

              <Section title={i18n.currency}>
                <div className="m-filter-pill-wrap">
                  {currencyCodes.map((code) => (
                    <Pill
                      key={code}
                      active={draft.selectedCurrencies
                        .map((c) => String(c).toUpperCase())
                        .includes(code)}
                      onClick={() => toggleCurrency(code)}
                    >
                      {code}
                    </Pill>
                  ))}
                </div>
              </Section>

              <Section title={i18n.showAll}>
                <button
                  type="button"
                  className={`m-rpt-toggle tap-scale${draft.showAll ? " is-on" : ""}`}
                  aria-pressed={draft.showAll}
                  onClick={() => setDraft((prev) => ({ ...prev, showAll: !prev.showAll }))}
                >
                  <span>{i18n.showAll}</span>
                  <span className="m-rpt-toggle-knob" aria-hidden="true" />
                </button>
              </Section>
            </>
          )}
        </div>

        <div className="m-sheet-footer">
          <button type="button" onClick={handleReset} className="m-sheet-footer-btn m-sheet-footer-btn--muted tap-scale">
            {i18n.reset}
          </button>
          <button type="button" onClick={handleApply} className="m-sheet-footer-btn m-sheet-footer-btn--primary tap-scale">
            {i18n.applyFilter || i18n.apply}
          </button>
        </div>
      </div>

      <DateRangeCalendarSheet
        open={rangeOpen}
        onClose={() => setRangeOpen(false)}
        dateFrom={draft.dateFrom}
        dateTo={draft.dateTo}
        maxYmd={todayYmd()}
        labels={{
          selectDateRange: i18n.selectDateRange,
          rangePickHint: i18n.rangePickHint,
          from: i18n.from,
          toDate: i18n.toDate,
          today: i18n.today,
          clear: i18n.clear,
          done: i18n.done,
          close: i18n.closeMenu || "Close",
        }}
        onApply={(from, to) =>
          setDraft((prev) => ({
            ...prev,
            dateFrom: from,
            dateTo: to,
            activePreset: "",
          }))
        }
      />
    </div>
  );
}

export function reportRangeLabel(dateFrom, dateTo) {
  return formatRangeLabel(dateFrom, dateTo);
}
