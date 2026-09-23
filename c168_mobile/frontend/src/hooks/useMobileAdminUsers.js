import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCurrentUser, logoutSession, switchSessionTenant } from "../lib/authApi.js";
import { withLegacyCompanyAliases } from "../lib/sessionUserAliases.js";
import { fetchOwnerCompaniesForMobile } from "../lib/tenantAccessibleApi.js";
import {
  companiesForPicker,
  pickCompany,
  resolveCompanyPickForGroup,
  resolveInitialMobileGcScope,
  resolveMobileGroupIds,
} from "../lib/dashboardScope.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import { canUseGroupOnlyMode, filterCompaniesForUserScope } from "../lib/loginScope.js";
import {
  accountScopeIsGroupOnly,
  resolveAccountScopeDraft,
  resolveScopeTenantIds,
} from "../lib/mobileAccountScope.js";
import { isPartnershipAuditReadOnlyLocked } from "../lib/partnershipAuditReadOnly.js";
import {
  applyUserFilters,
  buildAdminCompanyOptions,
  buildAdminGroupOptions,
  buildSelfAccHeldIds,
  canSelfEditAccountAccess,
  computeRowCapabilities,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
  getFinalPermissionsForCreation,
  getRoleTemplateSidebarList,
  getUserEditFieldLocks,
  getVisiblePermissionKeys,
  mergeAccountPermissionsForEditor,
  nextSelfAccountSelection,
  normRole,
  parseJsonArray,
  resolveAdminGroupEntityIds,
  resolveSeeAllOrCompactPermissions,
  roleHasReadOnlyToggle,
  canInteractWithReadOnlyToggle,
  shrinkAccountPermissionsForSelf,
  sortUsersByLogin,
  validateUserEmail,
} from "../lib/mobileUserAdmin.js";
import {
  buildAdminCreateRequest,
  buildAdminOwnerProfileUpdateRequest,
  buildAdminUpdateRequest,
  createAdminUser,
  deleteAdminUser,
  fetchAdminDetailByUserId,
  fetchMergedAdminLists,
  toggleAdminUserStatus,
  updateAdminUser,
  updateAdminOwnerProfile,
} from "../lib/adminUserApi.js";
import { fetchAccountListByTenantId } from "../lib/accountApi.js";
import { fetchProcessListByTenantId } from "../lib/processApi.js";
import { adminText } from "../translateFile/adminTranslate.js";
import { canAccessAdmin, resolveMobileLandingPath } from "../utils/mobilePermissions.js";

const EMPTY_FORM = {
  id: "",
  login_id: "",
  name: "",
  email: "",
  role: "",
  password: "",
  secondary_password: "",
  status: "active",
  read_only: true,
};

export function useMobileAdminUsers() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => adminText(lang), [lang]);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [toast, setToast] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRow, setEditingRow] = useState(null);
  const [permSelected, setPermSelected] = useState(() => new Set());
  const [formAccounts, setFormAccounts] = useState([]);
  const [formProcesses, setFormProcesses] = useState([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => new Set());
  const [selectedProcessIds, setSelectedProcessIds] = useState(() => new Set());
  /**
   * Self-edit "held" baseline (`buildSelfAccHeldIds`): the only ids a self-editing admin may
   * (re)check, and the intersection `shrinkAccountPermissionsForSelf` applies on save. `null`
   * for a non-self edit, meaning "no shrink". Replaces the legacy server-supplied
   * `toggleable_ids` / `superior_closed` pair — see the helpers' comment in mobileUserAdmin.js.
   */
  const [selfAccHeldIds, setSelfAccHeldIds] = useState(null);
  const [selfProcessHeldIds, setSelfProcessHeldIds] = useState(null);
  const [selectedTenantGroupIds, setSelectedTenantGroupIds] = useState(() => new Set());
  const [selectedTenantCompanyIds, setSelectedTenantCompanyIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef(null);
  const listSeq = useRef(0);

  /** Dirty check: snapshot the freshly-seeded form; only a real user edit
      makes close ask "discard unsaved changes?". openCreate/openEdit arm the
      baseline AFTER their async seeds land (batched into one commit). */
  const [formBaseline, setFormBaseline] = useState("");
  const [baselinePending, setBaselinePending] = useState(false);
  const formSignature = useMemo(
    () =>
      JSON.stringify({
        f: form,
        p: [...permSelected].sort(),
        a: [...selectedAccountIds].sort((x, y) => x - y),
        pr: [...selectedProcessIds].sort((x, y) => x - y),
        tg: [...selectedTenantGroupIds].sort((x, y) => x - y),
        tc: [...selectedTenantCompanyIds].sort((x, y) => x - y),
      }),
    [
      form,
      permSelected,
      selectedAccountIds,
      selectedProcessIds,
      selectedTenantGroupIds,
      selectedTenantCompanyIds,
    ],
  );
  useEffect(() => {
    if (!baselinePending) return;
    setFormBaseline(formSignature);
    setBaselinePending(false);
  }, [baselinePending, formSignature]);
  const isFormDirty = !baselinePending && formBaseline !== formSignature;

  const scope = useMemo(
    () => ({ companyId, selectedGroup, groupsAllMode, groupAllMode }),
    [companyId, selectedGroup, groupsAllMode, groupAllMode],
  );
  const groupIds = useMemo(() => resolveMobileGroupIds(companies, me), [companies, me]);
  const tenantGroupOptions = useMemo(
    () => buildAdminGroupOptions(companies, groupIds),
    [companies, groupIds],
  );
  const tenantCompanyOptions = useMemo(
    () => buildAdminCompanyOptions(companies),
    [companies],
  );
  const selectedCompany = useMemo(
    () => companies.find((row) => Number(row.id) === Number(companyId)) || null,
    [companies, companyId],
  );
  /** Desktop parity: secondary password only for C168 company scopes or owner-shadow rows. */
  const isC168Company = useMemo(
    () => String(selectedCompany?.company_id || "").toUpperCase() === "C168",
    [selectedCompany],
  );
  const groupOnlyMode = accountScopeIsGroupOnly(scope);
  const mutationsBlocked = isPartnershipAuditReadOnlyLocked(me);
  /** Writes require an explicit single company — never All / group-only aggregate views. */
  const canMutate =
    !mutationsBlocked && !groupsAllMode && !groupAllMode && !groupOnlyMode && Number(companyId) > 0;

  const currentUserId = me?.user_id ?? null;
  const currentUserRole = normRole(me?.role);
  const useDualTenantPicker = currentUserRole === "admin" || currentUserRole === "owner";
  const isEditMode = Number(form.id) > 0;
  const fieldLocks = useMemo(
    () =>
      isEditMode && editingRow
        ? getUserEditFieldLocks(editingRow, currentUserId, currentUserRole)
        : { name: false, email: false, role: false, password: false, sidebar: false, company: false, accountProcess: false },
    [isEditMode, editingRow, currentUserId, currentUserRole],
  );
  const roleOptions = useMemo(
    () =>
      isEditMode
        ? getAvailableRolesForEdit(currentUserRole, editingRow?.role)
        : getAvailableRolesForCreation(currentUserRole),
    [isEditMode, currentUserRole, editingRow?.role],
  );
  const visiblePermissionKeys = useMemo(
    () => getVisiblePermissionKeys(form.role || editingRow?.role),
    [form.role, editingRow?.role],
  );
  const showReadOnlyToggle = useMemo(() => {
    const targetRole = normRole(form.role) || normRole(editingRow?.role);
    return (
      roleHasReadOnlyToggle(targetRole) && canInteractWithReadOnlyToggle(currentUserRole, targetRole)
    );
  }, [form.role, editingRow?.role, currentUserRole]);

  const notify = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 4000 : 2200);
  }, []);

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const { ok: meOk, json: meJson } = await fetchCurrentUser({ signal: ac.signal });
        if (!meOk || !meJson?.success || !meJson?.data) {
          navigate("/login", { replace: true });
          return;
        }
        const user = withLegacyCompanyAliases(meJson.data);
        if (user.needs_owner_secondary || user.needs_user_secondary) {
          navigate(user.needs_owner_secondary ? "/owner-secondary-password" : "/user-secondary-password", {
            replace: true,
          });
          return;
        }
        if (!canAccessAdmin(user)) {
          setBlocked(true);
          navigate(resolveMobileLandingPath(user), { replace: true });
          return;
        }
        setMe(user);
        let list;
        try {
          list = await fetchOwnerCompaniesForMobile(ac.signal);
        } catch (e) {
          if (ac.signal.aborted || e?.name === "AbortError") return;
          throw new Error(e?.message || i18n.loadError);
        }
        if (ac.signal.aborted) return;
        const scoped = filterCompaniesForUserScope(list, user);
        const picked = pickCompany(scoped, user.company_id);
        const initial = resolveInitialMobileGcScope(user, scoped, picked);
        setCompanies(scoped);
        setCompanyId(initial.companyId);
        setSelectedGroup(initial.selectedGroup);
      } catch (e) {
        if (e?.name !== "AbortError") setError(e?.message || i18n.loadError);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [navigate, i18n.loadError]);

  const fetchUsers = useCallback(
    async (signal) => {
      // One `/api/userlist/list?tenant_id=` per tenant in scope, merged. The Spring response
      // already flags owner-shadow rows (`isOwnerShadow`), so the legacy "list, then fetch my
      // own shadow row separately and prepend it" second round-trip is gone — `fetchMergedAdminLists`
      // also prefers the non-shadow copy when two tenants report the same id.
      const tenantIds = resolveScopeTenantIds(scope, companies, groupIds);
      if (!tenantIds.length) return [];
      return fetchMergedAdminLists(tenantIds, signal);
    },
    [companies, groupIds, scope],
  );

  useEffect(() => {
    if (!me || (!Number(companyId) && !groupOnlyMode && !groupsAllMode && !groupAllMode)) return;
    const seq = ++listSeq.current;
    const ac = new AbortController();
    setLoading(true);
    setError("");
    fetchUsers(ac.signal)
      .then((rows) => {
        if (seq === listSeq.current) setUsers(rows);
      })
      .catch((e) => {
        if (e?.name !== "AbortError" && seq === listSeq.current) setError(e?.message || i18n.loadError);
      })
      .finally(() => {
        if (seq === listSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => ac.abort();
  }, [companyId, fetchUsers, groupAllMode, groupOnlyMode, groupsAllMode, i18n.loadError, me, reloadNonce]);

  const displayUsers = useMemo(
    () =>
      sortUsersByLogin(
        applyUserFilters(users, {
          search: debouncedSearch,
          showInactive,
          viewerRole: me?.role,
          viewerUserId: me?.user_id,
        }),
      ),
    [users, debouncedSearch, showInactive, me?.role, me?.user_id],
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadNonce((value) => value + 1);
  }, []);

  const applyScope = useCallback(
    async (draft) => {
      const next = resolveAccountScopeDraft(draft, companies);
      if (next.companyId && Number(next.companyId) !== Number(companyId)) {
        try {
          const { ok, json } = await switchSessionTenant(next.companyId);
          if (!ok || !json?.success) {
            throw new Error(json?.message || json?.error || i18n.loadError);
          }
        } catch (e) {
          notify(e?.message || i18n.loadError, "error");
          return false;
        }
      }
      setCompanyId(next.companyId);
      setSelectedGroup(next.selectedGroup);
      setGroupsAllMode(next.groupsAllMode);
      setGroupAllMode(next.groupAllMode);
      return true;
    },
    [companies, companyId, i18n.loadError, notify],
  );

  const rowCaps = useCallback(
    (row) => computeRowCapabilities(row, currentUserId, currentUserRole),
    [currentUserId, currentUserRole],
  );

  const loadDetail = useCallback(
    async (row) => {
      try {
        // `/api/userlist/get` needs the tenant the row was listed under (it scopes the tenant
        // access row), which is `scope_tenant_id` on the normalized list row.
        const scopeTenantId = Number(row.scope_tenant_id) || Number(companyId);
        const data = await fetchAdminDetailByUserId(row.id, scopeTenantId, {
          isOwnerShadow: !!row.is_owner_shadow,
        });
        setDetail(data);
        return data;
      } catch (e) {
        notify(e?.message || i18n.detailError, "error");
        return null;
      }
    },
    [companyId, i18n.detailError, notify],
  );

  const toggleStatus = useCallback(
    async (row) => {
      if (!canMutate) {
        notify(i18n.readOnly, "error");
        return;
      }
      if (!rowCaps(row).canToggleStatus) return;
      try {
        const scopeTenantId = Number(row.scope_tenant_id) || Number(companyId);
        const updated = await toggleAdminUserStatus({ id: row.id, scopeTenantId });
        const newStatus = updated?.status;
        if (!newStatus) throw new Error(i18n.toggleError);
        setUsers((rows) =>
          rows.map((u) => (Number(u.id) === Number(row.id) ? { ...u, status: newStatus } : u)),
        );
        setDetail((d) => (Number(d?.id) === Number(row.id) ? { ...d, status: newStatus } : d));
        notify(i18n.statusUpdated);
      } catch (e) {
        notify(e?.message || i18n.toggleError, "error");
      }
    },
    [canMutate, companyId, i18n.readOnly, i18n.statusUpdated, i18n.toggleError, notify, rowCaps],
  );

  const deleteUser = useCallback(async () => {
    if (!detail || !canMutate) return false;
    if (normRole(detail.status) !== "inactive") {
      notify(i18n.deleteInactiveOnly, "error");
      return false;
    }
    if (!rowCaps(detail).canDelete) return false;
    setSaving(true);
    try {
      const scopeTenantId = Number(detail.scope_tenant_id) || Number(companyId);
      await deleteAdminUser({ id: Number(detail.id), scopeTenantId });
      setDetail(null);
      setReloadNonce((value) => value + 1);
      notify(i18n.deleteSuccess);
      return true;
    } catch (e) {
      notify(e?.message || i18n.deleteError, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [canMutate, companyId, detail, i18n.deleteError, i18n.deleteInactiveOnly, i18n.deleteSuccess, notify, rowCaps]);

  /**
   * The assignable Account / Process lists for the modal.
   *
   * These replace the legacy `?for_assignment=1` endpoints, whose `toggleable_ids` told the
   * client what it was allowed to grant. Spring has no such field: the narrowing now lives in the
   * list queries themselves — `UserServiceImpl.filterByAccountAcl` and
   * `ProcessServiceImpl.filterByProcessAcl` drop rows the *requester* holds no grant for. So
   * whatever comes back here IS the grantable set, and no `toggleableIds` state exists any more.
   */
  const loadFormOptions = useCallback(async () => {
    const tenantIds = resolveScopeTenantIds(scope, companies, groupIds);
    if (!tenantIds.length) {
      setFormAccounts([]);
      setFormProcesses([]);
      return { accounts: [], processes: [] };
    }
    const slices = await Promise.all(
      tenantIds.map(async (tid) => {
        const [accRows, procRows] = await Promise.all([
          fetchAccountListByTenantId(tid).catch(() => []),
          fetchProcessListByTenantId(tid).catch(() => []),
        ]);
        return { accRows, procRows };
      }),
    );
    const byAccountId = new Map();
    const byProcessId = new Map();
    for (const { accRows, procRows } of slices) {
      for (const a of accRows) {
        const id = Number(a.id);
        if (!(id > 0) || String(a.status || "").toLowerCase() !== "active") continue;
        if (byAccountId.has(id)) continue;
        byAccountId.set(id, {
          id,
          account_id: a.account_id || "",
          name: String(a.name || "").trim(),
        });
      }
      for (const p of procRows) {
        const id = Number(p.id);
        if (!(id > 0) || String(p.status || "").toLowerCase() !== "active") continue;
        if (byProcessId.has(id)) continue;
        byProcessId.set(id, {
          id,
          process_id: p.process_id || "",
          description: p.description || "",
        });
      }
    }
    const accounts = [...byAccountId.values()];
    const processes = [...byProcessId.values()];
    setFormAccounts(accounts);
    setFormProcesses(processes);
    return { accounts, processes };
  }, [companies, groupIds, scope]);

  const openCreate = useCallback(async () => {
    if (!canMutate) {
      notify(mutationsBlocked ? i18n.readOnly : i18n.singleCompanyRequired, "error");
      return false;
    }
    setEditingRow(null);
    setForm({ ...EMPTY_FORM });
    setPermSelected(new Set());
    if (useDualTenantPicker) {
      setSelectedTenantGroupIds(
        new Set(resolveAdminGroupEntityIds(tenantGroupOptions, selectedGroup ? [selectedGroup] : [])),
      );
      const allowedCompanies = new Set(tenantCompanyOptions.map((row) => Number(row.id)));
      setSelectedTenantCompanyIds(
        new Set(allowedCompanies.has(Number(companyId)) ? [Number(companyId)] : []),
      );
    } else {
      setSelectedTenantGroupIds(new Set());
      setSelectedTenantCompanyIds(new Set());
    }
    try {
      const { accounts, processes } = await loadFormOptions();
      setSelectedAccountIds(new Set(accounts.map((a) => a.id)));
      setSelectedProcessIds(new Set(processes.map((p) => p.id)));
      // New user: no held baseline, so nothing to shrink against.
      setSelfAccHeldIds(null);
      setSelfProcessHeldIds(null);
      setBaselinePending(true);
      return true;
    } catch (e) {
      setBaselinePending(true);
      notify(e?.message || i18n.loadError, "error");
      return false;
    }
  }, [
    canMutate,
    companyId,
    i18n.loadError,
    i18n.readOnly,
    i18n.singleCompanyRequired,
    loadFormOptions,
    mutationsBlocked,
    notify,
    selectedGroup,
    tenantCompanyOptions,
    tenantGroupOptions,
    useDualTenantPicker,
  ]);

  const openEdit = useCallback(async (source) => {
    const target = source || detail;
    if (!target) return false;
    if (!canMutate) {
      notify(mutationsBlocked ? i18n.readOnly : i18n.singleCompanyRequired, "error");
      return false;
    }
    if (!rowCaps(target).canEditDelete) return false;
    setEditingRow(target);
    setForm({
      id: target.id,
      login_id: String(target.login_id || ""),
      name: String(target.name || ""),
      email: String(target.email || ""),
      role: normRole(target.role),
      password: "",
      status: normRole(target.status) || "active",
      read_only: Number(target.read_only ?? 1) === 1,
    });
    setPermSelected(new Set(parseJsonArray(target.permissions)));
    if (useDualTenantPicker && !target.is_owner_shadow) {
      setSelectedTenantGroupIds(
        new Set(resolveAdminGroupEntityIds(tenantGroupOptions, parseJsonArray(target.group_codes))),
      );
      const allowedCompanies = new Set(tenantCompanyOptions.map((row) => Number(row.id)));
      setSelectedTenantCompanyIds(
        new Set(
          parseJsonArray(target.company_ids)
            .map(Number)
            .filter((id) => allowedCompanies.has(id)),
        ),
      );
    } else {
      setSelectedTenantGroupIds(new Set());
      setSelectedTenantCompanyIds(new Set());
    }
    try {
      const { accounts, processes } = await loadFormOptions();

      /* Spring stores the grant set as `null` (all) / `[]` (none) / `[{id}]` rows — there are no
         per-row `self_hidden` / `superior_closed` flags to partition (the backend has neither
         column). So:
           - unset  → every listed row is checked;
           - set    → exactly the granted ids are checked (a grant a superior removed is simply
                      absent, which is how "superior-closed" is expressed now);
           - self   → additionally record the *held* baseline, the only set this admin may
                      (re)check and the set the save path intersects against. */
      const accPerms = target.account_permissions;
      const accUnset = accPerms == null;
      const accRows = accUnset ? null : Array.isArray(accPerms) ? accPerms : [];
      const procPerms = target.process_permissions;
      const procUnset = procPerms == null;
      const procRows = procUnset ? null : Array.isArray(procPerms) ? procPerms : [];
      const toIds = (rows) =>
        new Set((Array.isArray(rows) ? rows : []).map((x) => Number(x?.id ?? x)).filter((id) => id > 0));

      setSelectedAccountIds(
        accUnset ? new Set(accounts.map((a) => Number(a.id)).filter((id) => id > 0)) : toIds(accRows),
      );
      setSelectedProcessIds(
        procUnset ? new Set(processes.map((p) => Number(p.id)).filter((id) => id > 0)) : toIds(procRows),
      );

      const isSelf = canSelfEditAccountAccess(target, currentUserId, currentUserRole);
      setSelfAccHeldIds(
        isSelf ? buildSelfAccHeldIds(accRows, accUnset, accounts.map((a) => a.id)) : null,
      );
      setSelfProcessHeldIds(
        isSelf ? buildSelfAccHeldIds(procRows, procUnset, processes.map((p) => p.id)) : null,
      );
      setBaselinePending(true);
      return true;
    } catch (e) {
      setBaselinePending(true);
      notify(e?.message || i18n.loadError, "error");
      return false;
    }
  }, [
    canMutate,
    currentUserId,
    currentUserRole,
    detail,
    i18n.loadError,
    i18n.singleCompanyRequired,
    i18n.readOnly,
    loadFormOptions,
    mutationsBlocked,
    notify,
    rowCaps,
    tenantCompanyOptions,
    tenantGroupOptions,
    useDualTenantPicker,
  ]);

  /** New user: sidebar permissions follow the role template until manually changed. */
  const applyRoleTemplate = useCallback((role) => {
    setPermSelected(new Set(getRoleTemplateSidebarList(role)));
  }, []);

  const saveUser = useCallback(async () => {
    if (!canMutate) {
      notify(i18n.readOnly, "error");
      return false;
    }
    const editing = isEditMode;
    const ownerShadow = !!editingRow?.is_owner_shadow;
    if (!form.name.trim() || !form.email.trim() || (!ownerShadow && !form.role)) {
      notify(editing ? i18n.editRequiredFields : i18n.requiredFields, "error");
      return false;
    }
    if (!editing && (!form.login_id.trim() || !form.password.trim())) {
      notify(i18n.requiredFields, "error");
      return false;
    }
    const emailCheck = validateUserEmail(form.email);
    if (!emailCheck.ok) {
      notify(i18n.invalidEmail, "error");
      return false;
    }
    const selfAcc = editing && canSelfEditAccountAccess(editingRow, currentUserId, currentUserRole);

    /* Account / Process grants. Spring stores exactly the submitted set as `{id}` rows
       (`null` = all, `[]` = none) — there are no `self_hidden` / `superior_closed` flags, and the
       backend does NOT verify that the submitted ids are ones this actor is allowed to grant. So
       the two guards below ARE the narrowing:
         - self edit → ticked ∩ held. A grant a superior removed is absent from `existingPerms`,
                       hence absent from the held baseline, hence cannot be re-granted to self.
         - non-self  → keep the target's grants this editor cannot see (invisible must not mean
                       revoked) and accept ticked ids only from the editor's visible set. */
    const toRows = (ids) =>
      [...ids].map((id) => Number(id)).filter((id) => id > 0).map((id) => ({ id }));
    const heldRows = (held, fallback) =>
      held instanceof Set
        ? [...held].map((id) => ({ id: Number(id) })).filter((r) => r.id > 0)
        : fallback;
    const submittedAccounts = toRows(selectedAccountIds);
    const submittedProcesses = toRows(selectedProcessIds);
    const modalAccountIds = formAccounts.map((a) => Number(a.id)).filter((id) => id > 0);
    const modalProcessIds = formProcesses.map((p) => Number(p.id)).filter((id) => id > 0);
    const existingAccUnset = editingRow?.account_permissions == null;
    const existingProcUnset = editingRow?.process_permissions == null;
    const existingAcc = existingAccUnset ? [] : editingRow?.account_permissions;
    const existingProc = existingProcUnset ? [] : editingRow?.process_permissions;
    const editorSeesAll = currentUserRole === "owner";

    const accountPerms = resolveSeeAllOrCompactPermissions(
      { isSelf: !!selfAcc, editorSeesAll, selectedIds: selectedAccountIds, rows: formAccounts },
      selfAcc
        ? shrinkAccountPermissionsForSelf(
            heldRows(selfAccHeldIds, existingAccUnset ? submittedAccounts : existingAcc),
            submittedAccounts,
          )
        : existingAccUnset
          ? submittedAccounts
          : mergeAccountPermissionsForEditor(existingAcc, submittedAccounts, modalAccountIds),
    );
    const processPerms = resolveSeeAllOrCompactPermissions(
      { isSelf: !!selfAcc, editorSeesAll, selectedIds: selectedProcessIds, rows: formProcesses },
      selfAcc
        ? shrinkAccountPermissionsForSelf(
            heldRows(selfProcessHeldIds, existingProcUnset ? submittedProcesses : existingProc),
            submittedProcesses,
          )
        : existingProcUnset
          ? submittedProcesses
          : mergeAccountPermissionsForEditor(existingProc, submittedProcesses, modalProcessIds),
    );

    /* Spring `AdminDTO.tenantIds` is a flat list mixing group + company tenant ids. */
    const isAdminOrOwner = currentUserRole === "admin" || currentUserRole === "owner";
    const tenantIds = [];
    if (useDualTenantPicker && !ownerShadow) {
      tenantIds.push(...resolveAdminGroupEntityIds(tenantGroupOptions, [...selectedTenantGroupIds]));
      tenantIds.push(...[...selectedTenantCompanyIds].map(Number).filter((id) => id > 0));
    } else if (isAdminOrOwner && Number(companyId) > 0) {
      tenantIds.push(Number(companyId));
    }

    let secondaryPassword = "";
    const allowSecondaryPassword = isC168Company || ownerShadow;
    if (allowSecondaryPassword && form.secondary_password?.trim()) {
      if (!/^\d{6}$/.test(form.secondary_password.trim())) {
        notify(i18n.secondaryPasswordMustBe6Digits, "error");
        return false;
      }
      secondaryPassword = form.secondary_password.trim();
    }

    const common = {
      name: form.name.trim(),
      email: emailCheck.normalized,
      role: ownerShadow ? "owner" : form.role,
      status: form.status,
      password: form.password.trim() || undefined,
      secondaryPassword: secondaryPassword || undefined,
      readOnly: showReadOnlyToggle ? !!form.read_only : undefined,
    };
    let request;
    if (ownerShadow) {
      // Owner-shadow rows only carry profile fields — no role, no tenant ACL.
      request = buildAdminOwnerProfileUpdateRequest({ id: form.id, ...common });
    } else if (!editing) {
      request = buildAdminCreateRequest({
        ...common,
        loginId: form.login_id.trim(),
        permissions: getFinalPermissionsForCreation(form.role, [...permSelected], currentUserRole),
        tenantIds,
        accountPermissions: accountPerms,
        processPermissions: processPerms,
      });
    } else {
      request = buildAdminUpdateRequest({
        ...common,
        id: form.id,
        scopeTenantId: Number(detail?.scope_tenant_id) || Number(companyId),
        tenantAccessId: detail?.tenant_access_id,
        permissions: !fieldLocks.sidebar ? [...permSelected] : undefined,
        tenantIds: fieldLocks.company ? undefined : tenantIds,
        // A locked Account/Process column means "don't touch the grant set": send nothing so the
        // backend keeps the existing ACL mode. Self-edit bypasses the lock (you may shrink
        // your own access) — desktop does the same.
        accountPermissions: !fieldLocks.accountProcess || selfAcc ? accountPerms : undefined,
        processPermissions: !fieldLocks.accountProcess || selfAcc ? processPerms : undefined,
      });
    }
    setSaving(true);
    try {
      if (ownerShadow) {
        await updateAdminOwnerProfile(request);
      } else if (editing) {
        await updateAdminUser(request);
      } else {
        await createAdminUser(request);
      }
      notify(i18n.saveSuccess);
      setReloadNonce((value) => value + 1);
      if (editing) await loadDetail({ id: form.id, is_owner_shadow: ownerShadow });
      return true;
    } catch (e) {
      notify(e?.message || i18n.saveError, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    canMutate,
    companyId,
    currentUserId,
    currentUserRole,
    editingRow,
    fieldLocks,
    form,
    formAccounts,
    formProcesses,
    i18n,
    isEditMode,
    loadDetail,
    notify,
    permSelected,
    selectedAccountIds,
    selectedProcessIds,
    selectedGroup,
    selectedTenantCompanyIds,
    selectedTenantGroupIds,
    showReadOnlyToggle,
    selfAccHeldIds,
    selfProcessHeldIds,
    tenantGroupOptions,
    useDualTenantPicker,
  ]);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  return {
    i18n,
    lang,
    setLang,
    me,
    companies,
    companyId,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    selectedCompany,
    isC168Company,
    groupIds,
    companiesForPicker: companiesForPicker(companies, {
      selectedGroup,
      groupsAllMode,
      preferredCompanyId: companyId,
    }),
    canUseGroupOnlyForGroup: (group) => canUseGroupOnlyMode(me, group, companies),
    resolveCompanyForGroup: (group, current) => resolveCompanyPickForGroup(companies, group, current),
    applyScope,
    users: displayUsers,
    search,
    setSearch,
    showInactive,
    setShowInactive,
    loading,
    refreshing,
    error,
    blocked,
    toast,
    refresh,
    mutationsBlocked,
    canMutate,
    rowCaps,
    detail,
    setDetail,
    loadDetail,
    toggleStatus,
    deleteUser,
    form,
    setForm,
    isEditMode,
    editingRow,
    fieldLocks,
    roleOptions,
    visiblePermissionKeys,
    showReadOnlyToggle,
    permSelected,
    setPermSelected,
    applyRoleTemplate,
    formAccounts,
    formProcesses,
    selectedAccountIds,
    setSelectedAccountIds,
    selectedProcessIds,
    setSelectedProcessIds,
    /** Per-axis self-edit "held" baselines (`null` for a non-self edit). The sheet passes these
     *  to the tile grids, which then refuse to check anything outside them. */
    selfAccHeldIds,
    selfProcessHeldIds,
    selfToggle: isEditMode && canSelfEditAccountAccess(editingRow, currentUserId, currentUserRole),
    useDualTenantPicker,
    tenantGroupOptions,
    tenantCompanyOptions,
    selectedTenantGroupIds,
    setSelectedTenantGroupIds,
    selectedTenantCompanyIds,
    setSelectedTenantCompanyIds,
    openCreate,
    openEdit,
    saveUser,
    isFormDirty,
    saving,
    logout,
    notify,
  };
}
