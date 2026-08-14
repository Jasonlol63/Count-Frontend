import { useLayoutEffect, useRef } from "react";
import { pickTransactionDefaultCurrency } from "../lib/transactionPaymentLogic.js";
import {
  transactionScopeCacheCompanyKey,
  transactionScopeCacheKey,
} from "../lib/transactionScope.js";

function sameCurrencySelection(a, b) {
  const left = Array.isArray(a) ? a.map((x) => String(x || "").toUpperCase()) : [];
  const right = Array.isArray(b) ? b.map((x) => String(x || "").toUpperCase()) : [];
  if (left.length !== right.length) return false;
  return left.every((code, idx) => code === right[idx]);
}

export function useTransactionInitialization({
  loading,
  forbidden,
  filterSnapshot,
  transactionScope,
  currencyScopeBundle,
  todayDmy,
  search,
  form,
}) {
  const currencyRestoredScopeKeyRef = useRef(null);
  const prevScopeCacheKeyRef = useRef(null);
  const searchRef = useRef(search);
  const formRef = useRef(form);
  searchRef.current = search;
  formRef.current = form;

  useLayoutEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;

    const activeSearch = searchRef.current;
    const activeForm = formRef.current;
    if (!activeSearch || !activeForm) return;

    const scopeCacheKey = transactionScopeCacheKey(transactionScope);
    const companyCacheKey =
      transactionScopeCacheCompanyKey(transactionScope) ?? filterSnapshot.companyId ?? null;

    if (prevScopeCacheKeyRef.current !== scopeCacheKey) {
      currencyRestoredScopeKeyRef.current = null;
      prevScopeCacheKeyRef.current = scopeCacheKey;
    }

    const cid = companyCacheKey;
    const scopeKey = transactionScope
      ? `${transactionScope.scopeCompanyId > 0 ? transactionScope.scopeCompanyId : `group:${transactionScope.selectedGroup || ""}`}:${transactionScope.viewGroup || ""}`
      : String(cid ?? "");

    activeSearch.setDateFrom((v) => v || todayDmy);
    activeSearch.setDateTo((v) => v || todayDmy);
    activeForm.setTxDate((v) => v || todayDmy);
    activeForm.setRateDate((v) => v || todayDmy);

    if (!scopeCacheKey || currencyScopeBundle.scopeKey !== scopeCacheKey) return;
    if (currencyScopeBundle.rows.length === 0) {
      if (transactionScope?.mode === "group") {
        activeSearch.setShowAllCurrencies(false);
        activeSearch.setSelectedCurrencies([]);
      }
      return;
    }

    const rows = currencyScopeBundle.rows;
    const codes = rows.map((x) => String(x.code || x.currency || "").toUpperCase().trim()).filter(Boolean);

    // Form defaults follow sort order (first position).
    const defaultCode = pickTransactionDefaultCurrency(codes);
    const pickDefault =
      (defaultCode ? rows.find((c) => String(c.code || "").toUpperCase() === defaultCode) : null) ||
      rows[0];

    const ensureCurrencySelection = () => {
      if (activeSearch.showAllCurrencies || rows.length === 0) return;
      // Empty selection is intentional — do not force a default currency.
      if (activeSearch.selectedCurrencies.length === 0) return;
      const valid = activeSearch.selectedCurrencies.filter((code) =>
        codes.includes(String(code || "").toUpperCase().trim()),
      );
      if (valid.length > 0) {
        if (!sameCurrencySelection(activeSearch.selectedCurrencies, valid)) {
          activeSearch.setSelectedCurrencies(valid);
        }
        return;
      }
      // Prior codes are no longer in scope — clear rather than forcing a pick.
      activeSearch.setSelectedCurrencies([]);
    };

    const resetSelection = currencyRestoredScopeKeyRef.current !== scopeKey;

    if (!resetSelection) {
      ensureCurrencySelection();
      if (pickDefault?.code) {
        activeForm.setTxCurrency((v) => v || pickDefault.code);
        activeForm.setRateCurrencyFrom((v) => v || pickDefault.code);
        if (codes.includes("MYR")) activeForm.setRateCurrencyTo((v) => v || "MYR");
      }
      return;
    }

    // Company/scope enter: always select THIS company's first ordered currency.
    const nextShowAll = false;
    const nextSel = defaultCode ? [defaultCode] : codes[0] ? [codes[0]] : [];

    // Block cross-page sync from re-applying the previous company currency.
    activeSearch.beginScopeCurrencyDefault?.();
    activeSearch.setShowAllCurrencies((prev) => (prev === nextShowAll ? prev : nextShowAll));
    activeSearch.setSelectedCurrencies((prev) => (sameCurrencySelection(prev, nextSel) ? prev : nextSel));
    currencyRestoredScopeKeyRef.current = scopeKey;

    if (pickDefault?.code) {
      activeForm.setTxCurrency((v) => (v === pickDefault.code ? v : pickDefault.code));
      activeForm.setRateCurrencyFrom((v) => (v === pickDefault.code ? v : pickDefault.code));
      if (codes.includes("MYR")) activeForm.setRateCurrencyTo((v) => (v === "MYR" ? v : "MYR"));
    }
  }, [
    loading,
    forbidden,
    filterSnapshot,
    transactionScope,
    transactionScope?.scopeCompanyId,
    transactionScope?.viewGroup,
    currencyScopeBundle,
    todayDmy,
  ]);
}
