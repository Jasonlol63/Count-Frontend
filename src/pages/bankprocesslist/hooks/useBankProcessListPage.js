import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { ensureCrossPageCompanySelection } from "../../../utils/company/companySessionSync.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
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
import {
  createCurrency as createTenantCurrency,
  deleteCurrency as deleteTenantCurrency,
  fetchAvailableCurrencies,
} from "../../../utils/api/currencyApi.js";
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
  isBankCategoryCompany,
  resolveBankOnlyCategoryHint,
  parseProfitSharingToRows,
  serializeProfitSharingRows,
  calcBankNetProfitDisplay,
  formatBankMoneyFixed2,
  formatProfitSharingStringFixed2,
  EMPTY_BANK_FORM,
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
  normalizeBankResendDayStartYmd,
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
} from "../../processlist/processRoutePrefetch.js";

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
  const [showInactive, setShowInactive] = useState(false);
  const [showOfficial, setShowOfficial] = useState(false);
  const [showEInvoice, setShowEInvoice] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const clearBankProcessFilters = useCallback(() => {
    setShowAll(false);
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
      try {
        const companyUrl = accountId
          ? `api/accounts/account_company_api.php?action=get_available_companies&account_id=${accountId}`
          : "api/accounts/account_company_api.php?action=get_available_companies";
        const [curRows, compRes] = await Promise.all([
          fetchAvailableCurrencies({
            companyId,
            tenantId: companyId,
            accountId,
          }),
          fetch(buildApiUrl(companyUrl), { credentials: "include" }),
        ]);
        const compJ = await compRes.json();
        setAccountModalCurrencies(
          curRows.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })),
        );
        if (isEdit) {
          const ids = curRows.filter((c) => c.is_linked).map((c) => Number(c.id));
          setAccountModalSelectedCurrencyIds(ids);
          setAccountModalInitialCurrencyIds(ids);
        } else {
          setAccountModalSelectedCurrencyIds(pickDefaultAddCurrencyIds(curRows));
          setAccountModalInitialCurrencyIds([]);
        }
        if (compJ.success && Array.isArray(compJ.data)) {
          const linked = compJ.data.filter((c) => c.is_linked).map((c) => Number(c.id));
          setAccountModalSelectedCompanyIds(linked.length ? linked : companyId ? [Number(companyId)] : []);
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

  const fetchAccountDetailJson = useCallback(async (accountId) => {
    const url = new URL(buildApiUrl("api/accounts/getaccount_api.php"));
    url.searchParams.set("id", String(accountId));
    if (companyId) url.searchParams.set("company_id", String(companyId));
    url.searchParams.set("_", String(Date.now()));
    const res = await fetch(url.toString(), {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    const text = await res.text();
    if (!text.trim()) {
      return { success: false, error: `Empty response (${res.status})` };
    }
    try {
      return JSON.parse(text);
    } catch {
      return { success: false, error: "Invalid JSON from server" };
    }
  }, [companyId]);

  const createAccountModalCurrency = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const code = toUpper(accountModalCurrencyInput).trim();
    if (!code) return;
    const targetCompany = accountModalSelectedCompanyIds[0] || companyId;
    if (!targetCompany) return notify(t("pleaseSelectCompanyFirst"), "danger");
    try {
      const created = await createTenantCurrency({
        code,
        tenantId: targetCompany,
        companyId: targetCompany,
      });
      setAccountModalCurrencies((prev) => [...prev, { id: created.id, code: created.code, is_linked: false }]);
      setAccountModalCurrencyInput("");
      notify(t("currencyCreated", { code }), "success");
    } catch (err) {
      notify(apiMsg(err?.response, "failedCreateCurrency"), "danger");
    }
  };

  const removeAccountModalCurrency = async (cid) => {
    try {
      const result = await deleteTenantCurrency({
        id: cid,
        tenantId: companyId,
        companyId,
      });
      if (!result.success) return notify(apiMsg({ message: result.message }, "failedDeleteCurrency"), "danger");
      const removed = accountModalCurrencies.find((c) => Number(c.id) === Number(cid));
      setAccountModalCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
      setAccountModalSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
      if (removed?.code && companyId) {
        const code = String(removed.code).trim();
        setCountriesList((prev) => prev.filter((c) => String(c).trim().toUpperCase() !== toUpper(code)));
        setSelectedCountryChips((prev) => {
          const next = prev.filter((c) => String(c).trim().toUpperCase() !== toUpper(code));
          void persistSelectedCountries(next);
          return next;
        });
        try {
          const fd = new FormData();
          fd.append("company_id", String(companyId));
          fd.append("country", code);
          await fetch(buildApiUrl("api/processes/processlist_api.php?action=remove_country"), {
            method: "POST",
            body: fd,
            credentials: "include",
          });
        } catch {
          /* country list already updated in UI */
        }
      }
    } catch {
      notify(t("failedDeleteCurrency"), "danger");
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

    const fd = new FormData();
    Object.entries(accountModalForm).forEach(([k, v]) => {
      if (k === "alert_amount") fd.append(k, alertAmount);
      else fd.append(k, v ?? "");
    });
    if (accountModalForm.payment_alert === "0") {
      fd.set("alert_type", "");
      fd.set("alert_start_date", "");
      fd.set("alert_amount", "");
    }
    if (accountModalSelectedCompanyIds.length) fd.set("company_ids", JSON.stringify(accountModalSelectedCompanyIds));
    if (!isEdit) {
      if (companyId) fd.set("company_id", String(companyId));
      if (accountModalSelectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(accountModalSelectedCurrencyIds));
    }

    try {
      const endpoint = isEdit ? "api/accounts/update_api.php" : "api/accounts/addaccountapi.php";
      const res = await fetch(buildApiUrl(endpoint), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notify(apiMsg(json, "saveFailed"), "danger");

      const savedAccountId = isEdit ? Number(accountModalForm.id) : Number(json?.data?.id);

      if (!isEdit && json?.data?.id && accountModalSelectedCompanyIds.length) {
        await Promise.all(
          accountModalSelectedCompanyIds.map((cid) =>
            fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, company_id: cid }),
              credentials: "include",
            })
          )
        );
      }
      if (!isEdit && json?.data?.id && accountModalSelectedCurrencyIds.length) {
        await Promise.all(
          accountModalSelectedCurrencyIds.map((cur) =>
            fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, currency_id: cur }),
              credentials: "include",
            })
          )
        );
      }

      if (isEdit && savedAccountId) {
        const before = new Set(accountModalInitialCurrencyIds.map(Number));
        const after = new Set(accountModalSelectedCurrencyIds.map(Number));
        const toAdd = [...after].filter((id) => !before.has(id));
        const toRemove = [...before].filter((id) => !after.has(id));
        for (const cid of toAdd) {
          const currencyRes = await fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: savedAccountId, currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) return notify(apiMsg(currencyJson, "saveFailed"), "danger");
        }
        for (const cid of toRemove) {
          const currencyRes = await fetch(buildApiUrl("api/accounts/account_currency_api.php?action=remove_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: savedAccountId, currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) return notify(apiMsg(currencyJson, "saveFailed"), "danger");
        }
        setAccountModalInitialCurrencyIds([...after]);
      }

      notify(isEdit ? tAccount("accountSavedSuccessfully") : t("accountAddedSuccessfully"), "success");
      await handleAccountModalSuccess?.(
        isEdit ? { id: accountModalForm.id, account_id: accountModalForm.account_id } : json.data
      );
    } catch {
      notify(t("saveFailed"), "danger");
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

  /* React state 为 date range 唯一来源；hidden input 受控同步，避免再次打开日历时丢失已选范围 */
  useEffect(() => {
    if (loading || !cssReady || !bankDatePickerInitRef.current) return;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.();
  }, [dateFrom, dateTo, loading, cssReady, lang]);

  useEffect(() => {
    if (loading || !companyId || groupFilterKind !== "follow") return;
    if (suppressCrossPageSyncRef.current) return;
    const row = companies.find((c) => Number(c.id) === Number(companyId));
    void ensureCrossPageCompanySelection(companyId, {
      companies,
      selectedGroup,
      companyRow: row,
      sessionCompanyId: authMe?.company_id,
    });
  }, [loading, companyId, companies, selectedGroup, groupFilterKind, authMe?.company_id]);

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
            sessionCompanyId: authMe?.company_id,
          });
          setLoading(false);
          return;
        }

        const cs = await fetchOwnerCompaniesAll();
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
          const bankOnlyHint = resolveBankOnlyCategoryHint(sessionUser, effectiveNum);
          const bankCategory =
            bankOnlyHint !== null
              ? bankOnlyHint
              : await isBankCategoryCompany(currentCompanyRow.company_id, buildApiUrl);
          if (!bankCategory) {
            const warm = await prefetchGamesProcessListPayload(effectiveNum);
            navigate(`/process-list?company_id=${effectiveNum}`, {
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
        const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
        url.searchParams.set("company_id", String(companyId));
        url.searchParams.set("roles", BANK_PICK_ACCOUNT_ROLES.join(","));
        const res = await fetch(url.toString(), { credentials: "include" });
        const json = await res.json();
        const list = filterBankPickAccounts(Array.isArray(json?.data?.accounts) ? json.data.accounts : []);
        setAccounts(list);
      } catch { setAccounts([]); }
    })();
  }, [companyId, loading]);

  const loadCurrencyMeta = useCallback(async (targetCompanyId) => {
    const cid = Number(targetCompanyId ?? companyId);
    if (!Number.isFinite(cid) || cid <= 0) return;
    try {
      const [curRes, ordJson] = await Promise.all([
        fetch(buildApiUrl(`api/transactions/get_company_currencies_api.php?company_id=${cid}`), {
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
    let cancelled = false;
    (async () => {
      try {
        const base = buildApiUrl("api/processes/processlist_api.php");
        const cid = encodeURIComponent(String(companyId));
        const [countriesRes, selectedCountriesRes, selectedBanksRes] = await Promise.all([
          fetch(`${base}?action=get_countries&company_id=${cid}`, { credentials: "include" }),
          fetch(`${base}?action=get_selected_countries&company_id=${cid}`, { credentials: "include" }),
          fetch(`${base}?action=get_selected_banks&company_id=${cid}`, { credentials: "include" }),
        ]);
        const [countriesJson, selectedCountriesJson, selectedBanksJson] = await Promise.all([
          countriesRes.json(),
          selectedCountriesRes.json(),
          selectedBanksRes.json(),
        ]);
        if (cancelled) return;
        if (countriesJson.success && Array.isArray(countriesJson.data)) {
          setCountriesList(countriesJson.data);
        }
        if (selectedCountriesJson.success && Array.isArray(selectedCountriesJson.data)) {
          const list = selectedCountriesJson.data
            .map((c) => String(c || "").trim().toUpperCase())
            .filter(Boolean);
          setSelectedCountryChips([...new Set(list)]);
        }
        if (
          selectedBanksJson.success
          && selectedBanksJson.data
          && typeof selectedBanksJson.data === "object"
          && !Array.isArray(selectedBanksJson.data)
        ) {
          const map = {};
          for (const [countryKey, banks] of Object.entries(selectedBanksJson.data)) {
            const country = String(countryKey || "").trim();
            if (!country) continue;
            map[country] = Array.isArray(banks)
              ? banks.map((b) => String(b || "").trim()).filter(Boolean)
              : [];
          }
          setSelectedBanksByCountry(map);
        }
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
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_banks_by_country");
      url.searchParams.set("company_id", String(companyId));
      url.searchParams.set("country", String(form.country));
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (cancelled) return;
      if (json.success && Array.isArray(json.data)) setBanksList(json.data);
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

  // Contract / Day start / Frequency 变化时自动填 Day end；Monthly 不自动填；用户手动改 Day end 不会被覆盖（不监听 day_end）
  useEffect(() => {
    if (!modalOpen) {
      contractSyncKeysRef.current = { day_start: "", contract: "", frequency: "" };
      return;
    }
    const frequencyNorm = bankProcessFrequencyNormalized(form.day_start_frequency);
    if (frequencyNorm === "once" || frequencyNorm === "week" || frequencyNorm === "day" || frequencyNorm === "monthly") return;

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
  }, [modalOpen, form.day_start, form.contract, form.day_start_frequency]);

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
      setResendLockChecking(false);
      return;
    }
    const quickLocked = isBankResendScheduleLockedToday(resendTarget, resendDayStart);
    const seq = ++resendLockCheckSeqRef.current;
    setResendLockChecking(true);
    setResendConfirmDisabled(true);
    try {
      const backendLocked = await checkBankResendLockFromBackend(id, resendDayStart);
      if (seq !== resendLockCheckSeqRef.current) return;
      setResendConfirmDisabled(backendLocked);
    } catch {
      if (seq !== resendLockCheckSeqRef.current) return;
      setResendConfirmDisabled(quickLocked);
    } finally {
      if (seq === resendLockCheckSeqRef.current) setResendLockChecking(false);
    }
  }, [resendModalOpen, resendTarget, resendDayStart]);

  useEffect(() => {
    if (!resendModalOpen) {
      setResendConfirmDisabled(false);
      setResendLockChecking(false);
      return;
    }
    void refreshResendConfirmLock();
  }, [resendModalOpen, resendDayStart, resendDayEnd, resendTarget?.id, refreshResendConfirmLock]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (search.trim()) url.searchParams.set("search", search.trim());
    else url.searchParams.delete("search");
    if (dateFrom) url.searchParams.set("date_from", dateFrom);
    else url.searchParams.delete("date_from");
    if (dateTo) url.searchParams.set("date_to", dateTo);
    else url.searchParams.delete("date_to");
    [["showAll", showAll], ["showInactive", showInactive], ["showOfficial", showOfficial], ["showEInvoice", showEInvoice], ["showBlock", showBlock]].forEach(([k, v]) => {
      if (v) url.searchParams.set(k, "1"); else url.searchParams.delete(k);
    });
    if (currencyFilterCode) url.searchParams.set("currency", currencyFilterCode);
    else url.searchParams.delete("currency");
    window.history.replaceState({}, document.title, url.toString());
  }, [companyId, search, dateFrom, dateTo, showAll, showInactive, showOfficial, showEInvoice, showBlock, currencyFilterCode]);

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
    [search, selectedGroup],
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
      listAbortRef.current?.abort();
      const ac = new AbortController();
      listAbortRef.current = ac;
      if (!silent && rowsRef.current.length === 0) setTableLoading(true);
      try {
        const slice = await prefetchBankProcessListPayload(cid, { search });
        if (ac.signal.aborted) return;
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
      } catch {
        if (ac.signal.aborted) return;
        if (!silent) notify(t("failedLoadBankProcesses"), "danger");
      } finally {
        if (!ac.signal.aborted && !silent) setTableLoading(false);
      }
    },
    [companyId, selectedGroup, search, notify, syncUrl, t],
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
    if (!companyId) return;
    if (!silent) setAccountingLoading(true);
    try {
      const url = new URL(buildApiUrl("api/processes/process_accounting_inbox_api.php"));
      url.searchParams.set("company_id", String(companyId));
      const res = await fetch(url.toString(), { credentials: "include", cache: "no-cache" });
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
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
    } catch {
      setAccountingRows([]);
      if (!silent) {
        setAccountingSelected(new Set());
        setAccountingDeleteSelected(new Set());
      }
    } finally {
      if (!silent) setAccountingLoading(false);
    }
  }, [companyId]);

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

  // Badge count uses accountingRows; fetch inbox whenever company is ready so the badge is not stuck at 0 until the modal is opened.
  useEffect(() => {
    if (!companyId || loading) return;
    void loadAccountingInbox({ silent: true });
  }, [companyId, loading, loadAccountingInbox]);

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
      if (resendModalOpen) void refreshResendConfirmLock();
    };
    window.addEventListener("tx-data-changed", onTxChanged);
    return () => window.removeEventListener("tx-data-changed", onTxChanged);
  }, [fetchRows, resendModalOpen, refreshResendConfirmLock]);

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
    async (c, { layoutSilent = false } = {}) => {
      const nextId = Number(c?.id);
      if (!nextId) return;

      suppressCrossPageSyncRef.current = true;
      try {
        const sessionCompanyId = authMe?.company_id != null ? Number(authMe.company_id) : null;
        const bankCategoryPromise = isBankCategoryCompany(c.company_id, buildApiUrl);
        void fetchRows({ companyId: nextId, silent: true, preservePage: true, preserveSelection: true });
        if (accountingOpen) void loadAccountingInbox({ silent: true });

        try {
          const bankCategory = await bankCategoryPromise;
          if (!bankCategory) {
            const warm = await prefetchGamesProcessListPayload(nextId);
            navigate(`/process-list?company_id=${nextId}`, {
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

        if (sessionCompanyId === nextId) return;

        companySessionAbortRef.current?.abort();
        const sessionAc = new AbortController();
        companySessionAbortRef.current = sessionAc;

        try {
          const res = await fetch(
            buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextId}`),
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
      notifyDashboardGroupFilterChanged(nextGroup, nextId);

      void onSwitchCompanyRef.current?.(c, { layoutSilent: true });
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
    const fd = new FormData();
    fd.append("company_id", String(companyId));
    for (const c of countries) fd.append("countries[]", c);
    try {
      await fetch(buildApiUrl("api/processes/processlist_api.php?action=save_selected_countries"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      void refreshAccountModalCurrenciesIfOpen();
    } catch {
      /* ignore */
    }
  };

  const persistSelectedBanksByCountry = async (map) => {
    if (!companyId) return;
    const fd = new FormData();
    fd.append("company_id", String(companyId));
    fd.append("selected", JSON.stringify(map || {}));
    try {
      await fetch(buildApiUrl("api/processes/processlist_api.php?action=save_selected_banks"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
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
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", name);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=add_country"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "addCountryFailed"), "danger");
      setCountriesList((prev) => [...new Set([...prev, name])].sort());
      if (json.data?.id && json.data?.code) {
        mergeAccountModalCurrency(json.data);
      } else {
        void refreshAccountModalCurrenciesIfOpen();
      }
      setNewCountryName("");
      notify(t("countryAdded"));
    } catch { notify(t("addCountryFailed"), "danger"); }
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
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", String(form.country)); fd.append("banks[]", name);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=save_country_banks"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "addBankFailed"), "danger");
      setBanksList((prev) => [...new Set([...prev, name])].sort());
      setNewBankName("");
      notify(t("bankAdded"));
    } catch { notify(t("addBankFailed"), "danger"); }
  };

  const removeAvailableCountry = async (countryName) => {
    const country = String(countryName || "").trim();
    if (!country || !companyId) return;
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", country);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=remove_country"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "removeCountryFailed"), "danger");
      setCountriesList((prev) => prev.filter((c) => c !== country));
      setSelectedCountryChips((prev) => {
        const next = prev.filter((c) => c !== country);
        void persistSelectedCountries(next);
        return next;
      });
      setForm((f) => (f.country === country ? { ...f, country: "", bank: "" } : f));
      if (json.data?.currency_deleted) {
        removeAccountModalCurrencyByCode(country);
      } else {
        void refreshAccountModalCurrenciesIfOpen();
      }
      if (json.data?.currency_blocked) {
        notify(t("currencyInUseKeepInAccountList", { code: toUpper(country) }), "warning");
      } else {
        notify(t("countryRemoved"));
      }
    } catch { notify(t("removeCountryFailed"), "danger"); }
  };

  const removeAvailableBank = async (bankName) => {
    const bank = String(bankName || "").trim();
    const country = String(form.country || "").trim();
    if (!bank || !country || !companyId) return;
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", country); fd.append("bank", bank);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=remove_bank"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "removeBankFailed"), "danger");
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
    const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
    url.searchParams.set("company_id", String(companyId));
    url.searchParams.set("roles", BANK_PICK_ACCOUNT_ROLES.join(","));
    const listRes = await fetch(url.toString(), { credentials: "include" });
    const listJson = await listRes.json();
    const list = filterBankPickAccounts(Array.isArray(listJson?.data?.accounts) ? listJson.data.accounts : []);
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

    const existingId = getAccountIdForPlusTarget(target);
    const existingPickable = existingId && isPickableAccountId(existingId);

    try {
      const editRes = await fetch(buildApiUrl("api/editdata/editdata_api.php"), { credentials: "include" });
      const editJson = await editRes.json();
      setRolesList(Array.isArray(editJson?.data?.roles) ? editJson.data.roles : []);

      if (existingPickable) {
        const accJson = await fetchAccountDetailJson(existingId);
        if (!accJson.success || !accJson.data) {
          notify(accJson.error || accJson.message || tAccount("failedToLoadAccount"), "danger");
          return;
        }
        const d = accJson.data;
        setAccountModalIsEditMode(true);
        setAccountModalForm({
          id: d.id,
          account_id: toUpper(d.account_id),
          name: toUpper(d.name),
          role: d.role || "",
          password: d.password || "",
          remark: toUpper(d.remark),
          payment_alert: String(d.payment_alert == 1 ? "1" : "0"),
          alert_type: d.alert_type || d.alert_day || "",
          alert_start_date: d.alert_start_date || d.alert_specific_date || "",
          alert_amount: d.alert_amount || "",
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
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_process");
      url.searchParams.set("id", String(rowId));
      url.searchParams.set("permission", "Bank");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) return notify(apiMsg(json, "failedLoadBankProcess"), "danger");
      const d = json.data;
      const nextForm = {
        id: String(d.id || ""),
        country: d.country || "", bank: d.bank || "", type: d.type || "", name: d.name || "",
        card_merchant_id: d.card_merchant_id ? String(d.card_merchant_id) : "",
        customer_id: d.customer_id ? String(d.customer_id) : "",
        profit_account_id: d.profit_account_id ? String(d.profit_account_id) : "",
        contract: d.contract || "",
        insurance: d.insurance ?? "",
        cost: d.cost != null && d.cost !== "" ? formatBankMoneyFixed2(d.cost) : "",
        price: d.price != null && d.price !== "" ? formatBankMoneyFixed2(d.price) : "",
        profit: d.profit != null && d.profit !== "" ? formatBankMoneyFixed2(d.profit) : "",
        profit_sharing: formatProfitSharingStringFixed2(d.profit_sharing || ""),
        day_start: d.day_start ? String(d.day_start).slice(0, 10) : "",
        day_end: d.day_end ? String(d.day_end).slice(0, 10) : "",
        day_end_monthly_cap_enabled:
          bankProcessFrequencyNormalized(d.day_start_frequency) === "1st_of_every_month" &&
          (d.day_end_monthly_cap_enabled === 1 ||
            d.day_end_monthly_cap_enabled === true ||
            String(d.day_end_monthly_cap_enabled) === "1"),
        day_start_frequency: bankProcessFrequencyNormalized(d.day_start_frequency),
        status: d.status || "active", remark: d.remark || "", sop: d.sop || "",
      };
      seedContractSyncKeys(nextForm);
      setEditMode(true);
      setForm(nextForm);
      setModalOpen(true);
    } catch { notify(t("failedLoadBankProcess"), "danger"); }
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
    let normalizedFreq;
    if (isOnceSubmit) normalizedFreq = "once";
    else if (rawFreq === "week") normalizedFreq = "week";
    else if (rawFreq === "day") normalizedFreq = "day";
    else if (rawFreq === "monthly") normalizedFreq = "monthly";
    else normalizedFreq = "1st_of_every_month";
    const moneyNormalized = {
      ...form,
      cost: formatBankMoneyFixed2(form.cost),
      price: formatBankMoneyFixed2(form.price),
      profit: calcBankNetProfitDisplay(form.cost, form.price, form.profit_sharing),
      profit_sharing: formatProfitSharingStringFixed2(form.profit_sharing),
    };
    const fd = new FormData();
    Object.entries(moneyNormalized).forEach(([k, v]) => {
      if (k === "id" && !editMode) return;
      if (k === "day_end_monthly_cap_enabled") return;
      if (k === "day_start_frequency") {
        fd.append(k, normalizedFreq);
        return;
      }
      if (isOnceSubmit && (k === "day_end" || k === "contract" || k === "insurance")) {
        fd.append(k, "");
        return;
      }
      if (isWeekSubmit && (k === "day_end" || k === "contract")) {
        fd.append(k, "");
        return;
      }
      if (isDaySubmit && (k === "day_end" || k === "contract")) {
        fd.append(k, "");
        return;
      }
      fd.append(k, v ?? "");
    });
    if (editMode) {
      fd.append("day_end_monthly_cap_enabled", dayEndMonthlyCapEnabled ? "1" : "0");
    }
    if (companyId) fd.append("company_id", String(companyId));
    fd.append("permission", "Bank");
    try {
      const endpoint = editMode ? "api/processes/processlist_api.php?action=update_process" : "api/processes/addprocess_api.php";
      const res = await fetch(buildApiUrl(endpoint), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "saveFailed"), "danger");
      notify(editMode ? t("bankProcessUpdated") : t("bankProcessAdded"));
      notifyTransactionDataChanged("bank-process-list-react");
      setModalOpen(false);
      void fetchRows();
      void loadAccountingInbox({ silent: true });
    } catch { notify(t("saveFailed"), "danger"); }
  };

  const postAccountingToTransaction = async () => {
    if (guardWrite()) return;
    const selected = accountingRows.filter((r) => accountingSelected.has(accountingDueRowKey(r)) && !r.already_posted_today);
    if (selected.length === 0) return notify(t("needOneDueItem"), "warning");
    try {
      const fd = new FormData();
      selected.forEach((r) => {
        fd.append("ids[]", r.id); fd.append("period_types[]", accountingDuePeriodType(r)); fd.append("billing_months[]", accountingDueBillingMonth(r));
      });
      fd.append("allow_future_monthly", "1");
      const res = await fetch(buildApiUrl("api/processes/process_post_to_transaction_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "transactionPostFailed"), "danger");
      notify(apiMsg(json, "postedToTransaction"));
      notifyTransactionDataChanged("bank-process-list-react");
      loadAccountingInbox(); fetchRows();
    } catch { notify(t("transactionPostFailed"), "danger"); }
  };

  const dismissAccountingRows = async () => {
    if (guardWrite()) return;
    const selected = accountingRows.filter((r) => accountingDeleteSelected.has(accountingDueRowKey(r)));
    if (selected.length === 0) return notify(t("tickDeleteRows"), "warning");
    try {
      const fd = new FormData();
      selected.forEach((r) => {
        fd.append("ids[]", r.id); fd.append("period_types[]", accountingDuePeriodType(r)); fd.append("billing_months[]", accountingDueBillingMonth(r));
      });
      const res = await fetch(buildApiUrl("api/processes/dismiss_accounting_due_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "deleteDueFailed"), "danger");
      notify(apiMsg(json, "removedFromDue"));
      await loadAccountingInbox();
      await fetchRows();
      if (resendModalOpen) void refreshResendConfirmLock();
      notifyTransactionDataChanged("bank-process-list-react");
    } catch { notify(t("deleteDueFailed"), "danger"); }
  };

  const saveRemarkModal = async () => {
    if (guardWrite()) return;
    if (!remarkRow) return;
    try {
      const fd = new FormData(); fd.append("id", String(remarkRow.id)); fd.append("remark", remarkDraft);
      const res = await fetch(buildApiUrl("api/processes/update_bank_remark_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "remarkUpdateFailed"), "danger");
      setRows((prev) => prev.map((r) => (Number(r.id) === Number(remarkRow.id) ? { ...r, remark: remarkDraft } : r)));
      notifyTransactionDataChanged("bank-process-list-react");
      notify(t("remarkUpdated"));
      setRemarkModalOpen(false); setRemarkRow(null);
    } catch { notify(t("remarkUpdateFailed"), "danger"); }
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
    const normalizedResendFrequency =
      fq === "once" ? "once"
        : (fq === "monthly" ? "monthly"
          : (fq === "week" ? "week"
            : (fq === "day" ? "day" : "1st_of_every_month")));
    try {
      const res = await fetch(buildApiUrl("api/bankprocess_maintenance/resend_accounting_due_api.php"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          bank_process_id: Number(resendTarget.id),
          day_start: resendDayStart || null,
          day_end: omitDayEnd ? null : (dayEndTrim || null),
          day_start_frequency: normalizedResendFrequency,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const rawMsg = json.message || json.error || "";
        const msg = apiMsg(json, "resendFailed");
        if (isBankResendDayStartBackendErrorMessage(rawMsg) || isBankResendDayStartBackendErrorMessage(msg)) {
          setResendInlineError(msg);
        }
        return notify(msg, "danger");
      }
      notify(apiMsg(json, "resendSuccessful"));
      notifyTransactionDataChanged("bank-process-list-react");
      void loadAccountingInbox({ silent: true });
      void fetchRows();
      setResendModalOpen(false); setResendTarget(null);
    } catch { notify(t("resendFailed"), "danger"); }
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
      const res = await fetch(buildApiUrl("api/processes/delete_processes_api.php"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ ids: Array.from(selectedIds), permission: "Bank" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "deleteFailed"), "danger");
      const n = json?.data?.deleted ?? selectedIds.size;
      notify(n === 1 ? t("processDeletedOne") : t("processDeletedMany", { count: n }), "success");
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

      if (canUseGroupOnlyMode(authMe)) {
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
            setCurrencyFilterCode("");
            setCurrencyListOrdered([]);
            setCurrencyPillDisplayOrder(null);
          }
        });
        persistDashboardFilterState(g, nextCompanyId, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(g, nextCompanyId, {
          companyCode: pick.company_id,
        });
        void onSwitchCompanyRef.current?.(pick, { layoutSilent: true });
        return;
      }

      if (!canUseGroupOnlyMode(authMe) && companyId != null) {
        persistDashboardFilterState(g, companyId, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(g, companyId);
      }
    },
    [
      applyBankProcessListCache,
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
    const filterState = { showAll, showInactive, showOfficial, showEInvoice, showBlock };
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
    remeasureDeps: [
      visibleRows.length,
      tableLoading,
      lang,
      cssReady,
      currentPage,
      currencyFilterCode,
      showAll,
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
