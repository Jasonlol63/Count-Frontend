import React, { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { accountCompanyPickerZIndex, accountModalOverlayZIndex } from "../../../components/ProcessModalPortal.jsx";
import SimpleSelect from "../../../components/SimpleSelect.jsx";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";
import PasswordInput from "../../../components/PasswordInput.jsx";
import {
  nextAccountSelectionPreservingOutside,
  nextSelfAccountSelection,
} from "../userListLogic.js";

function readCssPxToken(el, name, fallback) {
  if (!el || typeof window === "undefined") return fallback;
  const raw = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function readResolvedCssInt(el, name, fallback) {
  if (!el || typeof window === "undefined") return fallback;
  const raw = String(getComputedStyle(el).getPropertyValue(name) || "").trim();
  // Custom props may still be `var(--x, 4)` — peel a trailing integer.
  const direct = parseInt(raw, 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const nested = raw.match(/(\d+)\s*\)?\s*$/);
  if (nested) {
    const n = parseInt(nested[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

/** Match userlist.css wide/compact Acc-Process column breakpoint. */
function readAccessGridCols() {
  if (typeof window === "undefined") return 4;
  const root = document.documentElement;
  const wide = readResolvedCssInt(root, "--user-modal-access-grid-cols-wide", 4);
  const compact = readResolvedCssInt(root, "--user-modal-access-grid-cols-compact", 3);
  const bp = readCssPxToken(root, "--user-modal-access-grid-bp", 1700);
  return window.innerWidth < bp ? compact : wide;
}

function readAccessRowEstimate() {
  if (typeof document === "undefined") return 43;
  const root = document.getElementById("userModal") || document.documentElement;
  const minH = readCssPxToken(root, "--user-modal-access-card-min-height", 38);
  const gap = readCssPxToken(root, "--user-modal-access-card-gap", 5);
  return Math.ceil(minH + gap);
}

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

/** Shared permission checklist used by the picker dialog. */
function PermissionChecklist({ className, permissionsLocked, permDisabledMap, visiblePermissionKeys, permSelected, setPermSelected, t }) {
  return (
    <div className={className}>
      {visiblePermissionKeys.map((key) => (
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

function PermissionBulkActions({ className, permissionsLocked, permDisabledMap, visiblePermissionKeys, setPermSelected, t }) {
  return (
    <div className={className}>
      <button
        type="button"
        className="btn-secondary btn-select-all"
        disabled={permissionsLocked}
        onClick={() => {
          startTransition(() => {
            const n = new Set();
            visiblePermissionKeys.forEach((k) => {
              if (!permDisabledMap[k]) n.add(k);
            });
            setPermSelected(n);
          });
        }}
      >
        {t("selectAll")}
      </button>
      <button
        type="button"
        className="btn-clearall"
        disabled={permissionsLocked}
        onClick={() => {
          startTransition(() => setPermSelected(new Set()));
        }}
      >
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
  PERMISSION_ICONS,
  normRole,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
  roleHasReadOnlyToggle,
  canInteractWithReadOnlyToggle,
  isUserModalPageReadOnlyLock,
} from "../userListLogic.js";
import { formatUserRoleDisplay } from "../../../translateFile/pages/userListTranslate.js";
import { sanitizeEmailInput } from "../../../utils/input/emailValidation.js";

/**
 * Account / Process 勾选列。memo 隔离：选 Role 只改 form/permSelected，
 * 本列 props（items/selectedIds/locked 等）不变即跳过重渲染，
 * 避免上百个 checkbox 卡片在每次角色切换时全量重建。
 */
const AccessSelectCard = React.memo(function AccessSelectCard({
  id,
  idPrefix,
  primary,
  secondary,
  checked,
  locked,
  onToggle,
}) {
  return (
    <label
      className={`account-item-compact account-item-compact--process user-modal-select-card${checked ? " is-selected" : ""}${locked ? " is-disabled" : ""}`}
    >
      <input
        type="checkbox"
        id={`${idPrefix}-${id}`}
        checked={checked}
        disabled={locked}
        onChange={(e) => onToggle(id, e.target.checked)}
      />
      <span className="account-label account-label--process">
        {primary}
        {secondary ? <span className="account-label-desc">{secondary}</span> : null}
      </span>
    </label>
  );
});

const SelectionColumn = React.memo(function SelectionColumn({
  variant,
  title,
  items,
  selectedIds,
  setSelectedIds,
  idList,
  locked,
  /** @type {Set<number>|null|undefined} self Acc: only these ids may be (re)checked */
  shrinkOnlyHeldIds = null,
  bulkSelectionSettling,
  runBulkSelection,
  /** Modal open — remount/remeasure virtualizer when display flips on */
  listActive = true,
  t,
}) {
  const idPrefix = variant === "account" ? "acc" : "proc";
  const colClass =
    variant === "account"
      ? "user-modal-col user-modal-col--account account-process-col"
      : "user-modal-col user-modal-col--process account-process-col";
  const selfShrinkOnly = shrinkOnlyHeldIds instanceof Set;
  const scrollRef = useRef(null);
  const [cols, setCols] = useState(4);
  const [rowEstimate, setRowEstimate] = useState(43);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const syncMetrics = () => {
      setCols(readAccessGridCols());
      setRowEstimate(readAccessRowEstimate());
    };
    syncMetrics();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncMetrics) : null;
    ro?.observe(el);
    window.addEventListener("resize", syncMetrics);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", syncMetrics);
    };
  }, [listActive, items.length]);

  const rowCount = cols > 0 ? Math.ceil(items.length / cols) : 0;
  const rowVirtualizer = useVirtualizer({
    count: listActive ? rowCount : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowEstimate,
    overscan: 8,
  });

  useEffect(() => {
    if (!listActive) return;
    const id = requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });
    return () => cancelAnimationFrame(id);
    // measure() only — avoid depending on virtualizer identity
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed by layout inputs
  }, [listActive, cols, rowEstimate, items.length]);

  const onToggle = useCallback(
    (id, checked) => {
      const nId = Number(id);
      // Self shrink-only: block checking Accs not in the held baseline (superior-closed).
      if (checked && selfShrinkOnly && !shrinkOnlyHeldIds.has(nId)) return;
      setSelectedIds((prev) => {
        const n = new Set(prev);
        if (checked) n.add(nId);
        else n.delete(nId);
        return n;
      });
    },
    [setSelectedIds, selfShrinkOnly, shrinkOnlyHeldIds],
  );

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div className={colClass} style={userModalColStyle}>
      <label className="acc-proc-label user-modal-col-title">{title}</label>
      <div
        ref={scrollRef}
        className={`account-grid account-grid--four account-grid--process account-grid--virtual${bulkSelectionSettling ? " account-grid--bulk-settling" : ""}`}
      >
        <div className="account-grid-virtual-spacer" style={{ height: totalSize }}>
          {virtualRows.map((vRow) => {
            const start = vRow.index * cols;
            const rowItems = items.slice(start, start + cols);
            return (
              <div
                key={vRow.key}
                data-index={vRow.index}
                ref={rowVirtualizer.measureElement}
                className="account-grid-virtual-row"
                style={{ transform: `translateY(${vRow.start}px)` }}
              >
                {rowItems.map((it) => {
                  const primary = variant === "account" ? it.account_id : it.process_id;
                  const secondary = variant === "account" ? it.name : it.description;
                  const nId = Number(it.id);
                  const checked = selectedIds.has(nId);
                  // Unchecked + not held → lock (cannot restore superior-closed Acc).
                  // Checked + not held → still allow uncheck.
                  const cardLocked =
                    locked || (selfShrinkOnly && !shrinkOnlyHeldIds.has(nId) && !checked);
                  return (
                    <AccessSelectCard
                      key={it.id}
                      id={it.id}
                      idPrefix={idPrefix}
                      primary={primary}
                      secondary={secondary}
                      checked={checked}
                      locked={cardLocked}
                      onToggle={onToggle}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="account-control-buttons user-modal-col-actions">
        <button
          type="button"
          className="btn-account-control"
          disabled={locked}
          onClick={() =>
            runBulkSelection(variant, () => {
              if (selfShrinkOnly) {
                setSelectedIds((prev) =>
                  nextSelfAccountSelection(prev, idList, shrinkOnlyHeldIds, "select"),
                );
                return;
              }
              setSelectedIds((prev) => nextAccountSelectionPreservingOutside(prev, idList, "select"));
            })
          }
        >
          {t("selectAll")}
        </button>
        <button
          type="button"
          className="btn-clearall"
          disabled={locked}
          onClick={() =>
            runBulkSelection(variant, () => {
              if (selfShrinkOnly) {
                setSelectedIds((prev) =>
                  nextSelfAccountSelection(prev, idList, shrinkOnlyHeldIds, "clear"),
                );
                return;
              }
              setSelectedIds((prev) => nextAccountSelectionPreservingOutside(prev, idList, "clear"));
            })
          }
        >
          {t("clearAll")}
        </button>
      </div>
    </div>
  );
});

function UserModal({
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
  visiblePermissionKeys,
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
  /** Self-edit Acc held baseline; null = not self shrink-only mode */
  selfAccHeldIds = null,
  /** Self-edit Process held baseline; null = not self shrink-only mode */
  selfProcessHeldIds = null,
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
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [permissionPickerOpen, setPermissionPickerOpen] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [draftSelectedCompanyIds, setDraftSelectedCompanyIds] = useState([]);
  const [draftSelectedGroupIds, setDraftSelectedGroupIds] = useState([]);
  const [bulkSettlingVariant, setBulkSettlingVariant] = useState(null);
  const bulkSelectionTimerRef = useRef(null);
  const { submitting, guardSubmit } = useSubmitGuard(open);

  const roleOptions = useMemo(() => {
    if (editingRow?.is_owner_shadow) {
      return [{ value: "owner", label: formatUserRoleDisplay(t, "owner") }];
    }
    const list = isEditMode
      ? getAvailableRolesForEdit(currentUserRole, editingRow?.role)
      : getAvailableRolesForCreation(currentUserRole);
    const opts = list.map((opt) => ({
      value: opt.value,
      label: formatUserRoleDisplay(t, opt.value),
    }));
    if (isEditMode && form.role && !list.find((x) => x.value === form.role)) {
      opts.push({
        value: form.role,
        label: formatUserRoleDisplay(t, form.role),
      });
    }
    return opts;
  }, [isEditMode, currentUserRole, editingRow, form.role, t]);

  useEffect(() => {
    return () => {
      if (bulkSelectionTimerRef.current) clearTimeout(bulkSelectionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    // One idle reflow is enough — triple sync was fighting Role interaction.
    let idleId = 0;
    let timeoutId = 0;
    const forceReflow = () => {
      const nodes = [modalBodyRef.current, cardRef.current];
      nodes.forEach((el) => {
        if (el) void el.getBoundingClientRect();
      });
    };
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(forceReflow, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(forceReflow, 200);
    }
    return () => {
      if (idleId && typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
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
    setDraftSelectedCompanyIds(selectedCompanyIds);
    setDraftSelectedGroupIds(selectedGroupIds);
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

  const accountIdList = useMemo(() => modalAccounts.map((x) => Number(x.id)), [modalAccounts]);
  const processIdList = useMemo(() => modalProcesses.map((x) => Number(x.id)), [modalProcesses]);

  const runBulkSelection = useCallback((variant, update) => {
    if (bulkSelectionTimerRef.current) clearTimeout(bulkSelectionTimerRef.current);
    setBulkSettlingVariant(variant);
    // Sync update so Save immediately after Select All reads the new selection
    // (startTransition previously deferred Set state and could persist []).
    update();
    bulkSelectionTimerRef.current = setTimeout(() => setBulkSettlingVariant(null), 120);
  }, []);

  const getCompanyPickerLabel = (companyRow) => {
    if (groupPickerMode) return String(companyRow?.group_id || "").trim().toUpperCase();
    return String(companyRow?.company_id || companyRow?.group_id || "").trim().toUpperCase();
  };

  const pickerGroupRows = dualTenantPicker ? modalGroupCompanies : groupPickerMode ? modalCompanies : [];
  const pickerCompanyRows = dualTenantPicker ? modalSubsidiaryCompanies : groupPickerMode ? [] : modalCompanies;
  const activeSelectedCompanyIds = companyPickerOpen ? draftSelectedCompanyIds : selectedCompanyIds;
  const activeSelectedGroupIds = companyPickerOpen ? draftSelectedGroupIds : selectedGroupIds;

  const selectedGroupLabels = useMemo(() => {
    if (!dualTenantPicker) return [];
    const set = new Set(activeSelectedGroupIds.map(Number));
    return pickerGroupRows
      .filter((c) => set.has(Number(c.id)))
      .map((c) => String(c?.group_id || c?.company_id || "").trim().toUpperCase())
      .filter(Boolean);
  }, [dualTenantPicker, pickerGroupRows, activeSelectedGroupIds]);

  const selectedCompanyLabels = useMemo(() => {
    const set = new Set(activeSelectedCompanyIds.map(Number));
    const rows = dualTenantPicker ? pickerCompanyRows : modalCompanies;
    return rows
      .filter((c) => set.has(Number(c.id)))
      .map((c) => getCompanyPickerLabel(c))
      .filter(Boolean);
  }, [modalCompanies, pickerCompanyRows, activeSelectedCompanyIds, groupPickerMode, dualTenantPicker]);

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

  const showProcessColumn = dualTenantPicker ? activeSelectedCompanyIds.length > 0 : !groupPickerMode;

  const selectedPermissionLabels = useMemo(
    () => visiblePermissionKeys.filter((k) => permSelected.has(k)).map((k) => getPermissionLabel(k, t)),
    [visiblePermissionKeys, permSelected, t]
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
  const accountLocked =
    !!(fieldLocks.account ?? fieldLocks.accountProcess) || !!editingRow?.is_owner_shadow || pageReadOnlyLock;
  const processLocked =
    !!(fieldLocks.process ?? fieldLocks.accountProcess) || !!editingRow?.is_owner_shadow || pageReadOnlyLock;
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
                <div className="form-group user-info-field">
                  <label htmlFor="login_id">{t("loginId")} *</label>
                  <input
                    id="login_id"
                    required
                    disabled={loginDisabled || pageReadOnlyLock}
                    value={form.login_id}
                    onChange={(e) => setForm((f) => ({ ...f, login_id: e.target.value }))}
                    style={{ textTransform: "uppercase" }}
                  />
                </div>
                {showSecondaryPassword ? (
                  <div className="form-group user-info-field password-row-container password-row-container--split">
                    <div className="password-field-wrapper">
                      <label htmlFor="password">{isEditMode ? t("password") : t("passwordRequiredMark")}</label>
                      <PasswordInput
                        id="password"
                        disabled={fieldLocks.password || pageReadOnlyLock}
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        showLabel={t("showPassword")}
                        hideLabel={t("hidePassword")}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="password-field-wrapper">
                      <label htmlFor="secondary_password">{t("secondaryPassword")}</label>
                      <PasswordInput
                        id="secondary_password"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        placeholder={t("secondaryPasswordPlaceholder")}
                        disabled={fieldLocks.password || pageReadOnlyLock}
                        value={form.secondary_password}
                        onChange={(e) => setForm((f) => ({ ...f, secondary_password: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                        showLabel={t("showPassword")}
                        hideLabel={t("hidePassword")}
                        autoComplete="off"
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="form-group user-info-field">
                    <label htmlFor="password">{isEditMode ? t("password") : t("passwordRequiredMark")}</label>
                    <PasswordInput
                      id="password"
                      disabled={fieldLocks.password || pageReadOnlyLock}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      showLabel={t("showPassword")}
                      hideLabel={t("hidePassword")}
                      autoComplete="new-password"
                    />
                  </div>
                )}
                <div className="user-info-field-row">
                  <div className="form-group user-info-field">
                    <label htmlFor="name">{t("nameRequired")}</label>
                    <input id="name" required disabled={fieldLocks.name || pageReadOnlyLock} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ textTransform: "uppercase" }} />
                  </div>
                  <div className="form-group user-info-field">
                    <label htmlFor="role">{t("roleRequired")}</label>
                    <SimpleSelect
                      id="role"
                      value={form.role}
                      onChange={(v) => {
                        // 先关掉下拉（SimpleSelect 已 close），权限模板用 transition 降低输入延迟
                        startTransition(() => {
                          setForm((f) => ({
                            ...f,
                            role: v,
                            ...(roleHasReadOnlyToggle(v) ? { read_only: true } : {}),
                          }));
                          applyPermTemplate(v, true);
                        });
                      }}
                      options={roleOptions}
                      placeholder={t("selectRole")}
                      disabled={roleSelectDisabled || fieldLocks.role || pageReadOnlyLock}
                      forcePortal
                      debugOpenFail
                      required
                    />
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
                    visiblePermissionKeys={visiblePermissionKeys}
                    permSelected={permSelected}
                    setPermSelected={setPermSelected}
                    t={t}
                  />
                  <PermissionBulkActions
                    className="permissions-actions user-modal-col-actions"
                    permissionsLocked={permissionsLocked}
                    permDisabledMap={permDisabledMap}
                    visiblePermissionKeys={visiblePermissionKeys}
                    setPermSelected={setPermSelected}
                    t={t}
                  />
                </div>
              </div>
              </form>
            </div>

            <SelectionColumn
              variant="account"
              title={t("account")}
              items={modalAccounts}
              selectedIds={selectedAccountIds}
              setSelectedIds={setSelectedAccountIds}
              idList={accountIdList}
              locked={accountLocked}
              shrinkOnlyHeldIds={selfAccHeldIds}
              bulkSelectionSettling={bulkSettlingVariant === "account"}
              runBulkSelection={runBulkSelection}
              listActive={open}
              t={t}
            />

            {showProcessColumn ? (
              <SelectionColumn
                variant="process"
                title={t("process")}
                items={modalProcesses}
                selectedIds={selectedProcessIds}
                setSelectedIds={setSelectedProcessIds}
                idList={processIdList}
                locked={processLocked}
                shrinkOnlyHeldIds={selfProcessHeldIds}
                bulkSelectionSettling={bulkSettlingVariant === "process"}
                runBulkSelection={runBulkSelection}
                listActive={open}
                t={t}
              />
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
                    if (dualTenantPicker) {
                      setDraftSelectedGroupIds(pickerGroupRows.map((c) => Number(c.id)));
                      setDraftSelectedCompanyIds(pickerCompanyRows.map((c) => Number(c.id)));
                      return;
                    }
                    setDraftSelectedCompanyIds(modalCompanies.map((c) => Number(c.id)));
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
                          const checked = draftSelectedGroupIds.includes(id);
                          const rowDisabled = fieldLocks.company || !!editingRow?.is_owner_shadow || pageReadOnlyLock;
                          return (
                            <li key={`g-${c.id}`} className="user-modal-company-picker-row">
                              <label className={checked ? "user-modal-company-picker-label is-checked" : "user-modal-company-picker-label"}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={rowDisabled || !setSelectedGroupIds}
                                  onChange={() => {
                                    setDraftSelectedGroupIds((prev) => {
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
                          const checked = draftSelectedCompanyIds.includes(id);
                          const rowDisabled = fieldLocks.company || !!editingRow?.is_owner_shadow || pageReadOnlyLock;
                          return (
                            <li key={`c-${c.id}`} className="user-modal-company-picker-row">
                              <label className={checked ? "user-modal-company-picker-label is-checked" : "user-modal-company-picker-label"}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={rowDisabled}
                                  onChange={() => {
                                    setDraftSelectedCompanyIds((prev) => {
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
                      const checked = draftSelectedCompanyIds.includes(id);
                      const rowDisabled = fieldLocks.company || !!editingRow?.is_owner_shadow || pageReadOnlyLock;
                      return (
                        <li key={c.id} className="user-modal-company-picker-row">
                          <label className={checked ? "user-modal-company-picker-label is-checked" : "user-modal-company-picker-label"}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={rowDisabled}
                              onChange={() => {
                                setDraftSelectedCompanyIds((prev) => {
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
                    if (dualTenantPicker && setSelectedGroupIds) {
                      setSelectedGroupIds(draftSelectedGroupIds);
                    }
                    setSelectedCompanyIds(draftSelectedCompanyIds);
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
                          startTransition(() => {
                            const n = new Set();
                            visiblePermissionKeys.forEach((k) => {
                              if (!permDisabledMap[k]) n.add(k);
                            });
                            setPermSelected(n);
                          });
                        }}
                      >
                        {t("selectAll")}
                      </button>
                      <button
                        type="button"
                        className="btn-clearall"
                        disabled={permissionsLocked}
                        onClick={() => {
                          startTransition(() => setPermSelected(new Set()));
                        }}
                      >
                        {t("clearAll")}
                      </button>
                    </div>
                  </div>
                  <PermissionChecklist
                    className="permissions-container user-modal-permission-picker-perms"
                    permissionsLocked={permissionsLocked}
                    permDisabledMap={permDisabledMap}
                    visiblePermissionKeys={visiblePermissionKeys}
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

export default React.memo(UserModal);
