import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ensureC168DomainApiSession } from "../../utils/company/companySessionSync.js";
import {
  isRichTextEffectivelyEmpty,
  normalizeRichTextInput,
  sanitizeRichTextHtml,
} from "../../utils/content/richTextSanitizer.js";
import {
  composeAnnouncementSection,
  splitAnnouncementSection,
} from "../../components/announcements/announcementSectionLabel.js";
import { useRealtimeDomain } from "../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../lib/realtime/realtimeEvents.js";
import {
  fetchAnnouncements as apiFetchAnnouncements,
  fetchMaintenanceList as apiFetchMaintenanceList,
  updateAnnouncement as apiUpdateAnnouncement,
  deleteAnnouncement as apiDeleteAnnouncement,
  updateMaintenance as apiUpdateMaintenance,
  deleteMaintenance as apiDeleteMaintenance,
} from "./announcementApi.js";

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
      const { json } = await apiFetchAnnouncements();
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
      const { json } = await apiFetchMaintenanceList();
      if (json.success && Array.isArray(json.data)) {
        setMaintenanceList(json.data);
      } else {
        setMaintenanceList([]);
        if (!json.success) showNotice(t("loadMaintenanceFailed", { message: json.message || "Unknown error" }), "error");
      }
    } catch (err) { showNotice(t("loadMaintenanceFailed", { message: err.message }), "error"); }
  }, [showNotice, t]);

  useRealtimeDomain(
    [REALTIME_DOMAINS.ANNOUNCEMENTS, REALTIME_DOMAINS.MAINTENANCE],
    () => {
      void loadAnnouncements();
      void loadMaintenance();
    },
    { enabled: sessionReady && Boolean(me) },
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
        // Same race as Domain: UI may trust sessionStorage C168 before PHP session catches up.
        const synced = await ensureC168DomainApiSession(me);
        if (!synced) {
          if (!cancelled) navigate(spaPath("dashboard"), { replace: true });
          return;
        }
        if (cancelled) return;
        await Promise.all([loadAnnouncements(), loadMaintenance()]);
      } catch {
        if (!cancelled) navigate(spaPath("login"), { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate, loadAnnouncements, loadMaintenance]);

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
          const { json } = await apiDeleteAnnouncement(item.id);
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
      const { json } = await apiUpdateAnnouncement({ id: editAnnouncement.id, title, content });
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
          const { json } = await apiDeleteMaintenance(item.id);
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
      const { json } = await apiUpdateMaintenance({ id: editMaintenance.id, prefix, content });
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
