import { useMemo, useRef, useState } from "react";
import MobileShell from "../../components/layout/MobileShell.jsx";
import MobileSubpageHeader from "../../components/layout/MobileSubpageHeader.jsx";
import { useIncrementalList } from "../../hooks/useIncrementalList.js";
import { useMobileOwnership } from "../../hooks/useMobileOwnership.js";
import { countOwnershipSubsidiariesInGroup, formatOwnershipMonthShort } from "../../lib/ownershipLogic.js";
import { formatDmyDash } from "../../lib/dateUtils.js";
import EarningsSegmentControl from "../dashboard/EarningsSegmentControl.jsx";
import {
  OwnershipConflictSheet,
  OwnershipEditorSheet,
  OwnershipJoinGroupSheet,
  OwnershipMonthSheet,
} from "./OwnershipSheets.jsx";
import "../account/account.css";
import "../dashboard/dashboard.css";
import "./ownership.css";

function expirationClass(dateStr) {
  if (!dateStr) return "";
  const expStr = String(dateStr).split(" ")[0];
  const expDate = new Date(expStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return " is-expired";
  if (daysLeft <= 30) return " is-warning";
  return "";
}

function AllocationBar({ total, fmtPct, t }) {
  const over = total > 100;
  return (
    <div className="m-own-alloc">
      <div className="m-own-alloc-meta">
        <span>{t("totalAllocation")}</span>
        <strong>{fmtPct(total)}</strong>
        <em className={over ? "is-over" : ""}>
          {over ? t("overLimit") : `${fmtPct(100 - total)} ${t("remaining")}`}
        </em>
      </div>
      <div className="m-own-bar">
        <span className={over ? "is-over" : ""} style={{ width: `${Math.min(total, 100)}%` }} />
      </div>
    </div>
  );
}

function CompanyCard({
  comp,
  t,
  fmtPct,
  selected,
  selectionMode,
  selectable,
  adminLocked,
  onOpen,
  onSelect,
  onLongPress,
  onJoin,
  onUngroup,
  canJoin,
}) {
  const gid = comp.group_id || null;
  const alloc = parseFloat(comp.allocated_percentage) || 0;
  const pressTimer = useRef(null);
  const longFired = useRef(false);
  const exp = comp.expiration_date
    ? formatDmyDash(comp.expiration_date) || String(comp.expiration_date).split(" ")[0]
    : "";

  const clearPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <div
      className={`m-own-card${selected ? " is-selected" : ""}${selectionMode ? " is-selecting" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={() => {
        longFired.current = false;
        pressTimer.current = window.setTimeout(() => {
          longFired.current = true;
          onLongPress?.(comp);
        }, 450);
      }}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      onClick={() => {
        if (longFired.current) return;
        if (selectionMode) onSelect(comp);
        else onOpen(Number(comp.id));
      }}
    >
      <div className="m-own-card-top">
        {selectionMode ? (
          <span className={`m-own-check${selected ? " is-on" : ""}${selectable ? "" : " is-off"}`} aria-hidden="true">
            {selected ? <i className="fas fa-check" /> : null}
          </span>
        ) : null}
        <div className="m-own-card-titles">
          <strong>
            {comp.name}
            {gid ? <span className="m-own-badge">{gid}</span> : null}
          </strong>
          {exp ? (
            <small className={`m-own-exp${expirationClass(comp.expiration_date)}`}>
              {t("expirationDate")}: {exp}
            </small>
          ) : (
            <small>{t("tapToEdit")}</small>
          )}
        </div>
        {!adminLocked && !selectionMode && (gid || canJoin) ? (
          gid ? (
            <button
              type="button"
              className="m-own-mini-btn tap-scale"
              onClick={(e) => {
                e.stopPropagation();
                onUngroup(Number(comp.id), comp.name);
              }}
            >
              {t("ungroup")}
            </button>
          ) : (
            <button
              type="button"
              className="m-own-mini-btn tap-scale"
              onClick={(e) => {
                e.stopPropagation();
                onJoin(comp);
              }}
            >
              {t("joinGroup")}
            </button>
          )
        ) : null}
      </div>
      <AllocationBar total={alloc} fmtPct={fmtPct} t={t} />
    </div>
  );
}

function GroupCard({ grp, t, fmtPct, onOpen }) {
  const alloc = parseFloat(grp.allocated_percentage) || 0;
  return (
    <button type="button" className="m-own-card tap-scale" onClick={() => onOpen(grp.group_id)}>
      <div className="m-own-card-top">
        <div className="m-own-card-titles">
          <strong>{grp.group_id}</strong>
          <small>{t("tapToEdit")}</small>
        </div>
      </div>
      <AllocationBar total={alloc} fmtPct={fmtPct} t={t} />
    </button>
  );
}

export default function OwnershipPage() {
  const api = useMobileOwnership();
  const { i18n, t } = api;
  const [monthOpen, setMonthOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState(null);
  const companyList = useIncrementalList(api.companiesData, 40);
  const groupList = useIncrementalList(api.geGroups, 40);

  const independentCount = useMemo(
    () => (api.allCompanies || []).filter((c) => !c.group_id).length,
    [api.allCompanies],
  );

  const segmentTabs = useMemo(
    () => [
      { id: "account-ownership", label: t("accountOwnership") },
      { id: "group-earnings", label: t("groupEarnings") },
    ],
    [t],
  );

  const editorCompany = api.expandedCompanyId != null
    ? (api.allCompanies || []).find((c) => Number(c.id) === Number(api.expandedCompanyId))
    : null;
  const editorGroup = api.geExpanded
    ? (api.geGroups || []).find((g) => g.group_id === api.geExpanded)
    : null;

  const overlayOpen = Boolean(
    monthOpen || api.expandedCompanyId != null || api.geExpanded || joinTarget || api.conflict,
  );

  if (api.blocked) return null;

  const monthLabel = formatOwnershipMonthShort(api.selectedMonth, api.lang);

  return (
    <MobileShell
      i18n={i18n}
      me={api.me}
      companyCode={api.companyCode}
      groupId={api.groupId}
      onLogout={api.logout}
      onRefresh={api.refresh}
      refreshing={api.refreshing}
      stickyBar={
        <div className="m-own-sticky">
          <MobileSubpageHeader
            backTo="/more"
            backAriaLabel={t("backToMore")}
            title={t("pageTitle")}
            subtitle={t("pageSubtitle")}
            trailing={
              <button
                type="button"
                className={`m-own-month-trigger tap-scale${api.isHistoricalView ? " is-history" : ""}`}
                onClick={() => setMonthOpen(true)}
              >
                <i className="fas fa-calendar-days" aria-hidden="true" />
                <span>{monthLabel}</span>
              </button>
            }
          />
          <EarningsSegmentControl
            ariaLabel={t("pageTitle")}
            tabs={segmentTabs}
            value={api.activeTab}
            onChange={api.setActiveTab}
          />
          {api.activeTab === "account-ownership" && api.allGroupIds.length > 0 ? (
            <div className="m-own-filter-row">
              <div className="m-own-chips" role="group" aria-label={t("group")}>
                <button
                  type="button"
                  className={`m-own-chip tap-scale${api.groupFilter === null ? " is-active" : ""}`}
                  onClick={() => api.setGroupFilter(null)}
                >
                  <span>{t("independent")}</span>
                  <em>{independentCount}</em>
                </button>
                {api.allGroupIds.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`m-own-chip tap-scale${api.groupFilter === g ? " is-active" : ""}`}
                    onClick={() => api.setGroupFilter((prev) => (prev === g ? null : g))}
                  >
                    <span>{g}</span>
                    <em>{countOwnershipSubsidiariesInGroup(api.allCompanies, g)}</em>
                  </button>
                ))}
              </div>
              {!api.adminLocked ? (
                <button
                  type="button"
                  className={`m-own-select-btn tap-scale${api.selectionMode ? " is-active" : ""}`}
                  onClick={api.toggleSelectionMode}
                >
                  {api.selectionMode ? t("cancel") : t("select")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      }
      lang={api.lang}
      onLangChange={api.setLang}
      overlayOpen={overlayOpen}
      overlay={
        <>
          <OwnershipMonthSheet
            open={monthOpen}
            onClose={() => setMonthOpen(false)}
            selectedMonth={api.selectedMonth}
            onMonthChange={api.setSelectedMonth}
            lang={api.lang}
            t={t}
          />
          <OwnershipEditorSheet
            open={api.expandedCompanyId != null}
            onClose={api.closeCompany}
            title={editorCompany?.name || t("accountOwnership")}
            loading={api.loadingCompanyId === api.expandedCompanyId}
            saving={api.savingCompanyId === api.expandedCompanyId}
            state={api.expandedCompanyId != null ? api.companyStates[api.expandedCompanyId] : null}
            t={t}
            fmtPct={api.fmtPct}
            calcTotal={api.calcTotal}
            readOnlyMode={api.viewOnlyMode}
            partnerLocked={api.adminLocked}
            partnerDescKey="partnerDescCompany"
            onUpdateRow={(idx, field, val) => api.updateRow(api.expandedCompanyId, idx, field, val)}
            onAddRow={() => api.addRow(api.expandedCompanyId)}
            onRemoveRow={(idx) => void api.removeRow(api.expandedCompanyId, idx)}
            onLinkPartner={(login) => api.linkPartner(api.expandedCompanyId, login)}
            onConfirm={() => api.confirmCompany(api.expandedCompanyId)}
          />
          <OwnershipEditorSheet
            open={Boolean(api.geExpanded)}
            onClose={api.closeGroup}
            title={editorGroup?.group_id || api.geExpanded || t("groupEarnings")}
            loading={api.geLoadingGid === api.geExpanded}
            saving={api.geSavingGid === api.geExpanded}
            state={api.geExpanded ? api.geStates[api.geExpanded] : null}
            t={t}
            fmtPct={api.fmtPct}
            calcTotal={api.calcTotal}
            readOnlyMode={api.viewOnlyMode}
            partnerLocked={api.adminLocked}
            partnerDescKey="partnerDescGroup"
            onUpdateRow={(idx, field, val) => api.geUpdateRow(api.geExpanded, idx, field, val)}
            onAddRow={() => api.geAddRow(api.geExpanded)}
            onRemoveRow={(idx) => void api.geRemoveRow(api.geExpanded, idx)}
            onLinkPartner={(login) => api.geLinkPartner(api.geExpanded, login)}
            onConfirm={() => api.geConfirm(api.geExpanded)}
          />
          <OwnershipJoinGroupSheet
            open={Boolean(joinTarget)}
            onClose={() => setJoinTarget(null)}
            t={t}
            groups={api.allGroupIds}
            onPick={(gid) => {
              if (!joinTarget) return;
              void api.joinGroup(Number(joinTarget.id), gid, joinTarget.name);
            }}
          />
          <OwnershipConflictSheet
            open={Boolean(api.conflict)}
            conflict={api.conflict}
            onResolve={(type) => void api.resolveConflict(type)}
            onCancel={() => api.setConflict(null)}
            t={t}
          />
        </>
      }
    >
      <div className={`m-own-page${api.selectionMode && api.selectedCompanyIds.size > 0 ? " has-bulk" : ""}`}>
        {api.toast ? (
          <div className={`m-account-toast ${api.toast.type === "error" ? "error" : ""}`}>
            {api.toast.message}
          </div>
        ) : null}

        {api.viewOnlyMode ? <p className="m-own-readonly">{t("readOnlyModifyBlocked")}</p> : null}

        {api.isHistoricalView ? (
          <p className={`m-own-banner${api.historyBanner?.empty ? " is-warn" : ""}`}>
            {api.historyBanner?.empty
              ? t("noSnapshotShort")
              : api.historyBanner?.savedAt
                ? t("snapshotSavedShort", { savedAt: api.historyBanner.savedAt })
                : t("historicalEditHint")}
            {api.historyBanner ? ` · ${t("historicalEditHint")}` : null}
          </p>
        ) : null}

        {api.activeTab === "account-ownership" ? (
          api.loading || api.loadingList ? (
            <div className="m-account-loading">
              <i className="fas fa-spinner fa-spin" aria-hidden="true" />
              <span>{t("loading")}</span>
            </div>
          ) : companyList.visible.length ? (
            <div className="m-own-list">
              {companyList.visible.map((comp) => {
                const gid = comp.group_id || null;
                const selectable = api.allGroupIds.length > 0 && (!gid || api.groupFilter !== null);
                return (
                  <CompanyCard
                    key={comp.id}
                    comp={comp}
                    t={t}
                    fmtPct={api.fmtPct}
                    selected={api.selectedCompanyIds.has(Number(comp.id))}
                    selectionMode={api.selectionMode}
                    selectable={selectable}
                    adminLocked={api.adminLocked}
                    canJoin={api.allGroupIds.length > 0}
                    onOpen={(id) => void api.openCompany(id)}
                    onSelect={api.toggleCompanySelect}
                    onLongPress={api.enterSelectionWith}
                    onJoin={(c) => setJoinTarget({ id: c.id, name: c.name })}
                    onUngroup={(id, name) => void api.ungroupCompany(id, name)}
                  />
                );
              })}
              {companyList.hasMore ? (
                <div ref={companyList.sentinelRef} className="m-admin-sentinel" aria-hidden="true" />
              ) : null}
            </div>
          ) : (
            <div className="m-account-empty">
              <i className="fas fa-sitemap" aria-hidden="true" />
              <p>{t("noCompaniesFound")}</p>
            </div>
          )
        ) : api.loading || api.geLoading ? (
          <div className="m-account-loading">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            <span>{t("loading")}</span>
          </div>
        ) : groupList.visible.length ? (
          <div className="m-own-list">
            {groupList.visible.map((grp) => (
              <GroupCard
                key={grp.group_id}
                grp={grp}
                t={t}
                fmtPct={api.fmtPct}
                onOpen={(gid) => void api.openGroup(gid)}
              />
            ))}
            {groupList.hasMore ? (
              <div ref={groupList.sentinelRef} className="m-admin-sentinel" aria-hidden="true" />
            ) : null}
          </div>
        ) : (
          <div className="m-account-empty">
            <i className="fas fa-layer-group" aria-hidden="true" />
            <p>{t("noGroupsFound")}</p>
          </div>
        )}

        {api.selectionMode && api.selectedCompanyIds.size > 0 ? (
          <div className="m-own-bulk">
            <div className="m-own-bulk-left">
              <strong>{api.selectedCompanyIds.size}</strong>
              <span>{t("selected")}</span>
            </div>
            {api.groupFilter !== null ? (
              <button type="button" className="m-own-bulk-danger tap-scale" onClick={() => void api.bulkUngroup()}>
                {t("ungroup")}
              </button>
            ) : (
              <>
                <select
                  className="m-own-bulk-select"
                  value={api.bulkGroupSelect}
                  onChange={(e) => api.setBulkGroupSelect(e.target.value)}
                >
                  <option value="">{t("selectGroupPlaceholder")}</option>
                  {api.allGroupIds.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="m-own-bulk-primary tap-scale"
                  onClick={() => void api.bulkJoin(api.bulkGroupSelect)}
                >
                  {t("joinGroupAction")}
                </button>
              </>
            )}
            <button type="button" className="m-own-bulk-cancel tap-scale" onClick={api.toggleSelectionMode}>
              {t("bulkCancel")}
            </button>
          </div>
        ) : null}
      </div>
    </MobileShell>
  );
}
