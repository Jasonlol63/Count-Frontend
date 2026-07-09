import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { accountCompanyPickerZIndex, accountModalOverlayZIndex } from "../../../components/ProcessModalPortal.jsx";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";

/** Inline so first paint is 3-column even if extracted CSS applies one frame late */
const modalBodyStyle = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  width: "100%",
};

const userModalCardStyle = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  alignItems: "stretch",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
  width: "100%",
};

function getPermissionLabel(key, t) {
  if (key === "home") return t("permHome");
  if (key === "admin") return t("permAdmin");
  if (key === "ownership") return t("permOwnership");
  if (key === "datacapture") return t("dataCapture");
  if (key === "payment") return t("transactionPayment");
  if (key === "report") return t("permReport");
  if (key === "maintenance") return t("permMaintenance");
  if (key === "account") return t("account");
  if (key === "process") return t("process");
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Large screens: inline checklist; laptop/tablet: same UI inside permission picker modal */
function PermissionChecklist({ className, permissionsLocked, permDisabledMap, permSelected, setPermSelected, t }) {
  return (
    <div className={className}>
      {PERMISSION_KEYS.map((key) => (
        <div key={key} className="permission-item" style={{ opacity: permDisabledMap[key] ? 0.6 : 1 }}>
          <label className="permission-label">
            <input
              type="checkbox"
              className="permission-checkbox"
              disabled={permissionsLocked || permDisabledMap[key]}
              checked={permSelected.has(key)}
              onChange={(e) => {
                const on = e.target.checked;
                setPermSelected((prev) => {
                  const n = new Set(prev);
                  if (on) n.add(key);
                  else n.delete(key);
                  return n;
                });
              }}
            />
            <span className="permission-name">
              <svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24">
                <path d={PERMISSION_ICONS[key]} />
              </svg>
              {getPermissionLabel(key, t)}
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}

function PermissionBulkActions({ className, permissionsLocked, permDisabledMap, setPermSelected, t }) {
  return (
    <div className={className}>
      <button
        type="button"
        className="btn-secondary btn-select-all"
        disabled={permissionsLocked}
        onClick={() => {
          const n = new Set();
          PERMISSION_KEYS.forEach((k) => {
            if (!permDisabledMap[k]) n.add(k);
          });
          setPermSelected(n);
        }}
      >
        {t("selectAll")}
      </button>
      <button type="button" className="btn-clearall" disabled={permissionsLocked} onClick={() => setPermSelected(new Set())}>
        {t("clearAll")}
      </button>
    </div>
  );
}

function ReadOnlyToggleInline({ readOnlyToggleCanInteract, pageReadOnlyLock, form, setForm, t }) {
  return (
    <span
      className="read-only-toggle-inline read-only-toggle-after-title"
      style={{
        opacity: readOnlyToggleCanInteract && !pageReadOnlyLock ? 1 : 0.6,
      }}
    >
      <span className="read-only-label">{t("readOnly")}</span>
      <label
        className="toggle-switch"
        style={{
          cursor: readOnlyToggleCanInteract && !pageReadOnlyLock ? "pointer" : "not-allowed",
        }}
      >
        <input
          type="checkbox"
          checked={form.read_only}
          disabled={!readOnlyToggleCanInteract}
          onChange={(e) => setForm((f) => ({ ...f, read_only: e.target.checked }))}
        />
        <span className="toggle-slider" />
      </label>
    </span>
  );
}

const userModalColStyle = {
  flex: "1 1 0%",
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
import {
  PERMISSION_KEYS,
  PERMISSION_ICONS,
  ALL_ROLE_OPTIONS,
  formatRoleLabel,
  normRole,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
  roleHasReadOnlyToggle,
  canInteractWithReadOnlyToggle,
  isUserModalPageReadOnlyLock,
} from "../userListLogic.js";
import { sanitizeEmailInput } from "../../../utils/input/emailValidation.js";

export default function UserModal({
  open,
  onClose,
  isEditMode,
  editingRow,
  form,
  setForm,
  isC168Company,
  currentUserRole,
  roleSelectDisabled,
  loginDisabled,
  fieldLocks,
  permDisabledMap,
  permSelected,
  setPermSelected,
  modalCompanies,
  selectedCompanyIds,
  setSelectedCompanyIds,
  groupPickerMode = false,
  dualTenantPicker = false,
  modalGroupCompanies = [],
  modalSubsidiaryCompanies = [],
  selectedGroupIds = [],
  setSelectedGroupIds,
  modalAccounts,
  selectedAccountIds,
  setSelectedAccountIds,
  modalProcesses,
  selectedProcessIds,
  setSelectedProcessIds,
  applyPermTemplate,
  onSave,
  sessionMutationsBlocked = false,
  currentUserId = null,
  t,
}) {
  const cardRef = useRef(null);
  const modalBodyRef = useRef(null);
  const accountGridRef = useRef(null);
  const processGridRef = useRef(null);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [permissionPickerOpen, setPermissionPickerOpen] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [bulkSelectionSettling, setBulkSelectionSettling] = useState(false);
  const bulkSelectionTimerRef = useRef(null);
  const { submitting, guardSubmit } = useSubmitGuard(open);

  useEffect(() => {
    if (!open) return undefined;

    const clearMinHeights = (gridEl) => {
      if (!gridEl) return;
      gridEl.querySelectorAll(".user-modal-select-card").forEach((el) => {
        el.style.minHeight = "";
      });
    };

    const syncGridCardHeights = (gridEl) => {
      if (!gridEl) return;
      const cards = gridEl.querySelectorAll(".user-modal-select-card");
      if (!cards.length) return;
      cards.forEach((c) => {
        c.style.minHeight = "";
      });
      let maxH = 0;
      cards.forEach((c) => {
        maxH = Math.max(maxH, c.getBoundingClientRect().height);
      });
      const px = maxH > 0 ? `${Math.ceil(maxH)}px` : "";
      if (!px) return;
      cards.forEach((c) => {
        c.style.minHeight = px;
      });
    };

    const syncAll = () => {
      syncGridCardHeights(accountGridRef.current);
      syncGridCardHeights(processGridRef.current);
    };

    syncAll();
    const r1 = requestAnimationFrame(() => {
      syncAll();
    });

    const ro = new ResizeObserver(() => {
      syncAll();
    });
    if (accountGridRef.current) ro.observe(accountGridRef.current);
    if (processGridRef.current) ro.observe(processGridRef.current);
    window.addEventListener("resize", syncAll);

    return () => {
      cancelAnimationFrame(r1);
      ro.disconnect();
      window.removeEventListener("resize", syncAll);
      clearMinHeights(accountGridRef.current);
      clearMinHeights(processGridRef.current);
    };
  }, [open, modalAccounts, modalProcesses]);

  useEffect(() => {
    return () => {
      if (bulkSelectionTimerRef.current) clearTimeout(bulkSelectionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const forceReflow = () => {
      const nodes = [modalBodyRef.current, cardRef.current];
      nodes.forEach((el) => {
        if (el) void el.getBoundingClientRect();
      });
    };
    forceReflow();
    const a = requestAnimationFrame(() => {
      forceReflow();
      requestAnimationFrame(() => {
        forceReflow();
      });
    });
    return () => cancelAnimationFrame(a);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCompanyPickerOpen(false);
      setPermissionPickerOpen(false);
      setCompanySearchQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!companyPickerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setCompanyPickerOpen(false);
        setCompanySearchQuery("");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [companyPickerOpen]);

  useEffect(() => {
    if (!permissionPickerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setPermissionPickerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [permissionPickerOpen]);

  useEffect(() => {
    if (!permissionPickerOpen) return undefined;
    const mq = window.matchMedia("(min-width: 1201px)");
    const closeIfDesktop = () => {
      if (mq.matches) setPermissionPickerOpen(false);
    };
    closeIfDesktop();
    mq.addEventListener("change", closeIfDesktop);
    return () => mq.removeEventListener("change", closeIfDesktop);
  }, [permissionPickerOpen]);

  const accountIdList = useMemo(() => modalAccounts.map((x) => Number(x.id)), [modalAccounts]);
  const processIdList = useMemo(() => modalProcesses.map((x) => Number(x.id)), [modalProcesses]);

  const runBulkSelection = (update) => {
    if (bulkSelectionTimerRef.current) clearTimeout(bulkSelectionTimerRef.current);
    setBulkSelectionSettling(true);
    update();
    bulkSelectionTimerRef.current = setTimeout(() => setBulkSelectionSettling(false), 120);
  };

  const getCompanyPickerLabel = (companyRow) => {
    if (groupPickerMode) return String(companyRow?.group_id || "").trim().toUpperCase();
    return String(companyRow?.company_id || companyRow?.group_id || "").trim().toUpperCase();
  };

  const pickerGroupRows = dualTenantPicker ? modalGroupCompanies : groupPickerMode ? modalCompanies : [];
  const pickerCompanyRows = dualTenantPicker ? modalSubsidiaryCompanies : groupPickerMode ? [] : modalCompanies;

  const selectedGroupLabels = useMemo(() => {
    if (!dualTenantPicker) return [];
    const set = new Set(selectedGroupIds.map(Number));
    return pickerGroupRows
      .filter((c) => set.has(Number(c.id)))
      .map((c) => String(c?.group_id || c?.company_id || "").trim().toUpperCase())
      .filter(Boolean);
  }, [dualTenantPicker, pickerGroupRows, selectedGroupIds]);

  const selectedCompanyLabels = useMemo(() => {
    const set = new Set(selectedCompanyIds.map(Number));
    const rows = dualTenantPicker ? pickerCompanyRows : modalCompanies;
    return rows
      .filter((c) => set.has(Number(c.id)))
      .map((c) => getCompanyPickerLabel(c))
      .filter(Boolean);
  }, [modalCompanies, pickerCompanyRows, selectedCompanyIds, groupPickerMode, dualTenantPicker]);

  const assignmentSummaryText = useMemo(() => {
    if (dualTenantPicker) {
      const left = selectedGroupLabels.join(", ");
      const right = selectedCompanyLabels.join(", ");
      if (left && right) return `${left} | ${right}`;
      return left || right || "";
    }
    return selectedCompanyLabels.join(", ");
  }, [dualTenantPicker, selectedGroupLabels, selectedCompanyLabels]);

  const filterPickerRows = (rows, useGroupLabel) => {
    const q = companySearchQuery.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const label = useGroupLabel
        ? String(c?.group_id || c?.company_id || "").trim().toUpperCase()
        : getCompanyPickerLabel(c);
      return label.includes(q);
    });
  };

  const groupPickerFiltered = useMemo(
    () => filterPickerRows(pickerGroupRows, true),
    [pickerGroupRows, companySearchQuery]
  );

  const companyPickerFiltered = useMemo(
    () => filterPickerRows(pickerCompanyRows, false),
    [pickerCompanyRows, companySearchQuery, groupPickerMode]
  );

  const showProcessColumn = dualTenantPicker ? selectedCompanyIds.length > 0 : !groupPickerMode;

  const selectedPermissionLabels = useMemo(
    () => PERMISSION_KEYS.filter((k) => permSelected.has(k)).map((k) => getPermissionLabel(k, t)),
    [permSelected, t]
  );

  const readOnlyToggleVisible = !editingRow?.is_owner_shadow && roleHasReadOnlyToggle(form.role);
  const readOnlyToggleCanInteract = canInteractWithReadOnlyToggle(currentUserRole, form.role);
  const pageReadOnlyLock =
    Boolean(sessionMutationsBlocked) ||
    isUserModalPageReadOnlyLock(isEditMode, editingRow, form.role, form.read_only, currentUserId);

  useEffect(() => {
    if (!open || !pageReadOnlyLock) return;
    setCompanyPickerOpen(false);
    setPermissionPickerOpen(false);
    setCompanySearchQuery("");
  }, [open, pageReadOnlyLock]);

  const permissionsLocked = fieldLocks.sidebar || !!editingRow?.is_owner_shadow || pageReadOnlyLock;
  const showSecondaryPassword = isC168Company || !!editingRow?.is_owner_shadow;

  const userModalShell = (
    <div id="userModal" className="modal" style={{ display: open ? "block" : "none", zIndex: accountModalOverlayZIndex }} aria-hidden={!open}>
      <div className={`modal-content user-modal-content${isEditMode ? " edit-mode" : ""}`}>
        <div className="modal-header-bar">
          <h2 id="modalTitle">{isEditMode ? (editingRow?.is_owner_shadow ? t("editOwner") : t("editUser")) : t("addUser")}</h2>
          <button type="button" className="btn-back" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t("back")}
          </button>
        </div>
        <div ref={modalBodyRef} className="modal-body" style={modalBodyStyle}>
          <div ref={cardRef} className="user-modal-card" style={userModalCardStyle}>
            <div className="user-modal-col user-modal-col--info user-info-panel" style={userModalColStyle}>
              <h3 className="user-modal-col-title">{t("userInformation")}</h3>
              <form id="userForm" onSubmit={guardSubmit(onSave)}>
              <div className="user-info-grid">
                <div className="user-info-field-row">
                  <div className="form-group user-info-field">
                    <label htmlFor="login_id">{t("loginId")} *</label>
                    <input
                      id="login_id"
                      required
                      disabled={loginDisabled || pageReadOnlyLock}
                      value={form.login_id}
                      onChange={(e) => setForm((f) => ({ ...f, login_id: e.target.value.toUpperCase() }))}
                    />
                  </div>
                </div>
                {showSecondaryPassword ? (
                  <div className="form-group user-info-field password-row-container password-row-container--split">
                    <div className="password-field-wrapper">
                      <label htmlFor="password">{isEditMode ? t("password") : t("passwordRequiredMark")}</label>
                      <input id="password" type="password" disabled={pageReadOnlyLock} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                    </div>
                    <div className="password-field-wrapper">
                      <label htmlFor="secondary_password">{t("secondaryPassword")}</label>
                      <input
                        id="secondary_password"
                        type="password"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        placeholder={t("secondaryPasswordPlaceholder")}
                        disabled={pageReadOnlyLock}
                        value={form.secondary_password}
                        onChange={(e) => setForm((f) => ({ ...f, secondary_password: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="form-group user-info-field">
                    <label htmlFor="password">{isEditMode ? t("password") : t("passwordRequiredMark")}</label>
                    <input id="password" type="password" disabled={pageReadOnlyLock} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                  </div>
                )}
                <div className="user-info-field-row">
                  <div className="form-group user-info-field">
                    <label htmlFor="name">{t("nameRequired")}</label>
                    <input id="name" required disabled={fieldLocks.name || pageReadOnlyLock} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))} />
                  </div>
                  <div className="form-group user-info-field">
                    <label htmlFor="role">{t("roleRequired")}</label>
                    <select id="role" required disabled={roleSelectDisabled || fieldLocks.role || pageReadOnlyLock} value={form.role} onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, role: v }));
                      applyPermTemplate(v, true);
                    }}>
                      <option value="">{t("selectRole")}</option>
                      {editingRow?.is_owner_shadow ? (
                        <option value="owner">Owner</option>
                      ) : (
                        <>
                          {(isEditMode ? getAvailableRolesForEdit(currentUserRole, editingRow?.role) : getAvailableRolesForCreation(currentUserRole)).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                          {isEditMode && form.role && !getAvailableRolesForEdit(currentUserRole, editingRow?.role).find((x) => x.value === form.role) ? (
                            <option value={form.role}>{formatRoleLabel(form.role)}</option>
                          ) : null}
                        </>
                      )}
                    </select>
                  </div>
                </div>
                <div className="form-group user-info-field">
                  <label htmlFor="email">{t("emailRequired")}</label>
                  <input
                    id="email"
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    required
                    disabled={fieldLocks.email || pageReadOnlyLock}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: sanitizeEmailInput(e.target.value) }))}
                  />
                </div>
                {(currentUserRole === "admin" || currentUserRole === "owner") && (
                  <div className="form-group user-info-field company-field-group">
                    <div className="user-modal-company-heading-row">
                      <label id="user-modal-company-trigger-label" htmlFor="user-modal-company-open-btn">
                        {dualTenantPicker
                          ? t("groupCompanyRequired")
                          : groupPickerMode
                            ? t("groupRequired")
                            : t("companyRequired")}
                      </label>
                      <button
                        id="user-modal-company-open-btn"
                        type="button"
                        className="user-modal-company-open-btn"
                        disabled={fieldLocks.company || !!editingRow?.is_owner_shadow || pageReadOnlyLock}
                        onClick={() => {
                          setCompanySearchQuery("");
                          setCompanyPickerOpen(true);
                        }}
                      >
                        {dualTenantPicker
                          ? t("selectGroupCompany")
                          : groupPickerMode
                            ? t("selectGroups")
                            : t("selectCompanies")}
                      </button>
                    </div>
                    <div className="user-modal-company-summary" aria-labelledby="user-modal-company-trigger-label">
                      {assignmentSummaryText ? (
                        <span className="user-modal-company-summary-text">{assignmentSummaryText}</span>
                      ) : (
                        <span className="user-modal-company-summary-empty">
                          {dualTenantPicker
                            ? t("groupCompanyNoneSelected")
                            : groupPickerMode
                              ? t("groupNoneSelected")
                              : t("companyNoneSelected")}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="user-modal-permissions-compact">
                  <div className="form-group user-info-field company-field-group permission-field-group">
                    <div className="user-modal-company-heading-row">
                      <label id="user-modal-permission-trigger-label" htmlFor="user-modal-permission-open-btn" className="permission-field-label">
                        <span className="permission-field-label-text">{t("permissions")}</span>
                        {readOnlyToggleVisible ? (
                          <ReadOnlyToggleInline
                            readOnlyToggleCanInteract={readOnlyToggleCanInteract}
                            pageReadOnlyLock={pageReadOnlyLock}
                            form={form}
                            setForm={setForm}
                            t={t}
                          />
                        ) : null}
                      </label>
                      <button
                        id="user-modal-permission-open-btn"
                        type="button"
                        className="user-modal-company-open-btn"
                        disabled={permissionsLocked}
                        onClick={() => setPermissionPickerOpen(true)}
                      >
                        {t("selectPermissions")}
                      </button>
                    </div>
                    <div className="user-modal-company-summary" aria-labelledby="user-modal-permission-trigger-label">
                      {selectedPermissionLabels.length ? (
                        <span className="user-modal-company-summary-text">{selectedPermissionLabels.join(", ")}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sidebar-permissions-section">
                <div className="user-modal-permissions-inline">
                  <h3 className="sidebar-permissions-title user-modal-permissions-title">
                    {t("permissions")}
                    {readOnlyToggleVisible ? (
                      <ReadOnlyToggleInline
                        readOnlyToggleCanInteract={readOnlyToggleCanInteract}
                        pageReadOnlyLock={pageReadOnlyLock}
                        form={form}
                        setForm={setForm}
                        t={t}
                      />
                    ) : null}
                  </h3>
                  <PermissionChecklist
                    className="permissions-container"
                    permissionsLocked={permissionsLocked}
                    permDisabledMap={permDisabledMap}
                    permSelected={permSelected}
                    setPermSelected={setPermSelected}
                    t={t}
                  />
                  <PermissionBulkActions
                    className="permissions-actions user-modal-col-actions"
                    permissionsLocked={permissionsLocked}
                    permDisabledMap={permDisabledMap}
                    setPermSelected={setPermSelected}
                    t={t}
                  />
                </div>
              </div>
              </form>
            </div>

            <div className="user-modal-col user-modal-col--account account-process-col" style={userModalColStyle}>
                <label className="acc-proc-label user-modal-col-title">{t("account")}</label>
                <div ref={accountGridRef} className={`account-grid account-grid--four account-grid--process${bulkSelectionSettling ? " account-grid--bulk-settling" : ""}`}>
                  {modalAccounts.map((a) => (
                    <label key={a.id} className="account-item-compact account-item-compact--process user-modal-select-card">
                      <input
                        type="checkbox"
                        id={`acc-${a.id}`}
                        checked={selectedAccountIds.has(Number(a.id))}
                        disabled={!!editingRow?.is_owner_shadow || pageReadOnlyLock}
                        onChange={(e) => {
                          setSelectedAccountIds((prev) => {
                            const n = new Set(prev);
                            if (e.target.checked) n.add(Number(a.id)); else n.delete(Number(a.id));
                            return n;
                          });
                        }}
                      />
                      <span className="account-label account-label--process">
                        {a.account_id}
                        {a.name ? <span className="account-label-desc">{a.name}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="account-control-buttons user-modal-col-actions">
                  <button type="button" className="btn-account-control" disabled={!!editingRow?.is_owner_shadow || pageReadOnlyLock} onClick={() => runBulkSelection(() => setSelectedAccountIds(new Set(accountIdList)))}>{t("selectAll")}</button>
                  <button type="button" className="btn-clearall" disabled={!!editingRow?.is_owner_shadow || pageReadOnlyLock} onClick={() => runBulkSelection(() => setSelectedAccountIds(new Set()))}>{t("clearAll")}</button>
                </div>
              </div>

            {showProcessColumn ? (
              <div className="user-modal-col user-modal-col--process account-process-col" style={userModalColStyle}>
                  <label className="acc-proc-label user-modal-col-title">{t("process")}</label>
                  <div ref={processGridRef} className={`account-grid account-grid--four account-grid--process${bulkSelectionSettling ? " account-grid--bulk-settling" : ""}`}>
                    {modalProcesses.map((p) => (
                      <label key={p.id} className="account-item-compact account-item-compact--process user-modal-select-card">
                        <input
                          type="checkbox"
                          id={`proc-${p.id}`}
                          checked={selectedProcessIds.has(Number(p.id))}
                          disabled={!!editingRow?.is_owner_shadow || pageReadOnlyLock}
                          onChange={(e) => {
                            setSelectedProcessIds((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(Number(p.id)); else n.delete(Number(p.id));
                              return n;
                            });
                          }}
                        />
                        <span className="account-label account-label--process">
                          {p.process_id}{p.description ? <span className="account-label-desc">{p.description}</span> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="account-control-buttons user-modal-col-actions">
                    <button type="button" className="btn-account-control" disabled={!!editingRow?.is_owner_shadow || pageReadOnlyLock} onClick={() => runBulkSelection(() => setSelectedProcessIds(new Set(processIdList)))}>{t("selectAll")}</button>
                    <button type="button" className="btn-clearall" disabled={!!editingRow?.is_owner_shadow || pageReadOnlyLock} onClick={() => runBulkSelection(() => setSelectedProcessIds(new Set()))}>{t("clearAll")}</button>
                  </div>
                </div>
            ) : null}
          </div>
        </div>
        <div className="user-modal-footer">
          <button type="submit" form="userForm" className="btn btn-save" disabled={pageReadOnlyLock || submitting}>
            {submitting ? t("saving") : t("save")}
          </button>
          <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );

  return (
    <>
    {typeof document !== "undefined" && document.body
      ? createPortal(userModalShell, document.body)
      : userModalShell}
    {companyPickerOpen && (currentUserRole === "admin" || currentUserRole === "owner")
      ? createPortal(
          <div
            className="user-modal-company-picker-root user-modal-company-picker-root--above-modals"
            style={{ zIndex: accountCompanyPickerZIndex }}
          >
            <button
              type="button"
              className="user-modal-company-picker-backdrop"
              aria-label={t("cancel")}
              onClick={() => {
                setCompanyPickerOpen(false);
                setCompanySearchQuery("");
              }}
            />
            <div
              className="user-modal-company-picker"
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-modal-company-picker-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="user-modal-company-picker-header">
                <span id="user-modal-company-picker-title">
                  {dualTenantPicker
                    ? t("groupCompanyPickerTitle")
                    : groupPickerMode
                      ? t("groupPickerTitle")
                      : t("companyPickerTitle")}
                </span>
                <button
                  type="button"
                  className="user-modal-company-picker-close"
                  aria-label={t("cancel")}
                  onClick={() => {
                    setCompanyPickerOpen(false);
                    setCompanySearchQuery("");
                  }}
                >
                  ×
                </button>
              </div>
              <div className="user-modal-company-picker-filter-row">
                <input
                  type="search"
                  className="user-modal-company-picker-search"
                  placeholder={
                    dualTenantPicker || groupPickerMode
                      ? t("groupSearchPlaceholder")
                      : t("companySearchPlaceholder")
                  }
                  value={companySearchQuery}
                  disabled={pageReadOnlyLock}
                  onChange={(e) => setCompanySearchQuery(e.target.value)}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="user-modal-company-picker-select-all"
                  disabled={fieldLocks.company || !!editingRow?.is_owner_shadow || modalCompanies.length === 0 || pageReadOnlyLock}
                  onClick={() => {
                    if (dualTenantPicker && setSelectedGroupIds) {
                      setSelectedGroupIds(pickerGroupRows.map((c) => Number(c.id)));
                      setSelectedCompanyIds(pickerCompanyRows.map((c) => Number(c.id)));
                      return;
                    }
                    setSelectedCompanyIds(modalCompanies.map((c) => Number(c.id)));
                  }}
                >
                  {t("selectAll")}
                </button>
              </div>
              <div className="user-modal-company-picker-body">
                {dualTenantPicker ? (
                  <>
                    <div className="user-modal-company-picker-section">
                      <div className="user-modal-company-picker-section-title">{t("groupsSectionTitle")}</div>
                      <ul className="user-modal-company-picker-list user-modal-company-picker-list--groups">
                        {groupPickerFiltered.map((c) => {
                          const id = Number(c.id);
                          const label = String(c?.group_id || c?.company_id || "").trim().toUpperCase();
                          const checked = selectedGroupIds.includes(id);
                          const rowDisabled = fieldLocks.company || !!editingRow?.is_owner_shadow || pageReadOnlyLock;
                          return (
                            <li key={`g-${c.id}`} className="user-modal-company-picker-row">
                              <label className={checked ? "user-modal-company-picker-label is-checked" : "user-modal-company-picker-label"}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={rowDisabled || !setSelectedGroupIds}
                                  onChange={() => {
                                    setSelectedGroupIds?.((prev) => {
                                      if (prev.includes(id)) return prev.filter((x) => x !== id);
                                      return [...prev, id];
                                    });
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div className="user-modal-company-picker-section">
                      <div className="user-modal-company-picker-section-title">{t("companiesSectionTitle")}</div>
                      <ul className="user-modal-company-picker-list user-modal-company-picker-list--companies">
                        {companyPickerFiltered.map((c) => {
                          const id = Number(c.id);
                          const label = getCompanyPickerLabel(c);
                          const checked = selectedCompanyIds.includes(id);
                          const rowDisabled = fieldLocks.company || !!editingRow?.is_owner_shadow || pageReadOnlyLock;
                          return (
                            <li key={`c-${c.id}`} className="user-modal-company-picker-row">
                              <label className={checked ? "user-modal-company-picker-label is-checked" : "user-modal-company-picker-label"}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={rowDisabled}
                                  onChange={() => {
                                    setSelectedCompanyIds((prev) => {
                                      if (prev.includes(id)) return prev.filter((x) => x !== id);
                                      return [...prev, id];
                                    });
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </>
                ) : (
                  <ul className="user-modal-company-picker-list">
                    {companyPickerFiltered.map((c) => {
                      const id = Number(c.id);
                      const label = getCompanyPickerLabel(c);
                      const checked = selectedCompanyIds.includes(id);
                      const rowDisabled = fieldLocks.company || !!editingRow?.is_owner_shadow || pageReadOnlyLock;
                      return (
                        <li key={c.id} className="user-modal-company-picker-row">
                          <label className={checked ? "user-modal-company-picker-label is-checked" : "user-modal-company-picker-label"}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={rowDisabled}
                              onChange={() => {
                                setSelectedCompanyIds((prev) => {
                                  if (prev.includes(id)) return prev.filter((x) => x !== id);
                                  return [...prev, id];
                                });
                              }}
                            />
                            <span>{label}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="user-modal-company-picker-footer">
                <button
                  type="button"
                  className="user-modal-company-picker-done"
                  onClick={() => {
                    setCompanyPickerOpen(false);
                    setCompanySearchQuery("");
                  }}
                >
                  {dualTenantPicker || groupPickerMode ? t("groupPickerDone") : t("companyPickerDone")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null}
    {permissionPickerOpen
      ? createPortal(
          <div
            className="user-modal-permission-picker-root user-modal-permission-picker-root--above-modals"
            style={{ zIndex: accountCompanyPickerZIndex }}
          >
            <button
              type="button"
              className="user-modal-permission-picker-backdrop"
              aria-label={t("cancel")}
              onClick={() => setPermissionPickerOpen(false)}
            />
            <div
              className="user-modal-permission-picker"
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-modal-permission-picker-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="user-modal-permission-picker-header">
                <span id="user-modal-permission-picker-title">{t("permissionPickerTitle")}</span>
                <button
                  type="button"
                  className="user-modal-permission-picker-close"
                  aria-label={t("cancel")}
                  onClick={() => setPermissionPickerOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="user-modal-permission-picker-body">
                <section className="user-modal-permission-picker-sidebar">
                  <div className="user-modal-permission-picker-sidebar-head">
                    <span className="user-modal-permission-picker-section-label">{t("permissions")}</span>
                    <div className="user-modal-permission-picker-sidebar-actions">
                      <button
                        type="button"
                        className="btn-secondary btn-select-all"
                        disabled={permissionsLocked}
                        onClick={() => {
                          const n = new Set();
                          PERMISSION_KEYS.forEach((k) => {
                            if (!permDisabledMap[k]) n.add(k);
                          });
                          setPermSelected(n);
                        }}
                      >
                        {t("selectAll")}
                      </button>
                      <button
                        type="button"
                        className="btn-clearall"
                        disabled={permissionsLocked}
                        onClick={() => setPermSelected(new Set())}
                      >
                        {t("clearAll")}
                      </button>
                    </div>
                  </div>
                  <PermissionChecklist
                    className="permissions-container user-modal-permission-picker-perms"
                    permissionsLocked={permissionsLocked}
                    permDisabledMap={permDisabledMap}
                    permSelected={permSelected}
                    setPermSelected={setPermSelected}
                    t={t}
                  />
                </section>
              </div>
              <div className="user-modal-permission-picker-footer">
                <button
                  type="button"
                  className="user-modal-permission-picker-done"
                  onClick={() => setPermissionPickerOpen(false)}
                >
                  {t("permissionPickerDone")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null}
    </>
  );
}
