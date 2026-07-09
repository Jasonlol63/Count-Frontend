import React from "react";

export default function BulkActionBar({
  selectedCount,
  groupFilter,
  allGroupIds,
  bulkGroupSelect,
  setBulkGroupSelect,
  onBulkUngroup,
  onBulkJoin,
  onExitSelectionMode,
  t,
}) {
  if (selectedCount === 0) return null;

  return (
    <div
      id="own-bulk-bar"
      className={`own-bulk-bar own-bulk-bar-visible${groupFilter !== null ? " own-bulk-bar-ungroup" : ""}`}
    >
      <div className="own-bulk-bar-left">
        <span className="own-bulk-count">{selectedCount}</span>
        <span className="own-bulk-label">{t("selected")}</span>
      </div>
      <div className="own-bulk-bar-right">
        {groupFilter !== null ? (
          <>
            <button type="button" className="own-bulk-ungroup-btn" onClick={onBulkUngroup}>
              {t("ungroup")}
            </button>
            <button type="button" className="own-bulk-cancel-btn" onClick={onExitSelectionMode}>
              {t("bulkCancel")}
            </button>
          </>
        ) : (
          <>
            <div className="own-bulk-group-wrap">
              <select
                className="own-bulk-group-select"
                value={bulkGroupSelect}
                onChange={(e) => setBulkGroupSelect(e.target.value)}
              >
                <option value="">{t("selectGroupPlaceholder")}</option>
                {allGroupIds.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="own-bulk-join-btn" onClick={() => onBulkJoin(bulkGroupSelect)}>
              {t("joinGroupAction")}
            </button>
            <button type="button" className="own-bulk-cancel-btn" onClick={onExitSelectionMode}>
              {t("bulkCancel")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
