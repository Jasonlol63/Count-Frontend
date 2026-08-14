import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOwnershipText } from "../../../translateFile/pages/ownershipTranslate.js";
import { prefetchOwnershipCompanies, peekOwnershipCompaniesCache, invalidateOwnershipCompaniesCache } from "../ownershipRoutePrefetch.js";
import { getApiMessage, isApiSuccess } from "./ownershipHelpers.js";
import {
  getOwnershipCurrentMonthKey,
  isOwnershipHistoricalMonth,
} from "./ownershipMonthHelpers.js";
import { clearOwnerCompaniesCache } from "../../../utils/company/sharedCompanyFilter.js";
import { useRealtimeDomain } from "../../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../../lib/realtime/realtimeEvents.js";

export function useOwnershipPageShell() {
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getOwnershipText(lang, key, params), [lang]);
  const [activeTab, setActiveTab] = useState("account-ownership");
  const [loadingList, setLoadingList] = useState(false);
  const [allCompanies, setAllCompanies] = useState([]);
  const [toast, setToast] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getOwnershipCurrentMonthKey);
  const [historyBanner, setHistoryBanner] = useState(null);
  const toastTimerRef = useRef(null);

  const isHistoricalView = useMemo(
    () => isOwnershipHistoricalMonth(selectedMonth),
    [selectedMonth],
  );

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page", "ownership-page");
    return () => {
      document.body.classList.remove("ownership-page");
    };
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  const fetchCompanies = useCallback(
    async (monthKey = getOwnershipCurrentMonthKey(), { force = false } = {}) => {
      if (force) {
        invalidateOwnershipCompaniesCache(monthKey);
        // Join/ungroup also invalidates site-wide Group/Company filter cache.
        clearOwnerCompaniesCache();
      }
      const cached = !force ? peekOwnershipCompaniesCache(monthKey) : null;
      // Cold start only — force/realtime refreshes must not wipe the list into a full-page spinner.
      if (!cached && !force) setLoadingList(true);
      try {
        const json = await prefetchOwnershipCompanies(monthKey, { force });
        if (isApiSuccess(json)) setAllCompanies(json.data || []);
        else showToast(getApiMessage(json, "Failed to load companies"), "error");
        setReadOnlyMode(false);
      } catch {
        if (!cached && !force) showToast("Server error", "error");
      } finally {
        setLoadingList(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void fetchCompanies(selectedMonth);
  }, [fetchCompanies, selectedMonth]);

  useRealtimeDomain(REALTIME_DOMAINS.OWNERSHIP, () => {
    void fetchCompanies(selectedMonth, { force: true });
  });

  return {
    lang,
    t,
    activeTab,
    setActiveTab,
    loadingList,
    allCompanies,
    setAllCompanies,
    fetchCompanies,
    toast,
    showToast,
    conflict,
    setConflict,
    readOnlyMode,
    selectedMonth,
    setSelectedMonth,
    isHistoricalView,
    historyBanner,
    setHistoryBanner,
  };
}
