import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { accountModalOverlayZIndex } from "../../../components/ProcessModalPortal.jsx";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  createCurrency as createTenantCurrency,
  deleteCurrency as deleteTenantCurrency,
  fetchAvailableCurrencies,
  resolveCurrencyTenantIdFromScope,
} from "../../../utils/api/currencyApi.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import {
  applyTenantLedgerToParams,
  LEDGER_GROUP,
  resolvePageLedgerScope,
} from "../../../utils/company/tenantLedgerParams.js";
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

/** Summary Add Account — shared AccountModal; supports company and group capture scope. */
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
  const [roles, setRoles] = useState([]);
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

  const loadRoles = useCallback(async () => {
    const ctx = ledgerCtxRef.current;
    try {
      const url = new URL(buildApiUrl("api/editdata/editdata_api.php"));
      const gid = ctx.selectedGroup ? String(ctx.selectedGroup).trim().toUpperCase() : null;
      const numericCid = ctx.companyId != null ? Number(ctx.companyId) : null;
      const groupOnlyFetch = Boolean(gid && (!Number.isFinite(numericCid) || numericCid <= 0));
      if (gid) url.searchParams.set("group_id", gid);
      if (groupOnlyFetch) {
        url.searchParams.set("group_only", "1");
      } else if (Number.isFinite(numericCid) && numericCid > 0) {
        url.searchParams.set("company_id", String(numericCid));
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (json?.success && Array.isArray(json?.data?.roles)) {
        setRoles(json.data.roles);
      }
    } catch {
      /* optional */
    }
  }, []);

  const loadSelectionMeta = useCallback(async (accountId) => {
    const ctx = ledgerCtxRef.current;
    const anchorCompanyId =
      ctx.groupOnlyAccountMode && ctx.selectedGroup
        ? companyButtons.find(
            (c) =>
              String(c.company_id || c.group_id || "")
                .trim()
                .toUpperCase() === String(ctx.selectedGroup).trim().toUpperCase(),
          )?.id ?? null
        : null;

    const companyUrl = accountId
      ? `api/accounts/account_company_api.php?action=get_available_companies&account_id=${accountId}`
      : "api/accounts/account_company_api.php?action=get_available_companies";

    const [curRows, compRes] = await Promise.all([
      fetchAvailableCurrencies({
        ledgerScope: ctx.pageLedgerScope,
        companyId: ctx.companyId,
        anchorCompanyId,
        accountId,
      }),
      fetch(buildApiUrl(companyUrl), { credentials: "include" }),
    ]);
    const compJ = await compRes.json();

    setCurrencies(curRows.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
    setSelectedCurrencyIds(pickDefaultAddCurrencyIds(curRows));
    if (compJ.success && Array.isArray(compJ.data)) {
      const linked = compJ.data.filter((c) => c.is_linked).map((c) => Number(c.id));
      if (ctx.groupOnlyAccountMode) {
        const defaultGroupEntity =
          groupPickerCompanies.find(
            (c) => String(c.group_id || c.company_id || "") === String(ctx.selectedGroup || ""),
          ) ||
          groupPickerCompanies[0] ||
          null;
        setSelectedCompanyIds(defaultGroupEntity?.id ? [String(defaultGroupEntity.id)] : []);
      } else {
        const cid = ctx.companyId;
        setSelectedCompanyIds(linked.length ? linked : cid ? [Number(cid)] : []);
      }
    }
  }, [companyButtons, groupPickerCompanies]);

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
      await loadRoles();
      resetToAdd();
      await loadSelectionMeta(null);
      setOpen(true);
    } catch {
      emitNotify(t("errorLoadingAccount"), "danger");
    } finally {
      openingRef.current = false;
    }
  }, [emitNotify, loadRoles, loadSelectionMeta, resetToAdd, t]);

  useLayoutEffect(() => {
    purgeLegacySummaryAddAccountModal();
  }, []);

  const createCurrency = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      const code = toUpper(currencyInput).trim();
      if (!code) return;
      const ctx = ledgerCtxRef.current;
      const anchorCompanyId =
        ctx.groupOnlyAccountMode && ctx.selectedGroup
          ? companyButtons.find(
              (c) =>
                String(c.company_id || c.group_id || "")
                  .trim()
                  .toUpperCase() === String(ctx.selectedGroup).trim().toUpperCase(),
            )?.id ?? null
          : null;
      const tenantId = resolveCurrencyTenantIdFromScope({
        ledgerScope: ctx.pageLedgerScope,
        companyId: ctx.companyId,
        anchorCompanyId,
        selectedCompanyIds,
      });
      if (!tenantId) {
        emitNotify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      try {
        const created = await createTenantCurrency({
          code,
          ledgerScope: ctx.pageLedgerScope,
          companyId: ctx.companyId,
          anchorCompanyId,
          selectedCompanyIds,
        });
        setCurrencies((prev) => [...prev, { id: created.id, code: created.code, is_linked: false }]);
        setCurrencyInput("");
      } catch (err) {
        emitNotify(apiMsg(err?.response, "createFailed"), "danger");
      }
    },
    [apiMsg, companyButtons, currencyInput, emitNotify, selectedCompanyIds, t],
  );

  const removeCurrency = useCallback(
    async (cid) => {
      const ctx = ledgerCtxRef.current;
      try {
        const result = await deleteTenantCurrency({
          id: cid,
          ledgerScope: ctx.pageLedgerScope,
          companyId: ctx.companyId,
        });
        if (!result.success) {
          emitNotify(apiMsg({ message: result.message }, "failedDeleteCurrency"), "danger");
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
      const alertAmount = normalizeAlertAmount(form.alert_amount);
      if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
        emitNotify(t("paymentAlertRequiredFields"), "danger");
        return;
      }

      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === "alert_amount") fd.append(k, alertAmount);
        else fd.append(k, v ?? "");
      });
      if (form.payment_alert === "0") {
        fd.set("alert_type", "");
        fd.set("alert_start_date", "");
        fd.set("alert_amount", "");
      }
      if (!ctx.groupOnlyAccountMode && selectedCompanyIds.length) {
        fd.set("company_ids", JSON.stringify(selectedCompanyIds));
      }
      if (!ctx.groupOnlyAccountMode && ctx.companyId) {
        fd.set("company_id", String(ctx.companyId));
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

        if (newAccountId && !ctx.groupOnlyAccountMode && selectedCompanyIds.length) {
          await Promise.all(
            selectedCompanyIds.map((cid) =>
              fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_id: newAccountId, company_id: cid }),
                credentials: "include",
              }),
            ),
          );
        }
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
