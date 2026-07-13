import { useCallback, useEffect, useMemo, useState } from "react";
import AccountModal from "../../../components/AccountModal.jsx";
import {
  createCurrency as createTenantCurrency,
  deleteCurrency as deleteTenantCurrency,
  fetchAvailableCurrencies,
} from "../../../utils/api/currencyApi.js";
import {
  buildAccountCreateRequest,
  createAccountUser,
  resolveAccountListTenantId,
} from "../../account/accountListApi.js";
import {
  DEFAULT_FORM,
  getAccountModalOrderedRoles,
  normalizeAlertAmount,
  toUpper,
} from "../../account/accountLogic.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { getAccountText } from "../../../translateFile/pages/accountTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/**
 * Add Account from Domain → Company Settings (Share %).
 * Uses the shared AccountModal so layout matches Account List / Bank Process.
 */
export default function AddAccountModal({ companyId, companyCode, preferredRole, onClose, onSuccess, lang = "en" }) {
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);
  const numericCompanyId = resolveAccountListTenantId(companyId);

  const [form, setForm] = useState({ ...DEFAULT_FORM, payment_alert: "0" });
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  const [hiddenCurrencyIds, setHiddenCurrencyIds] = useState([]);

  const orderedRoles = useMemo(() => getAccountModalOrderedRoles(), []);

  const accountModalCurrencies = useMemo(() => {
    const hidden = new Set(hiddenCurrencyIds.map(Number));
    return currencies.filter((c) => !hidden.has(Number(c.id)));
  }, [currencies, hiddenCurrencyIds]);

  const companiesForModal = useMemo(() => {
    if (numericCompanyId && companyCode) {
      return [{ id: numericCompanyId, company_id: companyCode }];
    }
    return [];
  }, [numericCompanyId, companyCode]);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      try {
        const curRows = await fetchAvailableCurrencies({
          companyId: numericCompanyId || null,
          tenantId: numericCompanyId || null,
        }).catch(() => []);

        if (cancelled) return;

        if (preferredRole) {
          const wanted =
            preferredRole.toUpperCase() === "SUPPLIER" ? "UPLINE" : preferredRole.toUpperCase();
          setForm((f) => ({ ...f, role: wanted }));
        }

        if (Array.isArray(curRows)) {
          setCurrencies(curRows.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
        }

        setSelectedCompanyIds(numericCompanyId ? [numericCompanyId] : []);
      } catch {
        if (!cancelled) showDomainAlert(t("errorLoadingAccount"), "danger");
      }
    }

    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [numericCompanyId, preferredRole, t]);

  const createCurrency = async () => {
    const code = toUpper(currencyInput).trim();
    if (!code) return;
    const existing = currencies.find((c) => toUpper(c.code).trim() === code);
    if (existing) {
      const existingId = Number(existing.id);
      setHiddenCurrencyIds((prev) => prev.filter((id) => Number(id) !== existingId));
      setSelectedCurrencyIds((prev) => (prev.map(Number).includes(existingId) ? prev : [...prev, existingId]));
      setCurrencyInput("");
      return;
    }
    try {
      const created = await createTenantCurrency({
        code,
        tenantId: numericCompanyId || null,
        companyId: numericCompanyId || null,
      });
      const newId = Number(created.id);
      setCurrencies((prev) => [...prev, { id: newId, code: created.code, is_linked: false }]);
      setSelectedCurrencyIds((prev) => (prev.map(Number).includes(newId) ? prev : [...prev, newId]));
      setCurrencyInput("");
    } catch (err) {
      showDomainAlert(err?.response?.message || err?.message || t("createFailed"), "danger");
    }
  };

  const removeModalCurrency = async (currencyId) => {
    const id = Number(currencyId);
    const hideFromModal = () => {
      setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
      setHiddenCurrencyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    };
    const dropCurrency = () => {
      hideFromModal();
      setCurrencies((prev) => prev.filter((c) => Number(c.id) !== id));
    };

    try {
      const result = await deleteTenantCurrency({
        id,
        tenantId: numericCompanyId || null,
        companyId: numericCompanyId || null,
      });
      if (result.success) {
        dropCurrency();
        return;
      }
      const msg = String(result.message || "");
      if (/being used|正在使用|Cannot delete/i.test(msg)) {
        showDomainAlert(msg || t("failedDeleteCurrency"), "danger");
        return;
      }
      showDomainAlert(msg || t("failedDeleteCurrency"), "danger");
    } catch {
      showDomainAlert(t("failedDeleteCurrency"), "danger");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!numericCompanyId) {
      showDomainAlert(t("saveFailed"), "danger");
      return;
    }
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      showDomainAlert(t("paymentAlertRequiredFields"), "danger");
      return;
    }
    const amount = normalizeAlertAmount(form.alert_amount);
    const submitForm = {
      ...form,
      alert_amount: amount,
    };

    try {
      const created = await createAccountUser(
        buildAccountCreateRequest(submitForm, numericCompanyId, selectedCurrencyIds)
      );
      const newId = created?.id ? parseInt(created.id, 10) : 0;
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
