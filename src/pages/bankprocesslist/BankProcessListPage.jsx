import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AccountModal from "../../components/AccountModal.jsx";
import { accountModalOverlayZIndex, processNotificationAboveAccountZIndex, processNotificationZIndex } from "../../components/ProcessModalPortal.jsx";
import "../../../public/css/processCSS.css";
import "../../../public/css/processlist.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/account-list.css";
import "../../../public/css/userlist.css";
import "../../../public/css/date-range-picker.css";
import ProcessDeleteConfirmModal from "../processlist/components/ProcessDeleteConfirmModal.jsx";
import AddProcessIcon from "../processlist/components/AddProcessIcon.jsx";
import BankProcessTable from "./components/BankProcessTable.jsx";
import BankProcessFilterChips from "./components/BankProcessFilterChips.jsx";
import BankProcessFormModal from "./components/BankProcessFormModal.jsx";
import CountrySelectionModal from "./components/CountrySelectionModal.jsx";
import BankSelectionModal from "./components/BankSelectionModal.jsx";
import ProfitSharingModal from "./components/ProfitSharingModal.jsx";
import { BankNoteModal, BankRemarkModal } from "./components/bankProcessTextModals.jsx";
import AccountingDueModal from "./components/AccountingDueModal.jsx";
import ResendModal from "./components/ResendModal.jsx";
import { DashboardCalendarPopup } from "../dashboard/components/DashboardCalendarPopup.jsx";
import { bankProcessFrequencyNormalized, normalizeBankProcessStatus, isoToDmy } from "./lib/bankProcessHelpers.js";
import { useBankProcessListPage } from "./hooks/useBankProcessListPage.js";
import { useBankProcessFilterCollapse } from "./hooks/useBankProcessFilterCollapse.js";
import { useC168ProcessRouteGuard } from "../processlist/useC168ProcessRouteGuard.js";

export default function BankProcessListPage() {
  useC168ProcessRouteGuard();
  const {
    navigate,
    location,
    resolveLang,
    lang,
    setLang,
    bpLocale,
    t,
    apiMsg,
    tAccount,
    handleDatePickerChange,
    loading,
    setLoading,
    tableLoading,
    setTableLoading,
    companies,
    setCompanies,
    companyId,
    setCompanyId,
    groupFilterKind,
    setGroupFilterKind,
    rows,
    setRows,
    currentPage,
    setCurrentPage,
    selectedIds,
    setSelectedIds,
    search,
    setSearch,
    showAll,
    setShowAll,
    showInactive,
    setShowInactive,
    showOfficial,
    setShowOfficial,
    showEInvoice,
    setShowEInvoice,
    showBlock,
    setShowBlock,
    clearBankProcessFilters,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deleteSubmitting,
    setDeleteSubmitting,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    toast,
    setToast,
    accounts,
    setAccounts,
    modalOpen,
    setModalOpen,
    editMode,
    setEditMode,
    form,
    setForm,
    accountingOpen,
    setAccountingOpen,
    accountingRows,
    setAccountingRows,
    accountingLoading,
    setAccountingLoading,
    accountingSelected,
    setAccountingSelected,
    accountingDeleteSelected,
    setAccountingDeleteSelected,
    resendModalOpen,
    setResendModalOpen,
    resendTarget,
    setResendTarget,
    resendDayStart,
    setResendDayStart,
    resendDayEnd,
    setResendDayEnd,
    resendFrequency,
    setResendFrequency,
    resendInlineError,
    setResendInlineError,
    resendConfirmDisabled,
    resendLockChecking,
    isBankResendScheduleLockedToday,
    sortColumn,
    sortDirection,
    remarkModalOpen,
    setRemarkModalOpen,
    remarkDraft,
    setRemarkDraft,
    remarkRow,
    setRemarkRow,
    countriesList,
    setCountriesList,
    banksList,
    setBanksList,
    countryModalOpen,
    setCountryModalOpen,
    bankModalOpen,
    setBankModalOpen,
    countrySearch,
    setCountrySearch,
    bankSearch,
    setBankSearch,
    newCountryName,
    setNewCountryName,
    newBankName,
    setNewBankName,
    selectedCountryChips,
    setSelectedCountryChips,
    selectedBankChips,
    setSelectedBankChips,
    selectedBanksByCountry,
    setSelectedBanksByCountry,
    profitShareModalOpen,
    setProfitShareModalOpen,
    profitShareRows,
    setProfitShareRows,
    bankFormNote,
    setBankFormNote,
    addAccountModalOpen,
    setAddAccountModalOpen,
    accountPlusTarget,
    setAccountPlusTarget,
    accountModalIsEditMode,
    setAccountModalIsEditMode,
    rolesList,
    setRolesList,
    accountModalCurrencies,
    setAccountModalCurrencies,
    accountModalForm,
    setAccountModalForm,
    accountModalSelectedCurrencyIds,
    setAccountModalSelectedCurrencyIds,
    accountModalSelectedCompanyIds,
    setAccountModalSelectedCompanyIds,
    accountModalInitialCurrencyIds,
    setAccountModalInitialCurrencyIds,
    accountModalCurrencyInput,
    setAccountModalCurrencyInput,
    currencyListOrdered,
    setCurrencyListOrdered,
    currencyFilterCode,
    setCurrencyFilterCode,
    handlePickCurrency,
    handlePickAllCurrencies,
    currencyPillDisplayOrder,
    setCurrencyPillDisplayOrder,
    skipNextCurrencyPillClickRef,
    toastTimerRef,
    listAbortRef,
    skipNextBankFetchRef,
    bankDatePickerInitRef,
    contractSyncKeysRef,
    seedContractSyncKeys,
    notify,
    accountModalOrderedRoles,
    getAccountIdForPlusTarget,
    loadAccountModalSelectionMeta,
    resetAccountModalToAdd,
    closeAccountModal,
    fetchAccountDetailJson,
    createAccountModalCurrency,
    removeAccountModalCurrency,
    submitAccountModal,
    loadCurrencyMeta,
    syncUrl,
    fetchRows,
    handleBankStatusUpdated,
    loadAccountingInbox,
    resetForm,
    onPickCompanyPill,
    warmBankProcessListCompanyCache,
    openAdd,
    persistSelectedCountries,
    persistSelectedBanksByCountry,
    submitNewCountry,
    submitNewBank,
    removeAvailableCountry,
    removeAvailableBank,
    openProfitShareModal,
    confirmProfitShareModal,
    handleAccountModalSuccess,
    openAddAccountForField,
    openEdit,
    submitForm,
    postAccountingToTransaction,
    dismissAccountingRows,
    saveRemarkModal,
    resendAccountingDue,
    deleteSelected,
    confirmDeleteProcesses,
    allCompanyButtons,
    groupIds,
    selectedCompany,
    selectedGroupKey,
    companyButtons,
    handlePickGroup,
    handlePickAllGroups,
    sortedRows,
    handleBankTableSort,
    rowCountryCodes,
    baseCurrencyPills,
    currencyPillCodes,
    persistOrderedCompanyCurrencies,
    onCurrencyPillDrop,
    visibleRows,
    totalPages,
    pageRows,
    PAGE_SIZE,
    listRegionRef,
  } = useBankProcessListPage();

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [isNarrowToolbar, setIsNarrowToolbar] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1699px)").matches,
  );
  const filterToolbarRef = useRef(null);
  const searchBarRef = useRef(null);
  const searchInputRef = useRef(null);
  const hasActiveFilters = showInactive || showAll || showOfficial || showEInvoice || showBlock;
  const isSearchCollapsed = isNarrowToolbar && !searchExpanded && !search.trim();

  const {
    toolbarTopRowRef,
    toolbarPrimaryRef,
    deleteActionsRef,
    filterMeasureRef,
    isFilterCollapsed,
  } = useBankProcessFilterCollapse({
    remeasureDeps: [lang, isSearchCollapsed, searchExpanded, search, dateFrom, dateTo],
  });

  const calendarI18n = useMemo(
    () => ({
      periodShortcutsAria: t("periodShortcutsAria"),
      monthLabels: bpLocale.monthsShort,
      weekdaysShort: bpLocale.weekdaysShort,
    }),
    [t, bpLocale],
  );

  const periodPresets = useMemo(
    () => [
      ["today", t("today")],
      ["yesterday", t("yesterday")],
      ["thisWeek", t("thisWeek")],
      ["lastWeek", t("lastWeek")],
      ["thisMonth", t("thisMonth")],
      ["lastMonth", t("lastMonth")],
      ["thisYear", t("thisYear")],
      ["lastYear", t("lastYear")],
    ],
    [t],
  );

  const filterChipsProps = useMemo(
    () => ({
      t,
      showInactive,
      setShowInactive,
      showAll,
      setShowAll,
      showOfficial,
      setShowOfficial,
      showEInvoice,
      setShowEInvoice,
      showBlock,
      setShowBlock,
    }),
    [
      t,
      showInactive,
      setShowInactive,
      showAll,
      setShowAll,
      showOfficial,
      setShowOfficial,
      showEInvoice,
      setShowEInvoice,
      showBlock,
      setShowBlock,
    ],
  );

  const hasDeletableRows = useMemo(
    () => visibleRows.some((r) => normalizeBankProcessStatus(r.status) === "inactive" && !r.has_transactions),
    [visibleRows],
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1699px)");
    const onChange = () => {
      setIsNarrowToolbar(mq.matches);
      if (!mq.matches) {
        setSearchExpanded(false);
        setFilterPanelOpen(false);
      }
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!searchExpanded || !isNarrowToolbar) return undefined;
    const id = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [searchExpanded, isNarrowToolbar]);

  useEffect(() => {
    if (!isFilterCollapsed) setFilterPanelOpen(false);
  }, [isFilterCollapsed]);

  useEffect(() => {
    if (!filterPanelOpen || !isFilterCollapsed) return undefined;
    const onDoc = (e) => {
      if (filterToolbarRef.current?.contains(e.target)) return;
      setFilterPanelOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setFilterPanelOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterPanelOpen, isFilterCollapsed]);

  const handleFilterToggleClick = (e) => {
    if (e.detail > 1) return;
    setFilterPanelOpen((open) => !open);
  };

  const handleFilterToggleDoubleClick = (e) => {
    e.preventDefault();
    if (!hasActiveFilters) return;
    clearBankProcessFilters();
    setFilterPanelOpen(false);
  };

  useEffect(() => {
    if (!isNarrowToolbar || !searchExpanded || search.trim()) return undefined;
    const onDoc = (e) => {
      if (searchBarRef.current?.contains(e.target)) return;
      setSearchExpanded(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isNarrowToolbar, searchExpanded, search]);

  return (
    <div className="container">
      <div className="content">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", marginBottom: 0, flexWrap: "wrap", gap: 12 }}>
          <div className="bank-process-header-left">
            <AccountingDueModal
              isOpen={accountingOpen}
              setOpen={setAccountingOpen}
              accountingRows={accountingRows}
              accountingLoading={accountingLoading}
              accountingSelected={accountingSelected}
              setAccountingSelected={setAccountingSelected}
              accountingDeleteSelected={accountingDeleteSelected}
              setAccountingDeleteSelected={setAccountingDeleteSelected}
              onPostToTransaction={postAccountingToTransaction}
              onDismissRows={dismissAccountingRows}
              loadAccountingInbox={loadAccountingInbox}
              lang={lang}
              t={t}
            />
          </div>
        </div>
        <div className="action-buttons-container">
          <div className="action-buttons">
            <div className="bank-process-toolbar-main">
              <div ref={toolbarTopRowRef} className="bank-process-toolbar-top-row">
                <div
                  ref={toolbarPrimaryRef}
                  className={[
                    "action-controls-row bank-process-toolbar-primary",
                    isFilterCollapsed ? "bank-process-toolbar-primary--filter-collapsed" : "",
                  ].filter(Boolean).join(" ")}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <button type="button" className="btn btn-add bank-process-toolbar-add" onClick={openAdd} title={t("addProcess")}>
                    <AddProcessIcon />
                    {t("addProcess")}
                  </button>
                  <div className="process-list-date-filter transaction-date-range-group" id="processListDateFilter" style={{ display: "inline-flex" }}>
                    <div
                      className="date-range-picker"
                      id="date-range-picker"
                      role="button"
                      tabIndex={0}
                      aria-label={t("selectDateRange")}
                    >
                      <i className="fas fa-calendar-alt" aria-hidden="true" />
                      {/* Text is driven by MaintenanceDateRangePicker (must not set React children or they overwrite picker + stale i18n). */}
                      <span id="date-range-display" aria-live="polite" />
                      <button type="button" className="process-list-date-clear" id="processListDateClearBtn" title={t("clearDateRange")} aria-label={t("clearDateRange")}>&times;</button>
                      <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
                    </div>
                    <input
                      type="hidden"
                      id="date_from"
                      readOnly
                      value={dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? isoToDmy(dateFrom) : ""}
                    />
                    <input
                      type="hidden"
                      id="date_to"
                      readOnly
                      value={dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? isoToDmy(dateTo) : ""}
                    />
                  </div>
                  <div
                    ref={searchBarRef}
                    className={[
                      "search-container userlist-search-bar bank-process-search-bar",
                      isNarrowToolbar && isSearchCollapsed ? "is-collapsed" : "",
                      isNarrowToolbar && !isSearchCollapsed ? "is-expanded" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {isSearchCollapsed ? (
                      <button
                        type="button"
                        className="bank-process-search-toggle"
                        aria-label={t("search")}
                        aria-expanded={false}
                        onClick={() => setSearchExpanded(true)}
                      >
                        <span className="userlist-search-bar__icon" aria-hidden="true">
                          <svg fill="currentColor" viewBox="0 0 24 24">
                            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                          </svg>
                        </span>
                      </button>
                    ) : (
                      <>
                        <span className="userlist-search-bar__icon" aria-hidden="true">
                          <svg fill="currentColor" viewBox="0 0 24 24">
                            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                          </svg>
                        </span>
                        <input
                          ref={searchInputRef}
                          type="text"
                          className="search-input userlist-search-input"
                          placeholder={t("search")}
                          value={search}
                          aria-expanded={isNarrowToolbar ? searchExpanded || Boolean(search.trim()) : undefined}
                          onChange={(e) => setSearch(e.target.value)}
                          onBlur={() => {
                            if (isNarrowToolbar && !search.trim()) setSearchExpanded(false);
                          }}
                        />
                      </>
                    )}
                  </div>
                  <div ref={filterToolbarRef} className="bank-process-filter-toolbar-slot">
                    {isFilterCollapsed ? (
                      <>
                        <button
                          type="button"
                          className={[
                            "bank-process-filter-toggle",
                            "bank-process-filter-toggle--icon-only",
                            filterPanelOpen ? "is-open" : "",
                            hasActiveFilters ? "has-active-filters" : "",
                          ].filter(Boolean).join(" ")}
                          aria-expanded={filterPanelOpen}
                          aria-controls="bank-process-filter-panel"
                          aria-label={t("filter")}
                          title={hasActiveFilters ? t("filterDoubleClickClear") : t("filter")}
                          onClick={handleFilterToggleClick}
                          onDoubleClick={handleFilterToggleDoubleClick}
                        >
                          <span className="bank-process-filter-toggle__icon" aria-hidden="true">
                            <svg fill="currentColor" viewBox="0 0 24 24">
                              <path d="M4.25 6h15.5c.41 0 .64.47.4.8L14 13.2v5.3a.75.75 0 0 1-1.1.67l-2.9-1.45a.75.75 0 0 1-.4-.67v-4.3L3.85 6.8a.75.75 0 0 1 .4-1.2z" />
                            </svg>
                          </span>
                          <span className="bank-process-filter-toggle__label">{t("filter")}</span>
                        </button>
                        <div
                          id="bank-process-filter-panel"
                          className={[
                            "bank-process-filter-panel",
                            "bank-process-filter-panel--dropdown",
                            filterPanelOpen ? "is-open" : "",
                          ].filter(Boolean).join(" ")}
                        >
                          <div className="bank-process-filter-dropdown">
                            <BankProcessFilterChips {...filterChipsProps} layout="dropdown" />
                            {hasActiveFilters ? (
                              <button
                                type="button"
                                className="bank-process-filter-dropdown__clear"
                                onClick={() => {
                                  clearBankProcessFilters();
                                  setFilterPanelOpen(false);
                                }}
                              >
                                {t("filterClearAll")}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </>
                    ) : (
                      <BankProcessFilterChips {...filterChipsProps} layout="inline" />
                    )}
                  </div>
                  <div ref={filterMeasureRef} className="bank-process-filter-measure" aria-hidden="true">
                    <BankProcessFilterChips {...filterChipsProps} layout="inline" />
                  </div>
                </div>
                <div ref={deleteActionsRef} className="user-toolbar-actions-right bank-process-toolbar-actions-right">
                  <button type="button" className="btn btn-delete" id="processDeleteSelectedBtn" disabled={!selectedIds.size} title={t("delete")} onClick={deleteSelected}>{t("delete")}</button>
                </div>
              </div>
            </div>
          </div>
          <div className="user-gc-inline-panel">
            {groupIds.length > 0 && (
              <div className="user-gc-inline-row">
                <span className="user-gc-inline-label">{t("groupId")}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
                    {groupIds.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`user-gc-segment${groupFilterKind === "follow" && g === selectedGroupKey ? " is-on" : ""}`}
                        onClick={() => handlePickGroup(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="user-gc-inline-row">
              <span className="user-gc-inline-label">{t("company")}</span>
              <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                <div className="user-gc-segment-group" role="group" aria-label={t("company")}>
                  {companyButtons.map((c) => {
                    const active = Number(c.id) === Number(companyId);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`user-gc-segment${active ? " is-on" : ""}`}
                        onMouseEnter={() => warmBankProcessListCompanyCache(c.id)}
                        onFocus={() => warmBankProcessListCompanyCache(c.id)}
                        onClick={() => onPickCompanyPill(c)}
                      >
                        {String(c.company_id || "").toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {currencyListOrdered.length > 0 && (
              <div className="user-gc-inline-row">
                <span className="user-gc-inline-label">{t("currency")}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div className="user-gc-segment-group" role="group" aria-label={t("currency")}>
                    <button
                      type="button"
                      className={`user-gc-segment${!currencyFilterCode ? " is-on" : ""}`}
                      onClick={handlePickAllCurrencies}
                    >
                      {t("groupFilterAll")}
                    </button>
                    {currencyPillCodes.map((code) => (
                      <button
                        key={code}
                        type="button"
                        draggable
                        title={t("currencyDragHint")}
                        className={`user-gc-segment user-gc-segment--draggable-pill${currencyFilterCode === code ? " is-on" : ""}`}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", code);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { void onCurrencyPillDrop(e, code); }}
                        onClick={() => {
                          if (skipNextCurrencyPillClickRef.current) {
                            skipNextCurrencyPillClickRef.current = false;
                            return;
                          }
                          handlePickCurrency(code);
                        }}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bank-process-list-body">
        <div
          ref={listRegionRef}
          className="bank-process-list-scroll-region"
          role="region"
          aria-label={t("bankProcessList")}
        >
          <BankProcessTable
            tableLoading={tableLoading}
            showAll={showAll}
            showSelectColumn={showAll || showInactive || showOfficial || showEInvoice || showBlock || hasDeletableRows}
            pageRows={pageRows}
            currentPage={currentPage}
            PAGE_SIZE={PAGE_SIZE}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            showHeaderSelectAll={showAll || showInactive || showOfficial || showEInvoice || showBlock}
            notify={notify}
            fetchRows={fetchRows}
            onBankStatusUpdated={handleBankStatusUpdated}
            loadAccountingInbox={loadAccountingInbox}
            openEdit={openEdit}
            openRemarkModal={(row) => {
              setRemarkRow(row);
              setRemarkDraft(String(row.remark || ""));
              setRemarkModalOpen(true);
            }}
            openResendModal={(row) => {
              setResendInlineError("");
              setResendTarget(row);
              setResendDayStart(String(row.day_start || row.date || "").slice(0, 10));
              const seedFq = bankProcessFrequencyNormalized(row.day_start_frequency);
              setResendFrequency(seedFq);
              setResendDayEnd(
                seedFq === "once" || seedFq === "monthly" ? "" : String(row.day_end || "").slice(0, 10),
              );
              setResendModalOpen(true);
            }}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleBankTableSort}
            isBankResendScheduleLockedToday={isBankResendScheduleLockedToday}
            lang={lang}
            t={t}
          />
        </div>
        {!showAll && (
          <div className="pagination-container">
            <button type="button" className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              ◀
            </button>
            <span className="pagination-info">{t("pageOf", { current: currentPage, total: totalPages })}</span>
            <button
              type="button"
              className="pagination-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              ▶
            </button>
          </div>
        )}
        </div>
      </div>

      {modalOpen && (
        <BankProcessFormModal
          editMode={editMode} form={form} setForm={setForm} accounts={accounts}
          countriesList={selectedCountryChips}
          banksList={selectedBanksByCountry[String(form.country || "").trim()] || []}
          onClose={() => setModalOpen(false)} onSubmit={submitForm}
          onOpenCountryModal={() => {
            setSelectedCountryChips((prev) => {
              const set = new Set(prev);
              const cur = String(form.country || "").trim().toUpperCase();
              if (cur) set.add(cur);
              return [...set].sort((a, b) => a.localeCompare(b));
            });
            setCountrySearch("");
            setNewCountryName("");
            setCountryModalOpen(true);
          }}
          onOpenBankModal={() => {
            const country = String(form.country || "").trim();
            if (!country) {
              notify(t("pleaseSelectCountryFirst"), "warning");
              return;
            }
            const banks = [...(selectedBanksByCountry[country] || [])];
            const cur = String(form.bank || "").trim();
            if (cur && !banks.includes(cur)) banks.push(cur);
            setSelectedBankChips(banks);
            setBankSearch("");
            setNewBankName("");
            setBankModalOpen(true);
          }}
          onOpenProfitShareModal={openProfitShareModal}
          onOpenBankFormNoteModal={(kind) => setBankFormNote({ kind, draft: kind === "sop" ? String(form.sop || "") : String(form.remark || "") })}
          onOpenAddAccountForField={openAddAccountForField}
          lang={lang}
          t={t}
        />
      )}

      {countryModalOpen && (
        <CountrySelectionModal
          countriesList={countriesList} selectedCountryChips={selectedCountryChips} setSelectedCountryChips={setSelectedCountryChips}
          countrySearch={countrySearch} setCountrySearch={setCountrySearch} newCountryName={newCountryName} setNewCountryName={setNewCountryName}
          onSubmitNewCountry={submitNewCountry} onRemoveAvailableCountry={removeAvailableCountry}
          onConfirm={(codes) => {
            const ordered = [];
            const seen = new Set();
            for (const c of codes || []) {
              const u = String(c || "").trim().toUpperCase();
              if (!u || seen.has(u)) continue;
              seen.add(u);
              ordered.push(u);
            }
            if (!ordered.length) return;
            setSelectedCountryChips(ordered);
            void persistSelectedCountries(ordered);
            setForm((f) => {
              const cur = String(f.country || "").trim().toUpperCase();
              const nextCountry = ordered.includes(cur) ? f.country : ordered[0];
              const countryChanged =
                String(nextCountry || "").trim().toUpperCase() !== cur;
              return { ...f, country: nextCountry, bank: countryChanged ? "" : f.bank };
            });
            setCountryModalOpen(false);
          }}
          onClose={() => setCountryModalOpen(false)} notify={notify}
          t={t}
        />
      )}

      {bankModalOpen && (
        <BankSelectionModal
          banksList={banksList} selectedBankChips={selectedBankChips} setSelectedBankChips={setSelectedBankChips}
          bankSearch={bankSearch} setBankSearch={setBankSearch} newBankName={newBankName} setNewBankName={setNewBankName}
          onSubmitNewBank={submitNewBank} onRemoveAvailableBank={removeAvailableBank}
          onConfirm={(banks) => {
            const country = String(form.country || "").trim();
            if (!country) return;
            const ordered = [];
            const seen = new Set();
            for (const b of banks || []) {
              const u = String(b || "").trim().toUpperCase();
              if (!u || seen.has(u)) continue;
              seen.add(u);
              ordered.push(u);
            }
            if (!ordered.length) return;
            const nextMap = { ...selectedBanksByCountry, [country]: ordered };
            setSelectedBanksByCountry(nextMap);
            setSelectedBankChips(ordered);
            void persistSelectedBanksByCountry(nextMap);
            setForm((f) => {
              const cur = String(f.bank || "").trim().toUpperCase();
              const nextBank = ordered.includes(cur) ? f.bank : ordered[0];
              return { ...f, bank: nextBank };
            });
            setBankModalOpen(false);
          }}
          onClose={() => setBankModalOpen(false)} notify={notify}
          t={t}
        />
      )}

      {profitShareModalOpen && (
        <ProfitSharingModal
          profitShareRows={profitShareRows} setProfitShareRows={setProfitShareRows} accounts={accounts}
          onConfirm={confirmProfitShareModal} onClose={() => setProfitShareModalOpen(false)}
          onOpenAddAccountForField={openAddAccountForField}
          t={t}
        />
      )}

      <BankNoteModal
        bankFormNote={bankFormNote} setBankFormNote={setBankFormNote}
        onSave={() => {
          if (bankFormNote) {
            const { kind, draft } = bankFormNote;
            if (kind === "sop") setForm((f) => ({ ...f, sop: draft })); else setForm((f) => ({ ...f, remark: draft }));
            setBankFormNote(null);
          }
        }}
        t={t}
      />

      {resendModalOpen && (
        <ResendModal
          resendTarget={resendTarget} resendDayStart={resendDayStart}
          resendDayEnd={resendDayEnd} resendFrequency={resendFrequency} setResendFrequency={setResendFrequency}
          resendInlineError={resendInlineError} setResendInlineError={setResendInlineError}
          resendConfirmDisabled={resendConfirmDisabled}
          resendLockChecking={resendLockChecking}
          onResend={resendAccountingDue} onClose={() => setResendModalOpen(false)}
          t={t}
        />
      )}

      {remarkModalOpen && (
        <BankRemarkModal remarkDraft={remarkDraft} setRemarkDraft={setRemarkDraft} onSave={saveRemarkModal} onClose={() => setRemarkModalOpen(false)} t={t} />
      )}

      <ProcessDeleteConfirmModal
        open={deleteConfirmOpen}
        count={selectedIds.size}
        deleting={deleteSubmitting}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteProcesses}
        t={t}
      />

      <AccountModal
        open={addAccountModalOpen}
        portalToBody
        overlayZIndex={accountModalOverlayZIndex}
        title={accountModalIsEditMode ? tAccount("editAccount") : tAccount("addAccount")}
        isEditMode={accountModalIsEditMode}
        form={accountModalForm}
        setForm={setAccountModalForm}
        orderedRoles={accountModalOrderedRoles}
        currencies={accountModalCurrencies}
        companies={companies}
        selectedCurrencyIds={accountModalSelectedCurrencyIds}
        setSelectedCurrencyIds={setAccountModalSelectedCurrencyIds}
        selectedCompanyIds={accountModalSelectedCompanyIds}
        setSelectedCompanyIds={setAccountModalSelectedCompanyIds}
        currencyInput={accountModalCurrencyInput}
        setCurrencyInput={setAccountModalCurrencyInput}
        onCreateCurrency={createAccountModalCurrency}
        onRemoveCurrency={removeAccountModalCurrency}
        onSubmit={submitAccountModal}
        onClose={closeAccountModal}
        currencyDeleteOnlyWhenDeselected
        t={tAccount}
      />
      {typeof document !== "undefined"
        ? createPortal(
            <DashboardCalendarPopup
              className="calendar-popup--bank-process-modal"
              i18n={calendarI18n}
              periodPresets={periodPresets}
              dateFrom={dateFrom}
            />,
            document.body
          )
        : null}
      {toast && typeof document !== "undefined" && document.body
        ? createPortal(
            <div
              className="process-notification-container"
              style={{
                zIndex: addAccountModalOpen ? processNotificationAboveAccountZIndex : processNotificationZIndex,
              }}
            >
              <div className={`process-notification process-notification-${toast.type === "danger" ? "danger" : (toast.type === "warning" ? "warning" : "success")} show`}>
                {toast.message}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

