import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOwnershipText } from "../../../translateFile/pages/ownershipTranslate.js";
import { prefetchOwnershipCompanies, peekOwnershipCompaniesCache } from "../ownershipRoutePrefetch.js";
import { getApiMessage, isApiSuccess } from "./ownershipHelpers.js";
import {
  getOwnershipCurrentMonthKey,
  isOwnershipHistoricalMonth,
} from "./ownershipMonthHelpers.js";

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
    async (monthKey = getOwnershipCurrentMonthKey()) => {
      const cached = peekOwnershipCompaniesCache(monthKey);
      if (!cached) setLoadingList(true);
      try {
        const json = await prefetchOwnershipCompanies(monthKey);
        if (isApiSuccess(json)) setAllCompanies(json.data || []);
        else showToast(getApiMessage(json, "Failed to load companies"), "error");
        setReadOnlyMode(false);
      } catch {
        if (!cached) showToast("Server error", "error");
      } finally {
        setLoadingList(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void fetchCompanies(selectedMonth);
  }, [fetchCompanies, selectedMonth]);

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
