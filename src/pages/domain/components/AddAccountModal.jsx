import { useCallback, useEffect, useMemo, useState } from "react";
import AccountModal from "../../../components/AccountModal.jsx";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { getAccountText } from "../../../translateFile/pages/accountTranslate.js";
import { DEFAULT_FORM, toUpper, normalizeAlertAmount, getAccountModalOrderedRoles } from "../../account/accountLogic.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/**
 * Add Account from Domain → Company Settings (Share %).
 * Uses the shared AccountModal so layout matches Account List / Bank Process.
 */
export default function AddAccountModal({ companyId, companyCode, preferredRole, onClose, onSuccess, lang = "en" }) {
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);
  const numericCompanyId = companyId ? Number(companyId) : 0;

  const [form, setForm] = useState({ ...DEFAULT_FORM, payment_alert: "0" });
  const [roles, setRoles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  const [hiddenCurrencyIds, setHiddenCurrencyIds] = useState([]);

  const orderedRoles = useMemo(() => getAccountModalOrderedRoles(roles), [roles]);

  const accountModalCurrencies = useMemo(() => {
    const hidden = new Set(hiddenCurrencyIds.map(Number));
    return currencies.filter((c) => !hidden.has(Number(c.id)));
  }, [currencies, hiddenCurrencyIds]);

  const companiesForModal = useMemo(() => {
    const rows = companies
      .map((c) => ({
        ...c,
        company_id: c.company_id ?? c.company_code ?? c.companyId ?? c.code ?? "",
      }))
      .filter((c) => String(c.company_id || "").trim() !== "");
    if (rows.length) return rows;
    if (numericCompanyId && companyCode) {
      return [{ id: numericCompanyId, company_id: companyCode }];
    }
    return [];
  }, [companies, numericCompanyId, companyCode]);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      try {
        const [rolesRes, curRes, compRes] = await Promise.all([
          fetch(buildApiUrl("api/editdata/editdata_api.php"), { cache: "no-cache", credentials: "include" }),
          fetch(
            buildApiUrl(
              `api/accounts/account_currency_api.php?action=get_available_currencies${
                numericCompanyId ? `&company_id=${numericCompanyId}` : ""
              }`
            ),
            { cache: "no-cache", credentials: "include" }
          ),
          fetch(buildApiUrl("api/accounts/account_company_api.php?action=get_available_companies"), {
            cache: "no-cache",
            credentials: "include",
          }),
        ]);

        if (cancelled) return;

        const rolesJson = await rolesRes.json();
        if (rolesJson.success && rolesJson.data) {
          const list = Array.isArray(rolesJson.data.roles) ? rolesJson.data.roles : [];
          setRoles(list);
          if (preferredRole) {
            const wanted =
              preferredRole.toUpperCase() === "SUPPLIER" ? "UPLINE" : preferredRole.toUpperCase();
            setForm((f) => ({ ...f, role: wanted }));
          }
        }

        const curJson = await curRes.json();
        if (curJson.success && Array.isArray(curJson.data)) {
          setCurrencies(curJson.data.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
        }

        const compJson = await compRes.json();
        if (compJson.success && Array.isArray(compJson.data)) {
          setCompanies(
            compJson.data.map((c) => ({
              id: c.id,
              company_id: c.company_id ?? c.company_code ?? c.companyId ?? c.code ?? "",
            }))
          );
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
      const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, company_id: numericCompanyId || undefined }),
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        const newId = Number(json.data.id);
        setCurrencies((prev) => [...prev, { id: newId, code: json.data.code, is_linked: false }]);
        setSelectedCurrencyIds((prev) => (prev.map(Number).includes(newId) ? prev : [...prev, newId]));
        setCurrencyInput("");
      } else {
        showDomainAlert(json.message || json.error || t("createFailed"), "danger");
      }
    } catch {
      showDomainAlert(t("createFailed"), "danger");
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
      const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        dropCurrency();
        return;
      }
      const msg = String(json.message || json.error || "");
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
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      showDomainAlert(t("paymentAlertRequiredFields"), "danger");
      return;
    }
    const amount = normalizeAlertAmount(form.alert_amount);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, k === "alert_amount" ? amount : v ?? ""));
    if (selectedCompanyIds.length) fd.set("company_ids", JSON.stringify(selectedCompanyIds));
    if (numericCompanyId) fd.set("company_id", String(numericCompanyId));
    if (selectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(selectedCurrencyIds));

    try {
      const res = await fetch(buildApiUrl("api/accounts/addaccountapi.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) {
        showDomainAlert(json.error || json.message || t("saveFailed"), "danger");
        return;
      }
      const newId = json.data?.id ? parseInt(json.data.id, 10) : 0;
      if (newId && selectedCurrencyIds.length) {
        await Promise.all(
          selectedCurrencyIds.map((cid) =>
            fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: newId, currency_id: cid }),
              credentials: "include",
            }).catch(() => null)
          )
        );
      }
      if (newId && numericCompanyId) {
        await fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: newId, company_id: numericCompanyId }),
          credentials: "include",
        }).catch(() => null);
      }
      showDomainAlert(t("accountSavedSuccessfully"));
      onSuccess?.(newId);
      onClose();
    } catch {
      showDomainAlert(t("saveFailed"), "danger");
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
