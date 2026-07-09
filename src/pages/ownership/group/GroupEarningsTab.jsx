import React from "react";
import GroupEarningCard from "./components/GroupEarningCard.jsx";

export default function GroupEarningsTab({ shell, group }) {
  const { t, isHistoricalView, readOnlyMode } = shell;
  const {
    geGroups,
    geLoading,
    geStates,
    geExpanded,
    setGeExpanded,
    geLoadingGid,
    geSavingGid,
    calcTotal,
    fmtPct,
    viewOnlyMode,
    geToggle,
    geAddRow,
    geUpdateRow,
    geRemoveRow,
    geConfirm,
    geLinkPartner,
  } = group;

  return (
    <div className="own-tab-panel">
      <div id="groupEarningsContainer">
        {geLoading && !geGroups.length ? (
          <div className="own-loader-container">
            <div className="own-loader" />
          </div>
        ) : geGroups.length === 0 ? (
          <div className="own-empty-state">{t("noGroupsFound")}</div>
        ) : (
          geGroups.map((grp) => (
            <GroupEarningCard
              key={grp.group_id}
              grp={grp}
              expanded={geExpanded === grp.group_id}
              loadingGid={geLoadingGid}
              geState={geStates[grp.group_id]}
              geSavingGid={geSavingGid}
              onToggle={geToggle}
              onAddRow={geAddRow}
              onUpdateRow={geUpdateRow}
              onRemoveRow={geRemoveRow}
              onConfirm={geConfirm}
              onCancel={() => setGeExpanded(null)}
              onLinkPartner={(login) => geLinkPartner(grp.group_id, login)}
              calcTotal={calcTotal}
              readOnlyMode={readOnlyMode}
              isHistoricalView={isHistoricalView}
              fmtPct={fmtPct}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}
