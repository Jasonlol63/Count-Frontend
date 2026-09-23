import { useCallback, useMemo, useState } from "react";
import MobileShell from "../../components/layout/MobileShell.jsx";
import MobileSubpageHeader from "../../components/layout/MobileSubpageHeader.jsx";
import { useIncrementalList } from "../../hooks/useIncrementalList.js";
import { useMobileAnnouncements } from "../../hooks/useMobileAnnouncements.js";
import { toSafeRenderHtml } from "../../utils/content/richTextSanitizer.js";
import EarningsSegmentControl from "../dashboard/EarningsSegmentControl.jsx";
import {
  AnnouncementConfirmSheet,
  AnnouncementFormSheet,
  MaintenanceFormSheet,
} from "./AnnouncementSheets.jsx";
import "../account/account.css";
import "../dashboard/dashboard.css";
import "./announcement.css";

function AnnouncementCard({ item, t, onEdit, onDelete }) {
  return (
    <article className="m-ann-admin-card">
      <div className="m-ann-admin-card-head">
        <h2 className="m-ann-admin-title">{item.title || "—"}</h2>
        <div className="m-ann-admin-actions">
          <button type="button" className="m-ann-admin-btn m-ann-admin-btn--edit tap-scale" onClick={() => onEdit(item)}>
            {t("edit")}
          </button>
          <button
            type="button"
            className="m-ann-admin-btn m-ann-admin-btn--delete tap-scale"
            onClick={() => onDelete(item)}
          >
            {t("delete")}
          </button>
        </div>
      </div>
      <div
        className="m-ann-admin-body"
        dangerouslySetInnerHTML={{ __html: toSafeRenderHtml(item.content) }}
      />
      <div className="m-ann-admin-meta">
        <span>{t("createdBy", { name: item.created_by || "—" })}</span>
        <span>{t("createdAt", { time: item.created_at || "—" })}</span>
      </div>
    </article>
  );
}

function MaintenanceCard({ item, t, onEdit, onDelete }) {
  return (
    <article className="m-ann-admin-card">
      <div className="m-ann-admin-card-head">
        <h2 className="m-ann-admin-title">{item.prefix || t("maintenanceTab")}</h2>
        <div className="m-ann-admin-actions">
          <button type="button" className="m-ann-admin-btn m-ann-admin-btn--edit tap-scale" onClick={() => onEdit(item)}>
            {t("edit")}
          </button>
          <button
            type="button"
            className="m-ann-admin-btn m-ann-admin-btn--delete tap-scale"
            onClick={() => onDelete(item)}
          >
            {t("delete")}
          </button>
        </div>
      </div>
      <div className="m-ann-admin-body">
        {item.prefix ? <strong className="m-ann-maint-prefix">{item.prefix} </strong> : null}
        <span dangerouslySetInnerHTML={{ __html: toSafeRenderHtml(item.content) }} />
      </div>
      <div className="m-ann-admin-meta">
        <span>{t("createdBy", { name: item.created_by || "—" })}</span>
        <span>{t("createdAt", { time: item.created_at || "—" })}</span>
      </div>
    </article>
  );
}

export default function AnnouncementPage() {
  const api = useMobileAnnouncements();
  const { i18n, t } = api;
  const [activeTab, setActiveTab] = useState("announcement");
  const [annFormOpen, setAnnFormOpen] = useState(false);
  const [maintFormOpen, setMaintFormOpen] = useState(false);
  const [editingAnn, setEditingAnn] = useState(null);
  const [editingMaint, setEditingMaint] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const annList = useIncrementalList(api.announcements, 40);
  const maintList = useIncrementalList(api.maintenanceList, 20);
  const canCreateMaintenance = api.maintenanceList.length === 0;
  const modeEnabled = Boolean(api.systemMaintenanceEnabled);

  const segmentTabs = useMemo(
    () => [
      { id: "announcement", label: t("announcementTab") },
      { id: "maintenance", label: t("maintenanceTab") },
    ],
    [t],
  );

  const openCreate = useCallback(() => {
    if (activeTab === "maintenance") {
      if (!canCreateMaintenance) {
        api.notify(t("maintenanceNotice"), "error");
        return;
      }
      setEditingMaint(null);
      setMaintFormOpen(true);
      return;
    }
    setEditingAnn(null);
    setAnnFormOpen(true);
  }, [activeTab, api, canCreateMaintenance, t]);

  const openEditAnnouncement = useCallback(
    (item) => {
      setEditingAnn(api.toEditForm(item));
      setAnnFormOpen(true);
    },
    [api],
  );

  const openEditMaintenance = useCallback(
    (item) => {
      setEditingMaint(api.toMaintenanceEditForm(item));
      setMaintFormOpen(true);
    },
    [api],
  );

  const openDeleteAnnouncement = useCallback(
    (item) => {
      setConfirm({
        message: t("confirmDeleteAnnouncement", { title: item.title || "" }),
        onConfirm: () => {
          void api.remove(item);
        },
      });
    },
    [api, t],
  );

  const openDeleteMaintenance = useCallback(
    (item) => {
      setConfirm({
        message: t("confirmDeleteMaintenance"),
        onConfirm: () => {
          void api.removeMaintenance(item);
        },
      });
    },
    [api, t],
  );

  const handleAnnSubmit = useCallback(
    async (payload) => {
      if (payload?.id) return api.update(payload);
      return api.publish(payload);
    },
    [api],
  );

  const handleMaintSubmit = useCallback(
    async (payload) => {
      if (payload?.id) return api.updateMaintenance(payload);
      return api.publishMaintenance(payload);
    },
    [api],
  );

  const overlayOpen = annFormOpen || maintFormOpen || Boolean(confirm);

  const stickyBar = (
    <div className="m-ann-sticky">
      <MobileSubpageHeader
        backTo="/more"
        backAriaLabel={t("backToMore")}
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />
      <EarningsSegmentControl
        ariaLabel={t("pageTitle")}
        tabs={segmentTabs}
        value={activeTab}
        onChange={setActiveTab}
      />
    </div>
  );

  if (api.blocked) return null;

  return (
    <MobileShell
      i18n={i18n}
      me={api.me}
      companyCode={api.companyCode}
      groupId={api.groupId}
      onLogout={api.logout}
      onRefresh={api.refresh}
      refreshing={api.refreshing}
      stickyBar={stickyBar}
      lang={api.lang}
      onLangChange={api.setLang}
      overlayOpen={overlayOpen}
      floatingAction={
        <button
          type="button"
          className="m-account-fab tap-scale"
          onClick={openCreate}
          aria-label={
            activeTab === "maintenance" ? t("createNewMaintenanceContent") : t("createNewAnnouncement")
          }
        >
          <i className="fas fa-plus" aria-hidden="true" />
        </button>
      }
      overlay={
        <>
          <AnnouncementFormSheet
            open={annFormOpen}
            onClose={() => setAnnFormOpen(false)}
            t={t}
            initial={editingAnn}
            onSubmit={handleAnnSubmit}
          />
          <MaintenanceFormSheet
            open={maintFormOpen}
            onClose={() => setMaintFormOpen(false)}
            t={t}
            initial={editingMaint}
            onSubmit={handleMaintSubmit}
          />
          <AnnouncementConfirmSheet
            open={Boolean(confirm)}
            onClose={() => setConfirm(null)}
            message={confirm?.message || ""}
            onConfirm={confirm?.onConfirm}
            t={t}
          />
        </>
      }
    >
      <div className="m-ann-admin-page">
        {api.toast ? (
          <div className={`m-account-toast ${api.toast.tone}`}>{api.toast.message}</div>
        ) : null}
        {api.error ? <div className="m-account-error">{api.error}</div> : null}

        {activeTab === "announcement" ? (
          <>
            <h2 className="m-ann-admin-section">{t("publishedAnnouncements")}</h2>
            {api.loading ? (
              <div className="m-account-loading">
                <i className="fas fa-spinner fa-spin" aria-hidden="true" />
                <span>{t("loading")}</span>
              </div>
            ) : annList.visible.length ? (
              <div className="m-ann-admin-list">
                {annList.visible.map((item) => (
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    t={t}
                    onEdit={openEditAnnouncement}
                    onDelete={openDeleteAnnouncement}
                  />
                ))}
                {annList.hasMore ? (
                  <div ref={annList.sentinelRef} className="m-admin-sentinel" aria-hidden="true" />
                ) : null}
              </div>
            ) : (
              <div className="m-account-empty">
                <i className="fas fa-bullhorn" aria-hidden="true" />
                <p>{t("noAnnouncements")}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="m-ann-admin-section-row">
              <h2 className="m-ann-admin-section">{t("publishedMaintenanceContent")}</h2>
              {api.canManageSystemMaintenance ? (
                <div className="m-ann-mode">
                  <div className="m-ann-mode-copy">
                    <strong>{t("modeStatusLabel")}</strong>
                    <small>{t("modeHint")}</small>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={modeEnabled}
                    aria-label={t("modeStatusLabel")}
                    className={`m-ann-mode-toggle tap-scale${modeEnabled ? " is-on" : ""}`}
                    disabled={api.systemMaintenanceSubmitting}
                    onClick={() => void api.toggleSystemMaintenanceMode(!modeEnabled)}
                  >
                    <span className="m-ann-mode-thumb" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>

            {!canCreateMaintenance ? (
              <p className="m-ann-singleton-hint">
                <strong>⚠️ {t("noticeLabel")}:</strong> {t("maintenanceNotice")}
              </p>
            ) : null}

            {api.loading ? (
              <div className="m-account-loading">
                <i className="fas fa-spinner fa-spin" aria-hidden="true" />
                <span>{t("loading")}</span>
              </div>
            ) : maintList.visible.length ? (
              <div className="m-ann-admin-list">
                {maintList.visible.map((item) => (
                  <MaintenanceCard
                    key={item.id}
                    item={item}
                    t={t}
                    onEdit={openEditMaintenance}
                    onDelete={openDeleteMaintenance}
                  />
                ))}
                {maintList.hasMore ? (
                  <div ref={maintList.sentinelRef} className="m-admin-sentinel" aria-hidden="true" />
                ) : null}
              </div>
            ) : (
              <div className="m-account-empty">
                <i className="fas fa-screwdriver-wrench" aria-hidden="true" />
                <p>{t("noMaintenanceContent")}</p>
              </div>
            )}
          </>
        )}
      </div>
    </MobileShell>
  );
}
