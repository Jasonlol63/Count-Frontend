import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { fetchUpdateCompanySession } from "../../../utils/company/companySessionSwitchCore.js";
import { ensureCrossPageCompanySelection } from "../../../utils/company/companySessionSync.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import { prefetchRouteModule } from "../../../utils/routing/routePrefetch.js";
import { replaceBrowserPathOnly } from "../../../utils/routing/privateBrowserUrl.js";
import {
  buildDashboardSidebarNotifyOptions,
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
import { useRealtimeDomain } from "../../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../../lib/realtime/realtimeEvents.js";
import { isCapitalLettersOnly, sanitizeCapitalLettersOnly } from "../../../utils/input/sanitizeCapitalLettersOnly.js";
import {
  mergeCurrencyCodesWithSavedOrder,
  persistCurrencyDisplayOrder,
  persistUserCurrencyDisplayOrder,
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
import { formatDmy, parseYmd } from "../../../utils/date/dateUtils.js";
import {
  PAGE_SIZE_MAX,
  PAGE_SIZE_MIN,
  normalizeRows,
  dmyToIso,
  parseRowDateMs,
  isBankResendDayStartBackendErrorMessage,
  notifyTransactionDataChanged,
  bankProcessStatusTargetPatch,
  resolveIsBankOnlyCompanyAsync,
  parseProfitSharingToRows,
  serializeProfitSharingRows,
  calcBankNetProfitDisplay,
  formatBankMoneyFixed2,
  formatProfitSharingStringFixed2,
  EMPTY_BANK_FORM,
  buildBankDtsFormFields,
  parseBankContractRentalMonthsForDayEnd,
  contractBillingEndYmdForBankForm,
  matchesCurrentBankFilters,
  bankProcessFrequencyNormalized,
  BANK_PICK_ACCOUNT_ROLES,
  filterBankPickAccounts,
  filterBankProcessRowsBySearch,
  sortBankProcessTableRows,
  accountingDuePeriodType,
  accountingDueBillingMonth,
  accountingDueRowKey,
  checkBankResendLockFromBackend,
  isBankResendScheduleLockedToday,
  isResendDayStartDuplicateInAccountingDue,
  normalizeBankResendDayStartYmd,
  resolveBankProcessListTenantId,
  bankProcessListRowToEditForm,
  readBankCountryChipSelection,
  persistBankCountryChipSelection,
} from "../lib/bankProcessHelpers.js";
import {
  fetchBankProcessListByTenantId,
  addBankProcess,
  buildAddBankProcessRequest,
  updateBankProcess,
  buildUpdateBankProcessRequest,
  deleteBankProcess,
  updateBankProcessRemark,
  fetchAccountingDueInbox,
  postAccountingDue,
  skipAccountingDue,
  resendBankProcess,
  buildResendBankProcessRequest,
} from "../bankProcessListApi.js";
import {
  fetchBankCountriesByTenantId,
  fetchBankOptionsByCountryId,
  insertBankCountry,
  insertBankOption,
  deleteBankCountry,
  deleteBankOption,
} from "../bankCountryOptionApi.js";
import {
  dedupeCompanyRowsForSwitcher,
  filterProcessPageCompanyButtons,
} from "../../processlist/processListHelpers.js";
import {
  prefetchBankProcessListPayload,
  resolveBankProcessListRouteCache,
  warmBankProcessListRouteCache,
  warmProcessListRouteCache,
} from "../../processlist/processRoutePrefetch.js";
import {
  fetchAccountListByTenantId,
  fetchAvailableCurrencies,
  createTenantCurrency,
  deleteTenantCurrency,
  createAccountUser,
  updateAccountUser,
  buildAccountCreateRequest,
  buildAccountUpdateRequest,
  accountRowToEditForm,
  tenantIdsToPickerCompanyIds,
} from "../../account/accountListApi.js";
import { fetchCurrencyListByTenantId, normalizeCurrencyRow } from "../../../utils/api/currencyApi.js";

function resolveBankProcessListCacheKey(companyId, search) {
  return `company:${Number(companyId)}|${String(search || "").trim()}`;
}

function bankProcessRowsFingerprint(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "0";
  return rows.map((r) => Number(r.id)).join(",");
}

function resolveBankProcessBootCurrency() {
  return "";
}

/** Picker hidden inputs + toolbar label use DD/MM/YYYY (same as MaintenanceDateRangePicker). */
function ymdToPickerDmy(ymd) {
  const d = parseYmd(String(ymd || "").trim());
  return d ? formatDmy(d) : "";
}

function resolveBankProcessListCurrencyAfterFetch(prev, ordered, userSelectedAllRef) {
  if (userSelectedAllRef.current && !prev) return "";
  if (prev && ordered.includes(prev)) return prev;
  return "";
}
import { usePartnershipAuditWriteGuard } from "../../../utils/audit/usePartnershipAuditWriteGuard.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

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

    if (fromId === "bank_day_start_drp_from" && document.getElementById("bank_day_start_drp_from")) {
      const fromDmy = document.getElementById(fromId)?.value?.trim() || "";
      setForm((prev) => ({ ...prev, day_start: dmyToIso(fromDmy) }));
      return;
    }
    if (fromId === "bank_day_end_drp_from" && document.getElementById("bank_day_end_drp_from")) {
      const fromDmy = document.getElementById(fromId)?.value?.trim() || "";
      const iso = dmyToIso(fromDmy);
      const minYmd = document.getElementById("bank_day_end_drp_from")?.dataset?.minYmd || "";
      if (minYmd && iso && iso < minYmd) return;
      setForm((prev) => ({ ...prev, day_end: iso }));
      return;
    }
    if (fromId === "bank_resend_day_start_drp_from" && document.getElementById("bank_resend_day_start_drp_from")) {
      const fromDmy = document.getElementById(fromId)?.value?.trim() || "";
      setResendInlineError("");
      setResendDayStart(dmyToIso(fromDmy));
      return;
    }
    if (fromId === "bank_resend_day_end_drp_from" && document.getElementById("bank_resend_day_end_drp_from")) {
      const fromDmy = document.getElementById(fromId)?.value?.trim() || "";
      const iso = dmyToIso(fromDmy);
      const minYmd = document.getElementById("bank_resend_day_end_drp_from")?.dataset?.minYmd || "";
      if (minYmd && iso && iso < minYmd) return;
      setResendDayEnd(iso);
      return;
    }

    const listFromDmy = document.getElementById("date_from")?.value?.trim() || "";
    const listToDmy = document.getElementById("date_to")?.value?.trim() || "";
    flushSync(() => {
      setDateFrom(dmyToIso(listFromDmy));
      setDateTo(dmyToIso(listToDmy));
    });
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

  const toolbarDateRangeText = useMemo(() => {
    const fromD = parseYmd(dateFrom);
    const toD = parseYmd(dateTo);
    if (!fromD || !toD) return t("selectDateRange");
    return `${formatDmy(fromD)} - ${formatDmy(toD)}`;
  }, [dateFrom, dateTo, t]);
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
  /** `{ [code]: id }` — Spring catalog rows keyed by code/name, for delete/insert calls. */
  const countriesCatalogRef = useRef(new Map());
  const banksCatalogRef = useRef(new Map());

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

  // Company multi-select is no longer refreshed from a server "available companies"
  // fetch (Spring has none) — callers set accountModalSelectedCompanyIds directly, from
  // the account's own tenant_ids on edit or [companyId] on add.
  const loadAccountModalSelectionMeta = useCallback(
    async (accountId, isEdit) => {
      if (!companyId) return;
      try {
        const rows = await fetchAvailableCurrencies(companyId, accountId);
        setAccountModalCurrencies(rows.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
        if (isEdit) {
          const ids = rows.filter((c) => c.is_linked).map((c) => Number(c.id));
          setAccountModalSelectedCurrencyIds(ids);
          setAccountModalInitialCurrencyIds(ids);
        } else {
          setAccountModalSelectedCurrencyIds(pickDefaultAddCurrencyIds(rows));
          setAccountModalInitialCurrencyIds([]);
        }
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
    const targetCompany = accountModalSelectedCompanyIds[0] || companyId;
    if (!targetCompany) return notify(t("pleaseSelectCompanyFirst"), "danger");
    try {
      const created = await createTenantCurrency({ code, tenantId: targetCompany });
      const newId = Number(created?.id);
      if (Number.isFinite(newId) && newId > 0) {
        setAccountModalCurrencies((prev) => [
          ...prev,
          { id: newId, code: created.code ?? code, is_linked: false },
        ]);
      } else {
        const rows = await fetchAvailableCurrencies(targetCompany, accountModalIsEditMode && accountModalForm.id ? accountModalForm.id : null);
        setAccountModalCurrencies(rows.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
      }
      setAccountModalCurrencyInput("");
      notify(t("currencyCreated", { code }), "success");
    } catch (err) {
      notify(apiMsg({ message: err?.message }, "failedCreateCurrency"), "danger");
    }
  };

  const removeAccountModalCurrency = async (cid) => {
    // Spring delete has no `force` override, unlike the old PHP endpoint.
    const { success, message } = await deleteTenantCurrency({ id: cid, tenantId: companyId });
    if (!success) return notify(apiMsg({ message }, "failedDeleteCurrency"), "danger");
    const removed = accountModalCurrencies.find((c) => Number(c.id) === Number(cid));
    setAccountModalCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
    setAccountModalSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
    if (removed?.code && companyId) {
      const code = String(removed.code).trim();
      const countryId = countriesCatalogRef.current.get(toUpper(code));
      setCountriesList((prev) => prev.filter((c) => String(c).trim().toUpperCase() !== toUpper(code)));
      setSelectedCountryChips((prev) => {
        const next = prev.filter((c) => String(c).trim().toUpperCase() !== toUpper(code));
        void persistSelectedCountries(next);
        return next;
      });
      if (countryId) {
        try {
          await deleteBankCountry(companyId, countryId);
          countriesCatalogRef.current.delete(toUpper(code));
        } catch {
          /* country list already updated in UI */
        }
      }
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

    // Spring create/update take currencyIds/tenantIds directly — no separate
    // add_company/add_currency/remove_currency follow-up calls needed.
    const submitFields = {
      ...accountModalForm,
      account_id: toUpper(accountModalForm.account_id),
      name: toUpper(accountModalForm.name),
      remark: toUpper(accountModalForm.remark),
      alert_amount: alertAmount,
    };
    if (accountModalForm.payment_alert === "0") {
      submitFields.alert_type = "";
      submitFields.alert_start_date = "";
      submitFields.alert_amount = "";
    }
    const tenantIds = accountModalSelectedCompanyIds.map(Number).filter((n) => Number.isFinite(n) && n > 0);

    try {
      let saved;
      if (isEdit) {
        const request = buildAccountUpdateRequest(submitFields, companyId, accountModalSelectedCurrencyIds, tenantIds);
        saved = await updateAccountUser(request);
      } else {
        const request = buildAccountCreateRequest(submitFields, companyId, accountModalSelectedCurrencyIds, tenantIds);
        saved = await createAccountUser(request);
      }
      notify(isEdit ? tAccount("accountSavedSuccessfully") : t("accountAddedSuccessfully"), "success");
      await handleAccountModalSuccess?.(saved);
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
      if (fromH) fromH.value = dfIso && /^\d{4}-\d{2}-\d{2}$/.test(dfIso) ? ymdToPickerDmy(dfIso) : "";
      if (toH) toH.value = dtIso && /^\d{4}-\d{2}-\d{2}$/.test(dtIso) ? ymdToPickerDmy(dtIso) : "";
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
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.bindPickers?.();
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

  /* React state 为 date range 唯一来源；hidden input 由 layout effect 写入 DOM（同 Dashboard） */
  useLayoutEffect(() => {
    if (loading || !cssReady || !bankDatePickerInitRef.current) return;
    const df = document.getElementById("date_from");
    const dt = document.getElementById("date_to");
    if (!df || !dt) return;
    const fromDmy = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? ymdToPickerDmy(dateFrom) : "";
    const toDmy = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? ymdToPickerDmy(dateTo) : "";
    if (df.value !== fromDmy) df.value = fromDmy;
    if (dt.value !== toDmy) dt.value = toDmy;
    const picker = document.getElementById("date-range-picker");
    if (picker) {
      picker.classList.toggle("has-selected-range", !!(fromDmy && toDmy));
    }
  }, [dateFrom, dateTo, loading, cssReady]);


  useEffect(() => {
    (async () => {
      let skipLoadingDone = false;
      try {
        const bootUrl = new URL(window.location.href);
        const bootSearch = bootUrl.searchParams.get("search") || "";
        if (authMe?.company_id) {
          warmBankProcessListRouteCache(authMe.company_id, { search: bootSearch });
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
            // Cross-route switch arrived before warm finished — silent hydrate, no Failed toast.
            setTableLoading(true);
            skipNextBankFetchRef.current = true;
          }
          const prefetchedRow = prefetchedCompanies.find((c) => Number(c.id) === prefetchCompanyId);
          const prefBootGroup = resolveInitialSelectedGroupFromSession(prefetchedCompanies, prefetchedRow);
          setSelectedGroup(prefBootGroup);
          await ensureCrossPageCompanySelection(prefetchCompanyId, {
            companies: prefetchedCompanies,
            selectedGroup: prefBootGroup,
            companyRow: prefetchedRow,
            sessionCompanyId: authMe?.company_id,
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
            : cs.find((c) => Number(c.id) === Number(sessionUser.company_id)) || null;
        const bootGroup = resolveInitialSelectedGroupFromSession(cs, rowForBoot, sessionUser);
        const effectiveNum = resolveSubsidiaryBootCompanyId(cs, {
          urlCompanyId: queryCompany,
          sessionCompanyId: sessionUser.company_id,
          selectedGroup: bootGroup,
          loginMe: sessionUser,
        });
        const currentCompanyRow =
          effectiveNum != null ? cs.find((c) => Number(c.id) === Number(effectiveNum)) : null;
        if (currentCompanyRow?.company_id) {
          const bankCategory = await resolveIsBankOnlyCompanyAsync(
            currentCompanyRow,
            sessionUser,
            buildApiUrl,
          );
          if (!bankCategory) {
            warmProcessListRouteCache(effectiveNum);
            prefetchRouteModule(spaPath("process-list"));
            navigate(spaPath("process-list"), {
              replace: true,
              state: {
                processListPrefetch: {
                  companyId: effectiveNum,
                  companies: cs,
                  groupFilterKind: "follow",
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
  }, [navigate, location.state, authMe?.company_id]);

  useEffect(() => {
    if (!companyId || loading) return;
    (async () => {
      try {
        const accountRows = await fetchAccountListByTenantId(companyId);
        setAccounts(filterBankPickAccounts(accountRows));
      } catch { setAccounts([]); }
    })();
  }, [companyId, loading]);

  const loadCurrencyMeta = useCallback(async (targetCompanyId) => {
    const cid = Number(targetCompanyId ?? companyId);
    if (!Number.isFinite(cid) || cid <= 0) return;
    try {
      const [currencyRows, ordJson] = await Promise.all([
        fetchCurrencyListByTenantId(cid),
        getUserCurrencyOrder({ companyId: cid }).catch(() => null),
      ]);
      const codes = currencyRows.map((r) => normalizeCurrencyRow(r).code).filter(Boolean);
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
    let cancelled = false;
    (async () => {
      try {
        const countries = await fetchBankCountriesByTenantId(companyId);
        if (cancelled) return;
        const codeMap = new Map(countries.map((c) => [c.code, c.id]));
        countriesCatalogRef.current = codeMap;
        const codes = [...codeMap.keys()].sort();
        setCountriesList(codes);

        const stored = readBankCountryChipSelection(companyId);
        const storedCountries = (stored?.selectedCountries || []).filter((c) => codeMap.has(c));
        setSelectedCountryChips(storedCountries.length ? storedCountries : codes);
        setSelectedBanksByCountry(stored?.selectedBanksByCountry || {});
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [modalOpen, companyId]);

  useEffect(() => {
    if (!modalOpen || !companyId || !form.country) {
      setBanksList([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const countryId = countriesCatalogRef.current.get(String(form.country).trim().toUpperCase());
        if (!countryId) {
          setBanksList([]);
          return;
        }
        const banks = await fetchBankOptionsByCountryId(companyId, countryId);
        if (cancelled) return;
        const nameMap = new Map(banks.map((b) => [b.name, b.id]));
        banksCatalogRef.current = nameMap;
        setBanksList([...nameMap.keys()].sort());
      } catch {
        if (!cancelled) setBanksList([]);
      }
    })();
    return () => { cancelled = true; };
  }, [modalOpen, companyId, form.country]);

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

  // Contract / Day start / Frequency 变化时自动填 Day end（1st_of_every_month / monthly 仍可事后手动改）。
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
    const duplicateClient = isResendDayStartDuplicateInAccountingDue(accountingRows, id, resendDayStart);
    const quickLocked = isBankResendScheduleLockedToday(resendTarget, resendDayStart);
    const seq = ++resendLockCheckSeqRef.current;
    setResendLockChecking(true);
    setResendConfirmDisabled(true);
    setResendConfirmBlockReason(duplicateClient ? "duplicate" : quickLocked ? "locked" : "");
    try {
      const backend = await checkBankResendLockFromBackend(id, resendDayStart);
      if (seq !== resendLockCheckSeqRef.current) return;
      const duplicate = duplicateClient || backend.duplicateOpenAnchor;
      const locked = backend.locked;
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
        const slice = await prefetchBankProcessListPayload(cid, { search, signal: ac.signal });
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
          if (silent && bankProcessRowsFingerprint(prev) === bankProcessRowsFingerprint(nextRows)) {
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
      // Prefer module warm / in-flight from cross-route switch; silent so races never toast.
      skipNextBankFetchRef.current = false;
      void (async () => {
        const cid = Number(companyId);
        if (applyBankProcessListCache(cid)) {
          void fetchRows({ companyId: cid, silent: true });
          return;
        }
        const slice = await resolveBankProcessListRouteCache(cid, { search });
        if (Number(companyIdRef.current) !== cid) return;
        if (Array.isArray(slice?.rows)) {
          const cacheKey = resolveBankProcessListCacheKey(cid, search);
          bankProcessListCacheRef.current.set(cacheKey, {
            rows: slice.rows,
            currencyCodes: slice.currencyCodes,
          });
          applyBankProcessListCache(cid);
          void fetchRows({ companyId: cid, silent: true });
          return;
        }
        await fetchRows({ companyId: cid, silent: true });
      })();
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
    const restoreDismissed = !!opts.restoreDismissed;
    const cid = Number(companyId);
    if (!Number.isFinite(cid) || cid <= 0) return;
    const fetchGen = ++accountingInboxFetchGenRef.current;
    if (!silent) setAccountingLoading(true);
    try {
      const list = await fetchAccountingDueInbox(cid, undefined, { restoreSkipped: restoreDismissed });
      if (fetchGen !== accountingInboxFetchGenRef.current) return;
      if (Number(companyIdRef.current) !== cid) return;
      setAccountingRows(list);
      if (!silent) {
        setAccountingSelected(new Set(list.map((x) => accountingDueRowKey(x)).filter(Boolean)));
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
  }, [companyId]);

  useRealtimeDomain(
    [REALTIME_DOMAINS.PROCESSES, REALTIME_DOMAINS.ACCOUNTS],
    () => {
      if (!companyId) return;
      void fetchRows({ silent: true, preservePage: true, preserveSelection: true });
      void loadAccountingInbox({ silent: true });
    },
  );

  const handleBankStatusUpdated = useCallback(
    (row, target, opts = {}) => {
      const id = row?.id;
      if (id == null) return;
      const backgroundSync = opts.backgroundSync !== false;
      const patch = bankProcessStatusTargetPatch(row, target);
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
      if (!backgroundSync) return;
      notifyTransactionDataChanged("bank-process-list-react-status");
      void fetchRows({ silent: true, preservePage: true, preserveSelection: true });
      void loadAccountingInbox({ silent: true });
    },
    [fetchRows, loadAccountingInbox]
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
          sessionCompanyId: authMe?.company_id,
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
      void loadAccountingInbox({ silent: true });
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
        const sessionCompanyId = authMe?.company_id != null ? Number(authMe.company_id) : null;
        if (backgroundRefresh) {
          void fetchRows({ companyId: nextId, silent: true, preservePage: true, preserveSelection: true });
        }
        if (accountingOpen) void loadAccountingInbox({ silent: true });

        try {
          const bankCategory = await resolveIsBankOnlyCompanyAsync(c, authMe, buildApiUrl);
          if (!bankCategory) {
            warmProcessListRouteCache(nextId);
            prefetchRouteModule(spaPath("process-list"));
            navigate(spaPath("process-list"), {
              replace: true,
              state: {
                processListPrefetch: {
                  companyId: nextId,
                  companies,
                  groupFilterKind: "follow",
                },
              },
            });
            return;
          }
        } catch {
          /* fall through to session sync */
        }

        if (sessionCompanyId === nextId) return;

        companySessionAbortRef.current?.abort();
        const sessionAc = new AbortController();
        companySessionAbortRef.current = sessionAc;

        try {
          const { json } = await fetchUpdateCompanySession(nextId, { signal: sessionAc.signal });
          if (sessionAc.signal.aborted) return;
          if (!json?.success) {
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
      authMe?.company_id,
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
      notifyDashboardGroupFilterChanged(
        nextGroup,
        nextId,
        buildDashboardSidebarNotifyOptions(c, nextGroup),
      );

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

  const persistSelectedCountries = async (countries) => {
    if (!companyId) return;
    persistBankCountryChipSelection(companyId, {
      selectedCountries: countries,
      selectedBanksByCountry,
    });
    void refreshAccountModalCurrenciesIfOpen();
  };

  const persistSelectedBanksByCountry = async (map) => {
    if (!companyId) return;
    persistBankCountryChipSelection(companyId, {
      selectedCountries: selectedCountryChips,
      selectedBanksByCountry: map,
    });
  };

  const submitNewCountry = async (e) => {
    if (guardWrite()) return;
    e.preventDefault();
    const name = sanitizeCapitalLettersOnly(newCountryName);
    if (!companyId) return;
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
      const created = await insertBankCountry(companyId, name);
      countriesCatalogRef.current.set(created.code, created.id);
      setCountriesList((prev) => [...new Set([...prev, created.code])].sort());
      mergeAccountModalCurrency({ id: created.id, code: created.code });
      setNewCountryName("");
      notify(t("countryAdded"));
    } catch (err) { notify(apiMsg({ message: err?.message }, "addCountryFailed"), "danger"); }
  };

  const submitNewBank = async (e) => {
    if (guardWrite()) return;
    e.preventDefault();
    const name = sanitizeCapitalLettersOnly(newBankName);
    if (!companyId || !form.country) return;
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
    const countryId = countriesCatalogRef.current.get(String(form.country).trim().toUpperCase());
    if (!countryId) return;
    try {
      const created = await insertBankOption(companyId, countryId, name);
      banksCatalogRef.current.set(created.name, created.id);
      setBanksList((prev) => [...new Set([...prev, created.name])].sort());
      setNewBankName("");
      notify(t("bankAdded"));
    } catch (err) { notify(apiMsg({ message: err?.message }, "addBankFailed"), "danger"); }
  };

  const removeAvailableCountry = async (countryName) => {
    const country = String(countryName || "").trim();
    if (!country || !companyId) return;
    const countryId = countriesCatalogRef.current.get(country);
    if (!countryId) return;
    try {
      await deleteBankCountry(companyId, countryId);
      countriesCatalogRef.current.delete(country);
      setCountriesList((prev) => prev.filter((c) => c !== country));
      setSelectedCountryChips((prev) => {
        const next = prev.filter((c) => c !== country);
        void persistSelectedCountries(next);
        return next;
      });
      setForm((f) => (f.country === country ? { ...f, country: "", bank: "" } : f));
      removeAccountModalCurrencyByCode(country);
      void refreshAccountModalCurrenciesIfOpen();
      notify(t("countryRemoved"));
    } catch (err) { notify(apiMsg({ message: err?.message }, "removeCountryFailed"), "danger"); }
  };

  const removeAvailableBank = async (bankName) => {
    const bank = String(bankName || "").trim();
    const country = String(form.country || "").trim();
    if (!bank || !country || !companyId) return;
    const countryId = countriesCatalogRef.current.get(country);
    const bankOptionId = banksCatalogRef.current.get(bank);
    if (!countryId || !bankOptionId) return;
    try {
      await deleteBankOption(companyId, bankOptionId, countryId);
      banksCatalogRef.current.delete(bank);
      setBanksList((prev) => prev.filter((b) => b !== bank));
      setSelectedBankChips((prev) => prev.filter((b) => b !== bank));
      setSelectedBanksByCountry((prev) => {
        const list = (prev[country] || []).filter((b) => b !== bank);
        const next = { ...prev };
        if (list.length) next[country] = list;
        else delete next[country];
        void persistSelectedBanksByCountry(next);
        return next;
      });
      setForm((f) => (f.bank === bank ? { ...f, bank: "" } : f));
      notify(t("bankRemoved"));
    } catch { notify(t("removeBankFailed"), "danger"); }
  };

  const openProfitShareModal = () => {
    const rows = parseProfitSharingToRows(form.profit_sharing, accounts).map((r) => {
      const prevMatch = profitShareRows.find((pr) => pr.accountId && String(pr.accountId) === String(r.accountId));
      return {
        ...r,
        amount: r.amount ? formatBankMoneyFixed2(r.amount) : "",
        amountMode: prevMatch?.amountMode || "",
        percentInput: prevMatch?.percentInput || "",
      };
    });
    setProfitShareRows(rows.length ? rows : [{ accountId: "", accountLabel: "", amount: "", amountMode: "", percentInput: "" }]);
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
    const accountRows = await fetchAccountListByTenantId(companyId).catch(() => []);
    const list = filterBankPickAccounts(accountRows);
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

  // Roles list: no Spring endpoint (dead in PHP too, see src/pages/account/README.md) —
  // getAccountModalOrderedRoles([]) already falls back to the full static ROLE_PRIORITY list.
  const openAddAccountForField = async (target) => {
    setAccountPlusTarget(target);
    if (!companyId) return notify(t("missingCompanyContext"), "danger");

    const existingId = getAccountIdForPlusTarget(target);
    const existingPickable = existingId && isPickableAccountId(existingId);

    try {
      if (existingPickable) {
        const row = accounts.find((a) => Number(a.id) === Number(existingId));
        if (!row) {
          notify(tAccount("failedToLoadAccount"), "danger");
          return;
        }
        const editForm = accountRowToEditForm(row);
        setAccountModalIsEditMode(true);
        setAccountModalForm(editForm);
        setAccountModalCurrencyInput("");
        setAccountModalSelectedCompanyIds(
          row.tenant_ids?.length ? tenantIdsToPickerCompanyIds(row.tenant_ids) : [Number(companyId)],
        );
        await loadAccountModalSelectionMeta(existingId, true);
      } else {
        if (existingId) clearFormFieldForPlusTarget(target);
        resetAccountModalToAdd();
        await loadAccountModalSelectionMeta(null, false);
      }

      setAddAccountModalOpen(true);
    } catch {
      notify(tAccount("errorLoadingAccount"), "danger");
    }
  };

  // No Spring get-by-id (frontend-springboot-migration.md §10.3.2) — build the Edit form
  // directly from the already-loaded, normalized list row.
  const openEdit = async (rowId) => {
    const row = rowsRef.current.find((r) => Number(r.id) === Number(rowId));
    if (!row) {
      notify(t("failedLoadBankProcess"), "danger");
      return;
    }
    const nextForm = bankProcessListRowToEditForm(row, accounts);
    seedContractSyncKeys(nextForm);
    setEditMode(true);
    setForm(nextForm);
    setModalOpen(true);
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
      if (!String(form.type || "").trim()) {
        notify(t("selectType"), "danger");
        return;
      }
    }
    // buildBankProcessMutableWriteFields (bankProcessListApi.js) already blanks
    // day_end/contract/insurance for once/week/day frequencies — no manual field
    // stripping needed here, unlike the old FormData-building code.
    const submitFormValues = {
      ...form,
      name: toUpper(form.name),
      day_end_monthly_cap_enabled: dayEndMonthlyCapEnabled,
      profit: calcBankNetProfitDisplay(form.cost, form.price, form.profit_sharing),
    };
    try {
      if (editMode) {
        const request = buildUpdateBankProcessRequest({ form: submitFormValues, tenantId: companyId, accounts });
        await updateBankProcess(request);
      } else {
        const countryId = countriesCatalogRef.current.get(String(form.country).trim().toUpperCase());
        const bankOptionId = banksCatalogRef.current.get(String(form.bank).trim().toUpperCase());
        if (!countryId || !bankOptionId) {
          notify(t("selectCountry"), "danger");
          return;
        }
        const request = buildAddBankProcessRequest({
          form: submitFormValues,
          tenantId: companyId,
          countryId,
          bankOptionId,
          accounts,
        });
        await addBankProcess(request);
      }
      notify(editMode ? t("bankProcessUpdated") : t("bankProcessAdded"));
      notifyTransactionDataChanged("bank-process-list-react");
      setModalOpen(false);
      void fetchRows();
      void loadAccountingInbox({ silent: true });
    } catch (err) { notify(apiMsg({ message: err?.message }, "saveFailed"), "danger"); }
  };

  const accountingDuePostItem = (r) => ({
    bankProcessId: Number(r.bank_process_id ?? r.id),
    postedDate: r.posted_date,
    periodType: accountingDuePeriodType(r),
    billingStart: r.billing_period_start,
    billingEnd: r.billing_period_end,
  });

  const postAccountingToTransaction = async () => {
    if (guardWrite()) return;
    const selected = accountingRows.filter((r) => accountingSelected.has(accountingDueRowKey(r)));
    if (selected.length === 0) return notify(t("needOneDueItem"), "warning");
    try {
      await postAccountingDue(selected.map(accountingDuePostItem));
      notify(t("postedToTransaction"));
      notifyTransactionDataChanged("bank-process-list-react");
      setAccountingOpen(false);
      setAccountingSelected(new Set());
      loadAccountingInbox(); fetchRows();
    } catch (err) { notify(apiMsg({ message: err?.message }, "transactionPostFailed"), "danger"); }
  };

  const dismissAccountingRows = async () => {
    if (guardWrite()) return;
    const selected = accountingRows.filter((r) => accountingDeleteSelected.has(accountingDueRowKey(r)));
    if (selected.length === 0) return notify(t("tickDeleteRows"), "warning");
    try {
      await skipAccountingDue(selected.map(accountingDuePostItem));
      notify(t("removedFromDue"));
      await loadAccountingInbox();
      await fetchRows();
      if (resendModalOpen) void refreshResendConfirmLock();
      notifyTransactionDataChanged("bank-process-list-react");
    } catch (err) { notify(apiMsg({ message: err?.message }, "deleteDueFailed"), "danger"); }
  };

  const saveRemarkModal = async () => {
    if (guardWrite()) return;
    if (!remarkRow) return;
    try {
      await updateBankProcessRemark({ id: remarkRow.id, tenantId: companyId, remark: remarkDraft });
      setRows((prev) => prev.map((r) => (Number(r.id) === Number(remarkRow.id) ? { ...r, remark: remarkDraft } : r)));
      notifyTransactionDataChanged("bank-process-list-react");
      notify(t("remarkUpdated"));
      setRemarkModalOpen(false); setRemarkRow(null);
    } catch (err) { notify(apiMsg({ message: err?.message }, "remarkUpdateFailed"), "danger"); }
  };

  const resendAccountingDue = async () => {
    if (guardWrite()) return;
    if (!resendTarget) return;
    setResendInlineError("");
    const dayStart = String(resendDayStart || "").trim();
    const dayEnd = String(resendDayEnd || "").trim();
    const fqEarly = bankProcessFrequencyNormalized(resendFrequency);
    const resendOmitsDayEnd = fqEarly === "once" || fqEarly === "week" || fqEarly === "day" || fqEarly === "monthly";
    if (!resendOmitsDayEnd && dayStart && dayEnd && dayEnd < dayStart) {
      const msg = t("dayEndEarlierThanStart");
      setResendInlineError(msg);
      notify(msg, "danger");
      return;
    }
    const fq = bankProcessFrequencyNormalized(resendFrequency);
    const omitDayEnd = fq === "once" || fq === "week" || fq === "day" || fq === "monthly";
    const dayEndTrim = omitDayEnd ? "" : String(resendDayEnd || "").trim();
    try {
      const request = buildResendBankProcessRequest({
        tenantId: companyId,
        bankProcessId: resendTarget.id,
        dayStart: normalizeBankResendDayStartYmd(resendDayStart) || null,
        dayEnd: omitDayEnd ? null : (normalizeBankResendDayStartYmd(dayEndTrim) || null),
        frequency: fq,
      });
      await resendBankProcess(request);
      notify(t("resendSuccessful"));
      notifyTransactionDataChanged("bank-process-list-react");
      void loadAccountingInbox({ silent: true });
      void fetchRows();
      setResendModalOpen(false); setResendTarget(null);
    } catch (err) {
      const msg = apiMsg({ message: err?.message }, "resendFailed");
      if (isBankResendDayStartBackendErrorMessage(err?.message || "") || isBankResendDayStartBackendErrorMessage(msg)) {
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
    setDeleteSubmitting(true);
    try {
      let deleted = 0;
      let lastErrorMessage = null;
      for (const id of selectedIds) {
        try {
          await deleteBankProcess({ id, tenantId: companyId });
          deleted += 1;
        } catch (err) {
          lastErrorMessage = err?.message;
        }
      }
      if (deleted === 0) {
        notify(apiMsg({ message: lastErrorMessage }, "deleteFailed"), "danger");
        return;
      }
      notify(deleted === 1 ? t("processDeletedOne") : t("processDeletedMany", { count: deleted }), "success");
      notifyTransactionDataChanged("bank-process-list-react");
      setDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      fetchRows();
    } catch { notify(t("deleteFailed"), "danger"); }
    finally { setDeleteSubmitting(false); }
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
    sessionCompanyId: authMe?.company_id,
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

  // Pills = company currencies only (not row Country extras — deleted codes must not reappear).
  const baseCurrencyPills = useMemo(
    () => (Array.isArray(currencyListOrdered) ? currencyListOrdered : []),
    [currencyListOrdered],
  );

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
      // Cross-page sync: keep the user-global order in step so every page follows this drag.
      persistUserCurrencyDisplayOrder(next);
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
    // currentPage is deliberately excluded: remeasuring off the DOM rows of
    // whichever page is currently on screen means the last (partial) page's
    // smaller row sample can compute a different pageSize than a full page
    // did, which shrinks totalPages and bounces the user back off the last
    // page. Only remeasure on things that actually change the dataset/layout.
    remeasureDeps: [
      visibleRows.length,
      tableLoading,
      lang,
      cssReady,
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
    toolbarDateRangeText,
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
