import React from "react";
import AccountEditorRow from "../../shared/components/AccountEditorRow.jsx";
import GePartnerSection from "./GePartnerSection.jsx";
import { ownershipRowClientId, maxAllowedOwnershipPct } from "../../shared/ownershipRowHelpers.js";

export default function GroupEarningCard({
  grp,
  expanded,
  loadingGid,
  geState,
  geSavingGid,
  onToggle,
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  onConfirm,
  onCancel,
  onLinkPartner,
  calcTotal,
  readOnlyMode,
  isHistoricalView,
  fmtPct,
  t,
}) {
  const gid = grp.group_id;
  const alloc = parseFloat(grp.allocated_percentage) || 0;
  const st = geState;
  const totalLive = st ? calcTotal(st.rows) : alloc;

  let footerText = t("unallocated", { value: "100%" });
  let warn = { show: false, err: false, icon: "⚠️", msg: "" };
  let confirmDisabled = false;

  if (st) {
    const total = calcTotal(st.rows);
    const r = 100 - total;
    if (total > 100) {
      warn = { show: true, err: true, icon: "❌", msg: t("totalExceeds100") };
      footerText = t("overAllocated", { value: `${Math.abs(r).toFixed(2)}%` });
      confirmDisabled = true;
    } else if (total < 100) {
      warn = { show: true, err: false, icon: "⚠️", msg: t("totalLessThan100") };
      footerText = t("unallocated", { value: `${r.toFixed(2)}%` });
    } else footerText = t("fullyAllocated");
  }

  return (
    <div
      id={`ge-card-${gid}`}
      className={`own-card ge-card${expanded ? " expanded" : ""}`}
      onClick={(e) => {
        const action = e.target.closest("[data-action]")?.dataset?.action;
        if (!action) return;
        e.stopPropagation();
        if (action === "toggle") onToggle(gid);
        else if (action === "add-row") onAddRow(gid);
        else if (action === "cancel") onCancel();
        else if (action === "confirm") onConfirm(gid);
      }}
      role="presentation"
    >
      <div className="own-card-header" style={{ cursor: "pointer" }} data-action="toggle" role="presentation">
        <div className="own-card-header-left">
          <div className="own-company-name">{gid}</div>
        </div>
        <div className="own-card-header-middle">
          <div className="own-allocation-info">
            <span className="own-allocation-label">{t("totalAllocation")}</span>
            <span className="own-allocation-percentage">{fmtPct(totalLive)}</span>
            <span className={`own-allocation-remaining${totalLive > 100 ? " own-over-limit" : ""}`}>
              {totalLive > 100 ? t("overLimit") : `${fmtPct(100 - totalLive)} ${t("remaining")}`}
            </span>
          </div>
          <div className="own-progress-bar-container">
            <div
              className={`own-progress-bar-fill${totalLive > 100 ? " own-bar-danger" : ""}`}
              style={{ width: `${Math.min(totalLive, 100)}%` }}
            />
          </div>
        </div>
        <div className="own-card-header-right">
          <button type="button" className="own-btn-outline" data-action="toggle">
            {t("manage")}
          </button>
          <button type="button" className="own-icon-btn" data-action="toggle">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      {isHistoricalView && !expanded && st?.rows?.length > 0 ? (
        <div className="own-history-preview">
          {st.rows.map((row, idx) => (
            <span key={`${gid}-hist-${idx}-${String(row.account_id)}`} className="own-history-preview-chip">
              <span className="own-history-preview-name">{row.account_label || row.account_id}</span>
              <span className="own-history-preview-pct">{fmtPct(row.percentage)}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="own-card-body" id={`ge-card-body-${gid}`}>
        {expanded && loadingGid === gid && !st ? (
          <div className="own-loader-container">
            <div className="own-loader" />
          </div>
        ) : null}
        <div className={expanded && st ? "" : "own-editor-hidden"} id={`ge-editor-${gid}`}>
          {expanded && st ? (
            <>
              <div className="own-table-headers">
                <div>{t("account")}</div>
                <div>{t("ownershipPercent")}</div>
              </div>
              <div id={`ge-rows-container-${gid}`}>
                {st.rows.map((row, idx) => (
                  <AccountEditorRow
                    key={ownershipRowClientId(row, idx)}
                    companyId={`ge-${gid}`}
                    idx={idx}
                    row={row}
                    accounts={st.accounts}
                    maxPercentage={maxAllowedOwnershipPct(st.rows, idx)}
                    enableDrag={false}
                    onUpdate={(i, f, v) => onUpdateRow(gid, i, f, v)}
                    onRemove={(i) => onRemoveRow(gid, i)}
                    readOnlyMode={readOnlyMode}
                    structureLocked={readOnlyMode}
                    t={t}
                  />
                ))}
              </div>
              <button type="button" className="own-btn-add-account" data-action="add-row" disabled={readOnlyMode}>
                {t("addAccount")}
              </button>
              <GePartnerSection groupId={gid} disabled={readOnlyMode || isHistoricalView} onLink={(login) => onLinkPartner(login)} t={t} />
              <div className="own-card-footer">
                <div className="own-footer-left">
                  <div className={`own-warning-badge${warn.err ? " own-warning-error" : ""}`} style={{ display: warn.show ? "flex" : "none" }}>
                    <span>{warn.icon}</span>
                    <span>{warn.msg}</span>
                  </div>
                  <span className="own-unallocated-text">{footerText}</span>
                </div>
                <div className="own-footer-right">
                  <button type="button" className="own-footer-btn own-btn-cancel" data-action="cancel">
                    {t("cancel")}
                  </button>
                  <button
                    type="button"
                    className="own-footer-btn own-btn-confirm"
                    data-action="confirm"
                    disabled={readOnlyMode || confirmDisabled || geSavingGid === gid}
                  >
                    {geSavingGid === gid ? t("saving") : t("confirm")}
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
