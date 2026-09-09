import { useCallback, useMemo, useRef, useState } from "react";
import { accountModalOverlayZIndex } from "../../../components/ProcessModalPortal.jsx";
import {
  accountRowToEditForm,
  buildAccountUpdateRequest,
  createTenantCurrency,
  deleteTenantCurrency,
  fetchAccountsLinkedToCurrency,
  fetchAvailableCurrencies,
  resolveRowScopeTenantId,
  tenantIdsToPickerCompanyIds,
  updateAccountUser,
  updateAccountsLinkedToCurrency,
} from "../../account/accountListApi.js";
import { getAccountModalOrderedRoles, pickDefaultAddCurrencyIds, toUpper } from "../../account/accountLogic.js";
import {
  getAccountText,
  parseAccountsFromCurrencyDeleteMessage,
  translateAccountApiMessage,
} from "../../../translateFile/pages/accountTranslate.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import {
  canOpenSummaryAccountModal,
  resolveSummaryAccountLedgerContext,
  useSummaryAccountPickerCompanies,
} from "./summaryAccountLedgerContext.js";

/**
 * Summary Edit Account — same shared `AccountModal` used by Add, opened for the account
 * currently selected in Edit Formula's Account Option picker. Behaves exactly like editing the
 * account from the Account List page (same fields, same currency add/remove/unlink rules —
 * see `AccountListPage.jsx`'s `openEdit`/`saveForm`/`removeModalCurrency`), just reachable
 * without leaving Capture Summary. The current company/group is locked in the picker (can't be
 * unchecked here) for the same reason Account List locks it: doing so mid-edit would pull the
 * account out from under the view/tenant it's being edited in.
 */
export function useSummaryEditAccount({
  companyId,
  captureScope = null,
  processData = null,
  accounts = [],
  notify,
  onAccountUpdated,
}) {
  const lang = useLoginLang();
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);
  const apiMsg = useCallback(
    (json, fallbackKey, apiData = null) =>
      translateAccountApiMessage(lang, json?.message ?? json?.error, fallbackKey || "", {}, apiData),
    [lang],
  );

  const ledgerCtx = useMemo(
    () => resolveSummaryAccountLedgerContext(captureScope, processData, companyId),
    [captureScope, processData, companyId],
  );
  const ledgerCtxRef = useRef(ledgerCtx);
  ledgerCtxRef.current = ledgerCtx;

  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  const [open, setOpen] = useState(false);
  const [roles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [form, setForm] = useState(null);
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  /** × 删除货币会永久生效——用会话内隐藏，避免同一批数据里瞬间又刷新回来。 */
  const [hiddenCurrencyIds, setHiddenCurrencyIds] = useState([]);
  /** Per Account List's loadSelectionMeta: baseline linked ids at load, for diffing on delete. */
  const [initialEditCurrencyIds, setInitialEditCurrencyIds] = useState([]);

  const openingRef = useRef(false);
  const tenantIdRef = useRef(null);
  const accountIdRef = useRef(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const emitNotify = useCallback(
    (message, type = "success") => {
      const title = type === "success" ? t("notifSuccess") : t("notifError");
      notifyRef.current?.(title, message, type);
    },
    [t],
  );

  const { modalPickerCompanies } = useSummaryAccountPickerCompanies(ledgerCtx);
  const orderedRoles = useMemo(() => getAccountModalOrderedRoles(roles), [roles]);

  const accountModalCurrencies = useMemo(() => {
    const hidden = new Set(hiddenCurrencyIds.map(Number));
    return currencies.filter((c) => !hidden.has(Number(c.id)));
  }, [currencies, hiddenCurrencyIds]);

  /** Mirrors AccountListPage.loadSelectionMeta(id, true, {...}). */
  const loadSelectionMetaForEdit = useCallback(
    async (id, tenantId, { selectCode = null } = {}) => {
      if (!tenantId) return;
      try {
        const rows = await fetchAvailableCurrencies(tenantId, id || null);
        setCurrencies(rows);
        const wantCode = selectCode ? toUpper(String(selectCode)).trim() : "";
        const matched = wantCode ? rows.find((c) => toUpper(c.code).trim() === wantCode) : null;

        const ids = rows.filter((c) => c.is_linked).map((c) => Number(c.id));
        let baselineIds = ids;
        if (!ids.length && id) {
          const fallback = pickDefaultAddCurrencyIds(rows);
          if (fallback.length) {
            try {
              await updateAccountsLinkedToCurrency({
                tenantId,
                currencyId: fallback[0],
                linkedAccountIds: [id],
              });
              baselineIds = fallback;
            } catch {
              /* leave unselected — a highlighted pill must reflect a real saved link */
            }
          }
        }
        const base = matched ? [...new Set([...baselineIds, Number(matched.id)])] : baselineIds;
        setSelectedCurrencyIds(base);
        setInitialEditCurrencyIds(baselineIds);
      } catch (e) {
        emitNotify(apiMsg({ message: e?.message }, "loadLinksFailed"), "danger");
      }
    },
    [apiMsg, emitNotify],
  );

  const closeEditAccount = useCallback(() => {
    setOpen(false);
    setForm(null);
    setHiddenCurrencyIds([]);
    tenantIdRef.current = null;
    accountIdRef.current = null;
    openingRef.current = false;
  }, []);

  /** Mirrors AccountListPage.openEdit(id). */
  const showEditAccount = useCallback(
    async (accountId) => {
      const ctx = ledgerCtxRef.current;
      if (!canOpenSummaryAccountModal(ctx)) {
        emitNotify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      const id = Number(accountId);
      if (!Number.isFinite(id) || id <= 0) return;
      const row = (accountsRef.current || []).find((a) => Number(a.id) === id);
      if (!row) {
        emitNotify(t("errorLoadingAccount"), "danger");
        return;
      }
      if (openingRef.current) return;
      openingRef.current = true;
      try {
        const tenantId = resolveRowScopeTenantId(row, ctx.tenantId);
        tenantIdRef.current = tenantId;
        accountIdRef.current = id;
        setForm(accountRowToEditForm(row));
        setHiddenCurrencyIds([]);
        if (ctx.groupOnlyAccountMode) {
          // Only one row in the picker here (the current group) — same as resetToAdd in
          // useSummaryAddAccount, this context never spans multiple groups.
          setSelectedCompanyIds(ctx.selectedGroup ? [ctx.selectedGroup] : []);
        } else {
          setSelectedCompanyIds(tenantIdsToPickerCompanyIds(row.tenant_ids));
        }
        setCurrencyInput("");
        await loadSelectionMetaForEdit(id, tenantId);
        setOpen(true);
      } catch {
        emitNotify(t("errorLoadingAccount"), "danger");
      } finally {
        openingRef.current = false;
      }
    },
    [emitNotify, loadSelectionMetaForEdit, t],
  );

  const createCurrency = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      const code = toUpper(currencyInput).trim();
      if (!code) return;
      const tenantId = tenantIdRef.current;
      if (!tenantId) {
        emitNotify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      const existing = currencies.find((c) => toUpper(c.code).trim() === code);
      if (existing) {
        const existingId = Number(existing.id);
        setHiddenCurrencyIds((prev) => prev.filter((cid) => Number(cid) !== existingId));
        setSelectedCurrencyIds((prev) => (prev.map(Number).includes(existingId) ? prev : [...prev, existingId]));
        setCurrencyInput("");
        return;
      }
      try {
        const created = await createTenantCurrency({ code, tenantId });
        const newId = Number(created?.id);
        const idValid = Number.isFinite(newId) && newId > 0;
        if (!idValid) {
          // API returned id=0 (stale lastInsertId): reload list and select by code.
          await loadSelectionMetaForEdit(accountIdRef.current, tenantId, { selectCode: code });
        } else {
          setCurrencies((prev) => [...prev, { id: newId, code: created.code, is_linked: false, deletable: true }]);
          setSelectedCurrencyIds((prev) => (prev.map(Number).includes(newId) ? prev : [...prev, newId]));
        }
        setCurrencyInput("");
      } catch (err) {
        const msg = String(err?.message || "");
        if (/already exists/i.test(msg) || /duplicate/i.test(msg)) {
          await loadSelectionMetaForEdit(accountIdRef.current, tenantId, { selectCode: code });
          setCurrencyInput("");
          return;
        }
        emitNotify(apiMsg({ message: msg }, "createFailed"), "danger");
      }
    },
    [apiMsg, currencies, currencyInput, emitNotify, loadSelectionMetaForEdit, t],
  );

  /** GET-ish lookup: which accounts currently use a currency, for this tenant. */
  const fetchAccountsUsingCurrency = useCallback(async (currencyId, tenantId) => {
    if (!tenantId) return [];
    try {
      const { linkedAccountIds, linkedAccounts } = await fetchAccountsLinkedToCurrency(currencyId, tenantId);
      if (linkedAccounts.length > 0) return linkedAccounts;
      const linkedIds = new Set(linkedAccountIds);
      return (accountsRef.current || [])
        .filter((a) => linkedIds.has(Number(a.id)))
        .map((a) => ({ id: Number(a.id), name: String(a.name ?? ""), account_id: String(a.account_id ?? "") }));
    } catch {
      return [];
    }
  }, []);

  const dropCurrencyFromUi = useCallback((currencyId) => {
    const id = Number(currencyId);
    setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
    setHiddenCurrencyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCurrencies((prev) => prev.filter((c) => Number(c.id) !== id));
  }, []);

  const handleCurrencyDeleteBlocked = useCallback(
    async (currencyId, json, msg, tenantId) => {
      const editingAccountId = accountIdRef.current ? Number(accountIdRef.current) : 0;
      let accountsInUse = Array.isArray(json?.data?.accounts_in_use) ? json.data.accounts_in_use : [];
      if (accountsInUse.length === 0) {
        accountsInUse = await fetchAccountsUsingCurrency(currencyId, tenantId);
      }
      if (accountsInUse.length === 0) {
        accountsInUse = parseAccountsFromCurrencyDeleteMessage(msg);
      }
      if (editingAccountId > 0) {
        accountsInUse = accountsInUse.filter((a) => Number(a.id) !== editingAccountId);
      }
      const apiData =
        accountsInUse.length > 0 ? { ...(json?.data || {}), accounts_in_use: accountsInUse } : json?.data ?? null;
      emitNotify(apiMsg({ message: msg }, "failedDeleteCurrency", apiData), "danger");
    },
    [apiMsg, emitNotify, fetchAccountsUsingCurrency],
  );

  /** Mirrors AccountListPage.removeModalCurrency — permanently delete; unlink current account first. */
  const removeCurrency = useCallback(
    async (currencyId) => {
      const id = Number(currencyId);
      const tenantId = tenantIdRef.current;
      const currencyRow = currencies.find((c) => Number(c.id) === id);
      if (currencyRow?.deletable === false) {
        emitNotify(t("apiCurrencySyncedFromSubsidiary"), "danger");
        return;
      }
      const accountId = accountIdRef.current ? Number(accountIdRef.current) : 0;

      if (selectedCurrencyIds.map(Number).includes(id)) {
        emitNotify(t("deselectCurrencyBeforeDelete"), "danger");
        return;
      }

      const unlinkCurrentAccountFromCurrency = async () => {
        const wasSavedOnAccount = accountId > 0 && initialEditCurrencyIds.map(Number).includes(id);
        if (!accountId) return true;

        let needsUnlink = wasSavedOnAccount;
        if (!needsUnlink) {
          const using = await fetchAccountsUsingCurrency(id, tenantId);
          needsUnlink = using.some((a) => Number(a.id) === accountId);
        }
        if (!needsUnlink) {
          if (wasSavedOnAccount) {
            setInitialEditCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
          }
          return true;
        }

        try {
          await updateAccountsLinkedToCurrency({ tenantId, currencyId: id, unlinkedAccountIds: [accountId] });
          setInitialEditCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
          setCurrencies((prev) => prev.map((c) => (Number(c.id) === id ? { ...c, is_linked: false } : c)));
          return true;
        } catch (e) {
          emitNotify(apiMsg({ message: e?.message }, "saveFailed"), "danger");
          return false;
        }
      };

      const unlinked = await unlinkCurrentAccountFromCurrency();
      if (!unlinked) return;

      let otherAccountsInUse = await fetchAccountsUsingCurrency(id, tenantId);
      if (accountId > 0) {
        otherAccountsInUse = otherAccountsInUse.filter((a) => Number(a.id) !== accountId);
      }

      try {
        const { success, json, message } = await deleteTenantCurrency({ id, tenantId });
        if (success) {
          dropCurrencyFromUi(id);
          emitNotify(apiMsg({ message }, "currencyDeleted"), "success");
          return;
        }
        const apiData =
          otherAccountsInUse.length > 0
            ? { ...(json?.data || {}), accounts_in_use: otherAccountsInUse }
            : json?.data ?? null;
        await handleCurrencyDeleteBlocked(id, { ...json, data: apiData }, message, tenantId);
      } catch (e) {
        emitNotify(apiMsg({ message: e?.message }, "failedDeleteCurrency"), "danger");
      }
    },
    [
      apiMsg,
      currencies,
      dropCurrencyFromUi,
      emitNotify,
      fetchAccountsUsingCurrency,
      handleCurrencyDeleteBlocked,
      initialEditCurrencyIds,
      selectedCurrencyIds,
      t,
    ],
  );

  /** Mirrors AccountListPage.saveForm (isEditMode branch). */
  const submitEditAccount = useCallback(
    async (e) => {
      e.preventDefault();
      const ctx = ledgerCtxRef.current;
      if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
        emitNotify(t("paymentAlertRequiredFields"), "danger");
        return;
      }

      let tenantIds;
      let primaryTenantId;
      if (ctx.groupOnlyAccountMode) {
        // The picker here only ever offers the current group (locked) — no cross-group
        // reassignment is possible from this entry point, unlike Account List's picker.
        tenantIds = tenantIdRef.current ? [Number(tenantIdRef.current)] : [];
        primaryTenantId = tenantIdRef.current;
      } else {
        tenantIds = selectedCompanyIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
        primaryTenantId =
          tenantIdRef.current && tenantIds.includes(Number(tenantIdRef.current))
            ? Number(tenantIdRef.current)
            : tenantIds[0];
      }
      if (!primaryTenantId || !tenantIds.length) {
        emitNotify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      const currencyIds = selectedCurrencyIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);

      try {
        const request = buildAccountUpdateRequest(form, primaryTenantId, currencyIds, tenantIds);
        await updateAccountUser(request);
        const updatedId = form.id ?? null;
        closeEditAccount();
        emitNotify(t("accountSavedSuccessfully"), "success");
        if (typeof onAccountUpdated === "function") {
          await onAccountUpdated(updatedId);
        }
      } catch (err) {
        emitNotify(apiMsg({ message: err?.message }, "saveFailed"), "danger");
      }
    },
    [apiMsg, closeEditAccount, emitNotify, form, onAccountUpdated, selectedCompanyIds, selectedCurrencyIds, t],
  );

  return {
    open,
    closeEditAccount,
    showEditAccount,
    accountModalProps: {
      open,
      title: t("editAccount"),
      isEditMode: true,
      form,
      setForm,
      orderedRoles,
      currencies: accountModalCurrencies,
      companies: modalPickerCompanies,
      selectedCurrencyIds,
      setSelectedCurrencyIds,
      selectedCompanyIds,
      setSelectedCompanyIds,
      currencyInput,
      setCurrencyInput,
      onCreateCurrency: createCurrency,
      onRemoveCurrency: removeCurrency,
      onSubmit: submitEditAccount,
      onClose: closeEditAccount,
      groupPickerMode: ledgerCtx.groupOnlyAccountMode,
      lockedCompanyId: ledgerCtx.groupOnlyAccountMode ? ledgerCtx.selectedGroup : ledgerCtx.companyId,
      t,
      overlayZIndex: accountModalOverlayZIndex,
    },
  };
}
