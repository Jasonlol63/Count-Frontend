import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { updateTenantSetting } from "../domainApi.js";
import { notifySessionRefreshRequested } from "../../../utils/company/companySessionEvents.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";
import FormDateField from "../../../components/FormDateField.jsx";
import MaintenanceCalendarPopup from "../../../components/MaintenanceCalendarPopup.jsx";
import {
  bindMaintenanceCalendarDismissListeners,
  closeMaintenanceCalendarPopup,
  ensureMaintenanceDateRangePicker,
} from "../../../utils/date/dateRangePicker.js";
import { parseDdMmYyyyToYmd } from "../../../utils/date/dateUtils.js";
import {
  SINGLE_CATEGORY_MODE,
  calculateExpirationDate,
  formatDate,
  defaultFeeShareAllocations,
  normalizeFeeShareFromServer,
  ensureCompanyFeeShare,
  isFeeShareAllocationsEmpty,
  pruneEmptyShareRows,
  sumFeeShareRolePercentages,
  computeShareTotals,
  formatShareRowAmount2,
  resolveDomainFeePriceForPeriod,
  forceUppercaseValue,
} from "../domainHelpers.js";
import AddAccountModal from "./AddAccountModal.jsx";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

const PERMISSION_LIST = [
  { value: "Games", id: "permGambling", labelSuffix: "Gambling" },
  { value: "Bank", id: "permBank", labelSuffix: "Bank" },
  { value: "Loan", id: "permLoan", labelSuffix: "Loan" },
  { value: "Rate", id: "permRate", labelSuffix: "Rate" },
  { value: "Money", id: "permMoney", labelSuffix: "Money" },
];

const SHARE_ROLES = ["profit", "sales", "cs", "it"];
const START_DATE_FIELD_KEY = "company_exp_start_date";
const START_DATE_FROM_ID = `${START_DATE_FIELD_KEY}_drp_from`;

const MONTH_LABELS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LABELS_ZH = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * Company Settings Modal — expiration date + permissions + share %
 *
 * Props:
 *   company          — the tempCompanies entry being edited (snapshot for cancel)
 *   domainPeriodPrices — { 7days, 1month, … } for share amount by selected period
 *   sessionCompanyId — fallback if company.company_id is missing
 *   sessionCompanyCode — used for adding accounts
 *   excludeOwnerId — edit domain: exclude current owner from global code check
 *   siblingGroupCodes — other group IDs in the form (for local rename validation)
 *   siblingCompanyCodes — other company IDs in the form (for local rename validation)
 *   persistImmediately = false — group: POST save_group_tenant_settings on Save
 *   commissionOnly — Auto Renew Comm: Share % only, no billing on Save
 *   sharePricePeriod — renewal period for share amount preview (commissionOnly)
 *   onSave(updatedCompany) — callback with updated company data
 *   onClose()
 */
export default function CompanySettingsModal({
  lang = "en",
  tenantType = "company",
  company: initCompany,
  domainPeriodPrices,
  sessionCompanyId,
  sessionCompanyCode,
  excludeOwnerId = null,
  siblingGroupCodes = [],
  siblingCompanyCodes = [],
  persistImmediately = false,
  commissionOnly = false,
  sharePricePeriod = "",
  onSave,
  onClose,
}) {
  const isGroup = tenantType === "group";
  const originalEntityCode = isGroup
    ? String(initCompany?.group_code ?? initCompany?.company_id ?? "").trim().toUpperCase()
    : String(initCompany?.company_id ?? "").trim().toUpperCase();
  const renameLocked = originalEntityCode === "C168";
  const { submitting, runGuarded } = useSubmitGuard(true);
  const [entityCodeInput, setEntityCodeInput] = useState(originalEntityCode);
  const isZh = lang === "zh";
  const t = (key, params) => getDomainText(lang, key, params);
  // Local copy of company being edited
  const [company, setCompany] = useState(() => JSON.parse(JSON.stringify(initCompany)));
  const [period, setPeriod] = useState(initCompany.selectedPeriod || "");
  const [startDate, setStartDate] = useState(() => {
    const raw = initCompany.startDate || "";
    const ymd = raw.includes("-") ? raw.split("T")[0] : parseDdMmYyyyToYmd(raw);
    return ymd || new Date().toISOString().split("T")[0];
  });
  const [expDisplay, setExpDisplay] = useState(initCompany.expiration_date ? formatDate(initCompany.expiration_date) : t("notSet"));
  const [permissions, setPermissions] = useState(
    isGroup ? [] : (Array.isArray(initCompany.permissions) ? initCompany.permissions : [])
  );
  const [chargeOnSave, setChargeOnSave] = useState(!!initCompany.apply_commission_payments_on_domain_save);
  const startDateHandlerRef = useRef(null);

  const monthLabels = isZh ? MONTH_LABELS_ZH : MONTH_LABELS_EN;
  const weekdaysShort = isZh ? WEEKDAYS_ZH : WEEKDAYS_EN;

  useEffect(() => {
    startDateHandlerRef.current = (iso) => {
      if (iso) setStartDate(iso);
    };
  });

  useEffect(() => {
    bindMaintenanceCalendarDismissListeners();
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.init?.({
      allowEmpty: false,
      placeholder: t("selectStartDateHint"),
      clearDateLabel: t("clearDate"),
      monthLabels,
      onChange: () => {
        const binding = window.MaintenanceDateRangePicker?.getActiveRangeBinding?.() || {};
        if (binding.dateFromId !== START_DATE_FROM_ID) return;
        const fromDmy = document.getElementById(START_DATE_FROM_ID)?.value?.trim() || "";
        const iso = parseDdMmYyyyToYmd(fromDmy);
        startDateHandlerRef.current?.(iso);
      },
    });
    window.MaintenanceDateRangePicker?.bindPickers?.();
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectStartDateHint"),
      clearDateLabel: t("clearDate"),
      monthLabels,
    });

    return () => {
      closeMaintenanceCalendarPopup();
    };
  }, [monthLabels, t]);

  // Share %
  const [shareAccounts, setShareAccounts] = useState([]);       // for sales/cs/it
  const [shareAccountsProfit, setShareAccountsProfit] = useState([]); // for profit
  const [fsa, setFsa] = useState(() => {
    const c = JSON.parse(JSON.stringify(initCompany));
    ensureCompanyFeeShare(c);
    return c.fee_share_allocations;
  });
  const [expandedCards, setExpandedCards] = useState({});
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addAccountRole, setAddAccountRole] = useState("");

  const sharePickerCompanyCode = "C168";

  const loadAccounts = useCallback(() => {
    // 暂时注销 PHP 获取 share 接口，避免报错
    setShareAccounts([]);
    setShareAccountsProfit([]);
  }, []);

  // Load share accounts from API
  useEffect(() => {
    loadAccounts();

    if (isGroup) {
      return;
    }

    // 已经由大弹窗传入了初始 permissions 列表，不再重复向旧 PHP 请求
    if (!Array.isArray(initCompany.permissions) || initCompany.permissions.length === 0) {
      setPermissions([]);
    } else {
      setPermissions(initCompany.permissions);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate expiration display whenever period/startDate changes
  useEffect(() => {
    if (!period) {
      setExpDisplay(company.expiration_date ? formatDate(company.expiration_date) : t("notSet"));
      return;
    }
    const base = startDate || new Date().toISOString().split("T")[0];
    const exp = calculateExpirationDate(period, base);
    setExpDisplay(formatDate(exp));
    setCompany((prev) => {
      if (prev.expiration_date === exp && prev.selectedPeriod === period) return prev;
      return { ...prev, expiration_date: exp, selectedPeriod: period };
    });
  }, [period, startDate, t]);

  function togglePermission(val) {
    if (SINGLE_CATEGORY_MODE) {
      setPermissions([val]);
    } else {
      setPermissions((prev) =>
        prev.includes(val) ? prev.filter((p) => p !== val) : [...prev, val]
      );
    }
  }

  async function validateEntityCodeForSave() {
    const newCode = entityCodeInput.trim().toUpperCase();
    if (!newCode) {
      showDomainAlert(isGroup ? t("pleaseEnterGroupId") : t("pleaseEnterCompanyId"), "danger");
      return null;
    }
    if (renameLocked) {
      if (newCode !== originalEntityCode) {
        showDomainAlert(t("cannotRenameC168"), "danger");
      }
      return originalEntityCode;
    }
    if (newCode === "C168") {
      showDomainAlert(t("cannotRenameToC168"), "danger");
      return null;
    }
    if (newCode === originalEntityCode) {
      return newCode;
    }

    const groupSet = new Set((siblingGroupCodes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean));
    const companySet = new Set((siblingCompanyCodes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean));

    if (isGroup) {
      if (companySet.has(newCode)) {
        showDomainAlert(t("cannotAddGroupUsesCompanyId", { id: newCode }), "danger");
        return null;
      }
      if (groupSet.has(newCode)) {
        showDomainAlert(t("groupIdAlreadyExists"), "danger");
        return null;
      }
    } else {
      if (groupSet.has(newCode)) {
        showDomainAlert(t("cannotAddCompanyUsesGroupId", { id: newCode }), "danger");
        return null;
      }
      if (companySet.has(newCode)) {
        showDomainAlert(t("companyIdAlreadyAdded"), "danger");
        return null;
      }
    }

    return newCode;
  }

  function buildRenameFields(newCode) {
    if (newCode === originalEntityCode) {
      return {};
    }
    const renameFrom = String(
      (isGroup ? initCompany?.previous_group_code : initCompany?.previous_company_id) ?? originalEntityCode
    ).trim().toUpperCase();
    return isGroup
      ? { previous_group_code: renameFrom }
      : { previous_company_id: renameFrom };
  }

  function handleReset() {
    const today = new Date().toISOString().split("T")[0];
    setEntityCodeInput(originalEntityCode);
    setStartDate(today);
    setPeriod("");
    setExpDisplay(t("notSet"));
    setCompany((prev) => ({
      ...prev,
      expiration_date: null,
      selectedPeriod: "",
      isExtending: false,
      originalExpirationDate: null,
    }));
    setFsa(defaultFeeShareAllocations());
    setChargeOnSave(false);
    setExpandedCards({});
    if (isGroup) {
      setPermissions([]);
    } else if (SINGLE_CATEGORY_MODE) {
      setPermissions(["Games"]);
    } else {
      setPermissions(["Games", "Bank", "Loan", "Rate", "Money"]);
    }
  }

  async function handleSave() {
    const cleanFsa = pruneEmptyShareRows(fsa);
    const apiEntityCode = originalEntityCode;

    if (commissionOnly) {
      try {
        const action = isGroup ? "save_group_share_settings" : "save_company_share_settings";
        const payload = isGroup
          ? { action, group_code: apiEntityCode, fee_share_allocations: cleanFsa }
          : { action, company_id: apiEntityCode, fee_share_allocations: cleanFsa };
        const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
          cache: "no-cache",
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.success) {
          showDomainAlert(json.message || t("shareSaveFailed"), "danger");
          return;
        }
        showDomainAlert(t("commissionSettingsSaved"));
        onSave({
          ...company,
          fee_share_allocations: cleanFsa,
        });
      } catch {
        showDomainAlert(t("shareSaveFailed"), "danger");
      }
      return;
    }

    // Validate permissions (company only — groups do not use Process List / Data Capture categories)
    if (!isGroup && SINGLE_CATEGORY_MODE) {
      if (permissions.length === 0) { showDomainAlert(t("pleaseSelectOneCategory"), "danger"); return; }
      if (permissions.length > 1)  { showDomainAlert(t("onlyOneCategoryAtTime"), "danger"); return; }
    }

    const newEntityCode = await validateEntityCodeForSave();
    if (!newEntityCode) return;
    const renameFields = buildRenameFields(newEntityCode);

    let expDate = company.expiration_date || null;
    if (period) {
      const base = startDate || new Date().toISOString().split("T")[0];
      expDate = calculateExpirationDate(period, base);
    }

    if (isGroup) {
      const updated = {
        ...company,
        group_code: newEntityCode,
        company_id: newEntityCode,
        ...renameFields,
        expiration_date: expDate,
        selectedPeriod: period || company.selectedPeriod,
        startDate,
        isExtending: company.isExtending,
        originalExpirationDate: company.originalExpirationDate,
        permissions: [],
        fee_share_allocations: cleanFsa,
        apply_commission_payments_on_domain_save: chargeOnSave,
      };

      if (persistImmediately && company.id) {
        try {
          const json = await updateTenantSetting({
            id: company.id,
            code: newEntityCode,
            ownerId: excludeOwnerId,
            expirationDate: expDate || null,
            categoryCode: [],
          });
          if (!json.success) {
            showDomainAlert(json.message || t("shareSaveFailed"), "danger");
            return;
          }
          showDomainAlert(t("groupUpdatedSuccess"));
          onSave(updated);
          notifySessionRefreshRequested();
        } catch {
          showDomainAlert(t("shareSaveFailed"), "danger");
        }
        return;
      }

      showDomainAlert(t("groupUpdatedShareAfterSave"));
      onSave(updated);
      notifySessionRefreshRequested();
      return;
    }

    const updatedCo = {
      ...company,
      company_id: newEntityCode,
      ...renameFields,
      expiration_date: expDate,
      selectedPeriod: period || company.selectedPeriod,
      startDate,
      isExtending: company.isExtending,
      originalExpirationDate: company.originalExpirationDate,
      permissions: [...permissions],
      fee_share_allocations: cleanFsa,
      apply_commission_payments_on_domain_save: chargeOnSave,
    };

    if (persistImmediately && company.id) {
      try {
        const json = await updateTenantSetting({
          id: company.id,
          code: newEntityCode,
          ownerId: excludeOwnerId,
          expirationDate: expDate || null,
          categoryCode: permissions,
        });
        if (!json.success) {
          showDomainAlert(json.message || t("permissionsSaveFailed"), "danger");
          return;
        }
        showDomainAlert(t("companyUpdatedSuccess"));
        onSave(updatedCo);
        notifySessionRefreshRequested();
      } catch {
        showDomainAlert(t("serverUnreachableChangesKept"), "danger");
        onSave(updatedCo);
      }
      return;
    }

    showDomainAlert(t("companyUpdatedShareAfterSave"));
    onSave(updatedCo);
    notifySessionRefreshRequested();
  }

  // ─── Share % helpers（周期变更时按 Price 中对应金额重算，含 C168 行） ─────
  const shareAmountPeriod = commissionOnly ? (sharePricePeriod || period) : period;
  const effectiveFeePrice = resolveDomainFeePriceForPeriod(
    domainPeriodPrices,
    shareAmountPeriod,
    isGroup ? "group" : "company"
  );
  const totals = computeShareTotals(fsa, effectiveFeePrice);

  function updateShareRow(role, idx, field, value) {
    setFsa((prev) => {
      const rows = [...(prev[role] || [])];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, [role]: rows };
    });
  }

  function addShareRow(role) {
    setFsa((prev) => {
      const pruned = pruneEmptyShareRows(prev);
      return { ...pruned, [role]: [...(pruned[role] || []), { account_id: 0, percentage: "" }] };
    });
    setExpandedCards((prev) => ({ ...prev, [role]: true }));
  }

  function removeShareRow(role, idx) {
    setFsa((prev) => {
      const rows = [...(prev[role] || [])];
      rows.splice(idx, 1);
      return { ...prev, [role]: rows };
    });
  }

  function toggleCard(role) {
    setExpandedCards((prev) => ({ ...prev, [role]: !prev[role] }));
  }

  function handleOpenAddAccount(role) {
    setAddAccountRole(role);
    setShowAddAccount(true);
  }

  const accountsForRole = (role) => role === "profit" ? shareAccountsProfit : shareAccounts;

  const roleTotals = {
    profit: totals.profitPool,
    sales: totals.salesSum,
    cs: totals.csSum,
    it: totals.itSum,
  };

  const rowAmounts = {
    profit: totals.profitRowAmounts,
    sales: totals.salesRowAmounts,
    cs: totals.csRowAmounts,
    it: totals.itRowAmounts,
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  /* 必须高于 DomainFormModal 遮罩 (2147483000)；勿依赖任意 Tailwind z-[…] 以免生产未生成 */
  const companySettingsOverlayZ = 2147483001;

  return (
    <>
    <DomainModalPortal>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          position: "fixed",
          inset: 0,
          zIndex: companySettingsOverlayZ,
          overflowY: "auto",
          padding: "clamp(16px, 3vh, 32px) 12px",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className={`company-settings-react-modal modal-content relative mx-auto shrink-0 overflow-hidden rounded-2xl border-0 bg-white shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]${commissionOnly ? " company-settings-modal-content--commission-only" : " company-settings-modal-content--split"}`}>
        <div className="modal-header company-settings-modal-header">
          <h2 className="m-0 bg-transparent p-0">
            {commissionOnly ? t("commissionSettings") : (isGroup ? t("groupSettings") : t("companySettings"))}
          </h2>
          <button
            type="button"
            className="account-close"
            aria-label={isZh ? "关闭" : "Close"}
            onClick={onClose}
          />
        </div>
        <div className="company-settings-modal-body">
          <div className="company-settings-split">
            {!commissionOnly ? (
            <>
            {/* ── Left: General ── */}
            <div id="companySettingsPanelGeneral" className="company-settings-split-left">
              <h3 className="company-settings-column-title">
                {isGroup ? t("groupSettingsLower") : t("companySettingsLower")}
              </h3>
              <div className="mb-[clamp(6px,0.625vw,12px)]">
                <label htmlFor="entityCodeRename" className="cs-company-field-label">
                  {isGroup ? t("groupIdLabel") : t("companyIdLabel")}
                </label>
                <input
                  id="entityCodeRename"
                  type="text"
                  className="company-settings-date-row-control company-settings-rename-input"
                  value={entityCodeInput}
                  disabled={renameLocked}
                  placeholder={t("renameIdPlaceholder")}
                  onChange={(e) => setEntityCodeInput(forceUppercaseValue(e.target.value))}
                />
              </div>
              {/* Start Date + Period */}
              <div className="company-settings-date-row">
                <div className="company-settings-field-half company-settings-start-date-field">
                  <FormDateField
                    fieldKey={START_DATE_FIELD_KEY}
                    htmlFor="expDateStartDate"
                    label={t("startDate")}
                    labelClassName="cs-company-field-label"
                    value={startDate}
                    placeholder={t("pickDate")}
                    allowClear={false}
                    onValueChange={setStartDate}
                    className="company-settings-form-date-field"
                    wrapClassName="company-settings-form-datepicker-wrap"
                    inputClassName="company-settings-date-row-control company-settings-form-datepicker-input"
                  />
                  <small id="expDateStartDateHelp" className="company-settings-start-hint">
                    {t("selectStartDateHint")}
                  </small>
                </div>
                <div className="company-settings-field-half company-settings-field-half--period">
                  <label className="cs-company-field-label" htmlFor="expDatePeriod">{t("period")}</label>
                  <div className="company-settings-period-wrap">
                    <select
                      id="expDatePeriod"
                      className="company-settings-date-row-control company-settings-period-select"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                    >
                    <option value="">{t("selectPeriod")}</option>
                    <option value="7days">{t("sevenDays")}</option>
                    <option value="1month">{t("oneMonth")}</option>
                    <option value="3months">{t("threeMonths")}</option>
                    <option value="6months">{t("sixMonths")}</option>
                    <option value="1year">{t("oneYear")}</option>
                    </select>
                  </div>
                  <small className="company-settings-start-hint company-settings-start-hint--align-spacer" aria-hidden="true">
                    &#8203;
                  </small>
                </div>
              </div>
              {/* Expiration Date display */}
              <div className="mb-2.5">
                <label className="cs-company-field-label">{t("expirationDate")}</label>
                <div id="expDateDisplay" className={`company-settings-exp-display${expDisplay === t("notSet") ? " is-muted" : ""}`}>
                  {expDisplay}
                </div>
              </div>
              {/* Permissions — company only */}
              {!isGroup && (
              <div className="company-settings-permissions-block">
                <label className="cs-company-field-label company-settings-permissions-label">{t("permissionsLabel")}</label>
                <div className="permission-toggle-row">
                  {PERMISSION_LIST.map(({ value, id, labelSuffix }) => (
                    <label
                      key={value}
                      className="permission-toggle-btn"
                      id={`permissionLabel${labelSuffix}`}
                      htmlFor={id}
                    >
                      <input
                        type="checkbox"
                        id={id}
                        value={value}
                        className="permission-checkbox"
                        checked={permissions.includes(value)}
                        onChange={() => togglePermission(value)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
                <p className="company-settings-permissions-hint">{t("permissionsHintLine")}</p>
              </div>
              )}
            </div>

            <div className="company-settings-split-divider" role="separator" aria-orientation="vertical" aria-hidden="true" />
            </>
            ) : null}

            {/* ── Right: Share % ── */}
            <div className="company-settings-split-right">
              <div className="company-settings-share-header">
                <h3 className="company-settings-column-title company-settings-share-title">{t("share")}</h3>
                {!commissionOnly ? (
                <div className="company-share-charge-on-save">
                  <span className={`company-share-charge-on-save__state${chargeOnSave ? " company-share-charge-on-save__state--on" : ""}`} aria-hidden="true">
                    {chargeOnSave ? t("on") : t("off")}
                  </span>
                  <label className="company-share-charge-switch">
                    <input
                      type="checkbox"
                      className="company-share-charge-switch__input"
                      id="companyShareChargeToggle"
                      role="switch"
                      aria-label={t("companyShareChargeAria")}
                      aria-checked={chargeOnSave}
                      checked={chargeOnSave}
                      onChange={(e) => setChargeOnSave(e.target.checked)}
                    />
                    <span className="company-share-charge-switch__track" aria-hidden="true">
                      <span className="company-share-charge-switch__thumb" />
                    </span>
                  </label>
                </div>
                ) : null}
              </div>

              {/* Grand total bar */}
              <div className="company-share-grand-total" style={{ display: "none" }}>
                <span>{totals.grand.toFixed(2)}%</span>
              </div>

              <div className="company-share-scroll">
                {SHARE_ROLES.map((role) => {
                  const isProfit = role === "profit";
                  const total = roleTotals[role];
                  const rows = fsa[role] || [];
                  const amounts = rowAmounts[role] || [];
                  const accounts = accountsForRole(role);
                  const isExpanded = !!expandedCards[role];
                  const assignedCount = rows.filter((r) => parseInt(r.account_id, 10) !== 0).length;
                  const cardId = `shareRows${role.charAt(0).toUpperCase() + role.slice(1)}`;

                  return (
                    <div key={role}
                      className={`company-share-role-card${isExpanded ? " expanded" : ""}${isProfit ? " company-share-role-card--profit-pool" : ""}${rows.length === 0 ? " company-share-role-card--empty" : ""}`}
                      data-share-card={role}>
                      <div
                        className="company-share-role-header"
                        role="button" tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-controls={cardId}
                        onClick={() => toggleCard(role)}
                        onKeyDown={(e) => e.key === "Enter" && toggleCard(role)}
                      >
                        <div className="company-share-role-header-left">
                          <span className={`company-share-role-badge company-share-role-badge--${role}`}>
                            {role.charAt(0).toUpperCase() + role.slice(1)}
                          </span>
                          <span className="company-share-account-count-display">
                            {assignedCount === 1 ? t("oneAccount") : t("accountCount", { count: assignedCount })}
                          </span>
                        </div>
                        <div className="company-share-role-header-middle">
                          <div className="company-share-role-alloc-row">
                            <span className="company-share-role-alloc-label">{t("shareTotal")}</span>
                            <span className={`company-share-card-sum${total > 100 ? " company-share-card-sum--over" : ""}`}>
                              {total.toFixed(2)}%
                            </span>
                          </div>
                          <div className="company-share-progress-track">
                            <div
                              className={`company-share-progress-fill${total > 100 ? " company-share-progress-fill--over" : ""}`}
                              style={{ width: `${Math.min(100, Math.max(0, total))}%` }}
                            />
                          </div>
                        </div>
                        <div className="company-share-role-header-right">
                          <button type="button" className="company-share-btn-manage"
                            onClick={(e) => { e.stopPropagation(); toggleCard(role); }}>
                            {t("manage")}
                          </button>
                          <span className="company-share-icon-chevron" aria-hidden="true">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className={`company-share-role-body${isProfit ? " profit-pool company-share-role-body--profit-pool" : ""}`}>
                          <div className={`company-share-column-labels${isProfit ? " company-share-column-labels--profit-pool" : ""}`}>
                            <span>{t("account")}</span>
                            {!isProfit && <span>{t("share")}</span>}
                            <span>{t("total")}</span>
                            <span className="company-share-col-actions" aria-hidden="true" />
                          </div>
                          <div id={cardId} role="list">
                            {rows.map((row, idx) => {
                              const amt = amounts[idx] || { amount: 0, percentage: 0 };
                              return (
                                <div key={idx} className="company-share-data-row" role="listitem">
                                  <div className="company-share-cell company-share-cell-account">
                                    <div className="company-share-account-inline">
                                      <select
                                        className="share-account-select company-share-select"
                                        aria-label={t("account")}
                                        value={row.account_id || ""}
                                        onChange={(e) => updateShareRow(role, idx, "account_id", parseInt(e.target.value, 10) || 0)}
                                      >
                                        <option value="">— Select —</option>
                                        {accounts.map((a) => (
                                          <option key={a.id} value={a.id}>{a.account_id}</option>
                                        ))}
                                      </select>
                                      <button type="button" className="company-share-account-plus-btn"
                                        title={t("addNewAccount")} aria-label={t("addNewAccount")}
                                        onClick={() => handleOpenAddAccount(role)}>+</button>
                                    </div>
                                  </div>
                                  {!isProfit && (
                                    <div className="company-share-cell company-share-cell-pct">
                                      <div className="company-share-pct-wrap">
                                        <input
                                          type="number"
                                          className="share-pct-input company-share-pct-input"
                                          step="0.1" min="0" max="100"
                                          value={row.percentage !== "" ? row.percentage : ""}
                                          placeholder="0"
                                          inputMode="decimal"
                                          aria-label={t("share")}
                                          onChange={(e) => updateShareRow(role, idx, "percentage", e.target.value === "" ? "" : parseFloat(e.target.value))}
                                        />
                                        <span className="company-share-pct-suffix">%</span>
                                      </div>
                                    </div>
                                  )}
                                  <div className="company-share-cell company-share-cell-amount">
                                    <input
                                      type="text"
                                      className="company-share-amount-input"
                                      value={formatShareRowAmount2(amt.amount)}
                                      readOnly tabIndex={-1}
                                      aria-label={t("total")}
                                    />
                                  </div>
                                  <div className="company-share-cell company-share-cell-remove">
                                    <button type="button" className="company-share-remove-btn"
                                      title={t("removeRow")} aria-label={t("removeRow")}
                                      onClick={() => removeShareRow(role, idx)}>
                                      <span aria-hidden="true">&times;</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <button type="button" className="company-share-add-btn"
                            onClick={() => addShareRow(role)}>{t("addAccountInline")}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {shareAccounts.length === 0 && shareAccountsProfit.length === 0 && (
                <div className="company-settings-empty-hint">
                  {t("noLinkedAccounts")}
                </div>
              )}
            </div>
          </div>

          {/* Footer actions — 与量测图：Save 蓝 / Reset 红 / Cancel 灰 */}
          <div className="form-actions company-settings-form-actions">
            <button type="button" className="btn btn-save" disabled={submitting} onClick={() => runGuarded(handleSave)}>
              {submitting ? t("saving") : t("save")}
            </button>
            {!commissionOnly ? (
            <>
            <button type="button" className="btn btn-reset-company" onClick={handleReset}>{t("reset")}</button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
            </>
            ) : null}
          </div>
        </div>
      </div>

        {showAddAccount && (
          <AddAccountModal
            lang={lang}
            companyId={sessionCompanyId}
            companyCode={sharePickerCompanyCode}
            preferredRole={addAccountRole}
            onClose={() => setShowAddAccount(false)}
            onSuccess={() => {
              loadAccounts();
            }}
          />
        )}
      </div>
    </DomainModalPortal>
    {typeof document !== "undefined"
      ? createPortal(
          <MaintenanceCalendarPopup
            className="calendar-popup--domain-company-settings"
            monthLabels={monthLabels}
            weekdaysShort={weekdaysShort}
            clearLabel={t("clearDate")}
          />,
          document.body
        )
      : null}
    </>
  );
}
