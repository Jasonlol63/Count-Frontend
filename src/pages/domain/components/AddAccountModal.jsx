import { useCallback, useEffect, useMemo, useState } from "react";
import AccountModal from "../../../components/AccountModal.jsx";
import { showDomainAlert } from "./DomainNotification.jsx";
import { getAccountText } from "../../../translateFile/pages/accountTranslate.js";
import { DEFAULT_FORM, toUpper, normalizeAlertAmount, getAccountModalOrderedRoles } from "../../account/accountLogic.js";
import {
  buildAccountCreateRequest,
  createAccountUser,
  createTenantCurrency,
  deleteTenantCurrency,
  fetchAvailableCurrencies,
} from "../../account/accountListApi.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/**
 * Add Account from Domain → Company Settings (Share %).
 * Always creates a single-tenant account under the C168 ledger tenant (Spring `/api/account/*`
 * + `/api/currency/*` — see Count/docs/frontend-springboot-migration.md §14.2). No multi-company
 * picker: Share % accounts only ever belong to `tenantId`.
 */
export default function AddAccountModal({ tenantId, tenantCode, preferredRole, onClose, onSuccess, lang = "en" }) {
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);
  const numericTenantId = tenantId ? Number(tenantId) : 0;

  const [form, setForm] = useState({ ...DEFAULT_FORM, payment_alert: "0" });
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState(numericTenantId ? [numericTenantId] : []);
  const [currencyInput, setCurrencyInput] = useState("");

  // No roles endpoint on the Spring side (Account List page has none either) — full role list fallback.
  const orderedRoles = useMemo(() => getAccountModalOrderedRoles([]), []);

  // Share % is single-tenant (C168) — the picker shows just that one pill, no multi-select.
  const companiesForModal = useMemo(() => {
    if (!numericTenantId || !tenantCode) return [];
    return [{ id: numericTenantId, company_id: tenantCode }];
  }, [numericTenantId, tenantCode]);

  useEffect(() => {
    if (preferredRole) {
      const wanted = preferredRole.toUpperCase() === "SUPPLIER" ? "UPLINE" : preferredRole.toUpperCase();
      setForm((f) => ({ ...f, role: wanted }));
    }
  }, [preferredRole]);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrencies() {
      if (!numericTenantId) {
        setCurrencies([]);
        return;
      }
      try {
        const rows = await fetchAvailableCurrencies(numericTenantId, null);
        if (!cancelled) {
          setCurrencies(rows.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
        }
      } catch {
        if (!cancelled) showDomainAlert(t("errorLoadingAccount"), "danger");
      }
    }
    void loadCurrencies();
    return () => {
      cancelled = true;
    };
  }, [numericTenantId, t]);

  const createCurrency = async () => {
    const code = toUpper(currencyInput).trim();
    if (!code || !numericTenantId) return;
    const existing = currencies.find((c) => toUpper(c.code).trim() === code);
    if (existing) {
      const existingId = Number(existing.id);
      setSelectedCurrencyIds((prev) => (prev.map(Number).includes(existingId) ? prev : [...prev, existingId]));
      setCurrencyInput("");
      return;
    }
    try {
      const created = await createTenantCurrency({ code, tenantId: numericTenantId });
      const newId = Number(created?.id);
      if (Number.isFinite(newId) && newId > 0) {
        setCurrencies((prev) => [...prev, { id: newId, code: created.code, is_linked: false }]);
        setSelectedCurrencyIds((prev) => (prev.map(Number).includes(newId) ? prev : [...prev, newId]));
      }
      setCurrencyInput("");
    } catch (err) {
      showDomainAlert(err?.message || t("createFailed"), "danger");
    }
  };

  const removeModalCurrency = async (currencyId) => {
    const id = Number(currencyId);
    if (!numericTenantId) return;
    try {
      const result = await deleteTenantCurrency({ id, tenantId: numericTenantId });
      if (!result.success) {
        showDomainAlert(result.message || t("failedDeleteCurrency"), "danger");
        return;
      }
      setCurrencies((prev) => prev.filter((c) => Number(c.id) !== id));
      setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
    } catch {
      showDomainAlert(t("failedDeleteCurrency"), "danger");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      showDomainAlert(t("paymentAlertRequiredFields"), "danger");
      return;
    }
    if (!numericTenantId) {
      showDomainAlert(t("pleaseSelectCompanyFirst"), "danger");
      return;
    }

    try {
      const currencyIds = selectedCurrencyIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
      const request = buildAccountCreateRequest(form, numericTenantId, currencyIds, [numericTenantId]);
      const created = await createAccountUser(request);
      showDomainAlert(t("accountSavedSuccessfully"));
      onSuccess?.(created?.id ?? null);
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
        currencies={currencies}
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
