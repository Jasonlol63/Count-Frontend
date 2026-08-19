import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { accountModalOverlayZIndex } from "../../../components/ProcessModalPortal.jsx";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import {
  applyTenantLedgerToParams,
  LEDGER_GROUP,
  resolvePageLedgerScope,
} from "../../../utils/company/tenantLedgerParams.js";
import {
  buildAccountCreateRequest,
  createAccountUser,
  createTenantCurrency,
  deleteTenantCurrency,
  fetchAvailableCurrencies,
} from "../../account/accountListApi.js";
import {
  DEFAULT_FORM,
  getAccountModalOrderedRoles,
  normalizeAlertAmount,
  pickDefaultAddCurrencyIds,
  toUpper,
} from "../../account/accountLogic.js";
import { getAccountText, translateAccountApiMessage } from "../../../translateFile/pages/accountTranslate.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";

function normalizeCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? row.group ?? null,
    company_id: row.company_id ?? row.companyId ?? row.code ?? "",
  };
}

function isVirtualGroupLinkCompanyRow(c) {
  const ls = c?.link_source_group ?? c?.linkSourceGroup;
  return ls != null && String(ls).trim() !== "";
}

import { isGroupLedgerCapture } from "../../../utils/company/c168CaptureChannel.js";

function resolveSummaryAddAccountContext(captureScope, processData, companyId) {
  const isGroupLedger = isGroupLedgerCapture(captureScope, processData);

  const groupId = String(captureScope?.groupId || processData?.captureSelectedGroup || "")
    .trim()
    .toUpperCase();

  if (isGroupLedger && groupId) {
    return {
      groupOnlyAccountMode: true,
      selectedGroup: groupId,
      companyId: null,
      pageLedgerScope: { ledger: LEDGER_GROUP, groupId, companyId: null },
    };
  }

  const cid = companyId != null && Number(companyId) > 0 ? Number(companyId) : null;
  return {
    groupOnlyAccountMode: false,
    selectedGroup: groupId || null,
    companyId: cid,
    pageLedgerScope: resolvePageLedgerScope({
      groupOnly: false,
      selectedGroup: groupId || null,
      companyId: cid,
    }),
  };
}

function canOpenAddAccount(ctx) {
  if (ctx.groupOnlyAccountMode && ctx.selectedGroup) return true;
  return ctx.companyId != null && Number(ctx.companyId) > 0;
}

/** Remove stale #addModal if present from an older page shell. */
function purgeLegacySummaryAddAccountModal() {
  const legacy = document.getElementById("addModal");
  if (legacy?.classList?.contains("account-modal")) {
    legacy.remove();
  } else if (legacy) {
    legacy.style.display = "none";
  }
}

/**
 * Summary Add Account — shared AccountModal; supports company and group capture scope.
 *
 * Company scope (the common case: Games/Bank company, incl. C168/bank-only) is fully
 * Spring (`accountListApi.js` — same `/api/account/*` + `/api/currency/*` the Account List
 * page uses). True AP/IG group ledger scope (`groupOnlyAccountMode`) has no resolvable
 * numeric tenant id here and stays on the legacy `api/accounts/*` PHP endpoints, matching
 * the same documented boundary as the rest of the group-ledger capture path (see
 * docs/datacapture-spring-api.md §4) — not part of this migration pass.
 */
export function useSummaryAddAccount({
  companyId,
  captureScope = null,
  processData = null,
  notify,
  onAccountCreated,
}) {
  const lang = useLoginLang();
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);
  const apiMsg = useCallback(
    (json, fallbackKey) =>
      translateAccountApiMessage(lang, json?.message ?? json?.error, fallbackKey || ""),
    [lang],
  );

  const ledgerCtx = useMemo(
    () => resolveSummaryAddAccountContext(captureScope, processData, companyId),
    [captureScope, processData, companyId],
  );
  const ledgerCtxRef = useRef(ledgerCtx);
  ledgerCtxRef.current = ledgerCtx;

  const [open, setOpen] = useState(false);
  const [roles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [form, setForm] = useState({ ...DEFAULT_FORM, payment_alert: "0" });
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");

  const openingRef = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const emitNotify = useCallback(
    (message, type = "success") => {
      const title = type === "success" ? t("notifSuccess") : t("notifError");
      notifyRef.current?.(title, message, type);
    },
    [t],
  );

  const groupPickerCompanies = useMemo(() => {
    if (!ledgerCtx.groupOnlyAccountMode || !ledgerCtx.selectedGroup) return [];
    const g = ledgerCtx.selectedGroup;
    return [{ id: g, company_id: g, group_id: g }];
  }, [ledgerCtx]);

  const companyButtons = useMemo(
    () =>
      companies.filter(
        (c) => c.company_id && String(c.company_id).trim() !== "" && !isVirtualGroupLinkCompanyRow(c),
      ),
    [companies],
  );

  const modalPickerCompanies = ledgerCtx.groupOnlyAccountMode ? groupPickerCompanies : companyButtons;
  // No roles endpoint (Account List page doesn't call one either — DB-未建 role 时的
  // fallback list in getAccountModalOrderedRoles([]) already covers the full role set).
  const orderedRoles = useMemo(() => getAccountModalOrderedRoles(roles), [roles]);

  useEffect(() => {
    if (ledgerCtx.groupOnlyAccountMode || !ledgerCtx.companyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchOwnerCompaniesAll();
        if (!cancelled && rows.length) {
          setCompanies(rows.map(normalizeCompanyRow));
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ledgerCtx.groupOnlyAccountMode, ledgerCtx.companyId]);

  /** New account has nothing linked yet — currency catalog only, no per-account lookup needed. */
  const loadSelectionMeta = useCallback(async () => {
    const ctx = ledgerCtxRef.current;

    if (ctx.groupOnlyAccountMode) {
      // True AP/IG group ledger — unmigrated, see docs/datacapture-spring-api.md §4.
      const currencyParams = new URLSearchParams({ action: "get_available_currencies" });
      applyTenantLedgerToParams(currencyParams, ctx.pageLedgerScope);
      try {
        const curRes = await fetch(
          buildApiUrl(`api/accounts/account_currency_api.php?${currencyParams.toString()}`),
          { credentials: "include" },
        );
        const curJ = await curRes.json();
        if (curJ.success && Array.isArray(curJ.data)) {
          setCurrencies(curJ.data.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
          setSelectedCurrencyIds(pickDefaultAddCurrencyIds(curJ.data));
        }
      } catch {
        /* optional */
      }
      return;
    }

    if (!ctx.companyId) {
      setCurrencies([]);
      setSelectedCurrencyIds([]);
      return;
    }
    try {
      const rows = await fetchAvailableCurrencies(ctx.companyId, null);
      setCurrencies(rows.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
      setSelectedCurrencyIds(pickDefaultAddCurrencyIds(rows));
    } catch {
      setCurrencies([]);
    }
  }, []);

  const resetToAdd = useCallback(() => {
    const ctx = ledgerCtxRef.current;
    setForm({ ...DEFAULT_FORM, payment_alert: "0" });
    setSelectedCurrencyIds([]);
    if (ctx.groupOnlyAccountMode && ctx.selectedGroup) {
      setSelectedCompanyIds([ctx.selectedGroup]);
    } else {
      setSelectedCompanyIds(ctx.companyId ? [Number(ctx.companyId)] : []);
    }
    setCurrencyInput("");
  }, []);

  const closeAddAccount = useCallback(() => {
    purgeLegacySummaryAddAccountModal();
    setOpen(false);
    resetToAdd();
    openingRef.current = false;
  }, [resetToAdd]);

  const showAddAccount = useCallback(async () => {
    const ctx = ledgerCtxRef.current;
    if (!canOpenAddAccount(ctx)) {
      emitNotify(t("pleaseSelectCompanyFirst"), "danger");
      return;
    }
    if (openingRef.current) return;
    openingRef.current = true;
    purgeLegacySummaryAddAccountModal();
    try {
      resetToAdd();
      await loadSelectionMeta();
      setOpen(true);
    } catch {
      emitNotify(t("errorLoadingAccount"), "danger");
    } finally {
      openingRef.current = false;
    }
  }, [emitNotify, loadSelectionMeta, resetToAdd, t]);

  useLayoutEffect(() => {
    purgeLegacySummaryAddAccountModal();
  }, []);

  const createCurrency = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      const code = toUpper(currencyInput).trim();
      if (!code) return;
      const ctx = ledgerCtxRef.current;

      if (ctx.groupOnlyAccountMode) {
        // True AP/IG group ledger — unmigrated, see docs/datacapture-spring-api.md §4.
        const payload = { code };
        if (ctx.pageLedgerScope?.groupId) payload.group_id = ctx.pageLedgerScope.groupId;
        payload.group_only = true;
        try {
          const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: "include",
          });
          const json = await res.json();
          if (!json.success || !json.data) {
            emitNotify(apiMsg(json, "createFailed"), "danger");
            return;
          }
          const newId = Number(json.data.id);
          if (Number.isFinite(newId) && newId > 0) {
            setCurrencies((prev) => [...prev, { id: newId, code: json.data.code, is_linked: false }]);
          }
          setCurrencyInput("");
        } catch {
          emitNotify(t("createFailed"), "danger");
        }
        return;
      }

      if (!ctx.companyId) {
        emitNotify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      try {
        const created = await createTenantCurrency({ code, tenantId: ctx.companyId });
        const newId = Number(created?.id);
        if (Number.isFinite(newId) && newId > 0) {
          setCurrencies((prev) => [...prev, { id: newId, code: created.code, is_linked: false }]);
        }
        setCurrencyInput("");
      } catch (err) {
        emitNotify(apiMsg({ message: err?.message }, "createFailed"), "danger");
      }
    },
    [apiMsg, currencyInput, emitNotify, t],
  );

  const removeCurrency = useCallback(
    async (cid) => {
      const ctx = ledgerCtxRef.current;

      if (ctx.groupOnlyAccountMode) {
        // True AP/IG group ledger — unmigrated, see docs/datacapture-spring-api.md §4.
        try {
          const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: cid }),
            credentials: "include",
          });
          const json = await res.json();
          if (!json.success) {
            emitNotify(apiMsg(json, "failedDeleteCurrency"), "danger");
            return;
          }
        } catch {
          emitNotify(t("failedDeleteCurrency"), "danger");
          return;
        }
        setCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
        setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
        return;
      }

      if (!ctx.companyId) return;
      try {
        const result = await deleteTenantCurrency({ id: cid, tenantId: ctx.companyId });
        if (!result.success) {
          emitNotify(apiMsg(result.json, "failedDeleteCurrency"), "danger");
          return;
        }
        setCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
        setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
      } catch {
        emitNotify(t("failedDeleteCurrency"), "danger");
      }
    },
    [apiMsg, emitNotify, t],
  );

  const submitAddAccount = useCallback(
    async (e) => {
      e.preventDefault();
      const ctx = ledgerCtxRef.current;
      if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
        emitNotify(t("paymentAlertRequiredFields"), "danger");
        return;
      }

      if (ctx.groupOnlyAccountMode) {
        // True AP/IG group ledger — unmigrated, see docs/datacapture-spring-api.md §4.
        const alertAmount = normalizeAlertAmount(form.alert_amount);
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => {
          if (k === "alert_amount") {
            fd.append(k, alertAmount);
            return;
          }
          const raw = v ?? "";
          const out = k === "account_id" || k === "name" || k === "remark" ? toUpper(raw) : raw;
          fd.append(k, out);
        });
        if (form.payment_alert === "0") {
          fd.set("alert_type", "");
          fd.set("alert_start_date", "");
          fd.set("alert_amount", "");
        }
        applyTenantLedgerToParams(fd, ctx.pageLedgerScope);
        if (selectedCurrencyIds.length) {
          fd.set("currency_ids", JSON.stringify(selectedCurrencyIds));
        }
        try {
          const res = await fetch(buildApiUrl("api/accounts/addaccountapi.php"), {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          const json = await res.json();
          if (!json.success) {
            emitNotify(apiMsg(json, "saveFailed"), "danger");
            return;
          }
          const newAccountId = json?.data?.id;
          if (newAccountId && selectedCurrencyIds.length) {
            await Promise.all(
              selectedCurrencyIds.map((cur) =>
                fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ account_id: newAccountId, currency_id: cur }),
                  credentials: "include",
                }),
              ),
            );
          }
          closeAddAccount();
          const accountCode = String(form.account_id || "").trim().toUpperCase();
          emitNotify(
            accountCode
              ? t("accountAddedToFormulaList", { accountId: accountCode })
              : t("accountSavedSuccessfully"),
            "success",
          );
          if (typeof onAccountCreated === "function") {
            await onAccountCreated(newAccountId);
          }
        } catch {
          emitNotify(t("saveFailed"), "danger");
        }
        return;
      }

      const tenantIds = selectedCompanyIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
      if (!ctx.companyId || !tenantIds.length) {
        emitNotify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      const currencyIds = selectedCurrencyIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);

      try {
        const request = buildAccountCreateRequest(form, ctx.companyId, currencyIds, tenantIds);
        const created = await createAccountUser(request);
        closeAddAccount();
        const accountCode = String(form.account_id || "").trim().toUpperCase();
        emitNotify(
          accountCode
            ? t("accountAddedToFormulaList", { accountId: accountCode })
            : t("accountSavedSuccessfully"),
          "success",
        );
        if (typeof onAccountCreated === "function") {
          await onAccountCreated(created?.id ?? null);
        }
      } catch (err) {
        emitNotify(apiMsg({ message: err?.message }, "saveFailed"), "danger");
      }
    },
    [apiMsg, closeAddAccount, emitNotify, form, onAccountCreated, selectedCompanyIds, selectedCurrencyIds, t],
  );

  return {
    open,
    closeAddAccount,
    showAddAccount,
    accountModalProps: {
      open,
      title: t("addAccount"),
      isEditMode: false,
      form,
      setForm,
      orderedRoles,
      currencies,
      companies: modalPickerCompanies,
      selectedCurrencyIds,
      setSelectedCurrencyIds,
      selectedCompanyIds,
      setSelectedCompanyIds,
      currencyInput,
      setCurrencyInput,
      onCreateCurrency: createCurrency,
      onRemoveCurrency: removeCurrency,
      onSubmit: submitAddAccount,
      onClose: closeAddAccount,
      groupPickerMode: ledgerCtx.groupOnlyAccountMode,
      t,
      overlayZIndex: accountModalOverlayZIndex,
    },
  };
}
