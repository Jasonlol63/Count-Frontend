import { useCallback, useEffect, useMemo, useState } from "react";
import AccountModal from "../../../components/AccountModal.jsx";
import { showDomainAlert } from "./DomainNotification.jsx";
import { getAccountText } from "../../../translateFile/pages/accountTranslate.js";
import {
  DEFAULT_FORM,
  toUpper,
  normalizeAlertAmount,
  getAccountModalOrderedRoles,
  deriveAccountRolesFromRows,
  pickDefaultAddCurrencyIds,
} from "../../account/accountLogic.js";
import {
  buildAccountCreateRequest,
  createAccountUser,
  fetchAccountListByTenantId,
  resolveAccountListTenantId,
  tenantIdToPickerCompanyIds,
} from "../../account/accountListApi.js";
import {
  createCurrency as createTenantCurrency,
  deleteCurrency,
  fetchAvailableCurrencies,
} from "../../../utils/api/currencyApi.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/** Domain Share % card role → Spring account.role. */
function shareRoleToAccountRole(shareRole) {
  const key = String(shareRole || "").trim().toLowerCase();
  if (key === "profit") return "PROFIT";
  if (key === "sales" || key === "cs" || key === "it") return "STAFF";
  const upper = String(shareRole || "").trim().toUpperCase();
  return upper || "";
}

/**
 * Add Account from Domain → Company Settings (Share %).
 * Scope is always the C168 ledger tenant (`tenantId` = `tenant.id`).
 */
export default function AddAccountModal({
  tenantId,
  tenantCode,
  preferredRole,
  onClose,
  onSuccess,
  lang = "en",
}) {
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);
  const scopeTenantId = resolveAccountListTenantId(tenantId);

  const [form, setForm] = useState({ ...DEFAULT_FORM, payment_alert: "0" });
  const [roles, setRoles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  const [hiddenCurrencyIds, setHiddenCurrencyIds] = useState([]);

  const orderedRoles = useMemo(() => getAccountModalOrderedRoles(roles), [roles]);

  const accountModalCurrencies = useMemo(() => {
    const hidden = new Set(hiddenCurrencyIds.map(Number));
    return currencies.filter((c) => !hidden.has(Number(c.id)));
  }, [currencies, hiddenCurrencyIds]);

  /** AccountModal company pills: id = tenant.id, label = tenant code. */
  const companiesForModal = useMemo(() => {
    if (!scopeTenantId) return [];
    return [
      {
        id: scopeTenantId,
        company_id: tenantCode || String(scopeTenantId),
      },
    ];
  }, [scopeTenantId, tenantCode]);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      if (!scopeTenantId) {
        if (!cancelled) showDomainAlert(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }

      try {
        const [rows, currencyRows] = await Promise.all([
          fetchAccountListByTenantId(scopeTenantId),
          fetchAvailableCurrencies({ tenantId: scopeTenantId }),
        ]);

        if (cancelled) return;

        const accountRole = shareRoleToAccountRole(preferredRole);
        const derivedRoles = deriveAccountRolesFromRows(rows);
        setRoles(
          getAccountModalOrderedRoles(accountRole ? [...derivedRoles, accountRole] : derivedRoles),
        );

        setForm((f) => ({
          ...f,
          scope_tenant_id: scopeTenantId,
          ...(accountRole ? { role: accountRole } : {}),
        }));

        setCurrencies(currencyRows);
        setSelectedCurrencyIds(pickDefaultAddCurrencyIds(currencyRows));
        const pickerIds = tenantIdToPickerCompanyIds(scopeTenantId);
        setSelectedCompanyIds(pickerIds.length ? pickerIds : [String(scopeTenantId)]);
      } catch {
        if (!cancelled) showDomainAlert(t("errorLoadingAccount"), "danger");
      }
    }

    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [scopeTenantId, preferredRole, t]);

  const createCurrency = async () => {
    const code = toUpper(currencyInput).trim();
    if (!code) return;
    if (!scopeTenantId) {
      showDomainAlert(t("pleaseSelectCompanyFirst"), "danger");
      return;
    }

    const existing = currencies.find((c) => toUpper(c.code).trim() === code);
    if (existing) {
      const existingId = Number(existing.id);
      setHiddenCurrencyIds((prev) => prev.filter((id) => Number(id) !== existingId));
      setSelectedCurrencyIds((prev) => (prev.map(Number).includes(existingId) ? prev : [...prev, existingId]));
      setCurrencyInput("");
      return;
    }

    try {
      const created = await createTenantCurrency({ code, tenantId: scopeTenantId });
      const newId = Number(created.id);
      setCurrencies((prev) => [...prev, { id: newId, code: created.code, is_linked: false, deletable: true }]);
      setSelectedCurrencyIds((prev) => (prev.map(Number).includes(newId) ? prev : [...prev, newId]));
      setCurrencyInput("");
    } catch (err) {
      showDomainAlert(err?.message || t("createFailed"), "danger");
    }
  };

  const removeModalCurrency = async (currencyId) => {
    const id = Number(currencyId);
    const currencyRow = currencies.find((c) => Number(c.id) === id);
    if (currencyRow?.deletable === false) {
      showDomainAlert(t("apiCurrencySyncedFromSubsidiary"), "danger");
      return;
    }
    if (selectedCurrencyIds.map(Number).includes(id)) {
      showDomainAlert(t("deselectCurrencyBeforeDelete"), "danger");
      return;
    }

    const hideFromModal = () => {
      setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
      setHiddenCurrencyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    };
    const dropCurrency = () => {
      hideFromModal();
      setCurrencies((prev) => prev.filter((c) => Number(c.id) !== id));
    };

    if (!scopeTenantId) {
      showDomainAlert(t("pleaseSelectCompanyFirst"), "danger");
      return;
    }

    try {
      const result = await deleteCurrency({ id, tenantId: scopeTenantId });
      if (result.success) {
        dropCurrency();
        return;
      }
      showDomainAlert(String(result.message || t("failedDeleteCurrency")), "danger");
    } catch {
      showDomainAlert(t("failedDeleteCurrency"), "danger");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!scopeTenantId) {
      showDomainAlert(t("pleaseSelectCompanyFirst"), "danger");
      return;
    }
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      showDomainAlert(t("paymentAlertRequiredFields"), "danger");
      return;
    }

    const amount = normalizeAlertAmount(form.alert_amount);
    const formPayload = { ...form, alert_amount: amount, scope_tenant_id: scopeTenantId };
    const currencyIds = selectedCurrencyIds.map(Number).filter((cid) => Number.isFinite(cid) && cid > 0);

    try {
      const created = await createAccountUser(
        buildAccountCreateRequest(formPayload, scopeTenantId, currencyIds),
      );
      const newId = created?.id ? Number(created.id) : 0;
      showDomainAlert(t("accountSavedSuccessfully"));
      onSuccess?.(newId);
      onClose();
    } catch (err) {
      showDomainAlert(err?.message || t("saveFailed"), "danger");
    }
  };

  return (
    <DomainModalPortal>
      <AccountModal
        open
        overlayZIndex={2147483002}
        title={t("addAccount")}
        isEditMode={false}
        form={form}
        setForm={setForm}
        orderedRoles={orderedRoles}
        currencies={accountModalCurrencies}
        companies={companiesForModal}
        selectedCurrencyIds={selectedCurrencyIds}
        setSelectedCurrencyIds={setSelectedCurrencyIds}
        selectedCompanyIds={selectedCompanyIds}
        setSelectedCompanyIds={setSelectedCompanyIds}
        currencyInput={currencyInput}
        setCurrencyInput={setCurrencyInput}
        onCreateCurrency={createCurrency}
        onRemoveCurrency={removeModalCurrency}
        onSubmit={handleSubmit}
        onClose={onClose}
        t={t}
      />
    </DomainModalPortal>
  );
}
