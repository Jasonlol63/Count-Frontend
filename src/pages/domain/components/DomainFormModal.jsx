import { useState, useEffect } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { updateDomain } from "../domainApi.js";
import { notifySessionRefreshRequested } from "../../../utils/company/companySessionEvents.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";
import CompanySettingsModal from "./CompanySettingsModal.jsx";
import GroupSettingsModal from "./GroupSettingsModal.jsx";
import {
  calculateExpirationDate,
  formatDate,
  defaultFeeShareAllocations,
  ensureCompanyFeeShare,
  companyToDomainPayloadEntry,
  createEmptyGroup,
  groupFromListItem,
  companyFromListItem,
  groupToDomainPayloadEntry,
  groupToTenantSaveEntry,
  companyToTenantSaveEntry,
  tempGroupCode,
  forceUppercaseValue,
  forceNumericValue,
} from "../domainHelpers.js";
import { sanitizeEmailInput, validateEmail } from "../../../utils/input/emailValidation.js";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";
import ConfirmDeleteModal, { CONFIRM_DELETE_NESTED_Z_INDEX } from "../../../components/ConfirmDeleteModal.jsx";

function normalizeDomainCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function PasswordVisibilityIcon({ visible }) {
  return (
    <span className="dfm-password-toggle-icon" aria-hidden="true">
      <svg
        className={`dfm-password-toggle-icon__show${visible ? "" : " is-active"}`}
        viewBox="0 0 24 24"
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M12 5c-5.5 0-9.5 4.7-10.8 7 1.3 2.3 5.3 7 10.8 7s9.5-4.7 10.8-7C21.5 9.7 17.5 5 12 5zm0 11.5A4.5 4.5 0 1 1 16.5 12 4.5 4.5 0 0 1 12 16.5zm0-7A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5z"
        />
      </svg>
      <svg
        className={`dfm-password-toggle-icon__hide${visible ? " is-active" : ""}`}
        viewBox="0 0 24 24"
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M3.3 2.6 2 4l3 3.1C3.5 8.4 2.2 10 1.2 12c1.3 2.3 5.3 7 10.8 7 2 0 3.8-.6 5.4-1.5l2.8 2.8 1.3-1.4-17-17.1zM12 17.5c-4.2 0-7.6-3.2-9-5.5.7-1.2 1.8-2.7 3.2-4l1.8 1.8A4.48 4.48 0 0 0 12 16.5c.6 0 1.2-.1 1.7-.4l1.6 1.6c-.9.2-1.9.3-2.9.3zm9.8-5.5c-.5-.9-1.2-1.9-2-2.8l-1.5 1.5c.7.8 1.3 1.6 1.8 2.3-1.3 2.3-5.3 7-10.8 7-.8 0-1.5-.1-2.2-.2l-1.8 1.8c1.2.4 2.5.7 4 .7 5.5 0 9.5-4.7 10.8-7 .4-.7.7-1.4.9-2.1l2.8 2.8 1.3-1.4-4.3-4.3z"
        />
      </svg>
    </span>
  );
}

/** @returns {string|null} conflicting code if a non–group-entity company id equals a group id */
function findGroupCompanyCodeOverlap(tempGroups, tempCompanies) {
  const groupSet = new Set(tempGroups.map((g) => tempGroupCode(g)).filter(Boolean));
  for (const c of tempCompanies) {
    const cid = normalizeDomainCode(c.company_id);
    if (cid && groupSet.has(cid)) return cid;
  }
  return null;
}

/**
 * Domain Add/Edit Modal
 * Props:
 *   isEditMode      — boolean
 *   editingDomain   — domain object (for edit), null for add
 *   hasC168Context  — boolean
 *   isOwnerOrAdmin  — boolean
 *   sessionCompanyId   — number
 *   sessionCompanyCode — string
 *   domainPeriodPrices — per-period default amounts (for share calc in company settings)
 *   onClose()
 *   onSaved(domainData) — called after successful save
 */
export default function DomainFormModal({
  lang = "en",
  isEditMode, editingDomain, hasC168Context, isOwnerOrAdmin,
  sessionCompanyId, sessionCompanyCode, domainPeriodPrices,
  domains = [],
  onClose, onSaved,
}) {
  const isZh = lang === "zh";
  const t = (key, params) => getDomainText(lang, key, params);
  // Basic fields
  const [ownerCode, setOwnerCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondaryPassword, setSecondaryPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSecondaryPassword, setShowSecondaryPassword] = useState(false);
  const { submitting, guardSubmit } = useSubmitGuard(true);

  // Company / Group management
  const [tempCompanies, setTempCompanies] = useState([]);
  const [tempGroups, setTempGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [isMultipleChoiceMode, setIsMultipleChoiceMode] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [groupInput, setGroupInput] = useState("");

  const [csModalCompanyId, setCsModalCompanyId] = useState(null);
  const [gsModalGroupCode, setGsModalGroupCode] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingOwnerId, setEditingOwnerId] = useState(null);

  function toastDanger(message) {
    showDomainAlert(message, "danger");
  }

  /** Local duplicate check against all other owners in memory */
  function validateCodeGlobally(code) {
    const trimmed = String(code ?? "").trim().toUpperCase();
    if (!trimmed) return false;

    const isTaken = domains.some((d) => {
      // If editing, skip the owner currently being edited
      if (isEditMode && d.id === editingOwnerId) {
        return false;
      }

      // Check for conflict in groups
      const groupConflict = (d.groups || []).some(
        (g) => String(g.code || "").toUpperCase() === trimmed
      );
      // Check for conflict in companies
      const companyConflict = (d.companies || []).some(
        (c) => String(c.code || "").toUpperCase() === trimmed
      );

      return groupConflict || companyConflict;
    });

    if (isTaken) {
      toastDanger(t("groupIdAlreadyExists") || "ID already exists!");
      return false;
    }
    return true;
  }

  const showSecondaryPwd =
    !isEditMode || (hasC168Context && isOwnerOrAdmin);

  // On mount, load data if editing
  useEffect(() => {
    if (!isEditMode || !editingDomain) return;

    setOwnerCode(editingDomain.owner_code || "");
    setName(editingDomain.name || "");
    setEmail(editingDomain.email || "");

    const parsedOwnerId = Number(editingDomain.id);
    setEditingOwnerId(Number.isFinite(parsedOwnerId) && parsedOwnerId > 0 ? parsedOwnerId : null);

    const listGroups = Array.isArray(editingDomain.groups) ? editingDomain.groups : [];
    const listCompanies = Array.isArray(editingDomain.companies) ? editingDomain.companies : [];

    const validCompanies = listCompanies
      .filter((c) => c?.code)
      .map(companyFromListItem);
    setTempCompanies(validCompanies);

    let groups = listGroups
      .filter((g) => g?.code)
      .map(groupFromListItem);

    if (groups.length === 0) {
      const legacy = new Set();
      validCompanies.forEach((c) => {
        if (c.group_id) legacy.add(c.group_id);
      });
      groups = [...legacy].sort().map((code) => createEmptyGroup(code));
    }
    groups.sort((a, b) => tempGroupCode(a).localeCompare(tempGroupCode(b)));
    setTempGroups(groups);

    const initialGroupId =
      groups.length > 0 && validCompanies.some((c) => c.group_id)
        ? tempGroupCode(groups[0])
        : null;
    setSelectedGroupId(initialGroupId);
    setIsMultipleChoiceMode(false);
  }, [isEditMode, editingDomain]);

  // ── Company helpers ────────────────────────────────────────────────────────

  async function addCompany() {
    const cid = companyInput.trim().toUpperCase();
    if (!cid) { toastDanger(t("pleaseEnterCompanyId")); return; }
    if (tempGroups.some((g) => tempGroupCode(g) === cid)) {
      toastDanger(t("cannotAddCompanyUsesGroupId", { id: cid }));
      return;
    }
    if (tempCompanies.some((c) => normalizeDomainCode(c.company_id) === cid)) {
      toastDanger(t("companyIdAlreadyAdded"));
      return;
    }
    if (!validateCodeGlobally(cid)) return;
    const isC168 = cid === "C168";
    const today = new Date().toISOString().split("T")[0];
    const newExpDate = isC168 ? null : calculateExpirationDate("1month", today);
    const newCo = {
      company_id: cid,
      expiration_date: newExpDate,
      originalExpirationDate: newExpDate,
      startDate: today,
      isExtending: false,
      group_id: selectedGroupId || null,
      permissions: [],
      fee_share_allocations: defaultFeeShareAllocations(),
    };
    ensureCompanyFeeShare(newCo);
    setTempCompanies((prev) => [...prev, newCo]);
    setCompanyInput("");
  }

  function removeCompany(cid) {
    const code = normalizeDomainCode(cid);
    if (code === "C168") {
      toastDanger(t("cannotRemoveC168Company"));
      return;
    }
    const msg = t("confirmDeleteCompany", { cid: code });
    setDeleteConfirm({
      message: msg,
      onConfirm: () => {
        setTempCompanies((prev) => prev.filter((c) => normalizeDomainCode(c.company_id) !== code));
        showDomainAlert(t("companyRemovedFromForm", { cid: code }));
      },
    });
  }

  async function addGroup() {
    const gid = groupInput.trim().toUpperCase();
    if (!gid) { toastDanger(t("pleaseEnterGroupId")); return; }
    if (tempCompanies.some((c) => normalizeDomainCode(c.company_id) === gid)) {
      toastDanger(t("cannotAddGroupUsesCompanyId", { id: gid }));
      return;
    }
    if (tempGroups.some((g) => tempGroupCode(g) === gid)) {
      toastDanger(t("groupIdAlreadyExists"));
      return;
    }
    if (!validateCodeGlobally(gid)) return;
    setTempGroups((prev) => [...prev, createEmptyGroup(gid)]);
    setGroupInput("");
    showDomainAlert(t("groupAdded", { gid }));
  }

  function removeGroup(gid) {
    const code = tempGroupCode(gid);
    const count = tempCompanies.filter((c) => c.group_id === code).length;
    const msg = count > 0
      ? t("confirmDeleteGroupWithCount", { gid: code, count })
      : t("confirmDeleteGroup", { gid: code });
    setDeleteConfirm({
      message: msg,
      onConfirm: () => {
        setTempCompanies((prev) => prev.map((c) => c.group_id === code ? { ...c, group_id: null } : c));
        setTempGroups((prev) => prev.filter((g) => tempGroupCode(g) !== code));
        if (selectedGroupId === code) { setSelectedGroupId(null); setIsMultipleChoiceMode(false); }
        showDomainAlert(t("groupRemoved", { gid: code }));
      },
    });
  }

  function selectGroup(gid) {
    const code = tempGroupCode(gid);
    setSelectedGroupId((prev) => prev === code ? null : code);
    setIsMultipleChoiceMode(false);
  }

  function toggleMultipleChoice() {
    if (!selectedGroupId) { toastDanger(t("pleaseSelectGroupFirst")); return; }
    setIsMultipleChoiceMode((prev) => !prev);
  }

  function toggleCompanyGroup(cid) {
    if (!selectedGroupId) return;
    setTempCompanies((prev) => prev.map((c) =>
      c.company_id === cid
        ? { ...c, group_id: c.group_id === selectedGroupId ? null : selectedGroupId }
        : c
    ));
  }

  /** 多选：对当前列表内公司全部归入 / 撤出当前分组 */
  function toggleAssignSelectAll(candidateRows) {
    if (!selectedGroupId || candidateRows.length === 0) return;
    const allIn = candidateRows.every((c) => c.group_id === selectedGroupId);
    const idsInFilter = new Set(candidateRows.map((c) => c.company_id));
    setTempCompanies((prev) =>
      prev.map((c) => {
        if (!idsInFilter.has(c.company_id)) return c;
        if (allIn) {
          return c.group_id === selectedGroupId ? { ...c, group_id: null } : c;
        }
        return { ...c, group_id: selectedGroupId };
      })
    );
  }

  // ── Company Settings sub-modal callbacks ──────────────────────────────────

  function openCompanySettings(cid) {
    setCsModalCompanyId(cid);
  }

  function openGroupSettings(code) {
    setGsModalGroupCode(tempGroupCode(code));
  }

  function handleGroupSettingsSaved(updatedGroup) {
    const prevCode = tempGroupCode(updatedGroup.previous_group_code ?? gsModalGroupCode);
    const newCode = tempGroupCode(updatedGroup);
    setTempGroups((prev) =>
      prev.map((g) =>
        tempGroupCode(g) === prevCode
          ? { ...g, ...updatedGroup, group_code: newCode }
          : g
      )
    );
    if (prevCode && newCode && prevCode !== newCode) {
      setTempCompanies((prev) =>
        prev.map((c) => (c.group_id === prevCode ? { ...c, group_id: newCode } : c))
      );
      if (selectedGroupId === prevCode) {
        setSelectedGroupId(newCode);
      }
    }
    setGsModalGroupCode(null);
  }

  function handleCompanySettingsSaved(updatedCo) {
    const prevId = normalizeDomainCode(updatedCo.previous_company_id ?? csModalCompanyId);
    const newId = normalizeDomainCode(updatedCo.company_id);
    setTempCompanies((prev) =>
      prev.map((c) =>
        normalizeDomainCode(c.company_id) === prevId
          ? { ...c, ...updatedCo, company_id: newId }
          : c
      )
    );
    setCsModalCompanyId(null);
  }

  // ── Form submit ────────────────────────────────────────────────────────────

  function buildGroupsPayload() {
    return [...tempGroups]
      .sort((a, b) => tempGroupCode(a).localeCompare(tempGroupCode(b)))
      .map(groupToDomainPayloadEntry);
  }

  function buildCompaniesPayload() {
    return [...tempCompanies]
      .sort((a, b) => a.company_id.toUpperCase().localeCompare(b.company_id.toUpperCase()))
      .map(companyToDomainPayloadEntry);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) {
      toastDanger(t("invalidEmailFormat"));
      return;
    }
    const overlap = findGroupCompanyCodeOverlap(tempGroups, tempCompanies);
    if (overlap) {
      toastDanger(t("groupCompanyIdOverlapSave", { id: overlap }));
      return;
    }

    if (isEditMode && (editingOwnerId == null || editingOwnerId <= 0)) {
      toastDanger(t("operationFailed"));
      return;
    }

    try {
      let json;

      if (isEditMode) {
        json = await updateDomain({
          id: editingOwnerId,
          ownerCode,
          name,
          email: emailCheck.normalized,
          password: password || undefined,
          secondaryPassword: secondaryPassword || undefined,
          groups: buildGroupsPayload().map(groupToTenantSaveEntry),
          companies: buildCompaniesPayload().map(companyToTenantSaveEntry),
        });
      } else {
        const res = await fetch(buildApiUrl("api/domain/add"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_code: ownerCode,
            name,
            email: emailCheck.normalized,
            password,
            secondary_password: secondaryPassword,
            groups: buildGroupsPayload().map(groupToTenantSaveEntry),
            companies: buildCompaniesPayload().map(companyToTenantSaveEntry),
          }),
        });
        json = await res.json();
      }

      if (json.success) {
        showDomainAlert(isEditMode ? t("ownerUpdated") : t("ownerCreated"));
        onSaved(json.data);
        notifySessionRefreshRequested();
        onClose();
      } else {
        toastDanger(json.message || t("operationFailed"));
      }
    } catch {
      toastDanger(t("saveOwnerError"));
    }
  }

  // ── Company display ────────────────────────────────────────────────────────

  function renderCompanyList() {
    let filtered;
    if (selectedGroupId) {
      filtered = tempCompanies.filter((c) => c.group_id === selectedGroupId);
    } else {
      filtered = [...tempCompanies];
    }

    if (isMultipleChoiceMode && selectedGroupId) {
      const pool = tempCompanies
        .filter((c) => !c.group_id || c.group_id === selectedGroupId)
        .sort((a, b) => a.company_id.localeCompare(b.company_id));

      if (pool.length === 0) {
        return <span className="dfm-empty-hint">{t("noUngroupedCompaniesAvailable")}</span>;
      }

      const allAssigned =
        pool.length > 0 && pool.every((c) => c.group_id === selectedGroupId);

      return (
        <div className="dfm-assign-mc-stack">
          <label className="dfm-assign-mc-select-all">
            <input
              type="checkbox"
              className="dfm-assign-ref-checkbox dfm-assign-select-all-checkbox"
              checked={allAssigned}
              onChange={() => toggleAssignSelectAll(pool)}
            />
            <span>{t("selectAll")}</span>
          </label>
          <div className="dfm-assign-mc-list">
            {pool.map((c) => (
              <div key={c.company_id} className="company-item dfm-assign-mc-row">
                <div className="company-item-left">
                  <input
                    type="checkbox"
                    id={`dfm-mc-${c.company_id}`}
                    className="dfm-assign-ref-checkbox dfm-assign-row-checkbox"
                    checked={c.group_id === selectedGroupId}
                    onChange={() => toggleCompanyGroup(c.company_id)}
                  />
                  <label className="dfm-assign-mc-name" htmlFor={`dfm-mc-${c.company_id}`}>
                    {c.company_id}
                  </label>
                </div>
                <div className="company-item-right">
                  <span className="exp-date-display">
                    {c.expiration_date ? formatDate(c.expiration_date) : t("notSet")}
                  </span>
                  <button
                    type="button"
                    className="company-reset-btn"
                    onClick={() => openCompanySettings(c.company_id)}
                    title={t("setExpirationDate")}
                  >
                    {t("set")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const sorted = [...filtered].sort((a, b) => a.company_id.localeCompare(b.company_id));
    if (sorted.length === 0) {
      const msg = selectedGroupId
        ? t("noCompaniesInGroup", { gid: selectedGroupId })
        : t("noUngroupedCompanies");
      return <span className="dfm-empty-hint">{msg}</span>;
    }

    return sorted.map((c) => (
      <div key={c.company_id} className="company-item">
        <div className="company-item-left">
          <span>{c.company_id}</span>
        </div>
        <div className="company-item-right">
          <span className="exp-date-display">
            {c.expiration_date ? formatDate(c.expiration_date) : t("notSet")}
          </span>
          <button
            type="button"
            className="company-reset-btn"
            onClick={() => openCompanySettings(c.company_id)}
            title={t("setExpirationDate")}
          >
            {t("set")}
          </button>
          <button type="button" className="company-remove-btn" onClick={() => removeCompany(c.company_id)}>
            {t("remove")}
          </button>
        </div>
      </div>
    ));
  }

  const csCompany = csModalCompanyId
    ? tempCompanies.find((c) => c.company_id === csModalCompanyId)
    : null;

  const gsGroup = gsModalGroupCode
    ? tempGroups.find((g) => tempGroupCode(g) === gsModalGroupCode)
    : null;

  function renderSelectedGroupsList() {
    if (tempGroups.length === 0) {
      return <span className="dfm-empty-hint">{t("noGroupsAddedYet")}</span>;
    }
    const sorted = [...tempGroups].sort((a, b) =>
      tempGroupCode(a).localeCompare(tempGroupCode(b))
    );
    return sorted.map((g) => {
      const code = tempGroupCode(g);
      const count = tempCompanies.filter((c) => c.group_id === code).length;
      return (
        <div key={code} className="company-item">
          <div className="company-item-left">
            <span>{code}</span>
            <span className="dfm-group-co-count text-slate-500"> ({count})</span>
          </div>
          <div className="company-item-right">
            <span className="exp-date-display">
              {g.expiration_date ? formatDate(g.expiration_date) : t("notSet")}
            </span>
            <button
              type="button"
              className="company-reset-btn"
              onClick={() => openGroupSettings(code)}
              title={t("setExpirationDate")}
            >
              {t("set")}
            </button>
            <button type="button" className="company-remove-btn" onClick={() => removeGroup(code)}>
              {t("remove")}
            </button>
          </div>
        </div>
      );
    });
  }

  const showMcAssignPanel = isMultipleChoiceMode && selectedGroupId;
  const multiChoiceToggle =
    selectedGroupId ? (
      <button
        type="button"
        className={`dfm-multi-choice-btn ${
          isMultipleChoiceMode ? "dfm-multi-choice-btn--on" : "dfm-multi-choice-btn--off"
        }`}
        aria-pressed={isMultipleChoiceMode}
        onClick={toggleMultipleChoice}
      >
        {isMultipleChoiceMode ? (
          <span className="dfm-mc-done-content">
            <span>{t("doneCompact")}</span>
            <span className="dfm-mc-done-icon" aria-hidden="true">
              <span className="dfm-mc-done-icon-check" />
            </span>
          </span>
        ) : (
          t("multipleChoice")
        )}
      </button>
    ) : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DomainModalPortal>
      {/* z-index fixed inline: production Tailwind 若未抽出 arbitrary z-[50001]，弹窗可能在 #root/sidebar 下不可见 */}
      <div
        className="domain-form-modal-backdrop"
        style={{
          display: "block",
          position: "fixed",
          inset: 0,
          zIndex: 2147483000,
          overflowY: "auto",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      >
        <div className="domain-form-modal-panel relative mx-auto my-[1vh] flex w-[98%] max-w-[1400px] flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
          <div className="dfm-header flex items-center justify-between border-b border-gray-300 bg-[#f4f5f7] px-9 py-[18px]">
            <h2 className="m-0 bg-transparent p-0 text-xl font-bold text-black">{isEditMode ? t("editDomain") : t("addDomain")}</h2>
            <button type="button" className="account-close" onClick={onClose} aria-label="Close" />
          </div>
          <form className="domain-form-modal-form flex flex-col bg-white" onSubmit={guardSubmit(handleSubmit)}>
            <input type="hidden" value={isEditMode ? (editingOwnerId ?? "") : ""} />
            <div className="domain-form-modal-body px-9 py-6">
              {/* DOMAIN INFORMATION — 全宽上下布局（对齐设计图） */}
              <section className="dfm-section-block">
                <div className="dfm-section-heading">{t("domainInformation")}</div>
                <div className="dfm-section-divider h-[2.5px] w-full bg-blue-900" />
                <div className={`dfm-domain-grid${showSecondaryPwd ? "" : " dfm-domain-grid--no-secondary"}`}>
                    <div className="dfm-field dfm-field--owner-code">
                      <label htmlFor="df_owner_code">{t("ownerCode")} *</label>
                      <input
                        type="text" id="df_owner_code" required className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                        value={ownerCode}
                        disabled={isEditMode}
                        onChange={(e) => setOwnerCode(forceUppercaseValue(e.target.value))}
                      />
                    </div>
                    <div className="dfm-field dfm-field--name">
                      <label htmlFor="df_name">{t("name")} *</label>
                      <input
                        type="text" id="df_name" required className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                        value={name}
                        onChange={(e) => setName(forceUppercaseValue(e.target.value))}
                      />
                    </div>
                    <div className="dfm-field dfm-field--email">
                      <label htmlFor="df_email">{t("email")} *</label>
                      <input
                        type="text"
                        id="df_email"
                        inputMode="email"
                        autoComplete="email"
                        spellCheck={false}
                        required
                        className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                        value={email}
                        onChange={(e) => setEmail(sanitizeEmailInput(e.target.value))}
                      />
                    </div>
                    <div className="dfm-field dfm-field--password">
                      <label htmlFor="df_password">{t("password")} {!isEditMode && "*"}</label>
                      <div className="dfm-password-wrap">
                        <input
                          type="text"
                          id="df_password"
                          className={`min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10${showPassword ? "" : " dfm-password-masked"}`}
                          required={!isEditMode}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="new-password"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          className="dfm-password-toggle"
                          aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                          aria-pressed={showPassword}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.preventDefault();
                            setShowPassword((v) => !v);
                          }}
                        >
                          <PasswordVisibilityIcon visible={showPassword} />
                        </button>
                      </div>
                    </div>
                    {showSecondaryPwd && (
                      <div className="dfm-field dfm-field--secondary-pwd">
                        <label htmlFor="df_secondary_pwd">
                          {t("secondaryPassword")} {!isEditMode && "*"}
                        </label>
                        <div className="dfm-password-wrap">
                          <input
                            type="text"
                            id="df_secondary_pwd"
                            className={`min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10${showSecondaryPassword ? "" : " dfm-password-masked"}`}
                            maxLength={6}
                            pattern="[0-9]{6}"
                            placeholder={isEditMode ? t("leaveEmptyKeepCurrentPassword") : t("sixDigitsOnly")}
                            required={!isEditMode}
                            value={secondaryPassword}
                            onChange={(e) => setSecondaryPassword(forceNumericValue(e.target.value))}
                            autoComplete="off"
                            inputMode="numeric"
                            spellCheck={false}
                          />
                          <button
                            type="button"
                            className="dfm-password-toggle"
                            aria-label={showSecondaryPassword ? t("hidePassword") : t("showPassword")}
                            aria-pressed={showSecondaryPassword}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.preventDefault();
                              setShowSecondaryPassword((v) => !v);
                            }}
                          >
                            <PasswordVisibilityIcon visible={showSecondaryPassword} />
                          </button>
                        </div>
                        <small className="dfm-helper-text">{t("secondaryPwdRequirement")}</small>
                      </div>
                    )}
                </div>
              </section>

              {/* COMPANY INFORMATION — 全宽，位于 Domain 下方 */}
              <section className="dfm-section-block dfm-section-block--company">
                <div className="dfm-section-heading">{t("companyInformation")}</div>
                <div className="dfm-section-divider h-[2.5px] w-full bg-blue-900" />
                <div className="dfm-company-section">
                  <div className="dfm-company-grid-row1">
                    <div className="dfm-field dfm-field--group-input">
                      <label htmlFor="df_group_input">{t("groupIdLabel")}</label>
                      <div className="dfm-input-with-btn flex min-w-0">
                        <input
                          type="text"
                          id="df_group_input"
                          placeholder={t("groupIdPlaceholder")}
                          className="min-h-[42px] flex-1 rounded-l-lg rounded-r-none border border-r-0 border-gray-300 px-3.5 py-2.5 text-[15px] uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                          value={groupInput}
                          onChange={(e) => setGroupInput(forceUppercaseValue(e.target.value))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
                        />
                        <button type="button" className="dfm-adjoin-btn rounded-r-lg border-0 bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] px-4 text-[15px] font-semibold text-white transition-all hover:bg-[linear-gradient(180deg,#0D60FF_0%,#63C4FF_100%)] sm:px-5" onClick={addGroup}>{t("add")}</button>
                      </div>
                    </div>
                    <div className="dfm-field dfm-field--company-input">
                      <label htmlFor="df_company_input">{t("companyIdLabel")}</label>
                      <div className="dfm-input-with-btn flex min-w-0">
                        <input
                          type="text"
                          id="df_company_input"
                          placeholder={t("companyIdPlaceholder")}
                          className="min-h-[42px] flex-1 rounded-l-lg rounded-r-none border border-r-0 border-gray-300 px-3.5 py-2.5 text-[15px] uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                          value={companyInput}
                          onChange={(e) => setCompanyInput(forceUppercaseValue(e.target.value))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompany(); } }}
                        />
                        <button type="button" className="dfm-adjoin-btn rounded-r-lg border-0 bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] px-4 text-[15px] font-semibold text-white transition-all hover:bg-[linear-gradient(180deg,#0D60FF_0%,#63C4FF_100%)] sm:px-5" onClick={addCompany}>{t("add")}</button>
                      </div>
                    </div>
                    <div className="dfm-field dfm-field--group-pills" id="groupPillsSection">
                      <label>{t("groupLabel")}</label>
                      <div className="group-pills">
                        {tempGroups.length === 0
                          ? <span className="dfm-empty-hint">{t("noGroupsCreated")}</span>
                          : tempGroups.map((g) => {
                            const code = tempGroupCode(g);
                            const count = tempCompanies.filter((c) => c.group_id === code).length;
                            return (
                              <span
                                key={code}
                                role="button"
                                tabIndex={0}
                                className={`group-pill ${selectedGroupId === code ? "active" : ""}`}
                                onClick={() => selectGroup(code)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    selectGroup(code);
                                  }
                                }}
                              >
                                {code} ({count})
                                <span
                                  className="remove-x"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeGroup(code);
                                  }}
                                >
                                  &times;
                                </span>
                              </span>
                            );
                          })
                        }
                      </div>
                    </div>
                  </div>

                  <div className="dfm-company-grid-row2">
                    <div className="dfm-row2-head dfm-row2-head--groups">
                      <span className="dfm-selected-companies-label">{t("selectedGroups")}</span>
                    </div>
                    <div className="dfm-row2-head dfm-row2-head--companies">
                      <span className="dfm-selected-companies-label">{t("selectedCompanies")}</span>
                      {!showMcAssignPanel && multiChoiceToggle}
                    </div>

                    <div className="dfm-field dfm-field--selected-groups flex flex-1 flex-col">
                      <div className="dfm-selected-list dfm-selected-list--groups">
                        {renderSelectedGroupsList()}
                      </div>
                    </div>

                    <div className="dfm-field dfm-field--stretch dfm-field--selected-companies flex flex-1 flex-col">
                      <div
                        className={`dfm-selected-list${showMcAssignPanel ? " dfm-selected-list--mc-mode" : ""}`}
                      >
                        {showMcAssignPanel && (
                          <div className="dfm-mc-panel-head">
                            <span className="dfm-selected-companies-label">{t("selectedCompanies")}</span>
                            {multiChoiceToggle}
                          </div>
                        )}
                        {tempCompanies.length === 0 ? (
                          <span className="dfm-empty-hint">{t("noCompaniesAddedYet")}</span>
                        ) : (
                          renderCompanyList()
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
            <div className="dfm-footer-actions">
              <button type="submit" className="btn btn-save" disabled={submitting}>
                {submitting ? t("saving") : t("confirm")}
              </button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
            </div>
          </form>
        </div>
      </div>

      {/* Company Settings sub-modal */}
      {csCompany && (
        <CompanySettingsModal
          lang={lang}
          company={csCompany}
          domainPeriodPrices={domainPeriodPrices}
          sessionCompanyId={sessionCompanyId}
          sessionCompanyCode={sessionCompanyCode}
          excludeOwnerId={isEditMode ? editingOwnerId : null}
          siblingGroupCodes={tempGroups.map(tempGroupCode)}
          siblingCompanyCodes={tempCompanies
            .filter((c) => normalizeDomainCode(c.company_id) !== normalizeDomainCode(csModalCompanyId))
            .map((c) => normalizeDomainCode(c.company_id))}
          persistImmediately={isEditMode}
          onSave={handleCompanySettingsSaved}
          onClose={() => setCsModalCompanyId(null)}
        />
      )}
      {gsGroup && (
        <GroupSettingsModal
          lang={lang}
          group={gsGroup}
          domainPeriodPrices={domainPeriodPrices}
          sessionCompanyId={sessionCompanyId}
          sessionCompanyCode={sessionCompanyCode}
          excludeOwnerId={isEditMode ? editingOwnerId : null}
          siblingGroupCodes={tempGroups
            .filter((g) => tempGroupCode(g) !== gsModalGroupCode)
            .map(tempGroupCode)}
          siblingCompanyCodes={tempCompanies.map((c) => normalizeDomainCode(c.company_id))}
          persistImmediately={isEditMode}
          onSave={handleGroupSettingsSaved}
          onClose={() => setGsModalGroupCode(null)}
        />
      )}
      {deleteConfirm && (
        <ConfirmDeleteModal
          open
          title={t("confirmDeleteTitle")}
          message={deleteConfirm.message}
          cancelLabel={t("cancel")}
          confirmLabel={t("delete")}
          zIndex={CONFIRM_DELETE_NESTED_Z_INDEX}
          onConfirm={() => {
            deleteConfirm.onConfirm?.();
            setDeleteConfirm(null);
          }}
          onClose={() => setDeleteConfirm(null)}
        />
      )}
    </DomainModalPortal>
  );
}
