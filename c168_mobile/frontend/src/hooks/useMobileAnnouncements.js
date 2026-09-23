import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { canAccessC168DomainPages, fetchOwnerCompaniesForDomain } from "../lib/c168DomainAccess.js";
import { fetchCurrentUser, logoutSession } from "../lib/authApi.js";
import {
  createAnnouncement,
  createMaintenance,
  deleteAnnouncement,
  deleteMaintenance,
  fetchAnnouncements,
  fetchMaintenanceList,
  normalizeAnnouncementItem,
  updateAnnouncement,
  updateMaintenance as updateMaintenanceContent,
} from "../lib/announcementApi.js";
import { isSystemMaintenanceItUser } from "../lib/loginScope.js";
import { useSyncedLoginLang, writeLoginLang } from "../lib/loginLang.js";
import { REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";
import { useRealtimeDomain } from "../lib/realtime/useRealtimeDomain.js";
import {
  fetchSystemMaintenanceMode,
  setSystemMaintenanceMode,
} from "../lib/systemMaintenanceModeApi.js";
import { announcementText, getAnnouncementText } from "../translateFile/announcementTranslate.js";
import {
  composeAnnouncementSection,
  splitAnnouncementSection,
} from "../components/announcements/announcementSectionLabel.js";
import {
  isRichTextEffectivelyEmpty,
  normalizeRichTextInput,
  sanitizeRichTextHtml,
} from "../utils/content/richTextSanitizer.js";

export function useMobileAnnouncements() {
  const navigate = useNavigate();
  const [lang, setLangState] = useSyncedLoginLang();
  const i18n = useMemo(() => announcementText(lang), [lang]);
  const t = useCallback((key, params) => getAnnouncementText(lang, key, params), [lang]);

  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [maintenanceList, setMaintenanceList] = useState([]);
  /** IT "kick everyone" switch (`/api/it/maintenance-mode`) — not the retired "which maintenance
   *  announcement is active" flag. Only meaningful for IT operators; see
   *  `isSystemMaintenanceItUser`. */
  const [systemMaintenanceEnabled, setSystemMaintenanceEnabled] = useState(false);
  const [canManageSystemMaintenance, setCanManageSystemMaintenance] = useState(false);
  const [systemMaintenanceSubmitting, setSystemMaintenanceSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const meRef = useRef(null);
  const companiesRef = useRef([]);
  meRef.current = me;
  companiesRef.current = companies;

  const setLang = useCallback((next) => {
    setLangState(writeLoginLang(next));
  }, []);

  const notify = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 4000 : 2200);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // Announcement / maintenance-banner content is global (no tenant scoping — confirmed
  // against AnnouncementController.java), so there is no session-company-sync step here
  // any more, unlike the old PHP endpoints.
  const loadAnnouncements = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const { res, json } = await fetchAnnouncements();
        if (!res.ok || !json?.success) {
          if (!silent) {
            setError(json?.message || t("loadAnnouncementsFailed", { message: "Unknown error" }));
            setAnnouncements([]);
          }
          return false;
        }
        if (!silent) setError("");
        setAnnouncements((Array.isArray(json.data) ? json.data : []).map(normalizeAnnouncementItem));
        return true;
      } catch (err) {
        if (!silent) {
          setError(t("loadAnnouncementsFailed", { message: err?.message || "Unknown error" }));
          setAnnouncements([]);
        }
        return false;
      }
    },
    [t],
  );

  const loadMaintenance = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const { res, json } = await fetchMaintenanceList();
        if (!res.ok || !json?.success) {
          if (!silent) {
            notify(t("loadMaintenanceFailed", { message: json?.message || "Unknown error" }), "error");
            setMaintenanceList([]);
          }
          return false;
        }
        setMaintenanceList((Array.isArray(json.data) ? json.data : []).map(normalizeAnnouncementItem));
        return true;
      } catch (err) {
        if (!silent) {
          notify(t("loadMaintenanceFailed", { message: err?.message || "Unknown error" }), "error");
          setMaintenanceList([]);
        }
        return false;
      }
    },
    [notify, t],
  );

  const loadSystemMaintenanceMode = useCallback(async () => {
    if (!isSystemMaintenanceItUser(meRef.current)) {
      setCanManageSystemMaintenance(false);
      return;
    }
    try {
      const { res, json } = await fetchSystemMaintenanceMode();
      if (res.status === 403) {
        setCanManageSystemMaintenance(false);
        return;
      }
      if (json?.success && json.data) {
        setCanManageSystemMaintenance(true);
        setSystemMaintenanceEnabled(Boolean(json.data.enabled));
      } else {
        setCanManageSystemMaintenance(false);
      }
    } catch {
      setCanManageSystemMaintenance(false);
    }
  }, []);

  const loadAll = useCallback(
    async ({ silent = false } = {}) => {
      await Promise.all([
        loadAnnouncements({ silent }),
        loadMaintenance({ silent }),
        loadSystemMaintenanceMode(),
      ]);
    },
    [loadAnnouncements, loadMaintenance, loadSystemMaintenanceMode],
  );

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { ok, json } = await fetchCurrentUser({ signal: ac.signal });
        if (!ok || !json?.success || !json?.data) {
          navigate("/login", { replace: true });
          return;
        }
        const user = json.data;
        setMe(user);
        const ownerCompanies = await fetchOwnerCompaniesForDomain(ac.signal);
        if (ac.signal.aborted) return;
        setCompanies(ownerCompanies);

        if (!canAccessC168DomainPages(user)) {
          setBlocked(true);
          navigate("/more", { replace: true });
          return;
        }
        await loadAll();
      } catch (e) {
        if (e?.name !== "AbortError") navigate("/login", { replace: true });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      ac.abort();
      clearTimeout(toastTimer.current);
    };
  }, [navigate, loadAll, t]);

  useRealtimeDomain(
    [REALTIME_DOMAINS.ANNOUNCEMENTS, REALTIME_DOMAINS.MAINTENANCE],
    () => {
      void loadAll({ silent: true });
    },
    { enabled: Boolean(me) && !blocked },
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const publish = useCallback(
    async ({ title, sectionLabel, content }) => {
      const trimmedTitle = String(title || "").trim();
      const composed = composeAnnouncementSection(sectionLabel, content);
      if (!trimmedTitle) {
        notify(t("titleCannotBeEmpty"), "error");
        return false;
      }
      if (isRichTextEffectivelyEmpty(composed)) {
        notify(t("contentCannotBeEmpty"), "error");
        return false;
      }
      try {
        const { json } = await createAnnouncement({ title: trimmedTitle, content: composed });
        if (json?.success) {
          notify(t("announcementPublishedSuccess"));
          await loadAnnouncements({ silent: true });
          return true;
        }
        notify(t("publishFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("publishFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadAnnouncements, notify, t],
  );

  const update = useCallback(
    async ({ id, title, sectionLabel, content }) => {
      const trimmedTitle = String(title || "").trim();
      const composed = composeAnnouncementSection(sectionLabel, content);
      if (!trimmedTitle) {
        notify(t("titleCannotBeEmpty"), "error");
        return false;
      }
      if (isRichTextEffectivelyEmpty(composed)) {
        notify(t("contentCannotBeEmpty"), "error");
        return false;
      }
      try {
        const { json } = await updateAnnouncement({ id, title: trimmedTitle, content: composed });
        if (json?.success) {
          notify(t("announcementUpdatedSuccess"));
          await loadAnnouncements({ silent: true });
          return true;
        }
        notify(t("updateFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("updateFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadAnnouncements, notify, t],
  );

  const remove = useCallback(
    async (item) => {
      if (!item?.id) return false;
      try {
        const { json } = await deleteAnnouncement(item.id);
        if (json?.success) {
          notify(t("announcementDeletedSuccess"));
          await loadAnnouncements({ silent: true });
          return true;
        }
        notify(t("deleteFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("failedToDelete", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadAnnouncements, notify, t],
  );

  const publishMaintenance = useCallback(
    async ({ prefix, content }) => {
      if (maintenanceList.length > 0) {
        notify(t("maintenanceNotice"), "error");
        return false;
      }
      const trimmedPrefix = String(prefix || "").trim();
      const safeContent = sanitizeRichTextHtml(content);
      if (!trimmedPrefix) {
        notify(t("prefixCannotBeEmpty"), "error");
        return false;
      }
      if (isRichTextEffectivelyEmpty(safeContent)) {
        notify(t("contentCannotBeEmpty"), "error");
        return false;
      }
      try {
        const { json } = await createMaintenance({ prefix: trimmedPrefix, content: safeContent });
        if (json?.success) {
          notify(t("maintenancePublishedSuccess"));
          await loadMaintenance({ silent: true });
          return true;
        }
        notify(t("publishFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("publishFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadMaintenance, maintenanceList.length, notify, t],
  );

  const updateMaintenance = useCallback(
    async ({ id, prefix, content }) => {
      const trimmedPrefix = String(prefix || "").trim();
      const safeContent = sanitizeRichTextHtml(content);
      if (!trimmedPrefix) {
        notify(t("prefixCannotBeEmpty"), "error");
        return false;
      }
      if (isRichTextEffectivelyEmpty(safeContent)) {
        notify(t("contentCannotBeEmpty"), "error");
        return false;
      }
      try {
        const { json } = await updateMaintenanceContent({ id, prefix: trimmedPrefix, content: safeContent });
        if (json?.success) {
          notify(t("maintenanceUpdatedSuccess"));
          await loadMaintenance({ silent: true });
          return true;
        }
        notify(t("updateFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("updateFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadMaintenance, notify, t],
  );

  const removeMaintenance = useCallback(
    async (item) => {
      if (!item?.id) return false;
      try {
        const { json } = await deleteMaintenance(item.id);
        if (json?.success) {
          notify(t("maintenanceDeletedSuccess"));
          await loadMaintenance({ silent: true });
          return true;
        }
        notify(t("deleteFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("deleteFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      }
    },
    [loadMaintenance, notify, t],
  );

  /**
   * Flip the IT "kick everyone" switch. Unlike the retired PHP `mode_api.php` this needs no
   * maintenance content to exist and no C168 session sync — the endpoint touches nothing but its
   * own singleton row, and the backend broadcasts `session_kick` afterwards (every non-IT
   * session is then locked out on its next request and pushed out by `MobileShell`).
   */
  const toggleSystemMaintenanceMode = useCallback(
    async (nextEnabled) => {
      if (systemMaintenanceSubmitting) return false;
      setSystemMaintenanceSubmitting(true);
      try {
        const { res, json } = await setSystemMaintenanceMode(nextEnabled);
        if (res.status === 403) {
          setCanManageSystemMaintenance(false);
          notify(t("updateFailed", { message: json?.message || "Forbidden" }), "error");
          return false;
        }
        if (json?.success && json.data) {
          setSystemMaintenanceEnabled(Boolean(json.data.enabled));
          notify(nextEnabled ? t("modeEnabledSuccess") : t("modeDisabledSuccess"));
          return true;
        }
        notify(t("updateFailed", { message: json?.message || "Unknown error" }), "error");
        return false;
      } catch (err) {
        notify(t("updateFailed", { message: err?.message || "Unknown error" }), "error");
        return false;
      } finally {
        setSystemMaintenanceSubmitting(false);
      }
    },
    [systemMaintenanceSubmitting, notify, t],
  );

  const toEditForm = useCallback((item) => {
    const split = splitAnnouncementSection(item?.content || "");
    return {
      id: item?.id || "",
      title: item?.title || "",
      sectionLabel: split.sectionLabel,
      content: normalizeRichTextInput(split.bodyHtml || ""),
    };
  }, []);

  const toMaintenanceEditForm = useCallback((item) => {
    return {
      id: item?.id || "",
      prefix: item?.prefix || "",
      content: normalizeRichTextInput(item?.content || ""),
    };
  }, []);

  const companyCode = String(me?.company_code || me?.company_id || "").toUpperCase();
  const groupId = String(me?.login_group_id || me?.login_identifier || "").toUpperCase();

  return {
    i18n,
    t,
    lang,
    setLang,
    me,
    companyCode,
    groupId,
    announcements,
    maintenanceList,
    systemMaintenanceEnabled,
    canManageSystemMaintenance,
    systemMaintenanceSubmitting,
    loading,
    refreshing,
    blocked,
    error,
    toast,
    notify,
    logout,
    refresh,
    publish,
    update,
    remove,
    publishMaintenance,
    updateMaintenance,
    removeMaintenance,
    toggleSystemMaintenanceMode,
    toEditForm,
    toMaintenanceEditForm,
  };
}
