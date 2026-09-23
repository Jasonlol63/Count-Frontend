import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  buildMobileRealtimeScopeFromGc,
  setMobileRealtimeScope,
} from "../lib/realtime/mobileRealtimeScope.js";
import { REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";
import { useRealtimeDomain } from "../lib/realtime/useRealtimeDomain.js";
import { accountText } from "../translateFile/accountTranslate.js";
import { fetchCurrentUser, logoutSession, switchSessionTenant } from "../lib/authApi.js";
import { withLegacyCompanyAliases } from "../lib/sessionUserAliases.js";
import { fetchOwnerCompaniesForMobile } from "../lib/tenantAccessibleApi.js";
import { getAccountModalOrderedRoles, normalizeAlertAmount } from "../lib/accountLogic.js";
import {
  accountRowToEditForm,
  buildAccountCreateRequest,
  buildAccountUpdateRequest,
  createAccountUser,
  createTenantCurrency,
  deleteAccountUser,
  deleteTenantCurrency,
  fetchAccountLinkedAccounts,
  fetchAccountListByTenantId,
  fetchAccountsLinkedToCurrency,
  fetchAvailableCurrencies,
  fetchMergedAccountLists,
  linkAccountPair,
  resolveRowScopeTenantId,
  toggleAccountUserPaymentAlert,
  toggleAccountUserStatus,
  unlinkAccountPair,
  updateAccountLinkPair,
  updateAccountUser,
  updateAccountsLinkedToCurrency,
} from "../lib/accountApi.js";
import { canAccessAccount, resolveMobileLandingPath } from "../utils/mobilePermissions.js";

const EMPTY_FORM = {
  id: "",
  account_id: "",
  name: "",
  role: "",
  status: "active",
  password: "",
  remark: "",
  payment_alert: "0",
  alert_type: "",
  alert_start_date: "",
  alert_amount: "",
};

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

/** GROUP-type tenant row whose own code matches this group id. */
function findGroupRow(companies, groupCode) {
  const g = upper(groupCode);
  if (!g) return null;
  return companies.find((c) => c.tenant_type === "GROUP" && upper(c.company_id) === g) || null;
}

export function useMobileAccount() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => accountText(lang), [lang]);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState("account");
  const [sortDirection, setSortDirection] = useState("asc");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [toast, setToast] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [roles, setRoles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formCurrencies, setFormCurrencies] = useState([]);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [linkPool, setLinkPool] = useState([]);
  const [linkedIds, setLinkedIds] = useState(new Set());
  const [linkTypeMap, setLinkTypeMap] = useState({});
  const [linkType, setLinkType] = useState("bidirectional");
  const [currencyLinked, setCurrencyLinked] = useState(new Set());
  const [currencyInitial, setCurrencyInitial] = useState(new Set());
  const [settingCurrencyIds, setSettingCurrencyIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef(null);
  const listSeq = useRef(0);
  const softReloadRef = useRef(false);

  const scope = useMemo(
    () => ({ companyId, selectedGroup, groupsAllMode, groupAllMode }),
    [companyId, selectedGroup, groupsAllMode, groupAllMode],
  );
  const groupIds = useMemo(() => resolveMobileGroupIds(companies, me), [companies, me]);
  const selectedCompany = useMemo(
    () => companies.find((row) => Number(row.id) === Number(companyId)) || null,
    [companies, companyId],
  );
  const groupOnlyMode = accountScopeIsGroupOnly(scope);
  const mutationsBlocked = isPartnershipAuditReadOnlyLocked(me);
  const canMutate =
    !mutationsBlocked &&
    !groupsAllMode &&
    !groupAllMode &&
    (Number(companyId) > 0 || groupOnlyMode);

  /** Tenant id used for role/currency lookups + mutations in the current modal context. */
  const effectiveTenantId = useCallback(() => {
    if (groupOnlyMode) return findGroupRow(companies, selectedGroup)?.id ?? null;
    return companyId;
  }, [companies, companyId, groupOnlyMode, selectedGroup]);

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
        const { ok, json: meJson } = await fetchCurrentUser({ signal: ac.signal });
        if (!ok || !meJson?.success || !meJson?.data) {
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
        if (!canAccessAccount(user)) {
          setBlocked(true);
          navigate(resolveMobileLandingPath(user), { replace: true });
          return;
        }
        setMe(user);
        const list = await fetchOwnerCompaniesForMobile(ac.signal);
        const scoped = filterCompaniesForUserScope(list, user);
        const picked = pickCompany(scoped, user.company_id);
        const initial = resolveInitialMobileGcScope(user, scoped, picked);

        /* Desktop parity (AccountListPage boot sync): align the server-side session tenant with
           the company this page is about to show. The account list itself is fine — tenant_id
           travels on each request — but the realtime WebSocket binds the session tenant at
           handshake time and the backend only authorises /topic/company/{id} for that tenant
           (StompSubscriptionAuthInterceptor); a mismatch gets every company-scoped SUBSCRIBE
           rejected with an ERROR frame and a closed session. Best-effort, like desktop: a
           failure here must not block the page.

           Deliberately awaited BEFORE the scope state below: committing the scope publishes the
           realtime scope, which reconnects the socket on a debounce, and the handshake must
           already carry the new tenant or the first company subscriptions get rejected. */
        const initialCompanyId = Number(initial.companyId) || null;
        if (initialCompanyId && initialCompanyId !== (Number(user.company_id) || null)) {
          try {
            await switchSessionTenant(initialCompanyId, { signal: ac.signal });
          } catch {
            /* boot session sync is best-effort */
          }
          if (ac.signal.aborted) return;
        }

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

  const fetchRows = useCallback(
    async (signal) => {
      const tenantIds = resolveScopeTenantIds(scope, companies, groupIds);
      if (!tenantIds.length) return [];
      return fetchMergedAccountLists(
        { tenantIds, searchTerm: debouncedSearch, showInactive },
        signal,
      );
    },
    [companies, debouncedSearch, groupIds, scope, showInactive],
  );

  useEffect(() => {
    if (!me || (!Number(companyId) && !groupOnlyMode && !groupsAllMode && !groupAllMode)) return;
    const seq = ++listSeq.current;
    const soft = softReloadRef.current;
    softReloadRef.current = false;
    const ac = new AbortController();
    if (!soft) setLoading(true);
    setError("");
    fetchRows(ac.signal)
      .then((rows) => {
        if (seq === listSeq.current) setAccounts(rows);
      })
      .catch((e) => {
        if (e?.name !== "AbortError" && seq === listSeq.current && !soft) {
          setError(e?.message || i18n.loadError);
        }
      })
      .finally(() => {
        if (seq === listSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => ac.abort();
  }, [companyId, fetchRows, groupAllMode, groupOnlyMode, groupsAllMode, i18n.loadError, me, reloadNonce]);

  // Publish GC scope for MobileRealtimeBridge.
  useEffect(() => {
    if (!me) return;
    setMobileRealtimeScope(
      buildMobileRealtimeScopeFromGc({ companyId, selectedGroup, groupsAllMode, groupAllMode }),
    );
  }, [me, companyId, selectedGroup, groupsAllMode, groupAllMode]);

  const accountRealtimeEnabled =
    Number.isFinite(Number(companyId)) && Number(companyId) > 0
      ? true
      : Boolean(selectedGroup || groupsAllMode || groupAllMode);

  useRealtimeDomain(
    REALTIME_DOMAINS.ACCOUNTS,
    () => {
      softReloadRef.current = true;
      setReloadNonce((value) => value + 1);
    },
    { enabled: accountRealtimeEnabled },
  );

  const displayAccounts = useMemo(() => {
    const rows = [...accounts];
    const direction = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let left = a?.account_id;
      let right = b?.account_id;
      if (sortKey === "name") {
        left = a?.name;
        right = b?.name;
      } else if (sortKey === "role") {
        left = a?.role;
        right = b?.role;
      } else if (sortKey === "lastLogin") {
        left = a?.last_login;
        right = b?.last_login;
      }
      return String(left || "").localeCompare(String(right || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction;
    });
    return rows;
  }, [accounts, sortDirection, sortKey]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadNonce((value) => value + 1);
  }, []);

  /**
   * Apply a new company/group scope.
   *
   * The account list needs no session switch (`tenant_id` travels on every request), but the
   * realtime WebSocket does: the backend binds the session tenant at handshake time and only
   * authorises `/topic/company/{id}` for that tenant, so the session has to follow the company
   * being viewed or every company-scoped SUBSCRIBE is rejected. Desktop does the same on its
   * company switch (`AccountListPage` → `syncCompanySessionApi`).
   *
   * Scope is committed first and the sync is not allowed to roll it back — matching desktop,
   * which notifies on failure but keeps the selected scope.
   */
  const applyScope = useCallback(
    async (draft) => {
      const next = resolveAccountScopeDraft(draft, companies);
      const nextCompanyId = Number(next.companyId) || null;

      /* Switched before the scope state below, for the same handshake reason as the boot sync:
         the scope commit is what reconnects the socket. */
      if (nextCompanyId && nextCompanyId !== (Number(me?.company_id) || null)) {
        try {
          const { ok, json } = await switchSessionTenant(nextCompanyId);
          if (!ok || !json?.success) {
            notify(json?.message || json?.error || i18n.failedToSwitchCompany, "error");
          } else {
            // Keep local session state in step so the next switch doesn't re-issue this call.
            setMe((prev) =>
              prev
                ? { ...prev, company_id: nextCompanyId, tenant_id: nextCompanyId }
                : prev,
            );
          }
        } catch (e) {
          notify(e?.message || i18n.failedToSwitchCompany, "error");
        }
      }

      // Committed even when the sync failed — desktop notifies but keeps the selected scope.
      setCompanyId(next.companyId);
      setSelectedGroup(next.selectedGroup);
      setGroupsAllMode(next.groupsAllMode);
      setGroupAllMode(next.groupAllMode);
      return true;
    },
    [companies, me, i18n.failedToSwitchCompany, notify],
  );

  const guarded = useCallback(
    (fn) => {
      if (!canMutate) {
        notify(i18n.readOnly, "error");
        return false;
      }
      fn();
      return true;
    },
    [canMutate, i18n.readOnly, notify],
  );

  const toggleStatus = useCallback(
    async (account) => {
      if (!guarded(() => {})) return;
      try {
        const tenantId = resolveRowScopeTenantId(account, effectiveTenantId());
        const updated = await toggleAccountUserStatus({ id: account.id, scopeTenantId: tenantId });
        setAccounts((rows) => rows.map((row) => (Number(row.id) === Number(account.id) ? updated : row)));
        setDetail((row) => (Number(row?.id) === Number(account.id) ? updated : row));
        setReloadNonce((value) => value + 1);
      } catch (e) {
        notify(e?.message || i18n.toggleError, "error");
      }
    },
    [effectiveTenantId, guarded, i18n.toggleError, notify],
  );

  const toggleAlert = useCallback(
    async (accountRow) => {
      if (!guarded(() => {})) return "blocked";
      const currentlyOn = Number(accountRow?.payment_alert) === 1;
      if (!currentlyOn) {
        const type = accountRow?.alert_type || accountRow?.alert_day || "";
        const start = accountRow?.alert_start_date || accountRow?.alert_specific_date || "";
        if (!String(type).trim() || !String(start).trim()) {
          notify(i18n.alertRequired, "error");
          return "needsEdit";
        }
      }
      try {
        const tenantId = resolveRowScopeTenantId(accountRow, effectiveTenantId());
        const currencyRows = await fetchAvailableCurrencies(tenantId, accountRow.id);
        const currencyIds = currencyRows.filter((row) => row.is_linked).map((row) => row.id);
        const updated = await toggleAccountUserPaymentAlert(accountRow, tenantId, currencyIds);
        setAccounts((rows) => rows.map((row) => (Number(row.id) === Number(accountRow.id) ? updated : row)));
        setDetail((row) => (Number(row?.id) === Number(accountRow.id) ? updated : row));
        return "ok";
      } catch (e) {
        notify(e?.message || i18n.toggleError, "error");
        return "blocked";
      }
    },
    [effectiveTenantId, guarded, i18n.alertRequired, i18n.toggleError, notify],
  );

  const loadRolesAndCurrencies = useCallback(
    async (accountId = null) => {
      const tenantId = effectiveTenantId();
      const currencyRows = await fetchAvailableCurrencies(tenantId, accountId);
      setRoles(getAccountModalOrderedRoles(accounts.map((row) => row.role).filter(Boolean)));
      setCurrencies(currencyRows);
      const selected = currencyRows.filter((row) => row.is_linked).map((row) => row.id);
      setFormCurrencies(selected.length ? selected : currencyRows.slice(0, 1).map((row) => row.id));

      // Company assignment picker reuses the already-loaded company list — the old
      // `account_company_api.php?action=get_available_companies` fetch no longer exists
      // in the Spring API, a UserListDTO carries its own `tenantIds` instead.
      const assignable = companies.filter((row) => row.tenant_type !== "GROUP");
      setAvailableCompanies(assignable);
    },
    [accounts, companies, effectiveTenantId],
  );

  const openCreate = useCallback(async () => {
    if (!guarded(() => {})) return false;
    setDetail(null);
    setForm({ ...EMPTY_FORM });
    try {
      await loadRolesAndCurrencies(null);
      setSelectedCompanyIds(
        groupOnlyMode
          ? [effectiveTenantId()].filter(Boolean)
          : [companyId].filter((id) => Number(id) > 0),
      );
      return true;
    } catch (e) {
      notify(e?.message || i18n.loadError, "error");
      return false;
    }
  }, [companyId, effectiveTenantId, groupOnlyMode, guarded, i18n.loadError, loadRolesAndCurrencies, notify]);

  const openEdit = useCallback(
    async (source) => {
      const row = source || detail;
      if (!row || !guarded(() => {})) return false;
      setDetail(row);
      const tenantId = resolveRowScopeTenantId(row, effectiveTenantId());
      setForm(accountRowToEditForm(row));
      try {
        await loadRolesAndCurrencies(row.id);
        setSelectedCompanyIds(
          groupOnlyMode ? [tenantId].filter(Boolean) : (row.tenant_ids || []).map(Number),
        );
        return true;
      } catch (e) {
        notify(e?.message || i18n.loadError, "error");
        return false;
      }
    },
    [detail, effectiveTenantId, groupOnlyMode, guarded, i18n.loadError, loadRolesAndCurrencies, notify],
  );

  const loadDetail = useCallback(
    async (account) => {
      // The Spring list already carries every field the modal needs (and never sends
      // the password hash), so unlike the old `getaccount_api.php` there is no separate
      // detail fetch — just use the row already present in `accounts`.
      const row = accounts.find((r) => Number(r.id) === Number(account?.id)) || account;
      setDetail(row);
      return row;
    },
    [accounts],
  );

  const saveAccount = useCallback(async () => {
    const editing = Number(form.id) > 0;
    if (!form.name.trim() || !form.role.trim() || (!editing && (!form.account_id.trim() || !form.password.trim()))) {
      notify(editing ? i18n.editRequiredFields : i18n.requiredFields, "error");
      return false;
    }
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      notify(i18n.alertRequired, "error");
      return false;
    }
    let tenantIds;
    let primaryTenantId;
    if (groupOnlyMode) {
      const groupTenantId = effectiveTenantId();
      if (!groupTenantId) {
        notify(i18n.pleaseSelectCompanyFirst || i18n.requiredFields, "error");
        return false;
      }
      tenantIds = [groupTenantId];
      primaryTenantId = groupTenantId;
    } else {
      tenantIds = selectedCompanyIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
      if (!tenantIds.length) {
        notify(i18n.pleaseSelectCompanyFirst || i18n.requiredFields, "error");
        return false;
      }
      primaryTenantId = tenantIds.includes(Number(companyId)) ? Number(companyId) : tenantIds[0];
    }
    const currencyIds = formCurrencies.map(Number).filter((id) => Number.isFinite(id) && id > 0);
    setSaving(true);
    try {
      const form_ = { ...form, account_id: upper(form.account_id), name: upper(form.name), remark: upper(form.remark), alert_amount: normalizeAlertAmount(form.alert_amount) };
      if (editing) {
        const request = buildAccountUpdateRequest(form_, primaryTenantId, currencyIds, tenantIds);
        await updateAccountUser(request);
      } else {
        const request = buildAccountCreateRequest(form_, primaryTenantId, currencyIds, tenantIds);
        await createAccountUser(request);
      }
      notify(i18n.saveSuccess);
      setReloadNonce((value) => value + 1);
      return true;
    } catch (e) {
      notify(e?.message || i18n.saveError, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [companyId, effectiveTenantId, form, formCurrencies, groupOnlyMode, i18n, notify, selectedCompanyIds]);

  const loadLinks = useCallback(async () => {
    if (!detail || !guarded(() => {})) return false;
    try {
      const tenantId = resolveRowScopeTenantId(detail, effectiveTenantId());
      const [poolRows, linked] = await Promise.all([
        fetchAccountListByTenantId(tenantId),
        fetchAccountLinkedAccounts(detail.id, tenantId),
      ]);
      setLinkPool(poolRows.filter((row) => Number(row.id) !== Number(detail.id)));
      setLinkTypeMap(linked.linkTypesMap);
      setLinkedIds(
        new Set(
          Object.entries(linked.linkTypesMap)
            .filter(([, type]) => type === "bidirectional")
            .map(([id]) => Number(id)),
        ),
      );
      setLinkType("bidirectional");
      return true;
    } catch (e) {
      notify(e?.message || i18n.linkError, "error");
      return false;
    }
  }, [detail, effectiveTenantId, guarded, i18n.linkError, notify]);

  useEffect(() => {
    setLinkedIds(
      new Set(
        Object.entries(linkTypeMap)
          .filter(([, type]) => type === linkType)
          .map(([id]) => Number(id)),
      ),
    );
  }, [linkType, linkTypeMap]);

  const saveLinks = useCallback(async () => {
    if (!detail) return false;
    setSaving(true);
    try {
      const current = new Set(
        Object.entries(linkTypeMap)
          .filter(([, type]) => type === linkType)
          .map(([id]) => Number(id)),
      );
      const add = [...linkedIds].filter((id) => !current.has(id));
      const remove = [...current].filter((id) => !linkedIds.has(id));
      const tenantId = resolveRowScopeTenantId(detail, effectiveTenantId());
      for (const id of remove) {
        await unlinkAccountPair({ accountId1: detail.id, accountId2: id, tenantId });
      }
      for (const id of add) {
        await linkAccountPair({
          accountId1: detail.id,
          accountId2: id,
          linkType,
          sourceAccountId: linkType === "unidirectional" ? detail.id : null,
        });
      }
      if (!add.length && !remove.length && linkedIds.size > 0) {
        for (const id of linkedIds) {
          await updateAccountLinkPair({
            accountId1: detail.id,
            accountId2: id,
            linkType,
            sourceAccountId: linkType === "unidirectional" ? detail.id : null,
          });
        }
      }
      notify(i18n.linkSuccess);
      return true;
    } catch (e) {
      notify(e?.message || i18n.linkError, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [detail, effectiveTenantId, i18n.linkError, i18n.linkSuccess, linkType, linkTypeMap, linkedIds, notify]);

  const deleteAccount = useCallback(async () => {
    if (!detail || !canMutate) return false;
    if (String(detail.status || "").toLowerCase() !== "inactive") return false;
    setSaving(true);
    try {
      const tenantId = resolveRowScopeTenantId(detail, effectiveTenantId());
      await deleteAccountUser({ id: detail.id, scopeTenantId: tenantId });
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
  }, [canMutate, detail, effectiveTenantId, i18n.deleteError, i18n.deleteSuccess, notify]);

  const loadCurrencyLinks = useCallback(
    async (currencyId) => {
      const tenantId = effectiveTenantId();
      const { linkedAccountIds } = await fetchAccountsLinkedToCurrency(currencyId, tenantId);
      return linkedAccountIds;
    },
    [effectiveTenantId],
  );

  useEffect(() => {
    const currencyIds = [...settingCurrencyIds].map(Number).filter((id) => id > 0);
    if (!currencyIds.length) {
      setCurrencyLinked(new Set());
      setCurrencyInitial(new Set());
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          currencyIds.map(async (currencyId) => [currencyId, new Set(await loadCurrencyLinks(currencyId))]),
        );
        if (cancelled) return;
        // Intersection across the selected currencies (same UX as before).
        const sets = entries.map(([, set]) => set);
        const intersection = sets.length
          ? [...sets[0]].filter((id) => sets.every((s) => s.has(id)))
          : [];
        setCurrencyInitial(new Set(intersection));
        setCurrencyLinked(new Set(intersection));
      } catch (e) {
        if (!cancelled) notify(e?.message || i18n.currencyError, "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n.currencyError, loadCurrencyLinks, notify, settingCurrencyIds]);

  const openCurrency = useCallback(async () => {
    if (!guarded(() => {})) return false;
    try {
      setSettingCurrencyIds(new Set());
      setCurrencyLinked(new Set());
      setCurrencyInitial(new Set());
      await loadRolesAndCurrencies();
      return true;
    } catch (e) {
      notify(e?.message || i18n.currencyError, "error");
      return false;
    }
  }, [guarded, i18n.currencyError, loadRolesAndCurrencies, notify]);

  const createCurrency = useCallback(
    async (code) => {
      const normalized = upper(code);
      if (!normalized || !canMutate) return false;
      try {
        await createTenantCurrency({ code: normalized, tenantId: effectiveTenantId() });
        await loadRolesAndCurrencies();
        return true;
      } catch (e) {
        notify(e?.message || i18n.currencyError, "error");
        return false;
      }
    },
    [canMutate, effectiveTenantId, i18n.currencyError, loadRolesAndCurrencies, notify],
  );

  const deleteCurrency = useCallback(
    async (currency) => {
      if (!currency?.id || !canMutate) return false;
      try {
        const { success, message } = await deleteTenantCurrency({
          id: currency.id,
          tenantId: effectiveTenantId(),
        });
        if (!success) throw new Error(message || i18n.currencyError);
        setCurrencies((rows) => rows.filter((row) => Number(row.id) !== Number(currency.id)));
        setSettingCurrencyIds((prev) => {
          const next = new Set(prev);
          next.delete(Number(currency.id));
          return next;
        });
        return true;
      } catch (e) {
        notify(e?.message || i18n.currencyError, "error");
        return false;
      }
    },
    [canMutate, effectiveTenantId, i18n.currencyError, notify],
  );

  const saveCurrencyLinks = useCallback(async () => {
    const currencyIds = [...settingCurrencyIds]
      .map(Number)
      .filter((id) => id > 0 && currencies.some((row) => Number(row.id) === id));
    if (!currencyIds.length) {
      notify(i18n.pleaseSelectCurrencyFirst, "error");
      return false;
    }
    const toggledOn = [];
    const toggledOff = [];
    accounts.forEach((row) => {
      const id = Number(row.id);
      if (!(id > 0)) return;
      const was = currencyInitial.has(id);
      const now = currencyLinked.has(id);
      if (now && !was) toggledOn.push(id);
      if (!now && was) toggledOff.push(id);
    });
    if (!toggledOn.length && !toggledOff.length) {
      notify(i18n.pleaseSelectAccountFirst, "error");
      return false;
    }
    setSaving(true);
    try {
      const tenantId = effectiveTenantId();
      for (const currencyId of currencyIds) {
        await updateAccountsLinkedToCurrency({
          tenantId,
          currencyId,
          linkedAccountIds: toggledOn,
          unlinkedAccountIds: toggledOff,
        });
      }
      setCurrencyInitial(new Set(currencyLinked));
      notify(i18n.currencySuccess);
      return true;
    } catch (e) {
      notify(e?.message || i18n.currencyError, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [accounts, currencies, currencyInitial, currencyLinked, effectiveTenantId, i18n, notify, settingCurrencyIds]);

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
    groupIds,
    companiesForPicker: companiesForPicker(companies, {
      selectedGroup,
      groupsAllMode,
      preferredCompanyId: companyId,
    }),
    canUseGroupOnlyForGroup: (group) => canUseGroupOnlyMode(me, group, companies),
    resolveCompanyForGroup: (group, current) => resolveCompanyPickForGroup(companies, group, current),
    applyScope,
    accounts: displayAccounts,
    search,
    setSearch,
    showInactive,
    setShowInactive,
    sortKey,
    setSortKey,
    sortDirection,
    setSortDirection,
    loading,
    refreshing,
    error,
    blocked,
    toast,
    refresh,
    reload: refresh,
    mutationsBlocked,
    canMutate,
    detail,
    setDetail,
    loadDetail,
    toggleStatus,
    toggleAlert,
    form,
    setForm,
    roles,
    currencies,
    formCurrencies,
    setFormCurrencies,
    availableCompanies,
    selectedCompanyIds,
    setSelectedCompanyIds,
    groupOnlyMode,
    openCreate,
    openEdit,
    saveAccount,
    linkPool,
    linkedIds,
    setLinkedIds,
    linkType,
    setLinkType,
    loadLinks,
    saveLinks,
    deleteAccount,
    currencyLinked,
    setCurrencyLinked,
    settingCurrencyIds,
    setSettingCurrencyIds,
    currencyInitial,
    loadCurrencyLinks,
    openCurrency,
    createCurrency,
    deleteCurrency,
    saveCurrencyLinks,
    saving,
    logout,
    notify,
  };
}
