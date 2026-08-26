import { useCallback, useEffect, useMemo, useState } from "react";
import { assetUrl, buildApiUrl } from "../../utils/core/apiUrl.js";
import { injectStylesheet } from "../../utils/core/injectStylesheet.js";
import { MAINTENANCE_I18N } from "../../translateFile/pages/maintenanceTranslate.js";
import { formatMemberRole, getMemberText } from "../../translateFile/pages/memberTranslate.js";
import { ensureMaintenanceDateRangePicker } from "../../utils/date/dateRangePicker.js";
import {
  publishMaintenanceModeEvent,
  subscribeMaintenanceModeEvent,
} from "../../utils/maintenance/maintenanceRealtimeBus.js";
import { useExpirationReminder } from "../../hooks/useExpirationReminder.js";
import { buildSidebarExpirationFields } from "../../utils/expiration/expirationReminder.js";
import { clearDashboardFilterSession, clearOwnerCompaniesCache } from "../../utils/company/sharedCompanyFilter.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import { fetchCurrentUser, fetchTenantAccessible, logoutSession } from "../../utils/auth/authApi.js";

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * Spring `SessionUser` (`/auth/current-user`) → legacy `current_user_api.php` field names,
 * which `MemberPage.jsx`/`useMemberWinLoss.js` still read. Company and Group are both just a
 * `tenantId` on the Spring side (no separate group_id concept) — `company_id` here is always
 * the tenant id regardless of tenant type.
 */
function normalizeSessionUserToMemberMe(u) {
  if (!u) return null;
  return {
    user_id: u.user_id,
    member_login_account_id: u.user_id,
    member_winloss_view_account_id: u.user_id,
    winloss_view_account_id: u.user_id,
    name: u.name || "",
    login_id: u.login_id || "",
    role: u.role || "",
    user_type: u.user_type || "",
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    is_current_company_c168: Boolean(u.is_current_tenant_c168),
    company_has_gambling: Boolean(u.tenant_has_game),
    company_has_bank: Boolean(u.tenant_has_bank),
    company_id: u.tenant_id ?? null,
    company_code: u.tenant_code || null,
    login_scope: u.login_scope ?? null,
    login_identifier: u.login_identifier ?? null,
    needs_owner_secondary: Boolean(u.needs_owner_secondary),
    needs_user_secondary: Boolean(u.needs_user_secondary),
    read_only: Number(u.read_only) || 0,
    ...buildSidebarExpirationFields(u.expiration_date),
  };
}

/** `/auth/tenant-accessible` rows → legacy `get_account_companies` shape the company pills expect. */
function normalizeTenantAccessibleToCompanies(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      id: row.tenant_id,
      company_id: row.tenant_id,
      company_code: row.tenant_code || "",
      tenant_type: row.tenant_type || "",
    }))
    .filter((c) => c.company_id != null);
}

const AVATAR_MAP = {
  male1: assetUrl("images/avatar1.png"),
  male2: assetUrl("images/avatar2.png"),
  male3: assetUrl("images/avatar3.png"),
  male4: assetUrl("images/avatar4.png"),
  male5: assetUrl("images/avatar5.png"),
  male6: assetUrl("images/avatar6.png"),
  male7: assetUrl("images/avatar7.png"),
  male8: assetUrl("images/avatar8.png"),
  male9: assetUrl("images/avatar9.png"),
  female1: assetUrl("images/female1.png"),
  female2: assetUrl("images/female2.png"),
  female3: assetUrl("images/female3.png"),
  female4: assetUrl("images/female4.png"),
  female5: assetUrl("images/female5.png"),
  female6: assetUrl("images/female6.png"),
  female7: assetUrl("images/female7.png"),
  female8: assetUrl("images/female8.png"),
  female9: assetUrl("images/female9.png"),
};

/**
 * Member page shell: session bootstrap, sidebar avatar, announcements, logout, toasts.
 */
export function useMemberPageShell({ navigate, initSession, todayDmy, lang }) {
  const t = useCallback((key, params) => getMemberText(lang, key, params), [lang]);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);

  const initialAvatarId = readCookie("selectedAvatar") || "male1";
  const [selectedAvatarId, setSelectedAvatarId] = useState(initialAvatarId);
  const [selectedGender, setSelectedGender] = useState(
    initialAvatarId.startsWith("female") ? "female" : "male",
  );
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const avatarSrc = useMemo(() => AVATAR_MAP[selectedAvatarId] || AVATAR_MAP.male1, [selectedAvatarId]);

  const showNotification = useCallback((message, type = "info") => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotifications((prev) => {
      const next = [...prev, { id, message, type }];
      return next.slice(-2);
    });
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 2500);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("lang-zh", lang === "zh");
    document.body.classList.toggle("lang-en", lang !== "zh");
    return () => {
      document.body.classList.remove("lang-zh", "lang-en");
    };
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { ok, json: meRes } = await fetchCurrentUser();
        if (!ok || !meRes.success || !meRes.data) {
          navigate(spaPath("login"), { replace: true });
          return;
        }
        const u = normalizeSessionUserToMemberMe(meRes.data);
        if (String(u.user_type || "").toLowerCase() !== "member") {
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }
        const { json: tenantRes } = await fetchTenantAccessible({ all: true });
        if (!cancelled) {
          setMe(u);
          setCompanies(normalizeTenantAccessibleToCompanies(tenantRes?.data));
          initSession(u, u.company_id, todayDmy, todayDmy);
        }
      } catch {
        if (!cancelled) navigate(spaPath("login"), { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, todayDmy, initSession]);

  const refreshSession = useCallback(async () => {
    try {
      const { ok, json: meRes } = await fetchCurrentUser();
      if (ok && meRes.success && meRes.data) {
        const u = normalizeSessionUserToMemberMe(meRes.data);
        setMe(u);
        return u;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  useEffect(() => {
    if (loading || !me) return undefined;
    let stopped = false;
    let inFlight = false;
    /** Maintenance probe — keep light; cross-tab bus already broadcasts enable events. */
    const POLL_MS = 30000;

    const tick = async () => {
      if (stopped || inFlight) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const { ok, json } = await fetchCurrentUser({ cache: "no-store" });
        if (!ok && !stopped && (json?.maintenance_mode === true || json?.data?.maintenance_mode === true)) {
          if (typeof json?.message === "string" && json.message.trim() !== "") {
            sessionStorage.setItem("ec_maintenance_notice", json.message.trim());
          }
          // Tell sibling tabs in the same browser profile to logout immediately.
          publishMaintenanceModeEvent({
            enabled: true,
            message: typeof json?.message === "string" ? json.message : "",
          });
          clearDashboardFilterSession();
          clearOwnerCompaniesCache();
          window.location.assign(new URL(spaPath("login"), window.location.origin).href);
        }
      } catch {
        // silent: next tick retries
      } finally {
        inFlight = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };

    // Session was just loaded — do not fire an immediate duplicate request.
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loading, me]);

  useEffect(() => {
    if (loading || !me) return undefined;
    return subscribeMaintenanceModeEvent((event) => {
      if (!event?.enabled) return;
      if (typeof event.message === "string" && event.message.trim() !== "") {
        sessionStorage.setItem("ec_maintenance_notice", event.message.trim());
      }
      clearDashboardFilterSession();
      clearOwnerCompaniesCache();
      window.location.assign(new URL(spaPath("login"), window.location.origin).href);
    });
  }, [loading, me]);

  useEffect(() => {
    const onCompanySession = () => {
      void refreshSession();
    };
    window.addEventListener("eazycount:company-session-updated", onCompanySession);
    return () => window.removeEventListener("eazycount:company-session-updated", onCompanySession);
  }, [refreshSession]);

  useEffect(() => {
    injectStylesheet("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css").catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || !me) return;
    ensureMaintenanceDateRangePicker();
    const maintenance = MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en;
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      monthLabels: maintenance.monthsShort,
    });
  }, [loading, me, lang, t]);

  const handleSelectAvatar = useCallback((avatarId) => {
    setSelectedAvatarId(avatarId);
    setShowAvatarOptions(false);
    document.cookie = `selectedAvatar=${encodeURIComponent(avatarId)}; path=/; max-age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem("selectedAvatar", avatarId);
    } catch {
      // ignore
    }
  }, []);

  const roleLabel = useMemo(() => formatMemberRole(lang, me?.role), [lang, me?.role]);

  const expirationReminder = useExpirationReminder(me, lang);
  const displayAnnouncements = useMemo(
    () => expirationReminder.mergeAnnouncements(announcements),
    [announcements, expirationReminder.mergeAnnouncements],
  );

  const toggleNotificationsWithExpiration = useCallback(async () => {
    if (showNotifications) {
      setShowNotifications(false);
      return;
    }
    expirationReminder.onBellOpen();
    setShowNotifications(true);
    setAnnouncementsLoading(true);
    try {
      const res = await fetch(buildApiUrl("api/announcements/announcement_get_dashboard_api.php"), {
        credentials: "include",
      });
      const json = await res.json();
      setAnnouncements(json?.success && Array.isArray(json?.data) ? json.data : []);
    } catch {
      setAnnouncements([]);
    } finally {
      setAnnouncementsLoading(false);
    }
  }, [showNotifications, expirationReminder.onBellOpen]);

  const performLogout = useCallback(async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      sessionStorage.setItem("ec_skip_session_bootstrap", "1");
      await logoutSession();
    } finally {
      clearDashboardFilterSession();
      clearOwnerCompaniesCache();
      setLogoutLoading(false);
      setShowLogoutConfirm(false);
      // Member logout lands back on the Member tab, not the default Admin tab.
      window.location.assign(
        new URL(spaPath("login", { search: "?role=member" }), window.location.origin).href,
      );
    }
  }, [logoutLoading]);

  const logoutI18n = useMemo(
    () => ({
      confirmLogoutTitle: t("confirmLogoutTitle"),
      confirmLogoutMessage: t("confirmLogoutMessage"),
      cancel: t("cancel"),
      logout: t("logout"),
      loggingOut: t("loggingOut"),
    }),
    [t],
  );

  return {
    loading,
    me,
    companies,
    roleLabel,
    avatarSrc,
    selectedAvatarId,
    selectedGender,
    setSelectedGender,
    showAvatarOptions,
    setShowAvatarOptions,
    handleSelectAvatar,
    notifications,
    showNotification,
    showNotifications,
    toggleNotifications: toggleNotificationsWithExpiration,
    announcements: displayAnnouncements,
    announcementsLoading,
    showLogoutConfirm,
    setShowLogoutConfirm,
    logoutLoading,
    performLogout,
    logoutI18n,
    expirationReminder,
  };
}
