import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { getAnnouncementText } from "../../translateFile/pages/announcementTranslate.js";
import "../../../public/css/announcement.css";
import "../../../public/css/accountCSS.css";
import { spaPath } from "../../utils/routing/pageRoutes.js";

// Components
import { AnnouncementToast, AnnouncementConfirmModal } from "./components/AnnouncementCommon.jsx";
import { EditAnnouncementModal, EditMaintenanceModal } from "./components/AnnouncementModals.jsx";
import { AnnouncementPanel, MaintenancePanel } from "./components/AnnouncementPanels.jsx";
import PagePillTabSwitch from "../../components/PagePillTabSwitch.jsx";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { canAccessC168DomainPages } from "../../utils/company/loginScope.js";
import {
  isRichTextEffectivelyEmpty,
  normalizeRichTextInput,
  sanitizeRichTextHtml,
} from "../../utils/content/richTextSanitizer.js";
import {
  composeAnnouncementSection,
  splitAnnouncementSection,
} from "../../components/announcements/announcementSectionLabel.js";
import { publishMaintenanceModeEvent } from "../../utils/maintenance/maintenanceRealtimeBus.js";

export default function AnnouncementPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getAnnouncementText(lang, key, params), [lang]);

  const [activeTab, setActiveTab] = useState("announcement");
  const [notices, setNotices] = useState([]);

  // Data
  const [announcements, setAnnouncements] = useState([]);
  const [maintenanceList, setMaintenanceList] = useState([]);
  const [maintenanceMode, setMaintenanceMode] = useState({
    enabled: false,
    maintenance_message_id: null,
    message_preview: "",
    updated_by: "",
    updated_at: "",
  });
  const [canManageMaintenanceMode, setCanManageMaintenanceMode] = useState(false);
  const [modeSubmitting, setModeSubmitting] = useState(false);

  // Modals
  const [editAnnouncement, setEditAnnouncement] = useState({ id: "", title: "", sectionLabel: "", content: "" });
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editMaintenance, setEditMaintenance] = useState({ id: "", prefix: "", content: "" });
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const toastTimerRef = useRef(null);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  const showNotice = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setNotices((prev) => [...prev, { id, message, type, visible: false }]);
    setTimeout(() => {
      setNotices((prev) => prev.map((n) => n.id === id ? { ...n, visible: true } : n));
    }, 10);
    setTimeout(() => {
      setNotices((prev) => prev.map((n) => n.id === id ? { ...n, visible: false } : n));
      setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 300);
    }, 3000);
  }, []);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    document.body.classList.add("announcement-page");
    return () => {
      document.body.classList.remove("announcement-modal-open");
      document.body.classList.remove("announcement-page", "bg");
      document.body.classList.add("dashboard-page");
    };
  }, []);

  useEffect(() => {
    const hasModalOpen = announcementModalOpen || maintenanceModalOpen;
    document.body.classList.toggle("announcement-modal-open", hasModalOpen);
    return () => {
      document.body.classList.remove("announcement-modal-open");
    };
  }, [announcementModalOpen, maintenanceModalOpen]);

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/announcements/announcement_list_api.php"), { credentials: "include" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAnnouncements(json.data);
      } else {
        setAnnouncements([]);
        if (!json.success) showNotice(t("loadAnnouncementsFailed", { message: json.message || "Unknown error" }), "error");
      }
    } catch (err) { showNotice(t("loadAnnouncementsFailed", { message: err.message }), "error"); }
  }, [showNotice, t]);

  const loadMaintenance = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/maintenance/list_api.php"), { credentials: "include" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setMaintenanceList(json.data);
      } else {
        setMaintenanceList([]);
        if (!json.success) showNotice(t("loadMaintenanceFailed", { message: json.message || "Unknown error" }), "error");
      }
    } catch (err) { showNotice(t("loadMaintenanceFailed", { message: err.message }), "error"); }
  }, [showNotice, t]);

  const loadMaintenanceMode = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/maintenance/mode_api.php"), { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setCanManageMaintenanceMode(false);
        return;
      }
      if (json.success && json.data) {
        setCanManageMaintenanceMode(true);
        setMaintenanceMode({
          enabled: Boolean(json.data.enabled),
          maintenance_message_id: json.data.maintenance_message_id ?? null,
          message_preview: json.data.message_preview || "",
          updated_by: json.data.updated_by || "",
          updated_at: json.data.updated_at || "",
        });
      } else {
        setCanManageMaintenanceMode(false);
      }
    } catch {
      setCanManageMaintenanceMode(false);
    }
  }, []);

  const toggleMaintenanceMode = useCallback(
    async (nextEnabled) => {
      if (modeSubmitting) return;
      if (nextEnabled && maintenanceList.length === 0) {
        showNotice(t("modeEnableNeedsMaintenance"), "error");
        return;
      }
      setModeSubmitting(true);
      try {
        const fd = new FormData();
        fd.append("action", nextEnabled ? "enable" : "disable");
        if (nextEnabled) {
          const messageId = maintenanceList[0]?.id;
          if (messageId) fd.append("maintenance_id", String(messageId));
        }
        const res = await fetch(buildApiUrl("api/maintenance/mode_api.php"), {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = await res.json();
        if (json.success && json.data) {
          setMaintenanceMode({
            enabled: Boolean(json.data.enabled),
            maintenance_message_id: json.data.maintenance_message_id ?? null,
            message_preview: json.data.message_preview || "",
            updated_by: json.data.updated_by || "",
            updated_at: json.data.updated_at || "",
          });
          publishMaintenanceModeEvent({
            enabled: Boolean(json.data.enabled),
            message: json.data.message_preview || "",
          });
          showNotice(nextEnabled ? t("modeEnabledSuccess") : t("modeDisabledSuccess"));
          await loadMaintenance();
        } else {
          showNotice(t("modeToggleFailed", { message: json.message || "Unknown error" }), "error");
        }
      } catch (err) {
        showNotice(t("modeToggleFailed", { message: err.message }), "error");
      } finally {
        setModeSubmitting(false);
      }
    },
    [maintenanceList, modeSubmitting, showNotice, t, loadMaintenance]
  );

  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    (async () => {
      try {
        if (!canAccessC168DomainPages(me)) {
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }
        await Promise.all([loadAnnouncements(), loadMaintenance(), loadMaintenanceMode()]);
      } catch {
        if (!cancelled) navigate(spaPath("login"), { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate, loadAnnouncements, loadMaintenance, loadMaintenanceMode]);

  // Handlers
  function handleAnnouncementEdit(item) {
    if (!item) return;
    setEditAnnouncement({
      id: item.id,
      title: item.title || "",
      ...(() => {
        const split = splitAnnouncementSection(item.content || "");
        return {
          sectionLabel: split.sectionLabel,
          content: normalizeRichTextInput(split.bodyHtml || ""),
        };
      })(),
    });
    setAnnouncementModalOpen(true);
  }

  function handleAnnouncementDelete(item) {
    setConfirmModal({
      message: t("confirmDeleteAnnouncement", { title: item.title }),
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const fd = new FormData(); fd.append("id", item.id);
          const res = await fetch(buildApiUrl("api/announcements/announcement_delete_api.php"), { method: "POST", body: fd, credentials: "include" });
          const json = await res.json();
          if (json.success) { showNotice(t("announcementDeletedSuccess")); loadAnnouncements(); }
          else showNotice(t("deleteFailed", { message: json.message || "Unknown error" }), "error");
        } catch (err) { showNotice(t("failedToDelete", { message: err.message }), "error"); }
      },
    });
  }

  async function saveEditedAnnouncement() {
    try {
      const title = editAnnouncement.title.trim();
      const content = composeAnnouncementSection(editAnnouncement.sectionLabel, editAnnouncement.content);
      if (!title) {
        showNotice(t("titleCannotBeEmpty"), "error");
        return;
      }
      if (isRichTextEffectivelyEmpty(content)) {
        showNotice(t("contentCannotBeEmpty"), "error");
        return;
      }
      const fd = new FormData();
      fd.append("id", editAnnouncement.id);
      fd.append("title", title);
      fd.append("content", content);
      const res = await fetch(buildApiUrl("api/announcements/announcement_update_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) { showNotice(t("announcementUpdatedSuccess")); setAnnouncementModalOpen(false); loadAnnouncements(); }
      else showNotice(t("updateFailed", { message: json.message || "Unknown error" }), "error");
    } catch (err) { showNotice(t("updateFailed", { message: err.message }), "error"); }
  }

  function handleMaintenanceEdit(item) {
    if (!item) return;
    setEditMaintenance({
      id: item.id,
      prefix: item.prefix || "",
      content: normalizeRichTextInput(item.content || ""),
    });
    setMaintenanceModalOpen(true);
  }

  function handleMaintenanceDelete(item) {
    setConfirmModal({
      message: t("confirmDeleteMaintenance"),
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const fd = new FormData(); fd.append("id", item.id);
          const res = await fetch(buildApiUrl("api/maintenance/delete_api.php"), { method: "POST", body: fd, credentials: "include" });
          const json = await res.json();
          if (json.success) { showNotice(t("maintenanceDeletedSuccess")); loadMaintenance(); }
          else showNotice(t("deleteFailed", { message: json.message || "Unknown error" }), "error");
        } catch (err) { showNotice(t("deleteFailed", { message: err.message }), "error"); }
      },
    });
  }

  async function saveEditedMaintenance() {
    try {
      const prefix = editMaintenance.prefix.trim();
      const content = sanitizeRichTextHtml(editMaintenance.content);
      if (!prefix) {
        showNotice(t("prefixCannotBeEmpty"), "error");
        return;
      }
      if (isRichTextEffectivelyEmpty(content)) {
        showNotice(t("contentCannotBeEmpty"), "error");
        return;
      }
      const fd = new FormData();
      fd.append("id", editMaintenance.id);
      fd.append("prefix", prefix);
      fd.append("content", content);
      const res = await fetch(buildApiUrl("api/maintenance/update_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) { showNotice(t("maintenanceUpdatedSuccess")); setMaintenanceModalOpen(false); loadMaintenance(); }
      else showNotice(t("updateFailed", { message: json.message || "Unknown error" }), "error");
    } catch (err) { showNotice(t("updateFailed", { message: err.message }), "error"); }
  }

  return (
    <>
      <div className="container announcement-page-container">
        <div className="announcement-scroll-area">
          <div className="page-header">
            <PagePillTabSwitch
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { value: "announcement", label: t("announcementTab") },
                { value: "maintenance", label: t("maintenanceTab") },
              ]}
            />
          </div>
          {activeTab === "announcement" && (
            <AnnouncementPanel
              t={t}
              announcements={announcements}
              onEdit={handleAnnouncementEdit}
              onDelete={handleAnnouncementDelete}
              onPublished={() => { loadAnnouncements(); showNotice(t("announcementPublishedSuccess")); }}
              onPublishFailed={(message) => showNotice(t("publishFailed", { message }), "error")}
            />
          )}
          {activeTab === "maintenance" && (
            <MaintenancePanel
              t={t}
              maintenanceList={maintenanceList}
              maintenanceMode={maintenanceMode}
              canManageMaintenanceMode={canManageMaintenanceMode}
              modeSubmitting={modeSubmitting}
              onEnableMaintenanceMode={() => toggleMaintenanceMode(true)}
              onDisableMaintenanceMode={() => toggleMaintenanceMode(false)}
              onEdit={handleMaintenanceEdit}
              onDelete={handleMaintenanceDelete}
              onPublished={() => { loadMaintenance(); showNotice(t("maintenancePublishedSuccess")); }}
              onPublishFailed={(message) => showNotice(t("publishFailed", { message }), "error")}
            />
          )}
        </div>
      </div>
      <AnnouncementToast notices={notices} />
      <EditAnnouncementModal t={t} open={announcementModalOpen} draft={editAnnouncement} setDraft={setEditAnnouncement} onClose={() => setAnnouncementModalOpen(false)} onSave={saveEditedAnnouncement} />
      <EditMaintenanceModal t={t} open={maintenanceModalOpen} draft={editMaintenance} setDraft={setEditMaintenance} onClose={() => setMaintenanceModalOpen(false)} onSave={saveEditedMaintenance} />
      {confirmModal && <AnnouncementConfirmModal t={t} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onClose={() => setConfirmModal(null)} />}
    </>
  );
}
