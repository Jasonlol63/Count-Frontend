import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { accountModalOverlayZIndex } from "../../../components/ProcessModalPortal.jsx";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
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
import { resolveDataCaptureTenantId } from "../../datacapture/lib/dataCaptureTenant.js";

/**
 * `groupOnlyAccountMode` only changes the picker UI (single fixed "the group itself" row
 * instead of a multi-company picker) — the Group is a first-class tenant (`tenant.id`,
 * resolved via `groupEntityTenantId`), so both branches call the same Spring `/api/account/*`
 * + `/api/currency/*` endpoints against `ctx.tenantId`.
 */
function resolveSummaryAddAccountContext(captureScope, processData, companyId) {
  const isGroupLedger = isGroupLedgerCapture(captureScope, processData);

  const groupId = String(captureScope?.groupId || processData?.captureSelectedGroup || "")
    .trim()
    .toUpperCase();

  if (isGroupLedger && groupId) {
    const tenantId = resolveDataCaptureTenantId(captureScope);
    return {
      groupOnlyAccountMode: true,
      selectedGroup: groupId,
      companyId: null,
      tenantId,
    };
  }

  const cid = companyId != null && Number(companyId) > 0 ? Number(companyId) : null;
  return {
    groupOnlyAccountMode: false,
    selectedGroup: groupId || null,
    companyId: cid,
    tenantId: cid,
  };
}

function canOpenAddAccount(ctx) {
  if (ctx.groupOnlyAccountMode) return Boolean(ctx.tenantId);
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
 * Both scopes are fully Spring (`accountListApi.js` — same `/api/account/*` +
 * `/api/currency/*` the Account List page uses), keyed on `ctx.tenantId` (the Company's own
 * id, or the Group's own `tenant.id` resolved via `groupEntityTenantId`).
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
    if (!ledgerCtx.groupOnlyAccountMode || !ledgerCtx.tenantId) return [];
    // `id` is the group code (matches AccountModal's groupPickerMode picker_value, which reads
    // group_id/id — same shape AccountListPage.jsx uses for its own group picker rows), so the
    // preset selection in resetToAdd() actually matches this row instead of showing "none
    // selected". submitAddAccount() resolves the real numeric tenantId from ctx.tenantId
    // directly, not from this code.
    return [{ id: ledgerCtx.selectedGroup, company_id: ledgerCtx.selectedGroup, group_id: ledgerCtx.selectedGroup }];
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
    if (!ctx.tenantId) {
      setCurrencies([]);
      setSelectedCurrencyIds([]);
      return;
    }
    try {
      const rows = await fetchAvailableCurrencies(ctx.tenantId, null);
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
    if (ctx.groupOnlyAccountMode) {
      // groupPickerCompanies' single row is keyed by the group code, not the numeric tenant
      // id — preset with the same code so the picker shows it as already selected on open.
      setSelectedCompanyIds(ctx.selectedGroup ? [ctx.selectedGroup] : []);
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

      if (!ctx.tenantId) {
        emitNotify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      try {
        const created = await createTenantCurrency({ code, tenantId: ctx.tenantId });
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

      if (!ctx.tenantId) return;
      try {
        const result = await deleteTenantCurrency({ id: cid, tenantId: ctx.tenantId });
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

      // Group picker rows are keyed by group code (see groupPickerCompanies), not a numeric
      // tenant id — resolve the real tenantIds[] from ctx.tenantId directly in that mode
      // instead of Number()-coercing the selected code (which would always come out NaN).
      const tenantIds = ctx.groupOnlyAccountMode
        ? ctx.tenantId
          ? [Number(ctx.tenantId)]
          : []
        : selectedCompanyIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
      if (!ctx.tenantId || !tenantIds.length) {
        emitNotify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      const currencyIds = selectedCurrencyIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);

      try {
        const request = buildAccountCreateRequest(form, ctx.tenantId, currencyIds, tenantIds);
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
