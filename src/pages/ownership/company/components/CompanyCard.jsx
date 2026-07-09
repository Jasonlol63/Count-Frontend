import React from "react";
import AccountEditorRow from "../../shared/components/AccountEditorRow.jsx";
import PartnerLinkSection from "./PartnerLinkSection.jsx";
import { ownershipRowClientId, maxAllowedOwnershipPct } from "../../shared/ownershipRowHelpers.js";

export default function CompanyCard({
  comp,
  expanded,
  loading,
  companyState,
  allGroupIds,
  selectionMode,
  isSelected,
  groupFilter,
  savingCompanyId,
  openGroupPanelId,
  dragRef,
  onToggle,
  onToggleSelect,
  onJoinGroup,
  onUngroup,
  onSetOpenGroupPanel,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  onReorderRows,
  onLinkPartner,
  onConfirm,
  onCancel,
  calcTotal,
  readOnlyMode,
  isHistoricalView,
  fmtPct,
  t,
}) {
  const id = Number(comp.id);
  const gid = comp.group_id || null;
  const alloc = parseFloat(comp.allocated_percentage) || 0;
  const st = companyState;
  const totalLive = st ? calcTotal(st.rows) : alloc;
  const headerRemain = totalLive > 100 ? t("overLimit") : `${fmtPct(100 - totalLive)} ${t("remaining")}`;
  const headerPct = fmtPct(totalLive);
  const barW = Math.min(totalLive, 100);
  const selectable = allGroupIds.length > 0 && (!gid || groupFilter !== null);

  let footerText = t("unallocated", { value: "100%" });
  let warn = { show: false, err: false, icon: "⚠️", msg: "" };
  let confirmDisabled = false;

  if (st) {
    const total = calcTotal(st.rows);
    const rem = 100 - total;
    if (total > 100) {
      warn = { show: true, err: true, icon: "❌", msg: t("totalExceeds100") };
      footerText = t("overAllocated", { value: fmtPct(Math.abs(rem)) });
      confirmDisabled = true;
    } else if (total < 100) {
      warn = { show: true, err: false, icon: "⚠️", msg: t("totalLessThan100") };
      footerText = t("unallocated", { value: fmtPct(rem) });
    } else {
      footerText = t("fullyAllocated");
    }
  }

  const getExpirationClass = () => {
    if (!comp.expiration_date) return "";
    const expStr = String(comp.expiration_date).split(" ")[0];
    const expDate = new Date(expStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return " own-date-expired";
    if (daysLeft <= 30) return " own-date-warning";
    return "";
  };

  return (
    <div
      id={`card-${id}`}
      data-group-id={gid || undefined}
      data-selectable={selectable && selectionMode ? "true" : undefined}
      className={`own-card${expanded ? " expanded" : ""}${selectionMode && selectable ? " own-selection-mode" : ""}${isSelected ? ` own-selected${groupFilter !== null ? " own-ungroup-select" : ""}` : ""}`}
      onClick={(e) => onToggleSelect(comp, e)}
    >
      <div
        className="own-card-header"
        data-action="toggle"
        onClick={(e) => {
          if (e.target.closest(".own-group-btn-wrap")) return;
          onToggle(id);
        }}
        role="presentation"
      >
        <div className="own-card-header-left">
          <div className="own-company-name">
            {comp.name}
            {gid ? <span className="own-group-badge">{gid}</span> : null}
          </div>
          <div className={`own-company-date${getExpirationClass()}`}>
            {comp.expiration_date ? (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {String(comp.expiration_date).split(" ")[0]}
              </>
            ) : null}
          </div>
        </div>
        <div className="own-card-header-middle">
          <div className="own-allocation-info">
            <span className="own-allocation-label">{t("totalAllocation")}</span>
            <span className="own-allocation-percentage" id={`header-percent-${id}`}>
              {headerPct}
            </span>
            <span className={`own-allocation-remaining${totalLive > 100 ? " own-over-limit" : ""}`} id={`header-remain-${id}`}>
              {headerRemain}
            </span>
          </div>
          <div className="own-progress-bar-container">
            <div className={`own-progress-bar-fill${totalLive > 100 ? " own-bar-danger" : ""}`} id={`header-bar-${id}`} style={{ width: `${barW}%` }} />
          </div>
        </div>
        <div className="own-card-header-right">
          {!readOnlyMode && !isHistoricalView && allGroupIds.length > 0 && !gid ? (
            <div className="own-group-btn-wrap">
              <button
                type="button"
                className="own-group-join-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetOpenGroupPanel(openGroupPanelId === id ? null : id);
                }}
              >
                {t("joinGroup")}
              </button>
              <div className={`own-group-panel${openGroupPanelId === id ? " open" : ""}`}>
                {allGroupIds.map((g) => (
                  <div
                    key={g}
                    className="own-group-option"
                    role="presentation"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetOpenGroupPanel(null);
                      onJoinGroup(id, g, comp.name);
                    }}
                  >
                    {g}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {!readOnlyMode && !isHistoricalView && allGroupIds.length > 0 && gid ? (
            <button type="button" className="own-group-ungroup-btn" onClick={(e) => { e.stopPropagation(); onUngroup(id, comp.name); }}>
              {t("ungroup")}
            </button>
          ) : null}
          <button type="button" className="own-btn-outline" data-action="toggle" onClick={(e) => { e.stopPropagation(); onToggle(id); }}>
            {t("manage")}
          </button>
          <button type="button" className="own-icon-btn" data-action="toggle" onClick={(e) => { e.stopPropagation(); onToggle(id); }}>
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      {isHistoricalView && !expanded && st?.rows?.length > 0 ? (
        <div className="own-history-preview">
          {st.rows.map((row, idx) => (
            <span key={`${id}-hist-${idx}-${String(row.account_id)}`} className="own-history-preview-chip">
              <span className="own-history-preview-name">{row.account_label || row.account_id}</span>
              <span className="own-history-preview-pct">{fmtPct(row.percentage)}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="own-card-body" id={`card-body-${id}`}>
        {expanded && loading && !st ? (
          <div className="own-loader-container" id={`loader-${id}`}>
            <div className="own-loader" />
          </div>
        ) : null}
        <div className={expanded && st ? "" : "own-editor-hidden"} id={`editor-${id}`}>
          {expanded && st ? (
            <>
              <div className="own-table-headers">
                <div>{t("account")}</div>
                <div>{t("ownershipPercent")}</div>
              </div>
              <div id={`rows-container-${id}`}>
                {st.rows.map((row, idx) => (
                  <AccountEditorRow
                    key={ownershipRowClientId(row, idx)}
                    companyId={id}
                    idx={idx}
                    row={row}
                    accounts={st.accounts}
                    maxPercentage={maxAllowedOwnershipPct(st.rows, idx)}
                    dragContextRef={dragRef}
                    onUpdate={(i, f, v) => onUpdateRow(id, i, f, v)}
                    onRemove={(i) => onRemoveRow(id, i)}
                    readOnlyMode={readOnlyMode}
                    structureLocked={readOnlyMode}
                    onDragStart={() => {
                      dragRef.current = { companyId: id, idx };
                    }}
                    onDrop={(e) => {
                      const from = dragRef.current;
                      if (from.companyId !== id || from.idx === null || from.idx === idx) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const insertAfter = e.clientY > rect.top + rect.height / 2;
                      onReorderRows(id, from.idx, idx, insertAfter);
                      dragRef.current = { companyId: null, idx: null };
                    }}
                    onDragEnd={() => {
                      dragRef.current = { companyId: null, idx: null };
                    }}
                    t={t}
                  />
                ))}
              </div>
              <button type="button" className="own-btn-add-account" disabled={readOnlyMode} onClick={(e) => { e.stopPropagation(); onAddRow(id); }}>
                {t("addAccount")}
              </button>
              <PartnerLinkSection
                inputId={`partner-login-${id}`}
                disabled={readOnlyMode || isHistoricalView}
                onLink={async (login) => onLinkPartner(id, login)}
                t={t}
              />
              <div className="own-card-footer">
                <div className="own-footer-left">
                  <div className={`own-warning-badge${warn.err ? " own-warning-error" : ""}`} id={`warning-${id}`} style={{ display: warn.show ? "flex" : "none" }}>
                    <span id={`warning-msg-icon-${id}`}>{warn.icon}</span>
                    <span id={`warning-msg-${id}`}>{warn.msg}</span>
                  </div>
                  <span className="own-unallocated-text" id={`footer-remain-${id}`}>
                    {footerText}
                  </span>
                </div>
                <div className="own-footer-right">
                  <button type="button" className="own-footer-btn own-btn-cancel" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
                    {t("cancel")}
                  </button>
                  <button type="button" className="own-footer-btn own-btn-confirm" id={`confirm-btn-${id}`} disabled={readOnlyMode || confirmDisabled || savingCompanyId === id} onClick={(e) => { e.stopPropagation(); onConfirm(id); }}>
                    {savingCompanyId === id ? t("saving") : t("confirm")}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
