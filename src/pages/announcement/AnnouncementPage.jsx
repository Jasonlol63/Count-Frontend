import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { getAnnouncementText } from "../../translateFile/pages/announcementTranslate.js";
import "../../../public/css/announcement.css";
import { spaPath } from "../../utils/routing/pageRoutes.js";

// Components
import { AnnouncementToast, AnnouncementConfirmModal } from "./components/AnnouncementCommon.jsx";
import { EditAnnouncementModal, EditMaintenanceModal } from "./components/AnnouncementModals.jsx";
import { AnnouncementPanel, MaintenancePanel } from "./components/AnnouncementPanels.jsx";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { canAccessC168DomainPages } from "../../utils/company/loginScope.js";

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
  const [editAnnouncement, setEditAnnouncement] = useState({ id: "", title: "", content: "" });
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

  useEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    document.body.classList.add("announcement-page");
    return () => {
      document.body.classList.remove("announcement-page", "bg");
      document.body.classList.add("dashboard-page");
    };
  }, []);

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/announcements/announcement_list_api.php"), { credentials: "include" });
      const json = await res.json();
      setAnnouncements(json.success && Array.isArray(json.data) ? json.data : []);
    } catch (err) { showNotice(t("loadAnnouncementsFailed", { message: err.message }), "error"); }
  }, [showNotice, t]);

  const loadMaintenance = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/maintenance/list_api.php"), { credentials: "include" });
      const json = await res.json();
      setMaintenanceList(json.success && Array.isArray(json.data) ? json.data : []);
    } catch (err) { showNotice(t("loadMaintenanceFailed", { message: err.message }), "error"); }
  }, [showNotice, t]);

  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    (async () => {
      try {
        if (!canAccessC168DomainPages(me)) {
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }
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
    if (!item) { loadAnnouncements(); showNotice(t("announcementPublishedSuccess")); return; }
    setEditAnnouncement({ id: item.id, title: item.title || "", content: item.content || "" });
    setAnnouncementModalOpen(true);
  }

  function handleAnnouncementDelete(item) {
    setConfirmModal({
      message: t("confirmDeleteAnnouncement", { title: item.title }),
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch(buildApiUrl("api/announcements/announcement_delete_api.php"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: Number(item.id) }),
          });
          const json = await res.json();
          if (json.success) { showNotice(t("announcementDeletedSuccess")); loadAnnouncements(); }
          else showNotice(t("deleteFailed", { message: json.message || "Unknown error" }), "error");
        } catch (err) { showNotice(t("failedToDelete", { message: err.message }), "error"); }
      },
    });
  }

  async function saveEditedAnnouncement() {
    try {
      const res = await fetch(buildApiUrl("api/announcements/announcement_update_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(editAnnouncement.id),
          title: editAnnouncement.title.trim(),
          content: editAnnouncement.content.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) { showNotice(t("announcementUpdatedSuccess")); setAnnouncementModalOpen(false); loadAnnouncements(); }
      else showNotice(t("updateFailed", { message: json.message || "Unknown error" }), "error");
    } catch (err) { showNotice(t("updateFailed", { message: err.message }), "error"); }
  }

  function handleMaintenanceEdit(item) {
    if (!item) { loadMaintenance(); showNotice(t("maintenancePublishedSuccess")); return; }
    setEditMaintenance({ id: item.id, prefix: item.prefix || "", content: item.content || "" });
    setMaintenanceModalOpen(true);
  }

  function handleMaintenanceDelete(item) {
    setConfirmModal({
      message: t("confirmDeleteMaintenance"),
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch(buildApiUrl("api/maintenance/delete_api.php"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: Number(item.id) }),
          });
          const json = await res.json();
          if (json.success) { showNotice(t("maintenanceDeletedSuccess")); loadMaintenance(); }
          else showNotice(t("deleteFailed", { message: json.message || "Unknown error" }), "error");
        } catch (err) { showNotice(t("deleteFailed", { message: err.message }), "error"); }
      },
    });
  }

  async function saveEditedMaintenance() {
    try {
      const res = await fetch(buildApiUrl("api/maintenance/update_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(editMaintenance.id),
          prefix: editMaintenance.prefix.trim(),
          content: editMaintenance.content.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) { showNotice(t("maintenanceUpdatedSuccess")); setMaintenanceModalOpen(false); loadMaintenance(); }
      else showNotice(t("updateFailed", { message: json.message || "Unknown error" }), "error");
    } catch (err) { showNotice(t("updateFailed", { message: err.message }), "error"); }
  }

  return (
    <>
      <div className="container announcement-page-container">
        <div className="page-header">
          <div className="page-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={activeTab === "announcement"} className={`page-tab${activeTab === "announcement" ? " active" : ""}`} onClick={() => setActiveTab("announcement")}>{t("announcementTab")}</button>
            <button type="button" role="tab" aria-selected={activeTab === "maintenance"} className={`page-tab${activeTab === "maintenance" ? " active" : ""}`} onClick={() => setActiveTab("maintenance")}>{t("maintenanceTab")}</button>
          </div>
        </div>
        {activeTab === "announcement" && <AnnouncementPanel t={t} announcements={announcements} onEdit={handleAnnouncementEdit} onDelete={handleAnnouncementDelete} showNotice={showNotice} />}
        {activeTab === "maintenance" && <MaintenancePanel t={t} maintenanceList={maintenanceList} onEdit={handleMaintenanceEdit} onDelete={handleMaintenanceDelete} showNotice={showNotice} />}
      </div>
      <AnnouncementToast notices={notices} />
      <EditAnnouncementModal t={t} open={announcementModalOpen} draft={editAnnouncement} setDraft={setEditAnnouncement} onClose={() => setAnnouncementModalOpen(false)} onSave={saveEditedAnnouncement} />
      <EditMaintenanceModal t={t} open={maintenanceModalOpen} draft={editMaintenance} setDraft={setEditMaintenance} onClose={() => setMaintenanceModalOpen(false)} onSave={saveEditedMaintenance} />
      {confirmModal && <AnnouncementConfirmModal t={t} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onClose={() => setConfirmModal(null)} />}
    </>
  );
}
