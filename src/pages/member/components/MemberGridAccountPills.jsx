import {
  applyWlGridAccountAll,
  applyWlGridAccountToggle,
  getWlGridIncludedAccountIds,
  isWlGridAllSelected,
} from "../memberPageHelpers.js";

export default function MemberGridAccountPills({
  linkedAccounts,
  selectedIds,
  onApply,
  onNotify,
  t,
}) {
  const accounts = Array.isArray(linkedAccounts) ? linkedAccounts : [];
  if (!accounts.length) return null;

  const allSelected = isWlGridAllSelected(accounts, selectedIds);
  const included = new Set(getWlGridIncludedAccountIds(accounts, selectedIds));
  const showAllBtn = accounts.length > 1;

  const handleAll = () => {
    if (allSelected) return;
    onApply(applyWlGridAccountAll(accounts));
  };

  const handleToggle = (accountId) => {
    const next = applyWlGridAccountToggle(accounts, selectedIds, accountId);
    if (!next.length) {
      onNotify(t("selectAtLeastOneAccount"), "warning");
      return;
    }
    onApply(next);
  };

  return (
    <div className="user-gc-inline-row member-winloss-grid-account-filter" id="member_grid_account_filter">
      <span className="user-gc-inline-label">{t("gridAccountSelect")}</span>
      <div
        className="user-gc-inline-pills member-winloss-account-pills member-winloss-grid-account-pills"
        id="member_grid_account_buttons"
        aria-label={t("linkedFilterTitle")}
      >
        <div className="user-gc-segment-group member-winloss-grid-account-segments" role="group">
          {showAllBtn && (
            <button
              type="button"
              className={`user-gc-segment${allSelected ? " is-on" : ""}`}
              onClick={handleAll}
            >
              {t("all")}
            </button>
          )}
          {accounts.map((acc) => {
            const id = Number(acc.id);
            const label = String(acc.account_id || acc.name || acc.id);
            const isOn = showAllBtn ? !allSelected && included.has(id) : true;
            return (
              <button
                key={acc.id}
                type="button"
                className={`user-gc-segment${isOn ? " is-on" : ""}`}
                onClick={() => handleToggle(id)}
              >
                <span className="member-winloss-account-pill-label">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
