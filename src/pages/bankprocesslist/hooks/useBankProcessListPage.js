import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { ensureCrossPageCompanySelection } from "../../../utils/company/companySessionSync.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import { replaceBrowserPathOnly } from "../../../utils/routing/privateBrowserUrl.js";
import {
  clearDashboardGroupFilterKeepCompany,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  persistDashboardGroupFilter,
  pickDefaultSubsidiaryForGroup,
  resolveInitialSelectedGroupFromSession,
  resolveSubsidiaryBootCompanyId,
  buildDashboardCurrencyScopeKey,
  clearDashboardSelectedCurrency,
  notifyDashboardCurrencyFilterChanged,
} from "../../../utils/company/sharedCompanyFilter.js";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import { useCrossPageCurrencySync } from "../../../utils/company/useCrossPageCurrencySync.js";
import {
  closeMaintenanceCalendarPopup,
  ensureMaintenanceDateRangePicker,
} from "../../../utils/date/dateRangePicker.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { isCapitalLettersOnly, sanitizeCapitalLettersOnly } from "../../../utils/input/sanitizeCapitalLettersOnly.js";
import {
  mergeCurrencyCodesWithSavedOrder,
  persistCurrencyDisplayOrder,
  resolveSavedCurrencyOrder,
} from "../../../utils/company/currencyDisplayOrder.js";
import { saveUserCurrencyOrder, getUserCurrencyOrder } from "../../transaction/lib/transactionApi.js";
import {
  DEFAULT_FORM as ACCOUNT_DEFAULT_FORM,
  getAccountModalOrderedRoles,
  normalizeAlertAmount,
  pickDefaultAddCurrencyIds,
  toUpper,
} from "../../account/accountLogic.js";
import { getAccountText } from "../../../translateFile/pages/accountTranslate.js";
import { getBankProcessLocale, getBankProcessText, translateBankProcessApiMessage } from "../../../translateFile/pages/bankProcessTranslate.js";
// Helper imports
import { useAutoListPageSize } from "../../../hooks/useAutoListPageSize.js";
import {
  PAGE_SIZE_MAX,
  PAGE_SIZE_MIN,
  normalizeRows,
  isoToDmy,
  dmyToIso,
  parseRowDateMs,
  isBankResendDayStartBackendErrorMessage,
  notifyTransactionDataChanged,
  bankProcessStatusTargetPatch,
  normalizeBankProcessStatus,
  normalizeBankIssueFlag,
  resolveTenantIsBankOnly,
  parseProfitSharingToRows,
  serializeProfitSharingRows,
  calcBankNetProfitDisplay,
  formatBankMoneyFixed2,
  EMPTY_BANK_FORM,
  parseBankContractRentalMonthsForDayEnd,
  contractBillingEndYmdForBankForm,
  matchesCurrentBankFilters,
  bankProcessFrequencyNormalized,
  BANK_PICK_ACCOUNT_ROLES,
  filterBankPickAccounts,
  filterBankProcessRowsBySearch,
  sortBankProcessTableRows,
  accountingDueRowKey,
  buildAccountingDueSkipItem,
  checkBankResendLockFromBackend,
  isBankResendScheduleLockedToday,
  isResendDayStartDuplicateInAccountingDue,
  isResendDayStartOpenOnProcess,
  normalizeBankResendDayStartYmd,
  resolveBankProcessListTenantId,
  bankProcessListRowToEditForm,
} from "../lib/bankProcessHelpers.js";
import {
  dedupeCompanyRowsForSwitcher,
  filterProcessPageCompanyButtons,
} from "../../processlist/processListHelpers.js";
import {
  prefetchBankProcessListPayload,
  prefetchGamesProcessListPayload,
  resolveBankProcessListRouteCache,
  warmBankProcessListRouteCache,
  invalidateBankProcessListRouteCache,
} from "../../processlist/processRoutePrefetch.js";
import {
  deleteBankCountry,
  deleteBankOption,
  fetchBankCountriesByTenantId,
  fetchBankOptionsByCountryId,
  insertBankCountry,
  insertBankOption,
} from "../bankCountryOptionApi.js";
import {
  accountRowToEditForm,
  buildAccountCreateRequest,
  buildAccountUpdateRequest,
  createAccountUser,
  fetchAccountListByTenantId,
  resolveActiveScopeTenantId,
  updateAccountUser,
} from "../../account/accountListApi.js";
import {
  createCurrency,
  deleteCurrency,
  fetchAvailableCurrencies,
} from "../../../utils/api/currencyApi.js";
import {
  addBankProcess,
  buildAddBankProcessRequest,
  buildResendBankProcessRequest,
  buildUpdateBankProcessRequest,
  fetchAccountingDueInbox,
  postAccountingDue,
  resendBankProcess,
  skipAccountingDue,
  updateBankProcess,
  deleteBankProcess,
  updateBankProcessRemark,
} from "../bankProcessListApi.js";

function resolveBankProcessListCacheKey(companyId, search) {
  return `company:${Number(companyId)}|${String(search || "").trim()}`;
}

function bankProcessRowsFingerprint(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "0";
  // Include status/issue_flag so silent refetch after update-status replaces rows
  // (id-only fingerprint kept stale ACTIVE after DB already had INACTIVE).
  return rows
    .map(
      (r) =>
        `${Number(r?.id)}:${normalizeBankProcessStatus(r?.status)}:${normalizeBankIssueFlag(r?.issue_flag)}`,
    )
    .join("|");
}

function resolveBankProcessBootCurrency() {
  return "";
}

function resolveBankProcessListCurrencyAfterFetch(prev, ordered, userSelectedAllRef) {
  if (userSelectedAllRef.current && !prev) return "";
  if (prev && ordered.includes(prev)) return prev;
  return "";
}
import { usePartnershipAuditWriteGuard } from "../../../utils/audit/usePartnershipAuditWriteGuard.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { getSessionTenantId } from "../../../utils/auth/sessionTenant.js";

export function useBankProcessListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me: authMe } = useAuthSession();
  const resolveLang = useCallback(
    (next) => {
      if (next === "zh") return "zh";
      if (next === "en") return "en";
      // Prefer the same key used by AuthenticatedLayout; keep fallback for older persisted value.
      return localStorage.getItem("login_lang") === "zh" || localStorage.getItem("language") === "zh" ? "zh" : "en";
    },
    []
  );
  const [lang, setLang] = useState(() => resolveLang());
  const bpLocale = useMemo(() => getBankProcessLocale(lang), [lang]);
  const t = useCallback((key, params = {}) => getBankProcessText(lang, key, params), [lang]);
  const apiMsg = useCallback(
    (json, fallbackKey) => {
      const errorCode =
        json?.data && typeof json.data === "object" && !Array.isArray(json.data) ? json.data.error : undefined;
      return translateBankProcessApiMessage(
        lang,
        { message: json?.message ?? json?.error, errorCode },
        fallbackKey ? t(fallbackKey) : ""
      );
    },
    [lang, t]
  );
  const tAccount = useCallback((key, params = {}) => getAccountText(lang, key, params), [lang]);

  const handleDatePickerChange = useCallback(() => {
    const b = window.MaintenanceDateRangePicker?.getActiveRangeBinding?.() || {};
    const fromId = b.dateFromId || "";
    const fromDmy = document.getElementById(fromId)?.value?.trim() || "";
    const iso = dmyToIso(fromDmy);

    if (fromId === "bank_day_start_drp_from") {
      setForm((prev) => ({ ...prev, day_start: iso }));
      return;
    }
    if (fromId === "bank_day_end_drp_from") {
      const minYmd = document.getElementById("bank_day_end_drp_from")?.dataset?.minYmd || "";
      if (minYmd && iso && iso < minYmd) return;
      setForm((prev) => ({ ...prev, day_end: iso }));
      return;
    }
    if (fromId === "bank_resend_day_start_drp_from") {
      setResendInlineError("");
      setResendDayStart(iso);
      return;
    }
    if (fromId === "bank_resend_day_end_drp_from") {
      const minYmd = document.getElementById("bank_resend_day_end_drp_from")?.dataset?.minYmd || "";
      if (minYmd && iso && iso < minYmd) return;
      setResendDayEnd(iso);
      return;
    }
    const toDmy = document.getElementById(b.dateToId)?.value?.trim() || "";
    setDateFrom(dmyToIso(fromDmy));
    setDateTo(dmyToIso(toDmy));
  }, []);
  const [cssReady, setCssReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [rows, setRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showActive, setShowActive] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showOfficial, setShowOfficial] = useState(false);
  const [showEInvoice, setShowEInvoice] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const clearBankProcessFilters = useCallback(() => {
    setShowAll(false);
    setShowActive(false);
    setShowInactive(false);
    setShowOfficial(false);
    setShowEInvoice(false);
    setShowBlock(false);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const notifyBankListLayoutChanged = useCallback(() => {
    window.dispatchEvent(new Event("ec:bank-list-layout-changed"));
  }, []);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [toast, setToast] = useState(null);
  const [accounts, setAccounts] = useState([]);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_BANK_FORM });

  const [accountingOpen, setAccountingOpen] = useState(false);
  const [accountingRows, setAccountingRows] = useState([]);
  const [accountingLoading, setAccountingLoading] = useState(false);
  const [accountingSelected, setAccountingSelected] = useState(new Set());
  const [accountingDeleteSelected, setAccountingDeleteSelected] = useState(new Set());

  const [resendModalOpen, setResendModalOpen] = useState(false);
  const [resendTarget, setResendTarget] = useState(null);
  const [resendDayStart, setResendDayStart] = useState("");
  const [resendDayEnd, setResendDayEnd] = useState("");
  const [resendFrequency, setResendFrequency] = useState("1st_of_every_month");
  const [resendInlineError, setResendInlineError] = useState("");
  const [resendConfirmDisabled, setResendConfirmDisabled] = useState(false);
  const [resendConfirmBlockReason, setResendConfirmBlockReason] = useState("");
  const [resendLockChecking, setResendLockChecking] = useState(false);
  const resendLockCheckSeqRef = useRef(0);

  const [sortColumn, setSortColumn] = useState("supplier");
  const [sortDirection, setSortDirection] = useState("asc");
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [remarkRow, setRemarkRow] = useState(null);

  const [countriesList, setCountriesList] = useState([]);
  const [banksList, setBanksList] = useState([]);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [newCountryName, setNewCountryName] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [selectedCountryChips, setSelectedCountryChips] = useState([]);
  const [selectedBankChips, setSelectedBankChips] = useState([]);
  const [selectedBanksByCountry, setSelectedBanksByCountry] = useState({});

  const [profitShareModalOpen, setProfitShareModalOpen] = useState(false);
  const [profitShareRows, setProfitShareRows] = useState([]);
  const [bankFormNote, setBankFormNote] = useState(null);

  const [addAccountModalOpen, setAddAccountModalOpen] = useState(false);
  const [accountPlusTarget, setAccountPlusTarget] = useState(null);
  const [accountModalIsEditMode, setAccountModalIsEditMode] = useState(false);
  const [rolesList, setRolesList] = useState([]);
  const [accountModalCurrencies, setAccountModalCurrencies] = useState([]);

  // Add Account modal state (shared component)
  const [accountModalForm, setAccountModalForm] = useState({ ...ACCOUNT_DEFAULT_FORM });
  const [accountModalSelectedCurrencyIds, setAccountModalSelectedCurrencyIds] = useState([]);
  const [accountModalSelectedCompanyIds, setAccountModalSelectedCompanyIds] = useState([]);
  const [accountModalInitialCurrencyIds, setAccountModalInitialCurrencyIds] = useState([]);
  const [accountModalCurrencyInput, setAccountModalCurrencyInput] = useState("");

  const [currencyListOrdered, setCurrencyListOrdered] = useState([]);
  const [currencyFilterCode, setCurrencyFilterCode] = useState("");
  const [currencyPillDisplayOrder, setCurrencyPillDisplayOrder] = useState(null);
  const skipNextCurrencyPillClickRef = useRef(false);
  const userSelectedAllCurrenciesRef = useRef(false);

  const toastTimerRef = useRef(null);
  const listAbortRef = useRef(null);
  const listFetchGenRef = useRef(0);
  const accountingInboxFetchGenRef = useRef(0);
  const companyIdRef = useRef(null);
  const countriesByCodeRef = useRef(new Map());
  const banksByNameRef = useRef(new Map());
  const skipNextBankFetchRef = useRef(false);
  const skipCompanyFetchEffectRef = useRef(false);
  const bankProcessListCacheRef = useRef(new Map());
  const bankProcessListWarmInflightRef = useRef(new Map());
  const suppressCrossPageSyncRef = useRef(false);
  const onSwitchCompanyRef = useRef(null);
  const companySessionAbortRef = useRef(null);
  const rowsRef = useRef([]);
  const bankDatePickerInitRef = useRef(false);
  const listRegionRef = useRef(null);
  const contractSyncKeysRef = useRef({ day_start: "", contract: "", frequency: "" });

  const seedContractSyncKeys = useCallback((f) => {
    contractSyncKeysRef.current = {
      day_start: String(f?.day_start || "").trim(),
      contract: String(f?.contract || "").trim(),
      frequency: String(f?.day_start_frequency || "1st_of_every_month").trim(),
    };
  }, []);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    companyIdRef.current = companyId;
  }, [companyId]);

  const prevRowsLenRef = useRef(0);
  useEffect(() => {
    const prev = prevRowsLenRef.current;
    prevRowsLenRef.current = rows.length;
    if (loading || prev > 0 || rows.length === 0) return undefined;
    const raf = window.requestAnimationFrame(() => {
      notifyBankListLayoutChanged();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [rows.length, loading, notifyBankListLayoutChanged]);

  const { mutationsBlocked, guardWrite } = usePartnershipAuditWriteGuard(
    authMe,
    notify,
    t("readOnlyActionBlocked")
  );

  const accountModalOrderedRoles = useMemo(() => getAccountModalOrderedRoles(rolesList), [rolesList]);

  const getAccountIdForPlusTarget = useCallback(
    (target) => {
      if (target === "card_merchant_id") return String(form.card_merchant_id || "").trim();
      if (target === "customer_id") return String(form.customer_id || "").trim();
      if (target === "profit_account_id") return String(form.profit_account_id || "").trim();
      if (target && typeof target === "object" && target.type === "profitRow") {
        const row = profitShareRows[target.index];
        return String(row?.accountId || "").trim();
      }
      return "";
    },
    [form.card_merchant_id, form.customer_id, form.profit_account_id, profitShareRows]
  );

  const isPickableAccountId = useCallback((id, pickList = accounts) => {
    const num = Number(id);
    if (!Number.isFinite(num) || num <= 0) return false;
    return pickList.some((a) => Number(a.id) === num);
  }, [accounts]);

  const clearFormFieldForPlusTarget = useCallback((target) => {
    if (target === "card_merchant_id") {
      setForm((f) => ({ ...f, card_merchant_id: "" }));
      return;
    }
    if (target === "customer_id") {
      setForm((f) => ({ ...f, customer_id: "" }));
      return;
    }
    if (target === "profit_account_id") {
      setForm((f) => ({ ...f, profit_account_id: "" }));
      return;
    }
    if (target && typeof target === "object" && target.type === "profitRow") {
      const idx = target.index;
      setProfitShareRows((rows) =>
        rows.map((r, i) => (i === idx ? { ...r, accountId: "", accountLabel: "" } : r)),
      );
    }
  }, []);

  const mergeAccountModalCurrency = useCallback((currencyRow) => {
    if (!currencyRow?.id || !currencyRow?.code) return;
    const id = Number(currencyRow.id);
    const code = toUpper(currencyRow.code);
    setAccountModalCurrencies((prev) => {
      if (prev.some((c) => Number(c.id) === id || toUpper(c.code) === code)) return prev;
      return [...prev, { id, code, is_linked: false }];
    });
  }, []);

  const removeAccountModalCurrencyByCode = useCallback((code) => {
    const upper = toUpper(code).trim();
    if (!upper) return;
    setAccountModalCurrencies((prev) => {
      const removed = prev.find((c) => toUpper(c.code) === upper);
      if (removed) {
        const removedId = Number(removed.id);
        setAccountModalSelectedCurrencyIds((ids) => ids.filter((id) => Number(id) !== removedId));
      }
      return prev.filter((c) => toUpper(c.code) !== upper);
    });
  }, []);

  const loadAccountModalSelectionMeta = useCallback(
    async (accountId, isEdit) => {
      const tid = resolveBankProcessListTenantId(companyId);
      if (!tid) return;
      try {
        const currencies = await fetchAvailableCurrencies({
          tenantId: tid,
          accountId: accountId || null,
        });
        setAccountModalCurrencies(
          currencies.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked }))
        );
        if (isEdit) {
          const ids = currencies.filter((c) => c.is_linked).map((c) => Number(c.id));
          setAccountModalSelectedCurrencyIds(ids);
          setAccountModalInitialCurrencyIds(ids);
        } else {
          setAccountModalSelectedCurrencyIds(pickDefaultAddCurrencyIds(currencies));
          setAccountModalInitialCurrencyIds([]);
        }
        // Spring account create/update is scoped to one tenant (scopeTenantId).
        setAccountModalSelectedCompanyIds([tid]);
      } catch {
        /* silent */
      }
    },
    [companyId]
  );

  const refreshAccountModalCurrenciesIfOpen = useCallback(async () => {
    if (!addAccountModalOpen || !companyId) return;
    const accountId = accountModalIsEditMode && accountModalForm.id ? accountModalForm.id : null;
    await loadAccountModalSelectionMeta(accountId, accountModalIsEditMode);
  }, [
    addAccountModalOpen,
    companyId,
    accountModalIsEditMode,
    accountModalForm.id,
    loadAccountModalSelectionMeta,
  ]);

  const resetAccountModalToAdd = useCallback(() => {
    setAccountModalIsEditMode(false);
    setAccountModalForm({ ...ACCOUNT_DEFAULT_FORM, payment_alert: "0" });
    setAccountModalSelectedCurrencyIds([]);
    setAccountModalSelectedCompanyIds(companyId ? [Number(companyId)] : []);
    setAccountModalInitialCurrencyIds([]);
    setAccountModalCurrencyInput("");
  }, [companyId]);

  const closeAccountModal = useCallback(() => {
    setAddAccountModalOpen(false);
    setAccountPlusTarget(null);
    setAccountModalIsEditMode(false);
  }, []);

  const createAccountModalCurrency = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const code = toUpper(accountModalCurrencyInput).trim();
    if (!code) return;
    const tid = resolveActiveScopeTenantId({
      companyId,
      scopeTenantId: accountModalSelectedCompanyIds[0] || companyId,
    });
    if (!tid) return notify(t("pleaseSelectCompanyFirst"), "danger");
    try {
      const created = await createCurrency({ code, tenantId: tid });
      setAccountModalCurrencies((prev) => [...prev, { id: created.id, code: created.code, is_linked: false }]);
      setAccountModalCurrencyInput("");
      notify(t("currencyCreated", { code: created.code }), "success");
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "failedCreateCurrency"), "danger");
    }
  };

  const removeAccountModalCurrency = async (cid) => {
    const tid = resolveBankProcessListTenantId(companyId);
    if (!tid) return;
    try {
      const result = await deleteCurrency({ id: cid, tenantId: tid });
      if (!result.success) {
        return notify(apiMsg({ message: result.message }, "failedDeleteCurrency"), "danger");
      }
      const removed = accountModalCurrencies.find((c) => Number(c.id) === Number(cid));
      setAccountModalCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
      setAccountModalSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
      if (removed?.code) {
        const code = toUpper(String(removed.code).trim());
        const country = countriesByCodeRef.current.get(code);
        setCountriesList((prev) => prev.filter((c) => String(c).trim().toUpperCase() !== code));
        setSelectedCountryChips((prev) => prev.filter((c) => String(c).trim().toUpperCase() !== code));
        if (country?.id) {
          try {
            await deleteBankCountry(tid, country.id);
            countriesByCodeRef.current.delete(code);
          } catch {
            /* UI already updated; catalog delete may fail if in use */
          }
        }
      }
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "failedDeleteCurrency"), "danger");
    }
  };

  const submitAccountModal = async (e) => {
    if (guardWrite()) return;
    e.preventDefault();
    const isEdit = accountModalIsEditMode && accountModalForm.id;
    const alertAmount = normalizeAlertAmount(accountModalForm.alert_amount);
    if (accountModalForm.payment_alert === "1" && (!accountModalForm.alert_type || !accountModalForm.alert_start_date)) {
      return notify(t("paymentAlertRequired"), "danger");
    }
    if (accountModalForm.payment_alert === "1" && alertAmount && Number(alertAmount) >= 0) {
      return notify(t("alertAmountNegative"), "danger");
    }

    const scopeTenantId = resolveActiveScopeTenantId({
      companyId,
      scopeTenantId: accountModalSelectedCompanyIds[0] || companyId,
      form: accountModalForm,
    });
    if (!scopeTenantId) {
      return notify(t("missingCompanyContext"), "danger");
    }

    const formPayload = {
      ...accountModalForm,
      alert_amount: alertAmount,
    };
    if (formPayload.payment_alert === "0") {
      formPayload.alert_type = "";
      formPayload.alert_start_date = "";
      formPayload.alert_amount = "";
    }

    try {
      const saved = isEdit
        ? await updateAccountUser(
            buildAccountUpdateRequest(formPayload, scopeTenantId, accountModalSelectedCurrencyIds),
          )
        : await createAccountUser(
            buildAccountCreateRequest(formPayload, scopeTenantId, accountModalSelectedCurrencyIds),
          );

      if (isEdit) {
        setAccountModalInitialCurrencyIds([...accountModalSelectedCurrencyIds.map(Number)]);
      }

      notify(isEdit ? tAccount("accountSavedSuccessfully") : t("accountAddedSuccessfully"), "success");
      await handleAccountModalSuccess?.(
        isEdit
          ? { id: accountModalForm.id, account_id: accountModalForm.account_id }
          : { id: saved?.id, account_id: saved?.account_id },
      );
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "saveFailed"), "danger");
    }
  };

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "dashboard-page", "account-page", "announcement-page");
    document.body.classList.add("process-page", "process-page--bank");
    return () => {
      document.body.classList.remove("process-page", "process-page--bank", "process-page--bank-show-all");
      document.body.classList.add("dashboard-page");
    };
  }, []);

  useEffect(() => {
    const syncLang = (event) => {
      const nextLang = event?.detail?.lang;
      setLang(resolveLang(nextLang));
    };
    window.addEventListener("storage", syncLang);
    window.addEventListener("eazycount:language-updated", syncLang);
    return () => {
      window.removeEventListener("storage", syncLang);
      window.removeEventListener("eazycount:language-updated", syncLang);
    };
  }, [resolveLang]);

  useEffect(() => {
    if (loading || !cssReady || bankDatePickerInitRef.current) return;
    bankDatePickerInitRef.current = true;
    ensureMaintenanceDateRangePicker();
    {
      if (!window.MaintenanceDateRangePicker) return;
      const u = new URL(window.location.href);
      const dfIso = u.searchParams.get("date_from") || "";
      const dtIso = u.searchParams.get("date_to") || "";
      const fromH = document.getElementById("date_from");
      const toH = document.getElementById("date_to");
      if (fromH) fromH.value = dfIso && /^\d{4}-\d{2}-\d{2}$/.test(dfIso) ? isoToDmy(dfIso) : "";
      if (toH) toH.value = dtIso && /^\d{4}-\d{2}-\d{2}$/.test(dtIso) ? isoToDmy(dtIso) : "";
      window.MaintenanceDateRangePicker.init({
        allowEmpty: true,
        preserveDisplayUntilCommit: true,
        placeholder: t("selectDateRange"),
        selectEndDateHint: t("selectEndDate"),
        clearDateLabel: t("clearDate"),
        monthLabels: bpLocale.monthsShort,
        onChange: handleDatePickerChange,
      });
      requestAnimationFrame(() => {
        window.MaintenanceDateRangePicker?.syncBankToolbarDatePillWidth?.();
      });
      const clearBtn = document.getElementById("processListDateClearBtn");
      if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.MaintenanceDateRangePicker?.clear?.();
          setDateFrom(""); setDateTo("");
        });
      }
    }
    return () => { };
  }, [loading, cssReady, bpLocale.monthsShort, t, handleDatePickerChange]);

  useEffect(() => {
    if (!modalOpen && !resendModalOpen) return;
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.bindPickers?.();
  }, [modalOpen, resendModalOpen]);

  useEffect(() => {
    if (modalOpen || resendModalOpen) return;
    closeMaintenanceCalendarPopup();
  }, [modalOpen, resendModalOpen]);

  /* Keep date-range chip wording in sync when login/UI language changes (picker caches placeholder internally). */
  useEffect(() => {
    if (loading || !cssReady || !bankDatePickerInitRef.current || !window.MaintenanceDateRangePicker?.setLocaleStrings) return;
    window.MaintenanceDateRangePicker.setLocaleStrings({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      clearDateLabel: t("clearDate"),
      monthLabels: bpLocale.monthsShort,
    });
  }, [lang, loading, cssReady, t, bpLocale.monthsShort]);

  /* React state ä¸º date range å”¯ä¸€æ¥æºï¼›hidden input å—æŽ§åŒæ­¥ï¼Œé¿å…å†æ¬¡æ‰“å¼€æ—¥åŽ†æ—¶ä¸¢å¤±å·²é€‰èŒƒå›´ */
  useEffect(() => {
    if (loading || !cssReady || !bankDatePickerInitRef.current) return;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.();
  }, [dateFrom, dateTo, loading, cssReady, lang]);


  useEffect(() => {
    (async () => {
      let skipLoadingDone = false;
      try {
        const bootUrl = new URL(window.location.href);
        const bootSearch = bootUrl.searchParams.get("search") || "";
        const bootTenantId = getSessionTenantId(authMe);
        if (bootTenantId) {
          warmBankProcessListRouteCache(bootTenantId, { search: bootSearch });
        }
        const routePrefetch = location.state?.bankProcessListPrefetch;
        const prefetchCompanyId = routePrefetch?.companyId ? Number(routePrefetch.companyId) : null;
        const currentUrl = new URL(window.location.href);
        const prefetchQueryCompany = currentUrl.searchParams.get("company_id");

        if (routePrefetch && prefetchCompanyId && (!prefetchQueryCompany || Number(prefetchQueryCompany) === prefetchCompanyId)) {
          const prefetchedCompanies = Array.isArray(routePrefetch.companies) ? routePrefetch.companies : [];
          setCompanies(prefetchedCompanies);
          setCompanyId(prefetchCompanyId);
          {
            const pfGfk = routePrefetch.groupFilterKind;
            setGroupFilterKind(pfGfk === "all" || pfGfk === "ungrouped" ? pfGfk : "follow");
          }
          setSearch(currentUrl.searchParams.get("search") || "");
          const prefetchedRowEarly = prefetchedCompanies.find(
            (c) => Number(c.id) === prefetchCompanyId,
          );
          const prefBootGroupEarly = resolveInitialSelectedGroupFromSession(
            prefetchedCompanies,
            prefetchedRowEarly,
          );
          {
            userSelectedAllCurrenciesRef.current = true;
            setCurrencyFilterCode(resolveBankProcessBootCurrency());
          }
          setDateFrom(currentUrl.searchParams.get("date_from") || "");
          setDateTo(currentUrl.searchParams.get("date_to") || "");
          setShowAll(currentUrl.searchParams.get("showAll") === "1");
          setShowActive(currentUrl.searchParams.get("showActive") === "1");
          setShowInactive(currentUrl.searchParams.get("showInactive") === "1");
          setShowOfficial(currentUrl.searchParams.get("showOfficial") === "1");
          setShowEInvoice(currentUrl.searchParams.get("showEInvoice") === "1");
          setShowBlock(currentUrl.searchParams.get("showBlock") === "1");
          if (Array.isArray(routePrefetch.currencyCodes)) {
            setCurrencyListOrdered(routePrefetch.currencyCodes);
          }
          if (Array.isArray(routePrefetch.rows)) {
            const prefRows = normalizeRows(routePrefetch.rows);
            setRows(prefRows);
            skipNextBankFetchRef.current = true;
            setTableLoading(false);
            const cacheKey = resolveBankProcessListCacheKey(prefetchCompanyId, currentUrl.searchParams.get("search") || "");
            bankProcessListCacheRef.current.set(cacheKey, {
              rows: prefRows,
              currencyCodes: Array.isArray(routePrefetch.currencyCodes)
                ? routePrefetch.currencyCodes
                : null,
            });
            if (Array.isArray(routePrefetch.currencyCodes) && routePrefetch.currencyCodes.length) {
              setCurrencyListOrdered(routePrefetch.currencyCodes);
              setCurrencyPillDisplayOrder(null);
            }
          } else {
            setTableLoading(true);
          }
          const prefetchedRow = prefetchedCompanies.find((c) => Number(c.id) === prefetchCompanyId);
          const prefBootGroup = resolveInitialSelectedGroupFromSession(prefetchedCompanies, prefetchedRow);
          setSelectedGroup(prefBootGroup);
          await ensureCrossPageCompanySelection(prefetchCompanyId, {
            companies: prefetchedCompanies,
            selectedGroup: prefBootGroup,
            companyRow: prefetchedRow,
            sessionCompanyId: getSessionTenantId(authMe),
          });
          setLoading(false);
          return;
        }

        const cs = await fetchOwnerCompaniesAll({ me: authMe });
        setCompanies(cs);
        const sessionUser = authMe;
        if (!sessionUser) {
          window.location.assign(new URL(spaPath("login"), window.location.origin).toString());
          return;
        }
        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        const rowForBoot =
          queryCompany != null && queryCompany !== ""
            ? cs.find((c) => Number(c.id) === Number(queryCompany))
            : cs.find((c) => Number(c.id) === Number(getSessionTenantId(sessionUser))) || null;
        const bootGroup = resolveInitialSelectedGroupFromSession(cs, rowForBoot, sessionUser);
        const effectiveNum = resolveSubsidiaryBootCompanyId(cs, {
          urlCompanyId: queryCompany,
          sessionCompanyId: getSessionTenantId(sessionUser),
          selectedGroup: bootGroup,
          loginMe: sessionUser,
        });
        const currentCompanyRow =
          effectiveNum != null ? cs.find((c) => Number(c.id) === Number(effectiveNum)) : null;
        if (currentCompanyRow?.company_id || currentCompanyRow?.tenant_id) {
          const { bankOnly: bankCategory } = await resolveTenantIsBankOnly(
            effectiveNum,
            sessionUser,
            currentCompanyRow,
          );
          if (!bankCategory) {
            const warm = await prefetchGamesProcessListPayload(effectiveNum);
            navigate(spaPath("process-list"), {
              replace: true,
              state: {
                processListPrefetch: {
                  companyId: effectiveNum,
                  companies: cs,
                  groupFilterKind: "follow",
                  rows: warm.rows,
                  meta: warm.meta,
                },
              },
            });
            skipLoadingDone = true;
            return;
          }
        }
        setSelectedGroup(bootGroup);
        setCompanyId(effectiveNum);
        setGroupFilterKind("follow");
        if (effectiveNum != null) {
          persistDashboardFilterState(bootGroup, effectiveNum, { allowGroupOnly: false });
        }
        setSearch(url.searchParams.get("search") || "");
        {
          userSelectedAllCurrenciesRef.current = true;
          setCurrencyFilterCode(resolveBankProcessBootCurrency());
        }
        setDateFrom(url.searchParams.get("date_from") || "");
        setDateTo(url.searchParams.get("date_to") || "");
        setShowAll(url.searchParams.get("showAll") === "1");
        setShowActive(url.searchParams.get("showActive") === "1");
        setShowInactive(url.searchParams.get("showInactive") === "1");
        setShowOfficial(url.searchParams.get("showOfficial") === "1");
        setShowEInvoice(url.searchParams.get("showEInvoice") === "1");
        setShowBlock(url.searchParams.get("showBlock") === "1");

        if (effectiveNum != null) {
          const searchVal = url.searchParams.get("search") || "";
          const slice = await resolveBankProcessListRouteCache(effectiveNum, { search: searchVal });
          if (Array.isArray(slice?.rows)) {
            const cacheKey = resolveBankProcessListCacheKey(effectiveNum, searchVal);
            bankProcessListCacheRef.current.set(cacheKey, {
              rows: slice.rows,
              currencyCodes: slice.currencyCodes,
            });
            setRows(slice.rows);
            skipNextBankFetchRef.current = true;
            setTableLoading(false);
            if (Array.isArray(slice.currencyCodes) && slice.currencyCodes.length) {
              setCurrencyListOrdered(slice.currencyCodes);
              setCurrencyPillDisplayOrder(null);
            }
          } else {
            setTableLoading(true);
          }
        }
      } finally {
        if (!skipLoadingDone) setLoading(false);
      }
    })();
  }, [navigate, location.state, authMe?.tenant_id ?? authMe?.company_id]);

  useEffect(() => {
    if (!companyId || loading) return;
    const tid = resolveBankProcessListTenantId(companyId);
    if (!tid) {
      setAccounts([]);
      return;
    }
    (async () => {
      try {
        const rows = await fetchAccountListByTenantId(tid);
        setAccounts(filterBankPickAccounts(rows));
      } catch {
        setAccounts([]);
      }
    })();
  }, [companyId, loading]);

  const loadCurrencyMeta = useCallback(async (targetCompanyId) => {
    const cid = Number(targetCompanyId ?? companyId);
    if (!Number.isFinite(cid) || cid <= 0) return;
    try {
      const [curRes, ordJson] = await Promise.all([
        fetch(buildApiUrl(`api/transactions/get_company_currencies_api.php?tenant_id=${cid}`), {
          credentials: "include",
        }),
        getUserCurrencyOrder({ companyId: cid }).catch(() => null),
      ]);
      const curJson = await curRes.json();
      if (!curRes.ok || !curJson.success || !Array.isArray(curJson.data)) {
        setCurrencyListOrdered([]);
        return;
      }
      const codes = curJson.data.map((r) => String(r.code).toUpperCase());
      const savedOrder = resolveSavedCurrencyOrder(cid, ordJson?.data?.order);
      const ordered = mergeCurrencyCodesWithSavedOrder(codes, savedOrder);
      persistCurrencyDisplayOrder(cid, ordered);
      setCurrencyListOrdered(ordered);
      setCurrencyPillDisplayOrder(null);
    } catch {
      setCurrencyListOrdered([]);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId || loading) return;
    if (currencyListOrdered.length > 0) return;
    void loadCurrencyMeta(companyId);
  }, [companyId, loading, loadCurrencyMeta, currencyListOrdered.length]);

  useLayoutEffect(() => {
    if (showAll) document.body.classList.add("process-page--bank-show-all");
    else document.body.classList.remove("process-page--bank-show-all");
    const raf = window.requestAnimationFrame(() => {
      notifyBankListLayoutChanged();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [showAll, notifyBankListLayoutChanged]);

  useEffect(() => {
    if (!modalOpen || !companyId) return;
    const tid = resolveBankProcessListTenantId(companyId);
    if (!tid) return;
    let cancelled = false;
    (async () => {
      try {
        const countries = await fetchBankCountriesByTenantId(tid);
        if (cancelled) return;
        const byCode = new Map(countries.map((c) => [c.code, c]));
        countriesByCodeRef.current = byCode;
        const codes = countries.map((c) => c.code);
        setCountriesList(codes);
        setSelectedCountryChips((prev) => {
          const kept = (prev || [])
            .map((c) => String(c || "").trim().toUpperCase())
            .filter((c) => byCode.has(c));
          return kept.length ? [...new Set(kept)] : codes;
        });
      } catch {
        if (!cancelled) {
          countriesByCodeRef.current = new Map();
          setCountriesList([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [modalOpen, companyId]);

  useEffect(() => {
    if (!modalOpen || !companyId || !form.country) {
      setBanksList([]);
      banksByNameRef.current = new Map();
      return;
    }
    const tid = resolveBankProcessListTenantId(companyId);
    const countryCode = String(form.country || "").trim().toUpperCase();
    const country = countriesByCodeRef.current.get(countryCode);
    if (!tid || !country?.id) {
      setBanksList([]);
      banksByNameRef.current = new Map();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const banks = await fetchBankOptionsByCountryId(tid, country.id);
        if (cancelled) return;
        const byName = new Map(banks.map((b) => [b.name, b]));
        banksByNameRef.current = byName;
        const names = banks.map((b) => b.name);
        setBanksList(names);
        setSelectedBanksByCountry((prev) => {
          const existing = Array.isArray(prev[countryCode]) ? prev[countryCode] : [];
          const kept = existing
            .map((b) => String(b || "").trim().toUpperCase())
            .filter((b) => byName.has(b));
          const nextList = kept.length ? [...new Set(kept)] : names;
          return { ...prev, [countryCode]: nextList };
        });
      } catch {
        if (!cancelled) {
          banksByNameRef.current = new Map();
          setBanksList([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [modalOpen, companyId, form.country, countriesList]);

  useEffect(() => {
    if (!modalOpen || editMode || !form.country) return;
    const country = String(form.country || "").trim();
    const allowed = selectedBanksByCountry[country] || [];
    setForm((f) => {
      if (!f.bank || allowed.includes(f.bank)) return f;
      return { ...f, bank: "" };
    });
  }, [modalOpen, editMode, form.country, selectedBanksByCountry]);

  useEffect(() => {
    if (!modalOpen) return;
    const next = calcBankNetProfitDisplay(form.cost, form.price, form.profit_sharing);
    setForm((f) => {
      if (String(f.profit) === next) return f;
      return { ...f, profit: next };
    });
  }, [modalOpen, form.cost, form.price, form.profit_sharing]);

  // Contract / Day start / Frequency å˜åŒ–æ—¶è‡ªåŠ¨å¡« Day endï¼ˆ1st_of_every_month / monthly ä»å¯äº‹åŽæ‰‹åŠ¨æ”¹ï¼‰ã€‚
  useEffect(() => {
    if (!modalOpen) {
      contractSyncKeysRef.current = { day_start: "", contract: "", frequency: "" };
      return;
    }
    const frequencyNorm = bankProcessFrequencyNormalized(form.day_start_frequency);
    if (frequencyNorm === "once" || frequencyNorm === "week" || frequencyNorm === "day") return;
    if (editMode && form.day_end_monthly_cap_enabled && frequencyNorm === "1st_of_every_month") return;

    const start = String(form.day_start || "").trim();
    const contract = String(form.contract || "").trim();
    const frequency = String(form.day_start_frequency || "1st_of_every_month").trim();

    const prev = contractSyncKeysRef.current;
    const keysChanged =
      prev.day_start !== start || prev.contract !== contract || prev.frequency !== frequency;
    contractSyncKeysRef.current = { day_start: start, contract, frequency };

    if (!keysChanged || !start) return;

    const term = parseBankContractRentalMonthsForDayEnd(contract);
    const calculated = term ? contractBillingEndYmdForBankForm(start, term, frequency) : null;

    if (!calculated) {
      setForm((prevForm) => {
        const cur = String(prevForm.day_end || "").trim();
        if (cur && cur < start) return { ...prevForm, day_end: start };
        return prevForm;
      });
      return;
    }

    setForm((prevForm) => (prevForm.day_end === calculated ? prevForm : { ...prevForm, day_end: calculated }));
  }, [modalOpen, editMode, form.day_start, form.contract, form.day_start_frequency, form.day_end_monthly_cap_enabled]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      listAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!resendModalOpen) return;
    const fq = bankProcessFrequencyNormalized(resendFrequency);
    if (fq !== "once" && fq !== "week" && fq !== "day" && fq !== "monthly") return;
    if (!String(resendDayEnd || "").trim()) return;
    setResendDayEnd("");
  }, [resendModalOpen, resendFrequency, resendDayEnd]);

  const refreshResendConfirmLock = useCallback(async () => {
    const id = resendTarget?.id;
    const dayStartYmd = normalizeBankResendDayStartYmd(resendDayStart);
    if (!resendModalOpen || !id || !dayStartYmd) {
      setResendConfirmDisabled(false);
      setResendConfirmBlockReason("");
      setResendLockChecking(false);
      return;
    }
    const duplicateClient =
      isResendDayStartDuplicateInAccountingDue(accountingRows, id, resendDayStart) ||
      isResendDayStartOpenOnProcess(resendTarget, resendDayStart);
    const quickLocked = isBankResendScheduleLockedToday(resendTarget, resendDayStart);
    const seq = ++resendLockCheckSeqRef.current;
    setResendLockChecking(true);
    setResendConfirmDisabled(true);
    setResendConfirmBlockReason(duplicateClient ? "duplicate" : quickLocked ? "locked" : "");
    try {
      const backend = await checkBankResendLockFromBackend(id, resendDayStart, accountingRows);
      if (seq !== resendLockCheckSeqRef.current) return;
      const duplicate = duplicateClient || backend.duplicateOpenAnchor;
      const locked = quickLocked || backend.locked;
      setResendConfirmDisabled(locked || duplicate);
      setResendConfirmBlockReason(duplicate ? "duplicate" : locked ? "locked" : "");
    } catch {
      if (seq !== resendLockCheckSeqRef.current) return;
      setResendConfirmDisabled(quickLocked || duplicateClient);
      setResendConfirmBlockReason(duplicateClient ? "duplicate" : quickLocked ? "locked" : "");
    } finally {
      if (seq === resendLockCheckSeqRef.current) setResendLockChecking(false);
    }
  }, [resendModalOpen, resendTarget, resendDayStart, accountingRows]);

  useEffect(() => {
    if (!resendModalOpen) {
      setResendConfirmDisabled(false);
      setResendConfirmBlockReason("");
      setResendLockChecking(false);
      return;
    }
    void refreshResendConfirmLock();
  }, [resendModalOpen, resendDayStart, resendDayEnd, resendTarget?.id, accountingRows, refreshResendConfirmLock]);

  const syncUrl = useCallback(() => {
    replaceBrowserPathOnly();
  }, []);

  const applyBankProcessListCache = useCallback(
    (cid) => {
      const id = Number(cid);
      if (!Number.isFinite(id) || id <= 0) return false;
      const cacheKey = resolveBankProcessListCacheKey(id, search);
      const cached = bankProcessListCacheRef.current.get(cacheKey);
      if (!Array.isArray(cached?.rows)) return false;
      setRows((prev) =>
        bankProcessRowsFingerprint(prev) === bankProcessRowsFingerprint(cached.rows) ? prev : cached.rows,
      );
      setTableLoading(false);
      if (cached.rows.length > 0) {
        window.requestAnimationFrame(() => notifyBankListLayoutChanged());
      }
      if (Array.isArray(cached.currencyCodes) && cached.currencyCodes.length) {
        const ordered = mergeCurrencyCodesWithSavedOrder(
          cached.currencyCodes,
          resolveSavedCurrencyOrder(id, null),
        );
        setCurrencyListOrdered(ordered);
        setCurrencyPillDisplayOrder(null);
        setCurrencyFilterCode((prev) =>
          resolveBankProcessListCurrencyAfterFetch(prev, ordered, userSelectedAllCurrenciesRef),
        );
      }
      return true;
    },
    [search, notifyBankListLayoutChanged],
  );

  const warmBankProcessListCompanyCache = useCallback(
    (cid) => {
      const id = Number(cid);
      if (!Number.isFinite(id) || id <= 0) return;
      const cacheKey = resolveBankProcessListCacheKey(id, search);
      if (bankProcessListCacheRef.current.has(cacheKey) || bankProcessListWarmInflightRef.current.has(cacheKey)) {
        return;
      }
      const ac = new AbortController();
      bankProcessListWarmInflightRef.current.set(cacheKey, ac);
      void (async () => {
        try {
          const slice = await prefetchBankProcessListPayload(id, { search });
          if (ac.signal.aborted || !slice.rows) return;
          bankProcessListCacheRef.current.set(cacheKey, {
            rows: slice.rows,
            currencyCodes: slice.currencyCodes,
          });
        } catch {
          /* ignore */
        } finally {
          if (bankProcessListWarmInflightRef.current.get(cacheKey) === ac) {
            bankProcessListWarmInflightRef.current.delete(cacheKey);
          }
        }
      })();
    },
    [search],
  );

  // Bank list always fetches the full dataset, then filters client-side
  // (matches legacy bank_process_list.js: prevents stale issue_flag/inactive splits).
  const fetchRows = useCallback(
    async (opts = {}) => {
      const silent = !!opts.silent;
      const forceReplace = !!opts.forceReplace;
      const preservePage = !!opts.preservePage;
      const preserveSelection = !!opts.preserveSelection;
      const cid = opts.companyId != null ? Number(opts.companyId) : Number(companyId);
      if (!Number.isFinite(cid) || cid <= 0) return;

      const fetchGen = ++listFetchGenRef.current;
      if (rowsRef.current.length === 0) setTableLoading(true);

      listAbortRef.current?.abort();
      const ac = new AbortController();
      listAbortRef.current = ac;
      try {
        const slice = await prefetchBankProcessListPayload(cid, { search });
        if (ac.signal.aborted || fetchGen !== listFetchGenRef.current) return;
        if (Number(companyIdRef.current) !== cid) return;
        if (!slice.rows) {
          if (!silent) notify(t("failedLoadBankProcesses"), "danger");
          return;
        }
        const nextRows = slice.rows;
        const cacheKey = resolveBankProcessListCacheKey(cid, search);
        bankProcessListCacheRef.current.set(cacheKey, {
          rows: nextRows,
          currencyCodes: slice.currencyCodes,
        });
        setRows((prev) => {
          if (
            silent &&
            !forceReplace &&
            bankProcessRowsFingerprint(prev) === bankProcessRowsFingerprint(nextRows)
          ) {
            return prev;
          }
          return nextRows;
        });
        if (Array.isArray(slice.currencyCodes) && slice.currencyCodes.length) {
          const ordered = mergeCurrencyCodesWithSavedOrder(
            slice.currencyCodes,
            resolveSavedCurrencyOrder(cid, null),
          );
          setCurrencyListOrdered(ordered);
          setCurrencyPillDisplayOrder(null);
          setCurrencyFilterCode((prev) =>
            resolveBankProcessListCurrencyAfterFetch(prev, ordered, userSelectedAllCurrenciesRef),
          );
        }
        if (!preserveSelection) setSelectedIds(new Set());
        if (!preservePage) setCurrentPage(1);
        syncUrl();
        if (fetchGen === listFetchGenRef.current) {
          notifyBankListLayoutChanged();
        }
      } catch {
        if (ac.signal.aborted || fetchGen !== listFetchGenRef.current) return;
        if (!silent) notify(t("failedLoadBankProcesses"), "danger");
      } finally {
        if (fetchGen === listFetchGenRef.current) {
          setTableLoading(false);
        }
      }
    },
    [companyId, search, notify, syncUrl, t, notifyBankListLayoutChanged],
  );

  useEffect(() => {
    if (!companyId || loading) return;
    if (skipNextBankFetchRef.current) {
      skipNextBankFetchRef.current = false;
      return;
    }
    if (skipCompanyFetchEffectRef.current) {
      skipCompanyFetchEffectRef.current = false;
      return;
    }
    void (async () => {
      if (applyBankProcessListCache(companyId)) return;
      await fetchRows({ silent: rowsRef.current.length > 0 });
    })();
  }, [companyId, loading, search, fetchRows, applyBankProcessListCache]);

  // URL still reflects active filters even though they're applied client-side.
  useEffect(() => {
    if (!companyId || loading) return;
    syncUrl();
    setCurrentPage(1);
    setSelectedIds(new Set());
    const raf = window.requestAnimationFrame(() => {
      notifyBankListLayoutChanged();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [
    companyId,
    loading,
    showAll,
    showActive,
    showInactive,
    showOfficial,
    showEInvoice,
    showBlock,
    dateFrom,
    dateTo,
    currencyFilterCode,
    syncUrl,
    notifyBankListLayoutChanged,
  ]);

  const loadAccountingInbox = useCallback(async (opts = {}) => {
    const silent = !!opts.silent;
    const restoreSkipped = !!(opts.restoreSkipped || opts.restoreDismissed);
    // Once: resolving inbox may auto-expire past-month processes to INACTIVE on the server.
    const syncProcessList = opts.syncProcessList !== false;
    const cid = Number(companyId);
    if (!Number.isFinite(cid) || cid <= 0) return;
    const fetchGen = ++accountingInboxFetchGenRef.current;
    if (!silent) setAccountingLoading(true);
    try {
      const list = await fetchAccountingDueInbox(cid, undefined, { restoreSkipped });
      if (fetchGen !== accountingInboxFetchGenRef.current) return;
      if (Number(companyIdRef.current) !== cid) return;
      setAccountingRows(list);
      if (!silent) {
        setAccountingSelected(new Set(list.filter((x) => !x.already_posted_today).map((x) => accountingDueRowKey(x)).filter(Boolean)));
        setAccountingDeleteSelected(new Set());
      } else {
        const rowKeys = new Set(list.map((x) => accountingDueRowKey(x)).filter(Boolean));
        setAccountingSelected((prev) => {
          const next = new Set();
          prev.forEach((key) => {
            if (rowKeys.has(key)) next.add(key);
          });
          return next;
        });
        setAccountingDeleteSelected((prev) => {
          const next = new Set();
          prev.forEach((key) => {
            if (rowKeys.has(key)) next.add(key);
          });
          return next;
        });
      }
      if (syncProcessList) {
        void fetchRows({ silent: true, preservePage: true, preserveSelection: true });
      }
    } catch {
      if (fetchGen !== accountingInboxFetchGenRef.current) return;
      if (Number(companyIdRef.current) !== cid) return;
      setAccountingRows([]);
      if (!silent) {
        setAccountingSelected(new Set());
        setAccountingDeleteSelected(new Set());
      }
    } finally {
      if (!silent && fetchGen === accountingInboxFetchGenRef.current) {
        setAccountingLoading(false);
      }
    }
  }, [companyId, fetchRows]);

  const handleBankStatusUpdated = useCallback(
    (row, target, opts = {}) => {
      const id = Number(row?.id);
      if (!Number.isFinite(id) || id <= 0) return;
      const backgroundSync = opts.backgroundSync !== false;
      const patch = bankProcessStatusTargetPatch(row, target);
      setRows((prev) =>
        prev.map((r) => (Number(r.id) === id ? { ...r, ...patch } : r))
      );
      if (!backgroundSync) return;
      const cid = Number(companyIdRef.current);
      if (Number.isFinite(cid) && cid > 0) {
        invalidateBankProcessListRouteCache(cid);
        bankProcessListCacheRef.current.delete(resolveBankProcessListCacheKey(cid, search));
      }
      notifyTransactionDataChanged("bank-process-list-react-status");
      void fetchRows({ silent: true, forceReplace: true, preservePage: true, preserveSelection: true });
      void loadAccountingInbox({ silent: true, syncProcessList: false });
    },
    [fetchRows, loadAccountingInbox, search]
  );

  // Badge uses accountingRows; sync PHP session first (when needed) so inbox matches the visible company.
  useEffect(() => {
    if (!companyId || loading) return;
    if (suppressCrossPageSyncRef.current) return;

    let cancelled = false;
    void (async () => {
      if (groupFilterKind === "follow") {
        const row = companies.find((c) => Number(c.id) === Number(companyId));
        await ensureCrossPageCompanySelection(companyId, {
          companies,
          selectedGroup,
          companyRow: row,
          sessionCompanyId: getSessionTenantId(authMe),
        });
      }
      if (cancelled || Number(companyIdRef.current) !== Number(companyId)) return;
      await loadAccountingInbox({ silent: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, loading, companies, selectedGroup, groupFilterKind, authMe?.company_id, loadAccountingInbox]);

  // Items can become due when the clock passes a billing boundary; refresh periodically and when the tab becomes visible again.
  useEffect(() => {
    const onTxChanged = (e) => {
      const source = e?.detail?.source || "";
      if (source === "bank-process-list-react-status") {
        if (resendModalOpen) void refreshResendConfirmLock();
        return;
      }
      const isLocalBank = String(source).startsWith("bank-process-list-react");
      void fetchRows({
        silent: isLocalBank,
        preservePage: isLocalBank,
        preserveSelection: isLocalBank,
      });
      void loadAccountingInbox({ silent: true, syncProcessList: false });
      if (resendModalOpen) void refreshResendConfirmLock();
    };
    window.addEventListener("tx-data-changed", onTxChanged);
    return () => window.removeEventListener("tx-data-changed", onTxChanged);
  }, [fetchRows, loadAccountingInbox, resendModalOpen, refreshResendConfirmLock]);

  useEffect(() => {
    if (!companyId || loading) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadAccountingInbox({ silent: true });
    };
    const id = window.setInterval(tick, 90000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [companyId, loading, loadAccountingInbox]);

  const resetForm = () => setForm({ ...EMPTY_BANK_FORM });

  const onSwitchCompany = useCallback(
    async (c, { layoutSilent = false, backgroundRefresh = false } = {}) => {
      const nextId = Number(c?.id);
      if (!nextId) return;

      suppressCrossPageSyncRef.current = true;
      try {
        const sessionCompanyId = getSessionTenantId(authMe);
        if (backgroundRefresh) {
          void fetchRows({ companyId: nextId, silent: true, preservePage: true, preserveSelection: true });
        }
        if (accountingOpen) void loadAccountingInbox({ silent: true });

        let bankOnly = false;
        let syncJson = null;
        try {
          const resolved = await resolveTenantIsBankOnly(nextId, authMe, c);
          bankOnly = resolved.bankOnly;
          syncJson = resolved.syncJson;
          if (!bankOnly) {
            const warm = await prefetchGamesProcessListPayload(nextId);
            navigate(spaPath("process-list"), {
              replace: true,
              state: {
                processListPrefetch: {
                  companyId: nextId,
                  companies,
                  groupFilterKind: "follow",
                  rows: warm.rows,
                  meta: warm.meta,
                  currencyCodes: warm.currencyCodes,
                },
              },
            });
            return;
          }
        } catch {
          /* fall through to session sync */
        }

        if (sessionCompanyId === nextId) {
          if (syncJson?.data) notifyCompanySessionUpdated(syncJson.data);
          return;
        }

        // Already switched inside resolveTenantIsBankOnly (POST /auth/switch-tenant).
        if (syncJson?.success && syncJson.data) {
          notifyCompanySessionUpdated(syncJson.data);
          return;
        }

        companySessionAbortRef.current?.abort();
        const sessionAc = new AbortController();
        companySessionAbortRef.current = sessionAc;

        try {
          const res = await fetch(
            buildApiUrl(`auth/switch-tenant?tenant_id=${nextId}`),
            { credentials: "include", signal: sessionAc.signal },
          );
          const json = await res.json();
          if (sessionAc.signal.aborted) return;
          if (!res.ok || !json.success) {
            notify(apiMsg(json, "switchCompanyFailed"), "danger");
            return;
          }
          notifyCompanySessionUpdated(json.data ?? null);
        } catch {
          if (sessionAc.signal.aborted) return;
          notify(t("switchCompanyFailed"), "danger");
        } finally {
          if (companySessionAbortRef.current === sessionAc) {
            companySessionAbortRef.current = null;
          }
        }
      } finally {
        suppressCrossPageSyncRef.current = false;
      }
    },
    [
      accountingOpen,
      applyBankProcessListCache,
      authMe?.tenant_id ?? authMe?.company_id,
      companies,
      companyId,
      fetchRows,
      groupFilterKind,
      loadAccountingInbox,
      navigate,
      notify,
      selectedGroup,
      t,
    ],
  );

  onSwitchCompanyRef.current = onSwitchCompany;

  const onPickCompanyPill = useCallback(
    (c) => {
      const nextId = Number(c?.id);
      if (!nextId || Number(companyId) === nextId) return;

      const gid = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const nextGroup = gid || null;
      const cacheKey = resolveBankProcessListCacheKey(nextId, search);
      const cached = bankProcessListCacheRef.current.get(cacheKey);
      const hadCache = Array.isArray(cached?.rows) && cached.rows.length > 0;

      skipCompanyFetchEffectRef.current = hadCache;
      suppressCrossPageSyncRef.current = true;
      userSelectedAllCurrenciesRef.current = false;
      listAbortRef.current?.abort();
      flushSync(() => {
        setGroupFilterKind((prev) => (prev === "all" || prev === "ungrouped" ? prev : "follow"));
        if (nextGroup) setSelectedGroup(nextGroup);
        setCompanyId(nextId);
        if (hadCache) {
          applyBankProcessListCache(nextId);
        } else {
          setRows([]);
          setTableLoading(true);
          setCurrencyListOrdered([]);
          setCurrencyPillDisplayOrder(null);
        }
      });

      if (nextGroup) persistDashboardGroupFilter(nextGroup);
      persistDashboardFilterState(nextGroup, nextId);
      notifyDashboardGroupFilterChanged(nextGroup, nextId);

      void onSwitchCompanyRef.current?.(c, { layoutSilent: true, backgroundRefresh: hadCache });
    },
    [applyBankProcessListCache, companyId, search],
  );

  const openAdd = () => {
    setEditMode(false);
    resetForm();
    seedContractSyncKeys(EMPTY_BANK_FORM);
    setCountryModalOpen(false);
    setBankModalOpen(false);
    setProfitShareModalOpen(false);
    setBankFormNote(null);
    closeAccountModal();
    setModalOpen(true);
  };

  const persistSelectedCountries = async () => {
    // Local UI selection only — Spring has no save_selected_countries; catalog is tenant-scoped.
    void refreshAccountModalCurrenciesIfOpen();
  };

  const persistSelectedBanksByCountry = async () => {
    // Local UI selection only — Spring has no save_selected_banks.
  };

  const submitNewCountry = async (e) => {
    if (guardWrite()) return;
    e.preventDefault();
    const name = sanitizeCapitalLettersOnly(newCountryName);
    const tid = resolveBankProcessListTenantId(companyId);
    if (!tid) return;
    if (!isCapitalLettersOnly(name)) {
      notify(t("countryCodeLettersOnly"), "warning");
      return;
    }
    const alreadyExists =
      countriesList.some((c) => String(c).trim().toUpperCase() === name) ||
      selectedCountryChips.some((c) => String(c).trim().toUpperCase() === name);
    if (alreadyExists) {
      notify(t("countryAlreadyExists", { country: name }), "warning");
      return;
    }
    try {
      const created = await insertBankCountry(tid, name);
      countriesByCodeRef.current.set(created.code, created);
      setCountriesList((prev) => [...new Set([...prev, created.code])].sort((a, b) => a.localeCompare(b)));
      void refreshAccountModalCurrenciesIfOpen();
      setNewCountryName("");
      notify(t("countryAdded"));
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "addCountryFailed"), "danger");
    }
  };

  const submitNewBank = async (e) => {
    if (guardWrite()) return;
    e.preventDefault();
    const name = sanitizeCapitalLettersOnly(newBankName);
    const tid = resolveBankProcessListTenantId(companyId);
    const countryCode = String(form.country || "").trim().toUpperCase();
    const country = countriesByCodeRef.current.get(countryCode);
    if (!tid || !country?.id) return;
    if (!isCapitalLettersOnly(name)) {
      notify(t("bankCodeLettersOnly"), "warning");
      return;
    }
    const bankAlreadyExists =
      banksList.some((b) => String(b).trim().toUpperCase() === name) ||
      selectedBankChips.some((b) => String(b).trim().toUpperCase() === name);
    if (bankAlreadyExists) {
      notify(t("bankAlreadyExists", { bank: name }), "warning");
      return;
    }
    try {
      const created = await insertBankOption(tid, country.id, name);
      banksByNameRef.current.set(created.name, created);
      setBanksList((prev) => [...new Set([...prev, created.name])].sort((a, b) => a.localeCompare(b)));
      setNewBankName("");
      notify(t("bankAdded"));
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "addBankFailed"), "danger");
    }
  };

  const removeAvailableCountry = async (countryName) => {
    const countryCode = String(countryName || "").trim().toUpperCase();
    const tid = resolveBankProcessListTenantId(companyId);
    const country = countriesByCodeRef.current.get(countryCode);
    if (!countryCode || !tid || !country?.id) return;
    try {
      await deleteBankCountry(tid, country.id);
      countriesByCodeRef.current.delete(countryCode);
      setCountriesList((prev) => prev.filter((c) => String(c).trim().toUpperCase() !== countryCode));
      setSelectedCountryChips((prev) => prev.filter((c) => String(c).trim().toUpperCase() !== countryCode));
      setSelectedBanksByCountry((prev) => {
        if (!prev[countryCode]) return prev;
        const next = { ...prev };
        delete next[countryCode];
        return next;
      });
      setForm((f) =>
        String(f.country || "").trim().toUpperCase() === countryCode
          ? { ...f, country: "", bank: "" }
          : f
      );
      void refreshAccountModalCurrenciesIfOpen();
      notify(t("countryRemoved"));
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "removeCountryFailed"), "danger");
    }
  };

  const removeAvailableBank = async (bankName) => {
    const bank = String(bankName || "").trim().toUpperCase();
    const countryCode = String(form.country || "").trim().toUpperCase();
    const tid = resolveBankProcessListTenantId(companyId);
    const country = countriesByCodeRef.current.get(countryCode);
    const bankRow = banksByNameRef.current.get(bank);
    if (!bank || !country?.id || !tid || !bankRow?.id) return;
    try {
      await deleteBankOption(tid, bankRow.id, country.id);
      banksByNameRef.current.delete(bank);
      setBanksList((prev) => prev.filter((b) => String(b).trim().toUpperCase() !== bank));
      setSelectedBankChips((prev) => prev.filter((b) => String(b).trim().toUpperCase() !== bank));
      setSelectedBanksByCountry((prev) => {
        const list = (prev[countryCode] || []).filter((b) => String(b).trim().toUpperCase() !== bank);
        const next = { ...prev };
        if (list.length) next[countryCode] = list;
        else delete next[countryCode];
        return next;
      });
      setForm((f) => (String(f.bank || "").trim().toUpperCase() === bank ? { ...f, bank: "" } : f));
      notify(t("bankRemoved"));
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "removeBankFailed"), "danger");
    }
  };

  const openProfitShareModal = () => {
    const rows = parseProfitSharingToRows(form.profit_sharing, accounts).map((r) => ({
      ...r,
      amount: r.amount ? formatBankMoneyFixed2(r.amount) : "",
    }));
    setProfitShareRows(rows.length ? rows : [{ accountId: "", accountLabel: "", amount: "" }]);
    setProfitShareModalOpen(true);
  };

  const confirmProfitShareModal = () => {
    const normalizedRows = profitShareRows.map((r) => ({
      ...r,
      amount: r.amount ? formatBankMoneyFixed2(r.amount) : "",
    }));
    const s = serializeProfitSharingRows(normalizedRows, accounts);
    setForm((f) => ({ ...f, profit_sharing: s }));
    setProfitShareModalOpen(false);
  };

  const handleAccountModalSuccess = async (data) => {
    const newId = data?.id != null ? String(data.id) : "";
    const newAccountId = String(data?.account_id || "").trim();
    const tid = resolveBankProcessListTenantId(companyId);
    let list = [];
    if (tid) {
      try {
        const rows = await fetchAccountListByTenantId(tid);
        list = filterBankPickAccounts(rows);
      } catch {
        list = [];
      }
    }
    setAccounts(list);
    const pickable = newId && list.some((a) => Number(a.id) === Number(newId));
    if (pickable && accountPlusTarget === "card_merchant_id") {
      setForm((f) => ({ ...f, card_merchant_id: newId }));
    }
    if (pickable && accountPlusTarget === "customer_id") {
      setForm((f) => ({ ...f, customer_id: newId }));
    }
    if (pickable && accountPlusTarget === "profit_account_id") {
      setForm((f) => ({ ...f, profit_account_id: newId }));
    }
    if (
      pickable &&
      accountPlusTarget &&
      typeof accountPlusTarget === "object" &&
      accountPlusTarget.type === "profitRow"
    ) {
      const idx = accountPlusTarget.index;
      setProfitShareRows((rows) =>
        rows.map((r, i) => (i === idx ? { ...r, accountId: newId, accountLabel: newAccountId } : r)),
      );
    }
    notifyTransactionDataChanged("bank-process-list-react");
    closeAccountModal();
  };

  const openAddAccountForField = async (target) => {
    setAccountPlusTarget(target);
    if (!companyId) return notify(t("missingCompanyContext"), "danger");
    const tid = resolveBankProcessListTenantId(companyId);
    if (!tid) return notify(t("missingCompanyContext"), "danger");

    const existingId = getAccountIdForPlusTarget(target);
    const existingPickable = existingId && isPickableAccountId(existingId);

    try {
      setRolesList(getAccountModalOrderedRoles([...BANK_PICK_ACCOUNT_ROLES, "BANK", "CAPITAL"]));

      if (existingPickable) {
        const rows = await fetchAccountListByTenantId(tid);
        const row = rows.find((a) => Number(a.id) === Number(existingId));
        const editForm = accountRowToEditForm(row);
        if (!editForm) {
          notify(tAccount("failedToLoadAccount"), "danger");
          return;
        }
        setAccountModalIsEditMode(true);
        setAccountModalForm({
          ...editForm,
          account_id: toUpper(editForm.account_id),
          name: toUpper(editForm.name),
          remark: toUpper(editForm.remark),
        });
        setAccountModalCurrencyInput("");
        await loadAccountModalSelectionMeta(existingId, true);
      } else {
        if (existingId) clearFormFieldForPlusTarget(target);
        resetAccountModalToAdd();
        await loadAccountModalSelectionMeta(null, false);
      }

      setAddAccountModalOpen(true);
    } catch {
      setRolesList([]);
      notify(tAccount("errorLoadingAccount"), "danger");
    }
  };

  const openEdit = async (rowId) => {
    try {
      const id = Number(rowId);
      const row =
        (Array.isArray(rows) ? rows : []).find((r) => Number(r?.id) === id) ||
        (Array.isArray(rowsRef.current) ? rowsRef.current : []).find((r) => Number(r?.id) === id);
      if (!row) {
        notify(t("failedLoadBankProcess"), "danger");
        return;
      }

      let accs = accounts;
      if (!Array.isArray(accs) || accs.length === 0) {
        const tid = resolveBankProcessListTenantId(companyId);
        if (tid) {
          try {
            accs = await fetchAccountListByTenantId(tid);
          } catch {
            accs = [];
          }
        }
      }

      const nextForm = bankProcessListRowToEditForm(row, accs);
      if (!nextForm) {
        notify(t("failedLoadBankProcess"), "danger");
        return;
      }
      seedContractSyncKeys(nextForm);
      setEditMode(true);
      setForm(nextForm);
      setModalOpen(true);
    } catch {
      notify(t("failedLoadBankProcess"), "danger");
    }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (guardWrite()) return;
    const rawFreq = bankProcessFrequencyNormalized(form.day_start_frequency);
    const isOnceSubmit = rawFreq === "once";
    const isWeekSubmit = rawFreq === "week";
    const isDaySubmit = rawFreq === "day";
    const dayStart = String(form.day_start || "").trim();
    const dayEnd = String(form.day_end || "").trim();
    if (dayStart && dayEnd && dayEnd < dayStart) {
      notify(t("dayEndEarlierThanStart"), "danger");
      return;
    }
    let dayEndMonthlyCapEnabled = !!form.day_end_monthly_cap_enabled;
    if (rawFreq !== "1st_of_every_month" || !dayEnd) {
      dayEndMonthlyCapEnabled = false;
    }
    if (dayEndMonthlyCapEnabled && !/^\d{4}-\d{2}-\d{2}$/.test(dayEnd)) {
      notify(t("dayEndRequiredForCap"), "danger");
      return;
    }
    if (!isOnceSubmit && !isWeekSubmit && !isDaySubmit && !String(form.contract || "").trim()) {
      notify(t("contractRequiredUnlessOnceWeekOrDay"), "danger");
      return;
    }
    if (!editMode) {
      if (!String(form.country || "").trim()) {
        notify(t("selectCountry"), "danger");
        return;
      }
      if (!String(form.bank || "").trim()) {
        notify(t("selectBank"), "danger");
        return;
      }
      if (!String(form.type || "").trim()) {
        notify(t("selectType"), "danger");
        return;
      }

      const tid = resolveBankProcessListTenantId(companyId);
      const countryCode = String(form.country || "").trim().toUpperCase();
      const bankName = String(form.bank || "").trim().toUpperCase();
      const country = countriesByCodeRef.current.get(countryCode);
      const bankOption = banksByNameRef.current.get(bankName);
      if (!tid) {
        notify(t("missingCompanyContext"), "danger");
        return;
      }
      if (!country?.id) {
        notify(t("selectCountry"), "danger");
        return;
      }
      if (!bankOption?.id) {
        notify(t("selectBank"), "danger");
        return;
      }

      try {
        const request = buildAddBankProcessRequest({
          form,
          tenantId: tid,
          countryId: country.id,
          bankOptionId: bankOption.id,
          accounts,
        });
        await addBankProcess(request);
        notify(t("bankProcessAdded"));
        notifyTransactionDataChanged("bank-process-list-react");
        setModalOpen(false);
        void fetchRows();
        void loadAccountingInbox({ silent: true, syncProcessList: false });
      } catch (err) {
        notify(apiMsg({ message: err?.message }, "saveFailed"), "danger");
      }
      return;
    }

    const tid = resolveBankProcessListTenantId(companyId);
    if (!tid) {
      notify(t("missingCompanyContext"), "danger");
      return;
    }
    if (!Number(form.id)) {
      notify(t("failedLoadBankProcess"), "danger");
      return;
    }

    try {
      const request = buildUpdateBankProcessRequest({
        form,
        tenantId: tid,
        accounts,
      });
      await updateBankProcess(request);
      notify(t("bankProcessUpdated"));
      notifyTransactionDataChanged("bank-process-list-react");
      setModalOpen(false);
      void fetchRows();
      void loadAccountingInbox({ silent: true, syncProcessList: false });
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "saveFailed"), "danger");
    }
  };

  const postAccountingToTransaction = async () => {
    if (guardWrite()) return;
    const selected = accountingRows.filter((r) => accountingSelected.has(accountingDueRowKey(r)) && !r.already_posted_today);
    if (selected.length === 0) return notify(t("needOneDueItem"), "warning");
    const items = selected.map((r) => buildAccountingDueSkipItem(r)).filter(Boolean);
    if (items.length === 0) return notify(t("transactionPostFailed"), "danger");
    try {
      await postAccountingDue(items);
      notify(t("postedToTransaction"));
      notifyTransactionDataChanged("bank-process-list-react");
      setAccountingOpen(false);
      setAccountingSelected(new Set());
      loadAccountingInbox({ syncProcessList: false });
      fetchRows();
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "transactionPostFailed"), "danger");
    }
  };

  const dismissAccountingRows = async () => {
    if (guardWrite()) return;
    const selected = accountingRows.filter((r) => accountingDeleteSelected.has(accountingDueRowKey(r)));
    if (selected.length === 0) return notify(t("tickDeleteRows"), "warning");
    const items = selected.map((r) => buildAccountingDueSkipItem(r)).filter(Boolean);
    if (items.length === 0) return notify(t("deleteDueFailed"), "danger");
    try {
      await skipAccountingDue(items);
      notify(t("removedFromDue"));
      setAccountingDeleteSelected(new Set());
      await loadAccountingInbox({ silent: true, syncProcessList: false });
      await fetchRows();
      if (resendModalOpen) void refreshResendConfirmLock();
      notifyTransactionDataChanged("bank-process-list-react");
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "deleteDueFailed"), "danger");
    }
  };

  const saveRemarkModal = async () => {
    if (guardWrite()) return;
    if (!remarkRow) return;
    const tid = resolveBankProcessListTenantId(companyId);
    if (!tid) return notify(t("missingCompanyContext"), "danger");
    try {
      const savedRemark = await updateBankProcessRemark({
        id: remarkRow.id,
        tenantId: tid,
        remark: remarkDraft,
      });
      const displayRemark = savedRemark ?? "";
      setRows((prev) =>
        prev.map((r) => (Number(r.id) === Number(remarkRow.id) ? { ...r, remark: displayRemark } : r)),
      );
      notifyTransactionDataChanged("bank-process-list-react");
      notify(t("remarkUpdated"));
      setRemarkModalOpen(false);
      setRemarkRow(null);
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "remarkUpdateFailed"), "danger");
    }
  };

  const resendAccountingDue = async () => {
    if (guardWrite()) return;
    if (!resendTarget) return;
    setResendInlineError("");
    const dayStart = normalizeBankResendDayStartYmd(resendDayStart);
    const dayEnd = normalizeBankResendDayStartYmd(resendDayEnd);
    const fq = bankProcessFrequencyNormalized(resendFrequency);
    const isFirstOfMonth = fq === "1st_of_every_month";
    const omitDayEnd = fq === "once" || fq === "week" || fq === "day" || fq === "monthly";

    if (!dayStart) {
      const msg = t("dayStartRequired") || "Day start is required";
      setResendInlineError(msg);
      notify(msg, "danger");
      return;
    }
    if (isFirstOfMonth && !dayEnd) {
      const msg = t("dayEndRequired") || "Day end is required for 1st of every month Resend";
      setResendInlineError(msg);
      notify(msg, "danger");
      return;
    }
    if (!omitDayEnd && dayStart && dayEnd && dayEnd < dayStart) {
      const msg = t("dayEndEarlierThanStart");
      setResendInlineError(msg);
      notify(msg, "danger");
      return;
    }

    const tid = resolveBankProcessListTenantId(companyId);
    if (!tid) {
      notify(t("missingCompanyContext"), "danger");
      return;
    }

    try {
      const request = buildResendBankProcessRequest({
        tenantId: tid,
        bankProcessId: resendTarget.id,
        dayStart,
        dayEnd: omitDayEnd ? null : dayEnd,
        frequency: fq,
      });
      await resendBankProcess(request);
      notify(t("resendSuccessful"));
      notifyTransactionDataChanged("bank-process-list-react");
      void loadAccountingInbox({ silent: true, syncProcessList: false });
      void fetchRows();
      setResendModalOpen(false);
      setResendTarget(null);
    } catch (err) {
      const rawMsg = err?.message || "";
      const msg = apiMsg({ message: rawMsg }, "resendFailed");
      if (isBankResendDayStartBackendErrorMessage(rawMsg) || isBankResendDayStartBackendErrorMessage(msg)) {
        setResendInlineError(msg);
      }
      notify(msg, "danger");
    }
  };

  const deleteSelected = () => {
    if (!selectedIds.size) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteProcesses = async () => {
    if (guardWrite()) return;
    if (!selectedIds.size) {
      setDeleteConfirmOpen(false);
      return;
    }
    const tid = resolveBankProcessListTenantId(companyId);
    if (!tid) {
      notify(t("missingCompanyContext"), "danger");
      return;
    }
    setDeleteSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      let deleted = 0;
      for (const id of ids) {
        await deleteBankProcess({ id, tenantId: tid });
        deleted += 1;
      }
      notify(deleted === 1 ? t("processDeletedOne") : t("processDeletedMany", { count: deleted }), "success");
      invalidateBankProcessListRouteCache(tid);
      bankProcessListCacheRef.current.delete(resolveBankProcessListCacheKey(tid, search));
      notifyTransactionDataChanged("bank-process-list-react");
      setDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      void fetchRows({ forceReplace: true });
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "deleteFailed"), "danger");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const allCompanyButtons = useMemo(() => dedupeCompanyRowsForSwitcher(companies, companyId), [companies, companyId]);
  const groupIds = useMemo(
    () =>
      [...new Set(allCompanyButtons.map((c) => String(c.group_id || "").trim().toUpperCase()).filter(Boolean))].sort(),
    [allCompanyButtons]
  );
  const selectedCompany = useMemo(
    () => allCompanyButtons.find((c) => Number(c.id) === Number(companyId)) || null,
    [allCompanyButtons, companyId]
  );
  const selectedGroupKey = useMemo(() => {
    if (groupFilterKind !== "follow") return "";
    if (selectedGroup) return String(selectedGroup).trim().toUpperCase();
    return String(selectedCompany?.group_id || "").trim().toUpperCase();
  }, [groupFilterKind, selectedGroup, selectedCompany?.group_id]);

  const { resetAnchorSessionRef } = useGroupAnchorSessionSync({
    companies,
    selectedGroup: groupFilterKind === "follow" ? selectedGroup : null,
    companyId: groupFilterKind === "follow" ? companyId : null,
    sessionCompanyId: getSessionTenantId(authMe),
  });

  useLayoutEffect(() => {
    if (loading) return;
    notifyDashboardGroupFilterChanged(
      groupFilterKind === "follow" ? selectedGroup : null,
      groupFilterKind === "follow" ? companyId : null
    );
  }, [loading, groupFilterKind, selectedGroup, companyId]);
  const companyButtons = useMemo(() => {
    if (groupFilterKind === "all") {
      const groupOrder = new Map(groupIds.map((gid, idx) => [gid, idx]));
      const sorted = [...allCompanyButtons].sort((a, b) => {
        const ga = String(a.group_id || "").trim().toUpperCase();
        const gb = String(b.group_id || "").trim().toUpperCase();
        const ra = groupOrder.has(ga) ? groupOrder.get(ga) : Number.MAX_SAFE_INTEGER;
        const rb = groupOrder.has(gb) ? groupOrder.get(gb) : Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return String(a.company_id || "").localeCompare(String(b.company_id || ""), undefined, { numeric: true });
      });
      return filterProcessPageCompanyButtons(sorted, {
        groupFilterKind: "follow",
        groupIds,
        selectedGroupKey: null,
      });
    }
    return filterProcessPageCompanyButtons(allCompanyButtons, {
      groupFilterKind,
      groupIds,
      selectedGroupKey,
    });
  }, [allCompanyButtons, groupIds, selectedGroupKey, groupFilterKind]);

  const handlePickGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      if (groupFilterKind === "follow" && g === selectedGroupKey) {
        setGroupFilterKind("ungrouped");
        setSelectedGroup(null);
        if (companyId != null && !canUseGroupOnlyMode(authMe)) {
          clearDashboardGroupFilterKeepCompany(companyId);
        } else {
          persistDashboardGroupFilter(null);
        }
        return;
      }
      if (groupFilterKind === "follow" && g === selectedGroupKey && companyId != null) {
        if (!canUseGroupOnlyMode(authMe)) {
          setGroupFilterKind("ungrouped");
          setSelectedGroup(null);
          clearDashboardGroupFilterKeepCompany(companyId);
        }
        return;
      }

      if (canUseGroupOnlyMode(authMe, g, companies)) {
        setGroupFilterKind("follow");
        setSelectedGroup(g);
        persistDashboardGroupFilter(g);
        flushSync(() => {
          setCompanyId(null);
          setRows([]);
          setCurrencyFilterCode("");
          setCurrencyListOrdered([]);
          setCurrencyPillDisplayOrder(null);
        });
        persistDashboardFilterState(g, null, { allowGroupOnly: true });
        notifyDashboardGroupFilterChanged(g, null);
        return;
      }

      const pick = pickDefaultSubsidiaryForGroup(companies, g);
      const nextCompanyId = pick?.id != null ? Number(pick.id) : null;

      setGroupFilterKind("follow");
      setSelectedGroup(g);
      persistDashboardGroupFilter(g);

      if (nextCompanyId != null) {
        const cacheKey = resolveBankProcessListCacheKey(nextCompanyId, search);
        const hadCache =
          Array.isArray(bankProcessListCacheRef.current.get(cacheKey)?.rows) &&
          bankProcessListCacheRef.current.get(cacheKey).rows.length > 0;
        skipCompanyFetchEffectRef.current = hadCache;
        suppressCrossPageSyncRef.current = true;
        flushSync(() => {
          setCompanyId(nextCompanyId);
          if (hadCache) applyBankProcessListCache(nextCompanyId);
          else {
            setRows([]);
            setTableLoading(true);
            setCurrencyFilterCode("");
            setCurrencyListOrdered([]);
            setCurrencyPillDisplayOrder(null);
          }
        });
        persistDashboardFilterState(g, nextCompanyId, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(g, nextCompanyId, {
          companyCode: pick.company_id,
        });
        void onSwitchCompanyRef.current?.(pick, { layoutSilent: true, backgroundRefresh: hadCache });
        return;
      }

      if (!canUseGroupOnlyMode(authMe) && companyId != null) {
        persistDashboardFilterState(g, companyId, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(g, companyId);
      }
    },
    [
      applyBankProcessListCache,
      authMe,
      companies,
      companyId,
      groupFilterKind,
      search,
      selectedGroupKey,
    ],
  );

  const handlePickAllGroups = useCallback(() => {
    setGroupFilterKind((k) => (k === "all" ? "ungrouped" : "all"));
  }, []);

  const sortedRows = useMemo(
    () => sortBankProcessTableRows(rows, sortColumn, sortDirection),
    [rows, sortColumn, sortDirection]
  );

  const handleBankTableSort = useCallback(
    (column) => {
      setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
      setSortColumn(column);
      setCurrentPage(1);
    },
    [sortColumn]
  );

  const rowCountryCodes = useMemo(() => {
    const s = new Set();
    for (const r of rows) {
      const c = String(r.country || "").trim().toUpperCase();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const baseCurrencyPills = useMemo(() => {
    if (!currencyListOrdered.length) return [];
    const extra = rowCountryCodes.filter((c) => !currencyListOrdered.includes(c));
    return extra.length ? [...currencyListOrdered, ...extra] : currencyListOrdered;
  }, [currencyListOrdered, rowCountryCodes]);

  const currencyPillCodes = useMemo(
    () => currencyPillDisplayOrder ?? baseCurrencyPills,
    [currencyPillDisplayOrder, baseCurrencyPills]
  );

  const handlePickAllCurrencies = useCallback(() => {
    userSelectedAllCurrenciesRef.current = true;
    clearDashboardSelectedCurrency();
    setCurrencyFilterCode("");
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const handlePickCurrency = useCallback(
    (code) => {
      userSelectedAllCurrenciesRef.current = false;
      const cur = String(code || "").trim().toUpperCase();
      setCurrencyFilterCode(cur);
      setCurrentPage(1);
      setSelectedIds(new Set());
      if (cur) {
        notifyDashboardCurrencyFilterChanged(
          cur,
          buildDashboardCurrencyScopeKey({ companyId, selectedGroup }),
        );
      }
    },
    [companyId, selectedGroup],
  );

  useCrossPageCurrencySync({
    enabled: !loading && !!companyId && currencyPillCodes.length > 0,
    companyId,
    selectedGroup,
    availableCodes: currencyPillCodes,
    currentCode: currencyFilterCode,
    onApplyCode: (code) => {
      userSelectedAllCurrenciesRef.current = false;
      setCurrencyFilterCode(code);
      setCurrentPage(1);
      setSelectedIds(new Set());
    },
    respectEmptyRef: userSelectedAllCurrenciesRef,
  });

  useEffect(() => {
    setCurrencyPillDisplayOrder((prev) => {
      if (!prev) return null;
      const allowed = new Set(baseCurrencyPills);
      const kept = prev.filter((c) => allowed.has(c));
      const add = baseCurrencyPills.filter((c) => !kept.includes(c));
      if (!kept.length && !add.length) return null;
      return add.length ? [...kept, ...add] : kept;
    });
  }, [baseCurrencyPills]);

  const persistOrderedCompanyCurrencies = useCallback(
    async (orderedPills) => {
      const cid = Number(companyId);
      if (!Number.isFinite(cid) || cid <= 0) return;
      const companySet = new Set(currencyListOrdered);
      const apiOrder = orderedPills.filter((c) => companySet.has(c));
      if (apiOrder.length === 0) return;
      const json = await saveUserCurrencyOrder(apiOrder, { companyId: cid });
      if (!json?.success) return;
      persistCurrencyDisplayOrder(cid, [...apiOrder, ...currencyListOrdered.filter((c) => !apiOrder.includes(c))]);
      const tail = currencyListOrdered.filter((c) => !apiOrder.includes(c));
      setCurrencyListOrdered([...apiOrder, ...tail]);
    },
    [companyId, currencyListOrdered],
  );

  const onCurrencyPillDrop = useCallback(
    async (e, targetCode) => {
      e.preventDefault();
      const dragged = e.dataTransfer.getData("text/plain");
      if (!dragged || !targetCode || dragged === targetCode) return;
      const list = [...currencyPillCodes];
      const fromI = list.indexOf(dragged);
      const toI = list.indexOf(targetCode);
      if (fromI < 0 || toI < 0 || fromI === toI) return;
      skipNextCurrencyPillClickRef.current = true;
      const next = [...list];
      const [moved] = next.splice(fromI, 1);
      next.splice(toI, 0, moved);
      setCurrencyPillDisplayOrder(next);
      const cid = Number(companyId);
      if (Number.isFinite(cid) && cid > 0) {
        persistCurrencyDisplayOrder(cid, next);
      }
      await persistOrderedCompanyCurrencies(next);
    },
    [currencyPillCodes, persistOrderedCompanyCurrencies, companyId],
  );

  useEffect(() => {
    if (!currencyFilterCode) return;
    if (currencyPillCodes.length && !currencyPillCodes.includes(currencyFilterCode)) {
      setCurrencyFilterCode("");
    }
  }, [currencyFilterCode, currencyPillCodes]);

  const visibleRows = useMemo(() => {
    const filterState = { showAll, showActive, showInactive, showOfficial, showEInvoice, showBlock };
    let filtered = filterBankProcessRowsBySearch(sortedRows, search).filter((r) =>
      matchesCurrentBankFilters(r, filterState),
    );
    if (dateFrom || dateTo) {
      const fromMs = dateFrom ? parseRowDateMs(dateFrom) : null;
      const toMs = dateTo ? parseRowDateMs(dateTo) : null;
      const toEnd = toMs != null ? toMs + 86400000 - 1 : null;
      filtered = filtered.filter((r) => {
        const ts = parseRowDateMs(r.date || r.day_start);
        if (ts == null) return false;
        if (fromMs !== null && ts < fromMs) return false;
        if (toEnd !== null && ts > toEnd) return false;
        return true;
      });
    }
    if (currencyFilterCode) {
      filtered = filtered.filter((r) => String(r.country || "").trim().toUpperCase() === currencyFilterCode);
    }
    return filtered;
  }, [
    sortedRows,
    search,
    dateFrom,
    dateTo,
    showAll,
    showActive,
    showInactive,
    showOfficial,
    showEInvoice,
    showBlock,
    currencyFilterCode,
  ]);

  const pageSize = useAutoListPageSize({
    listRegionRef,
    enabled: !showAll,
    minRows: PAGE_SIZE_MIN,
    maxRows: PAGE_SIZE_MAX,
    // Show inactive / select column can alter effective row height.
    // Use real rendered rows to prevent clipped rows near page bottom.
    stableRowHeight: false,
    remeasureDeps: [
      visibleRows.length,
      tableLoading,
      lang,
      cssReady,
      currentPage,
      currencyFilterCode,
      showAll,
      showActive,
      showInactive,
      showOfficial,
      showEInvoice,
      showBlock,
    ],
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleRows.length / pageSize)),
    [visibleRows.length, pageSize],
  );

  useEffect(() => {
    if (showAll) return;
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [showAll, totalPages, pageSize]);

  const pageRows = useMemo(() => {
    if (showAll) return visibleRows;
    const p = Math.min(currentPage, totalPages);
    return visibleRows.slice((p - 1) * pageSize, p * pageSize);
  }, [visibleRows, showAll, currentPage, totalPages, pageSize]);

  return {
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
    cssReady,
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
    showActive,
    setShowActive,
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
    resendConfirmBlockReason,
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
    createAccountModalCurrency,
    removeAccountModalCurrency,
    submitAccountModal,
    loadCurrencyMeta,
    syncUrl,
    fetchRows,
    handleBankStatusUpdated,
    loadAccountingInbox,
    resetForm,
    onSwitchCompany,
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
    handlePickCurrency,
    handlePickAllCurrencies,
    visibleRows,
    totalPages,
    pageRows,
    pageSize,
    PAGE_SIZE: pageSize,
    listRegionRef,
    mutationsBlocked,
  };
}
