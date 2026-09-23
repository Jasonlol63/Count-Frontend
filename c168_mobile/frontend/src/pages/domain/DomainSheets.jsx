import { useCallback, useEffect, useMemo, useState } from "react";
import PasswordInput from "../../components/PasswordInput.jsx";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import { getAccountModalOrderedRoles } from "../../lib/accountLogic.js";
import { buildAccountCreateRequest, createAccountUser, createTenantCurrency, fetchAvailableCurrencies } from "../../lib/accountApi.js";
import { formatDisplayDate } from "../../lib/dashboardDateUtils.js";
import {
  createDomain,
  fetchDomainFeeSettings,
  fetchDomainList,
  fetchShareAccountsForTenant,
  mergeTenantIdsFromDomainResponse,
  saveDomainFeeSettings,
  syncAllTenantSettings,
  updateDomain,
  updateTenantSetting,
  validateTenantCodeGlobally,
} from "../../lib/domainApi.js";
import {
  DOMAIN_FEE_PERIOD_KEYS,
  SINGLE_CATEGORY_MODE,
  applyDefaultProfitAllocation,
  calculateCountdown,
  calculateExpirationDate,
  createEmptyGroup,
  defaultDomainFeeSettings,
  defaultFeeShareAllocations,
  ensureCompanyFeeShare,
  findChargeMissingStartDate,
  findMissingExpirationDate,
  formatDate,
  formatDomainFeeEdit2,
  isPermanentExpiration,
  normalizeDomainFeeSettingsFromApi,
  normalizeDomainStartDateYmd,
  computeShareTotals,
  formatShareRowAmount2,
  pruneEmptyShareRows,
  resolveDomainFeePriceForPeriod,
  tempGroupCode,
} from "../../lib/domainHelpers.js";
import { sanitizeEmailInput, validateEmail } from "../../lib/emailValidation.js";
import { getDomainText } from "../../translateFile/domainTranslate.js";
import "../transaction/add-transaction-sheet.css";

const PERIOD_LABEL_KEYS = {
  "7days": "sevenDays",
  "1month": "oneMonth",
  "3months": "threeMonths",
  "6months": "sixMonths",
  "1year": "oneYear",
};
const SHARE_ROLES = ["profit", "sales", "cs", "it"];
const PERMISSION_LIST = ["Games", "Bank", "Loan", "Rate", "Money"];

function normalizeDomainCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function periodPricesToEditState(periodPrices) {
  const next = {};
  DOMAIN_FEE_PERIOD_KEYS.forEach((key) => {
    const raw = periodPrices[key];
    next[key] = raw !== "" && raw != null ? formatDomainFeeEdit2(raw) : "";
  });
  return next;
}

function findGroupCompanyCodeOverlap(tempGroups, tempCompanies) {
  const groupSet = new Set(tempGroups.map((g) => tempGroupCode(g)).filter(Boolean));
  for (const c of tempCompanies) {
    const cid = normalizeDomainCode(c.company_id);
    if (cid && groupSet.has(cid)) return cid;
  }
  return null;
}

function DateTapRow({ label, value, onChange, disabled }) {
  return (
    <label className={`m-tx-date-row${disabled ? " m-tx-date-row--disabled" : ""}`}>
      <span className="m-tx-date-icon">
        <i className="far fa-calendar" aria-hidden="true" />
      </span>
      <span className="m-tx-date-main">
        <span className="m-tx-date-label">{label}</span>
        <span className="m-tx-date-value-row">
          <span className="m-tx-date-value">{value ? formatDisplayDate(value) : "—"}</span>
        </span>
      </span>
      <i className="fas fa-chevron-right m-tx-date-chevron" aria-hidden="true" />
      <input
        type="date"
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="m-tx-date-input"
        aria-label={label}
      />
    </label>
  );
}

function Sheet({ open, title, onClose, tall = false, elevate = false, children, footer = null }) {
  useOverlayLock(open, onClose);
  return (
    <div
      className={`m-sheet-overlay${elevate ? " m-sheet-overlay--high" : ""}${
        open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"
      }`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button type="button" className="m-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`m-sheet-panel${tall ? " m-sheet-panel--tall" : ""}${
          open ? " m-sheet-panel--open" : " m-sheet-panel--closed"
        }`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>
        <header className="m-sheet-header">
          <h2 className="m-sheet-title">{title}</h2>
          <button type="button" className="m-sheet-close tap-scale" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="m-sheet-body m-account-sheet-body">{children}</div>
        {footer ? <footer className="m-account-sheet-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="m-tx-form-field m-domain-form-field">
      <label className="m-tx-form-label">{label}</label>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`m-account-pill tap-scale${active ? " is-active" : ""}`}
    >
      {children}
    </button>
  );
}

export function DomainFeeSheet({ open, onClose, domain }) {
  const { t, notify, setDomainPeriodPrices } = domain;
  const [companyPeriodPrices, setCompanyPeriodPrices] = useState(() => defaultDomainFeeSettings().company);
  const [groupPeriodPrices, setGroupPeriodPrices] = useState(() => defaultDomainFeeSettings().group);
  const [feeTab, setFeeTab] = useState("company");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFeeTab("company");
    (async () => {
      try {
        const data = await fetchDomainFeeSettings();
        if (data) {
          const normalized = normalizeDomainFeeSettingsFromApi(data);
          setCompanyPeriodPrices(periodPricesToEditState(normalized.company));
          setGroupPeriodPrices(periodPricesToEditState(normalized.group));
        }
      } catch (e) {
        notify(e?.message || t("couldNotLoadSettings"), "error");
      }
    })();
  }, [open, notify, t]);

  const save = async () => {
    setSaving(true);
    try {
      const data = await saveDomainFeeSettings({ companyPeriodPrices, groupPeriodPrices });
      notify(t("saved"));
      if (data) setDomainPeriodPrices(normalizeDomainFeeSettingsFromApi(data));
      onClose();
    } catch (e) {
      notify(e?.message || t("saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const activePrices = feeTab === "group" ? groupPeriodPrices : companyPeriodPrices;
  const setActivePrices = feeTab === "group" ? setGroupPeriodPrices : setCompanyPeriodPrices;

  return (
    <Sheet
      open={open}
      title={t("price")}
      onClose={onClose}
      tall
      footer={
        <button type="button" className="m-account-primary-btn tap-scale" disabled={saving} onClick={save}>
          {saving ? t("loading") : t("save")}
        </button>
      }
    >
      <div className="m-domain-fee-sheet m-tx-form-section">
        <p className="m-tx-form-hint">{t("priceDescriptionDual")}</p>
        <div className="m-domain-fee-tabs" role="tablist" aria-label={t("price")}>
          <button
            type="button"
            role="tab"
            aria-selected={feeTab === "company"}
            className={`m-domain-fee-tab tap-scale${feeTab === "company" ? " is-active" : ""}`}
            onClick={() => setFeeTab("company")}
          >
            {t("companyPrice")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={feeTab === "group"}
            className={`m-domain-fee-tab tap-scale${feeTab === "group" ? " is-active" : ""}`}
            onClick={() => setFeeTab("group")}
          >
            {t("groupPrice")}
          </button>
        </div>
        <p className="m-tx-form-hint">{t("editPeriodHint")}</p>
        {DOMAIN_FEE_PERIOD_KEYS.map((period) => (
          <div key={period} className="m-tx-form-field m-domain-form-field">
            <label className="m-tx-form-label" htmlFor={`fee-${feeTab}-${period}`}>
              {t(PERIOD_LABEL_KEYS[period])}
            </label>
            <input
              id={`fee-${feeTab}-${period}`}
              className="m-tx-form-input"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder={t("pricePlaceholder")}
              value={activePrices[period] ?? ""}
              onChange={(e) => setActivePrices((prev) => ({ ...prev, [period]: e.target.value }))}
            />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function DomainExpirationSheet({ open, onClose, mode, rows, t }) {
  const title = mode === "group" ? t("groupExpirationStatus") : t("companyExpirationStatus");
  const codeKey = mode === "group" ? "group_code" : "company_id";
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="m-domain-exp-list">
        {(rows || []).length === 0 ? (
          <p className="m-domain-hint">{mode === "group" ? t("noGroupsFound") : t("noCompaniesFound")}</p>
        ) : (
          rows.map((row) => {
            const code = String(row?.[codeKey] || "").toUpperCase();
            const exp = row?.expiration_date;
            const countdown = exp ? calculateCountdown(exp) : null;
            const status = countdown?.status || "normal";
            const tone =
              !exp || status === "expired"
                ? "bad"
                : status === "exp-critical" || status === "exp-orange"
                  ? "warn"
                  : "ok";
            return (
              <div key={code} className="m-domain-exp-row">
                <strong>{code}</strong>
                <div className="m-domain-exp-status">
                  {exp ? (
                    <>
                      <div className={tone}>{isPermanentExpiration(exp) ? t("noExpiry") : countdown?.text || t("valid")}</div>
                      <div>
                        {t("expirationPrefix")}
                        {isPermanentExpiration(exp) ? t("noExpiry") : formatDate(exp)}
                      </div>
                    </>
                  ) : (
                    <div className="bad">{t("noExpirationDate")}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Sheet>
  );
}

export function DomainConfirmSheet({ open, onClose, message, onConfirm, t }) {
  return (
    <Sheet
      open={open}
      title={t("confirmDeleteTitle")}
      onClose={onClose}
      elevate
      footer={
        <div className="m-account-footer-actions">
          <button type="button" className="m-account-secondary-btn tap-scale" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="m-account-danger-btn tap-scale"
            onClick={() => {
              onConfirm?.();
              onClose();
            }}
          >
            {t("confirm")}
          </button>
        </div>
      }
    >
      <p className="m-domain-confirm-msg">{message}</p>
    </Sheet>
  );
}

/**
 * Add Account from Domain → Share % — always a single-tenant create on the C168 ledger
 * tenant (`tenantId`/`tenantCode`, fixed by the caller). Uses the same Spring account +
 * currency contract as the Account page (lib/accountApi.js), not the legacy PHP editdata/
 * account-company/create_currency/addaccountapi endpoints this used to call.
 */
function DomainAddAccountSheet({ open, onClose, tenantId, tenantCode, preferredRole, onSuccess, lang, notify }) {
  const t = useCallback((key, params) => getDomainText(lang, key, params), [lang]);
  const numericTenantId = tenantId ? Number(tenantId) : 0;
  const [form, setForm] = useState({
    account_id: "",
    name: "",
    role: preferredRole || "PROFIT",
    password: "",
    remark: "",
  });
  const roles = useMemo(() => getAccountModalOrderedRoles([]), []);
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingCurrency, setCreatingCurrency] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      account_id: "",
      name: "",
      role: preferredRole ? String(preferredRole).toUpperCase() : "PROFIT",
      password: "",
      remark: "",
    });
    setSelectedCurrencyIds([]);
    setCurrencyInput("");
    if (!numericTenantId) {
      setCurrencies([]);
      return;
    }
    (async () => {
      try {
        const rows = await fetchAvailableCurrencies(numericTenantId, null);
        setCurrencies(rows.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
      } catch {
        setCurrencies([]);
      }
    })();
  }, [open, preferredRole, numericTenantId]);

  const createCurrency = async () => {
    const code = currencyInput.trim().toUpperCase();
    if (!code || !numericTenantId) {
      notify(t("pleaseEnterCurrencyCode"), "error");
      return;
    }
    const existing = currencies.find((c) => String(c.code || "").trim().toUpperCase() === code);
    if (existing) {
      const existingId = Number(existing.id);
      setSelectedCurrencyIds((prev) => (prev.map(Number).includes(existingId) ? prev : [...prev, existingId]));
      setCurrencyInput("");
      notify(t("currencyExists", { code }), "error");
      return;
    }
    setCreatingCurrency(true);
    try {
      const created = await createTenantCurrency({ code, tenantId: numericTenantId });
      const newId = Number(created?.id);
      if (Number.isFinite(newId) && newId > 0) {
        setCurrencies((prev) => [...prev, { id: newId, code: created.code || code, is_linked: false }]);
        setSelectedCurrencyIds((prev) => (prev.map(Number).includes(newId) ? prev : [...prev, newId]));
      }
      setCurrencyInput("");
      notify(t("currencyCreatedSuccess", { code }));
    } catch (e) {
      notify(e?.message || t("createCurrencyFailed"), "error");
    } finally {
      setCreatingCurrency(false);
    }
  };

  const save = async () => {
    if (!form.account_id.trim() || !form.name.trim() || !form.role || !form.password) {
      notify(t("operationFailed"), "error");
      return;
    }
    if (!numericTenantId) {
      notify(t("pleaseSelectCompanyFirst"), "error");
      return;
    }
    setSaving(true);
    try {
      const currencyIds = selectedCurrencyIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
      const request = buildAccountCreateRequest(
        {
          account_id: form.account_id.trim().toUpperCase(),
          name: form.name.trim().toUpperCase(),
          role: form.role,
          password: form.password,
          remark: form.remark.trim().toUpperCase(),
          payment_alert: "0",
        },
        numericTenantId,
        currencyIds,
        [numericTenantId],
      );
      const created = await createAccountUser(request);
      notify(t("addAccountSuccess"));
      onSuccess?.(created?.id ?? null);
      onClose();
    } catch (e) {
      notify(e?.message || t("saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={t("addAccountTitle")}
      onClose={onClose}
      tall
      elevate
      footer={
        <button type="button" className="m-account-primary-btn tap-scale" disabled={saving} onClick={save}>
          {saving ? t("loading") : t("save")}
        </button>
      }
    >
      <div className="m-domain-section">
        <Field label={t("accountId")}>
          <input
            className="m-tx-form-input m-tx-form-input--muted"
            value={form.account_id}
            onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value.toUpperCase() }))}
          />
        </Field>
        <Field label={t("name")}>
          <input
            className="m-tx-form-input m-tx-form-input--muted"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
          />
        </Field>
        <Field label={t("role")}>
          <select
            className="m-tx-form-select m-tx-form-select--bold"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            {roles.map((role) => (
              <option key={role} value={String(role).toUpperCase()}>
                {String(role).toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("password")}>
          <PasswordInput
            className="m-tx-form-input m-tx-form-input--muted"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            showLabel={t("showPassword")}
            hideLabel={t("hidePassword")}
            autoComplete="new-password"
          />
        </Field>
        {tenantCode ? <p className="m-domain-hint">{tenantCode}</p> : null}
      </div>
      <div className="m-domain-section">
        <div className="m-domain-section-title">{t("currencies")}</div>
        {currencies.length === 0 ? (
          <p className="m-domain-hint">{t("noCurrenciesAvailable")}</p>
        ) : (
          <div className="m-domain-pill-row">
            {currencies.map((currency) => {
              const id = Number(currency.id);
              const active = selectedCurrencyIds.map(Number).includes(id);
              return (
                <Pill
                  key={id}
                  active={active}
                  onClick={() =>
                    setSelectedCurrencyIds((ids) =>
                      active ? ids.filter((x) => Number(x) !== id) : [...ids, id],
                    )
                  }
                >
                  {String(currency.code || "").toUpperCase()}
                </Pill>
              );
            })}
          </div>
        )}
        <div className="m-domain-add-row">
          <input
            className="m-tx-form-input m-tx-form-input--muted"
            value={currencyInput}
            placeholder={t("newCurrencyPlaceholder")}
            onChange={(e) => setCurrencyInput(e.target.value.toUpperCase())}
          />
          <button
            type="button"
            className="m-tx-form-btn m-tx-form-btn--outline m-domain-add-action tap-scale"
            disabled={creatingCurrency}
            onClick={() => void createCurrency()}
          >
            {t("createCurrency")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function DomainSettingsSheet({
  open,
  onClose,
  tenantType = "company",
  entity,
  domainPeriodPrices,
  excludeOwnerId,
  siblingGroupCodes = [],
  siblingCompanyCodes = [],
  domains,
  shareLedgerTenantId,
  shareLedgerTenantCode,
  lang,
  notify,
  onSave,
}) {
  const isGroup = tenantType === "group";
  const t = useCallback((key, params) => getDomainText(lang, key, params), [lang]);
  const originalEntityCode = isGroup
    ? String(entity?.group_code ?? entity?.company_id ?? "").trim().toUpperCase()
    : String(entity?.company_id ?? "").trim().toUpperCase();
  const renameLocked = originalEntityCode === "C168";

  const [entityCodeInput, setEntityCodeInput] = useState(originalEntityCode);
  const [company, setCompany] = useState(() => JSON.parse(JSON.stringify(entity || {})));
  const [period, setPeriod] = useState(entity?.selectedPeriod || "");
  const [startDate, setStartDate] = useState(
    () => normalizeDomainStartDateYmd(entity?.startDate) || new Date().toISOString().slice(0, 10),
  );
  const [expDisplay, setExpDisplay] = useState(
    entity?.expiration_date ? (isPermanentExpiration(entity.expiration_date) ? t("noExpiry") : formatDate(entity.expiration_date)) : "",
  );
  const [permissions, setPermissions] = useState(() =>
    Array.isArray(entity?.permissions) && entity.permissions.length
      ? [...entity.permissions]
      : isGroup
        ? []
        : ["Games"],
  );
  const [chargeOnSave, setChargeOnSave] = useState(Boolean(entity?.apply_commission_payments_on_domain_save));
  const [fsa, setFsa] = useState(() => {
    const c = JSON.parse(JSON.stringify(entity || {}));
    ensureCompanyFeeShare(c);
    return c.fee_share_allocations;
  });
  const [shareAccounts, setShareAccounts] = useState([]);
  const [shareAccountsProfit, setShareAccountsProfit] = useState([]);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addAccountRole, setAddAccountRole] = useState("PROFIT");
  const [saving, setSaving] = useState(false);

  const loadShareAccounts = useCallback(() => {
    if (!shareLedgerTenantId) {
      setShareAccounts([]);
      setShareAccountsProfit([]);
      return;
    }
    fetchShareAccountsForTenant(shareLedgerTenantId)
      .then(({ accounts, accounts_profit: profitAccounts }) => {
        setShareAccounts(accounts);
        setShareAccountsProfit(profitAccounts);
        setFsa((prev) => applyDefaultProfitAllocation(prev, profitAccounts));
      })
      .catch(() => {
        setShareAccounts([]);
        setShareAccountsProfit([]);
      });
  }, [shareLedgerTenantId]);

  useEffect(() => {
    if (!open || !entity) return;
    const code = isGroup
      ? String(entity.group_code ?? entity.company_id ?? "").trim().toUpperCase()
      : String(entity.company_id ?? "").trim().toUpperCase();
    setEntityCodeInput(code);
    setCompany(JSON.parse(JSON.stringify(entity)));
    setPeriod(entity.selectedPeriod || "");
    setStartDate(normalizeDomainStartDateYmd(entity.startDate) || new Date().toISOString().slice(0, 10));
    setExpDisplay(
      entity.expiration_date ? (isPermanentExpiration(entity.expiration_date) ? t("noExpiry") : formatDate(entity.expiration_date)) : t("notSet"),
    );
    setPermissions(
      Array.isArray(entity.permissions) && entity.permissions.length
        ? [...entity.permissions]
        : isGroup
          ? []
          : ["Games"],
    );
    setChargeOnSave(Boolean(entity.apply_commission_payments_on_domain_save));
    const c = JSON.parse(JSON.stringify(entity));
    ensureCompanyFeeShare(c);
    setFsa(c.fee_share_allocations);
    loadShareAccounts();
  }, [open, entity, isGroup, t, loadShareAccounts]);

  useEffect(() => {
    if (!open) return;
    if (!period) {
      setExpDisplay(
        company.expiration_date ? (isPermanentExpiration(company.expiration_date) ? t("noExpiry") : formatDate(company.expiration_date)) : t("notSet"),
      );
      return;
    }
    const base = startDate || new Date().toISOString().slice(0, 10);
    const exp = calculateExpirationDate(period, base);
    setExpDisplay(isPermanentExpiration(exp) ? t("noExpiry") : formatDate(exp));
    setCompany((prev) => ({ ...prev, expiration_date: exp, selectedPeriod: period }));
  }, [period, startDate, open, t]);

  const pricePreview = useMemo(() => {
    const feeKind = isGroup ? "group" : "company";
    return resolveDomainFeePriceForPeriod(domainPeriodPrices, period || "6months", feeKind);
  }, [domainPeriodPrices, isGroup, period]);

  const shareTotals = useMemo(
    () => computeShareTotals(fsa, Number(pricePreview) || 0),
    [fsa, pricePreview],
  );

  const roleTotals = {
    profit: shareTotals.profitPool,
    sales: shareTotals.salesSum,
    cs: shareTotals.csSum,
    it: shareTotals.itSum,
  };

  const rowAmounts = {
    profit: shareTotals.profitRowAmounts,
    sales: shareTotals.salesRowAmounts,
    cs: shareTotals.csRowAmounts,
    it: shareTotals.itRowAmounts,
  };

  const updateShareRow = (role, index, patch) => {
    setFsa((prev) => {
      const next = { ...prev, [role]: [...(prev[role] || [])] };
      next[role][index] = { ...next[role][index], ...patch };
      return next;
    });
  };

  const addShareRow = (role) => {
    setFsa((prev) => ({
      ...prev,
      [role]: [...(prev[role] || []), { account_id: 0, percentage: "" }],
    }));
  };

  const removeShareRow = (role, index) => {
    setFsa((prev) => ({
      ...prev,
      [role]: (prev[role] || []).filter((_, i) => i !== index),
    }));
  };

  const accountOptionLabel = (acc) => {
    const code = String(acc?.account_id || "").trim().toUpperCase();
    const name = String(acc?.name || "").trim().toUpperCase();
    if (code && name && name !== code) return `${code} · ${name}`;
    return code || String(acc?.id || "");
  };

  async function validateEntityCodeForSave() {
    const newCode = entityCodeInput.trim().toUpperCase();
    if (!newCode) {
      notify(isGroup ? t("pleaseEnterGroupId") : t("pleaseEnterCompanyId"), "error");
      return null;
    }
    if (renameLocked) {
      if (newCode !== originalEntityCode) notify(t("cannotRenameC168"), "error");
      return originalEntityCode;
    }
    if (newCode === "C168") {
      notify(t("cannotRenameToC168"), "error");
      return null;
    }
    if (newCode === originalEntityCode) return newCode;

    const groupSet = new Set(siblingGroupCodes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean));
    const companySet = new Set(siblingCompanyCodes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean));
    if (isGroup) {
      if (companySet.has(newCode)) {
        notify(t("cannotAddGroupUsesCompanyId", { id: newCode }), "error");
        return null;
      }
      if (groupSet.has(newCode)) {
        notify(t("groupIdAlreadyExists"), "error");
        return null;
      }
    } else {
      if (groupSet.has(newCode)) {
        notify(t("cannotAddCompanyUsesGroupId", { id: newCode }), "error");
        return null;
      }
      if (companySet.has(newCode)) {
        notify(t("companyIdAlreadyAdded"), "error");
        return null;
      }
    }

    const result = validateTenantCodeGlobally(newCode, { excludeOwnerId, domains });
    if (!result.ok) {
      notify(t(result.message || "operationFailed"), "error");
      return null;
    }
    return newCode;
  }

  const save = async () => {
    setSaving(true);
    try {
      const cleanFsa = pruneEmptyShareRows(fsa);
      const apiEntityCode = originalEntityCode;
      if (chargeOnSave && !normalizeDomainStartDateYmd(startDate)) {
        notify(t("chargeRequiresStartDate", { id: apiEntityCode }), "error");
        return;
      }
      let expDate = company.expiration_date || null;
      if (period) {
        expDate = calculateExpirationDate(period, startDate || new Date().toISOString().slice(0, 10));
      }
      if (!renameLocked && (!expDate || String(expDate).trim() === "")) {
        notify(t("expirationRequiredBeforeConfirm", { id: apiEntityCode }), "error");
        return;
      }
      if (!isGroup && SINGLE_CATEGORY_MODE) {
        if (permissions.length === 0) {
          notify(t("pleaseSelectOneCategory"), "error");
          return;
        }
        if (permissions.length > 1) {
          notify(t("onlyOneCategoryAtTime"), "error");
          return;
        }
      }

      const newEntityCode = await validateEntityCodeForSave();
      if (!newEntityCode) return;
      const renameFields =
        newEntityCode === originalEntityCode
          ? {}
          : isGroup
            ? { previous_group_code: originalEntityCode }
            : { previous_company_id: originalEntityCode };

      if (isGroup) {
        onSave({
          ...company,
          group_code: newEntityCode,
          company_id: newEntityCode,
          ...renameFields,
          expiration_date: expDate,
          selectedPeriod: period || company.selectedPeriod,
          startDate,
          permissions: ["Games"],
          fee_share_allocations: cleanFsa,
          apply_commission_payments_on_domain_save: chargeOnSave,
        });
        notify(t("groupUpdatedShareAfterSave"));
        onClose();
        return;
      }

      const updatedCompany = {
        ...company,
        company_id: newEntityCode,
        ...renameFields,
        expiration_date: expDate,
        selectedPeriod: period || company.selectedPeriod,
        startDate,
        permissions: [...permissions],
        fee_share_allocations: cleanFsa,
        apply_commission_payments_on_domain_save: chargeOnSave,
      };

      // Brand-new temp company (no tenant id yet) — settings get written by the outer
      // DomainFormSheet's syncAllTenantSettings once the whole domain is saved.
      if (!company.id) {
        notify(t("companyUpdatedShareAfterSave"));
        onSave(updatedCompany);
        onClose();
        return;
      }

      try {
        const { json } = await updateTenantSetting({
          id: company.id,
          code: apiEntityCode,
          ownerId: excludeOwnerId,
          expirationDate: expDate || null,
          permissions,
          feeShareAllocations: cleanFsa,
          chargeDomainFeeOnConfirm: chargeOnSave,
          domainFeePeriod: period || company.selectedPeriod || null,
        });
        if (!json?.success) {
          notify(json?.message || t("shareSaveFailed"), "error");
          return;
        }
        notify(t("companyUpdatedShareAfterSave") || t("saved"));
        onSave(updatedCompany);
        onClose();
      } catch (e) {
        notify(e?.message || t("shareSaveFailed"), "error");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        title={isGroup ? t("groupSettings") : t("companyInformation")}
        onClose={onClose}
        tall
        elevate
        footer={
          <button type="button" className="m-account-primary-btn tap-scale" disabled={saving} onClick={save}>
            {saving ? t("loading") : t("confirm")}
          </button>
        }
      >
        <div className="m-domain-section">
          <Field label={t("renameIdLabel")}>
            <input
              className="m-tx-form-input m-tx-form-input--muted"
              value={entityCodeInput}
              disabled={renameLocked}
              onChange={(e) => setEntityCodeInput(e.target.value.toUpperCase())}
            />
          </Field>
          <div className="m-domain-section-title">{t("period")}</div>
          <div className="m-domain-pill-row">
            {DOMAIN_FEE_PERIOD_KEYS.map((key) => (
              <Pill key={key} active={period === key} onClick={() => setPeriod(key)}>
                {t(PERIOD_LABEL_KEYS[key])}
              </Pill>
            ))}
          </div>
          <DateTapRow label={t("startDate")} value={startDate} onChange={setStartDate} />
          <p className="m-domain-hint">
            {t("expirationPrefix")}
            {expDisplay || t("notSet")}
            {pricePreview ? ` · ${pricePreview}` : ""}
          </p>
          <label className="m-domain-toggle">
            <span>{t("chargeOnSave")}</span>
            <input type="checkbox" checked={chargeOnSave} onChange={(e) => setChargeOnSave(e.target.checked)} />
          </label>
        </div>

        {!isGroup ? (
          <div className="m-domain-section">
            <div className="m-domain-section-title">{t("permissions")}</div>
            <div className="m-domain-pill-row">
              {PERMISSION_LIST.map((perm) => (
                <Pill
                  key={perm}
                  active={permissions.includes(perm)}
                  onClick={() => {
                    if (SINGLE_CATEGORY_MODE) setPermissions([perm]);
                    else {
                      setPermissions((prev) =>
                        prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
                      );
                    }
                  }}
                >
                  {perm}
                </Pill>
              ))}
            </div>
          </div>
        ) : null}

        <div className="m-domain-section">
          <div className="m-domain-section-title">{t("sharePercent")}</div>
          {SHARE_ROLES.map((role) => {
            const isProfit = role === "profit";
            const rows = fsa?.[role] || [];
            const accounts = isProfit ? shareAccountsProfit : shareAccounts;
            const assignedCount = rows.filter((r) => Number(r.account_id) > 0).length;
            const total = roleTotals[role] || 0;
            const totalOver = total > 100;
            const amounts = rowAmounts[role] || [];
            return (
              <div
                key={role}
                className={`m-domain-share-card m-domain-share-card--${role}${
                  isProfit ? " m-domain-share-card--profit-pool" : ""
                }`}
              >
                <div className="m-domain-share-head">
                  <div className="m-domain-share-head-main">
                    <span className={`m-domain-share-badge m-domain-share-badge--${role}`}>
                      {role.toUpperCase()}
                    </span>
                    <span className="m-domain-share-meta">
                      {assignedCount === 1
                        ? t("oneAccount")
                        : t("accountCount", { count: assignedCount })}
                    </span>
                  </div>
                  <div className="m-domain-share-head-total">
                    <span className="m-domain-share-total-label">{t("shareTotal")}</span>
                    <strong className={totalOver ? "is-over" : ""}>{total.toFixed(2)}%</strong>
                  </div>
                </div>
                <div className="m-domain-share-actions">
                  <button
                    type="button"
                    className="m-domain-mini-btn tap-scale"
                    title={t("addNewAccount")}
                    aria-label={t("addNewAccount")}
                    onClick={() => {
                      setAddAccountRole(role === "cs" ? "CS" : role.toUpperCase());
                      setAddAccountOpen(true);
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="m-domain-mini-btn tap-scale"
                    onClick={() => addShareRow(role)}
                  >
                    {t("add")}
                  </button>
                </div>
                <div
                  className={`m-domain-share-col-labels${
                    isProfit ? " m-domain-share-col-labels--profit" : ""
                  }`}
                >
                  <span>{t("account")}</span>
                  {!isProfit ? <span>{t("share")}</span> : null}
                  <span>{t("total")}</span>
                  <span aria-hidden="true" />
                </div>
                <div className="m-domain-share-rows">
                  {rows.length === 0 ? (
                    <p className="m-domain-hint">{t("addAccountInline")}</p>
                  ) : (
                    rows.map((row, index) => {
                      const amt = amounts[index] || { amount: 0, percentage: 0 };
                      return (
                        <div
                          key={`${role}-${index}`}
                          className={`m-domain-share-row${isProfit ? " m-domain-share-row--profit" : ""}`}
                        >
                          <label className="m-domain-share-select-wrap">
                            <span className="m-domain-sr-only">{t("selectAccount")}</span>
                            <select
                              className="m-domain-share-select"
                              value={Number(row.account_id) > 0 ? String(Number(row.account_id)) : ""}
                              onChange={(e) =>
                                updateShareRow(role, index, {
                                  account_id: parseInt(e.target.value, 10) || 0,
                                })
                              }
                            >
                              <option value="">{t("selectAccount")}</option>
                              {accounts.map((acc) => (
                                <option key={acc.id} value={String(acc.id)}>
                                  {accountOptionLabel(acc)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {!isProfit ? (
                            <label className="m-domain-share-pct-wrap">
                              <span className="m-domain-sr-only">{t("share")}</span>
                              <input
                                className="m-domain-share-pct"
                                inputMode="decimal"
                                placeholder="0"
                                value={row.percentage === 0 || row.percentage ? row.percentage : ""}
                                onChange={(e) =>
                                  updateShareRow(role, index, { percentage: e.target.value })
                                }
                              />
                              <span className="m-domain-share-pct-suffix">%</span>
                            </label>
                          ) : null}
                          <input
                            className="m-domain-share-amount"
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={formatShareRowAmount2(amt.amount)}
                            aria-label={t("total")}
                          />
                          <button
                            type="button"
                            className="m-domain-share-remove tap-scale"
                            title={t("removeRow")}
                            aria-label={t("removeRow")}
                            onClick={() => removeShareRow(role, index)}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Sheet>
      <DomainAddAccountSheet
        open={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        tenantId={shareLedgerTenantId}
        tenantCode={shareLedgerTenantCode}
        preferredRole={addAccountRole}
        lang={lang}
        notify={notify}
        onSuccess={() => loadShareAccounts()}
      />
    </>
  );
}

export function DomainFormSheet({ open, onClose, domain, editingDomain, setConfirm }) {
  const { t, notify, lang, isOwnerOrAdmin, domainPeriodPrices, handleDomainSaved, domains, shareLedgerTenantId, companyCode } = domain;
  const isEditMode = Boolean(editingDomain?.id);
  const hasC168Context = true;

  const [ownerCode, setOwnerCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondaryPassword, setSecondaryPassword] = useState("");
  const [tempCompanies, setTempCompanies] = useState([]);
  const [tempGroups, setTempGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [isMultipleChoiceMode, setIsMultipleChoiceMode] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [groupInput, setGroupInput] = useState("");
  const [settingsEntity, setSettingsEntity] = useState(null);
  const [settingsType, setSettingsType] = useState("company");
  const [saving, setSaving] = useState(false);

  const showSecondaryPwd = !isEditMode || (hasC168Context && isOwnerOrAdmin);

  useEffect(() => {
    if (!open) return;
    setOwnerCode(editingDomain?.owner_code || "");
    setName(editingDomain?.name || "");
    setEmail(editingDomain?.email || "");
    setPassword("");
    setSecondaryPassword("");
    setSelectedGroupId(null);
    setIsMultipleChoiceMode(false);
    setCompanyInput("");
    setGroupInput("");
    setSettingsEntity(null);

    if (!isEditMode || !editingDomain?.id) {
      setTempCompanies([]);
      setTempGroups([]);
      return;
    }

    // Seed directly from the already-loaded (Spring aggregate) domain row — no extra request needed.
    const companiesFull = Array.isArray(editingDomain.companies_full) ? editingDomain.companies_full : [];
    const validCompanies = companiesFull
      .filter((c) => c.company_id)
      .map((c) => {
        const co = {
          id: c.id,
          company_id: c.company_id,
          expiration_date: c.expiration_date || null,
          permissions: Array.isArray(c.permissions) ? c.permissions : [],
          group_id: c.group_id ? normalizeDomainCode(c.group_id) : null,
          fee_share_allocations: c.fee_share_allocations,
        };
        ensureCompanyFeeShare(co);
        co.originalExpirationDate = co.expiration_date || null;
        co.selectedPeriod = null;
        co.startDate = new Date().toISOString().slice(0, 10);
        co.isExtending = false;
        return co;
      });
    setTempCompanies(validCompanies);

    const groupsFull = Array.isArray(editingDomain.groups_full) ? editingDomain.groups_full : [];
    const groups = [];
    if (groupsFull.length > 0) {
      groupsFull.forEach((row) => {
        const g = {
          id: row.id,
          group_code: tempGroupCode(row),
          expiration_date: row.expiration_date || null,
          permissions: [],
          fee_share_allocations: row.fee_share_allocations,
        };
        ensureCompanyFeeShare(g);
        g.originalExpirationDate = g.expiration_date || null;
        g.selectedPeriod = null;
        g.startDate = new Date().toISOString().slice(0, 10);
        g.isExtending = false;
        groups.push(g);
      });
    } else {
      const legacy = new Set();
      validCompanies.forEach((c) => {
        if (c.group_id) legacy.add(c.group_id);
      });
      [...legacy].sort().forEach((code) => groups.push(createEmptyGroup(code)));
    }
    groups.sort((a, b) => tempGroupCode(a).localeCompare(tempGroupCode(b)));
    setTempGroups(groups);
  }, [open, editingDomain, isEditMode]);

  async function validateCodeGlobally(code) {
    const trimmed = String(code ?? "").trim();
    if (!trimmed) return false;
    const excludeOwnerId =
      isEditMode && editingDomain?.id != null && editingDomain?.id !== "" ? Number(editingDomain.id) : undefined;
    const result = validateTenantCodeGlobally(trimmed, { excludeOwnerId, domains });
    if (!result.ok) {
      notify(t(result.message || "operationFailed"), "error");
      return false;
    }
    return true;
  }

  const addCompany = async () => {
    const cid = companyInput.trim().toUpperCase();
    if (!cid) {
      notify(t("pleaseEnterCompanyId"), "error");
      return;
    }
    if (tempGroups.some((g) => tempGroupCode(g) === cid)) {
      notify(t("cannotAddCompanyUsesGroupId", { id: cid }), "error");
      return;
    }
    if (tempCompanies.some((c) => normalizeDomainCode(c.company_id) === cid)) {
      notify(t("companyIdAlreadyAdded"), "error");
      return;
    }
    if (!(await validateCodeGlobally(cid))) return;
    const today = new Date().toISOString().slice(0, 10);
    const newCo = {
      company_id: cid,
      expiration_date: null,
      originalExpirationDate: null,
      startDate: today,
      isExtending: false,
      group_id: selectedGroupId || null,
      permissions: ["Games"],
      fee_share_allocations: defaultFeeShareAllocations(),
    };
    ensureCompanyFeeShare(newCo);
    setTempCompanies((prev) => [...prev, newCo]);
    setCompanyInput("");
  };

  const addGroup = async () => {
    const gid = groupInput.trim().toUpperCase();
    if (!gid) {
      notify(t("pleaseEnterGroupId"), "error");
      return;
    }
    if (tempCompanies.some((c) => normalizeDomainCode(c.company_id) === gid)) {
      notify(t("cannotAddGroupUsesCompanyId", { id: gid }), "error");
      return;
    }
    if (tempGroups.some((g) => tempGroupCode(g) === gid)) {
      notify(t("groupIdAlreadyExists"), "error");
      return;
    }
    if (!(await validateCodeGlobally(gid))) return;
    setTempGroups((prev) => [...prev, createEmptyGroup(gid)]);
    setGroupInput("");
    notify(t("groupAdded", { gid }));
  };

  const removeCompany = (cid) => {
    const code = normalizeDomainCode(cid);
    if (code === "C168") {
      notify(t("cannotRemoveC168Company"), "error");
      return;
    }
    setConfirm({
      message: t("confirmDeleteCompany", { cid: code }),
      onConfirm: () => {
        setTempCompanies((prev) => prev.filter((c) => normalizeDomainCode(c.company_id) !== code));
        notify(t("companyRemovedFromForm", { cid: code }));
      },
    });
  };

  const removeGroup = (gid) => {
    const code = tempGroupCode(gid);
    const count = tempCompanies.filter((c) => c.group_id === code).length;
    setConfirm({
      message:
        count > 0
          ? t("confirmDeleteGroupWithCount", { gid: code, count })
          : t("confirmDeleteGroup", { gid: code }),
      onConfirm: () => {
        setTempCompanies((prev) =>
          prev.map((c) => (c.group_id === code ? { ...c, group_id: null } : c)),
        );
        setTempGroups((prev) => prev.filter((g) => tempGroupCode(g) !== code));
        if (selectedGroupId === code) {
          setSelectedGroupId(null);
          setIsMultipleChoiceMode(false);
        }
        notify(t("groupRemoved", { gid: code }));
      },
    });
  };

  const filteredCompanies = useMemo(() => {
    if (isMultipleChoiceMode && selectedGroupId) {
      return tempCompanies
        .filter((c) => !c.group_id || c.group_id === selectedGroupId)
        .sort((a, b) => a.company_id.localeCompare(b.company_id));
    }
    const filtered = selectedGroupId
      ? tempCompanies.filter((c) => c.group_id === selectedGroupId)
      : [...tempCompanies];
    return filtered.sort((a, b) => a.company_id.localeCompare(b.company_id));
  }, [tempCompanies, selectedGroupId, isMultipleChoiceMode]);

  const assignSelectAllChecked =
    isMultipleChoiceMode &&
    selectedGroupId &&
    filteredCompanies.length > 0 &&
    filteredCompanies.every((c) => c.group_id === selectedGroupId);

  const toggleAssignSelectAll = () => {
    if (!selectedGroupId || filteredCompanies.length === 0) return;
    const allIn = filteredCompanies.every((c) => c.group_id === selectedGroupId);
    const idsInFilter = new Set(filteredCompanies.map((c) => c.company_id));
    setTempCompanies((prev) =>
      prev.map((c) => {
        if (!idsInFilter.has(c.company_id)) return c;
        if (allIn) {
          return c.group_id === selectedGroupId ? { ...c, group_id: null } : c;
        }
        return { ...c, group_id: selectedGroupId };
      }),
    );
  };

  const handleSubmit = async () => {
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) {
      notify(t("invalidEmailFormat"), "error");
      return;
    }
    const overlap = findGroupCompanyCodeOverlap(tempGroups, tempCompanies);
    if (overlap) {
      notify(t("groupCompanyIdOverlapSave", { id: overlap }), "error");
      return;
    }
    const missingStart = findChargeMissingStartDate(tempCompanies, tempGroups);
    if (missingStart) {
      notify(t("chargeRequiresStartDate", { id: missingStart.id }), "error");
      return;
    }
    const missingExp = findMissingExpirationDate(tempCompanies, tempGroups);
    if (missingExp) {
      notify(t("expirationRequiredBeforeConfirm", { id: missingExp.id }), "error");
      return;
    }

    const groupsSorted = [...tempGroups].sort((a, b) => tempGroupCode(a).localeCompare(tempGroupCode(b)));
    const companiesSorted = [...tempCompanies].sort((a, b) =>
      a.company_id.toUpperCase().localeCompare(b.company_id.toUpperCase()),
    );

    setSaving(true);
    try {
      const { res, json } = isEditMode
        ? await updateDomain({
            id: editingDomain.id,
            ownerCode,
            name,
            email: emailCheck.normalized,
            password: password || undefined,
            secondaryPassword: secondaryPassword || undefined,
            groups: groupsSorted,
            companies: companiesSorted,
          })
        : await createDomain({
            ownerCode,
            name,
            email: emailCheck.normalized,
            password,
            secondaryPassword,
            groups: groupsSorted,
            companies: companiesSorted,
          });

      if (!res.ok || !json?.success) {
        notify(json?.message || t("operationFailed"), "error");
        return;
      }

      const ownerId = json.data?.id ?? editingDomain?.id;
      const { groups: mergedGroups, companies: mergedCompanies } = mergeTenantIdsFromDomainResponse(
        groupsSorted,
        companiesSorted,
        json.data,
      );
      await syncAllTenantSettings(ownerId, mergedGroups, mergedCompanies);

      const rows = await fetchDomainList(ownerId);
      const savedRow = rows.find((r) => Number(r.id) === Number(ownerId)) ?? rows[0];

      notify(isEditMode ? t("ownerUpdated") : t("ownerCreated"));
      if (savedRow) handleDomainSaved(savedRow);
      onClose();
    } catch (e) {
      notify(e?.message || t("saveOwnerError"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        title={isEditMode ? t("editDomain") : t("addDomain")}
        onClose={onClose}
        tall
        footer={
          <button
            type="button"
            className="m-account-primary-btn tap-scale"
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving ? t("loading") : t("confirm")}
          </button>
        }
      >
        <div className="m-domain-section m-tx-form-section">
          <p className="m-domain-section-title">{t("domainInformation")}</p>
          <Field label={t("ownerCode")}>
            <input
              className="m-tx-form-input m-tx-form-input--muted"
              value={ownerCode}
              disabled={isEditMode}
              onChange={(e) => setOwnerCode(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label={t("name")}>
            <input
              className="m-tx-form-input m-tx-form-input--muted"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t("email")}>
            <input
              className="m-tx-form-input m-tx-form-input--muted"
              value={email}
              onChange={(e) => setEmail(sanitizeEmailInput(e.target.value))}
              inputMode="email"
              autoComplete="email"
            />
          </Field>
          <Field label={t("password")}>
            <PasswordInput
              className="m-tx-form-input m-tx-form-input--muted"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showLabel={t("showPassword")}
              hideLabel={t("hidePassword")}
              autoComplete="new-password"
              placeholder={isEditMode ? t("leaveEmptyKeepCurrentPassword") : ""}
            />
          </Field>
          {showSecondaryPwd ? (
            <Field label={t("secondaryPassword")}>
              <PasswordInput
                className="m-tx-form-input m-tx-form-input--muted"
                value={secondaryPassword}
                onChange={(e) =>
                  setSecondaryPassword(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                showLabel={t("showPassword")}
                hideLabel={t("hidePassword")}
                autoComplete="new-password"
                placeholder={t("sixDigitsOnly")}
              />
            </Field>
          ) : null}
        </div>

        <div className="m-domain-section m-tx-form-section">
          <p className="m-domain-section-title">{t("companiesGroups")}</p>
          <div className="m-tx-form-field m-domain-form-field">
            <label className="m-tx-form-label">{t("groupIdLabel")}</label>
            <div className="m-domain-add-row">
              <input
                className="m-tx-form-input m-tx-form-input--muted"
                value={groupInput}
                placeholder={t("groupIdPlaceholder")}
                onChange={(e) => setGroupInput(e.target.value.toUpperCase())}
              />
              <button
                type="button"
                className="m-tx-form-btn m-tx-form-btn--outline m-domain-add-action tap-scale"
                onClick={addGroup}
              >
                {t("add")}
              </button>
            </div>
          </div>
          <div className="m-tx-form-field m-domain-form-field">
            <label className="m-tx-form-label">{t("companyIdLabel")}</label>
            <div className="m-domain-add-row">
              <input
                className="m-tx-form-input m-tx-form-input--muted"
                value={companyInput}
                placeholder={t("companyIdPlaceholder")}
                onChange={(e) => setCompanyInput(e.target.value.toUpperCase())}
              />
              <button
                type="button"
                className="m-tx-form-btn m-tx-form-btn--outline m-domain-add-action tap-scale"
                onClick={addCompany}
              >
                {t("add")}
              </button>
            </div>
          </div>

          <div className="m-domain-pill-row">
            {tempGroups.map((g) => {
              const code = tempGroupCode(g);
              return (
                <Pill
                  key={code}
                  active={selectedGroupId === code}
                  onClick={() => {
                    setSelectedGroupId((prev) => (prev === code ? null : code));
                    setIsMultipleChoiceMode(false);
                  }}
                >
                  {code}
                </Pill>
              );
            })}
          </div>
          {selectedGroupId ? (
            <div className="m-domain-toolbar-row">
              <button
                type="button"
                className="m-domain-mini-btn tap-scale"
                onClick={() => setIsMultipleChoiceMode((v) => !v)}
              >
                {isMultipleChoiceMode ? t("doneCompact") : t("multipleChoice")}
              </button>
              <button
                type="button"
                className="m-domain-mini-btn m-domain-mini-btn--ghost tap-scale"
                onClick={() => {
                  const g = tempGroups.find((x) => tempGroupCode(x) === selectedGroupId);
                  setSettingsType("group");
                  setSettingsEntity(g || createEmptyGroup(selectedGroupId));
                }}
              >
                {t("groupSettingsLower")}
              </button>
              <button
                type="button"
                className="m-domain-mini-btn m-domain-mini-btn--danger tap-scale"
                onClick={() => removeGroup(selectedGroupId)}
              >
                {t("remove")}
              </button>
            </div>
          ) : null}

          <div className="m-domain-entity-list">
            {isMultipleChoiceMode && selectedGroupId && filteredCompanies.length > 0 ? (
              <label className="m-domain-select-all">
                <input
                  type="checkbox"
                  checked={assignSelectAllChecked}
                  onChange={toggleAssignSelectAll}
                />
                <span>{t("selectAll")}</span>
              </label>
            ) : null}
            {filteredCompanies.length === 0 ? (
              <p className="m-domain-hint">
                {selectedGroupId
                  ? t("noCompaniesInGroup", { gid: selectedGroupId })
                  : tempCompanies.length === 0
                    ? t("noCompaniesAddedYet")
                    : t("selectedCompaniesHint")}
              </p>
            ) : (
              filteredCompanies.map((c) => (
                <div key={c.company_id} className="m-domain-entity-row">
                  <div>
                    {isMultipleChoiceMode && selectedGroupId ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={c.group_id === selectedGroupId}
                          onChange={() =>
                            setTempCompanies((prev) =>
                              prev.map((row) =>
                                row.company_id === c.company_id
                                  ? {
                                      ...row,
                                      group_id:
                                        row.group_id === selectedGroupId ? null : selectedGroupId,
                                    }
                                  : row,
                              ),
                            )
                          }
                        />{" "}
                        <strong>{c.company_id}</strong>
                      </label>
                    ) : (
                      <strong>{c.company_id}</strong>
                    )}
                    <div className="m-domain-entity-meta">
                      {c.expiration_date ? (isPermanentExpiration(c.expiration_date) ? t("noExpiry") : formatDate(c.expiration_date)) : t("notSet")}
                      {c.group_id ? ` · ${c.group_id}` : ""}
                    </div>
                  </div>
                  <div className="m-domain-entity-actions">
                    <button
                      type="button"
                      className="m-domain-mini-btn tap-scale"
                      onClick={() => {
                        setSettingsType("company");
                        setSettingsEntity(c);
                      }}
                    >
                      {t("set")}
                    </button>
                    <button
                      type="button"
                      className="m-domain-mini-btn m-domain-mini-btn--danger tap-scale"
                      onClick={() => removeCompany(c.company_id)}
                    >
                      {t("remove")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Sheet>

      <DomainSettingsSheet
        open={Boolean(settingsEntity)}
        onClose={() => setSettingsEntity(null)}
        tenantType={settingsType}
        entity={settingsEntity}
        domainPeriodPrices={domainPeriodPrices}
        excludeOwnerId={editingDomain?.id ?? null}
        siblingGroupCodes={tempGroups.map((g) => tempGroupCode(g)).filter((c) => c !== tempGroupCode(settingsEntity))}
        siblingCompanyCodes={tempCompanies
          .map((c) => normalizeDomainCode(c.company_id))
          .filter((c) => c !== normalizeDomainCode(settingsEntity?.company_id))}
        domains={domains}
        shareLedgerTenantId={shareLedgerTenantId}
        shareLedgerTenantCode={companyCode}
        lang={lang}
        notify={notify}
        onSave={(updated) => {
          if (settingsType === "group") {
            const prevCode = tempGroupCode(updated.previous_group_code ?? settingsEntity);
            const newCode = tempGroupCode(updated);
            setTempGroups((prev) =>
              prev.map((g) =>
                tempGroupCode(g) === prevCode ? { ...g, ...updated, group_code: newCode } : g,
              ),
            );
            if (prevCode && newCode && prevCode !== newCode) {
              setTempCompanies((prev) =>
                prev.map((c) => (c.group_id === prevCode ? { ...c, group_id: newCode } : c)),
              );
              if (selectedGroupId === prevCode) setSelectedGroupId(newCode);
            }
          } else {
            const prevId = normalizeDomainCode(updated.previous_company_id ?? settingsEntity?.company_id);
            const newId = normalizeDomainCode(updated.company_id);
            setTempCompanies((prev) =>
              prev.map((c) =>
                normalizeDomainCode(c.company_id) === prevId
                  ? { ...c, ...updated, company_id: newId }
                  : c,
              ),
            );
          }
          setSettingsEntity(null);
        }}
      />
    </>
  );
}
