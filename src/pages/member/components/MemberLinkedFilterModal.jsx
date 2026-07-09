import { useEffect, useState } from "react";

export default function MemberLinkedFilterModal({
  open,
  linkedAccounts,
  selectedIds,
  onClose,
  onApply,
  onNotify,
  t,
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState([]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setDraft([...selectedIds]);
    }
  }, [open, selectedIds]);

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const visible = linkedAccounts.filter((acc) => {
    const label = String(acc.account_id || acc.name || acc.id).toLowerCase();
    return !q || label.includes(q);
  });

  const toggle = (id) => {
    const n = Number(id);
    setDraft((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  const selectAll = () => {
    setDraft(linkedAccounts.map((a) => Number(a.id)).filter(Boolean));
  };

  const clearAll = () => setDraft([]);

  const apply = () => {
    if (!draft.length) {
      onNotify(t("selectAtLeastOneAccount"), "warning");
      return;
    }
    onApply(draft);
    onClose();
  };

  return (
    <div
      id="member_linked_filter_modal"
      className="transaction-modal"
      style={{ display: "block" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="member_linked_filter_modal_title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="transaction-modal-content member-linked-filter-modal-content">
        <div className="transaction-modal-header">
          <h3 id="member_linked_filter_modal_title">{t("linkedFilterTitle")}</h3>
          <button type="button" className="transaction-modal-close member-linked-filter-close" aria-label={t("close")} onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="transaction-modal-body">
          <div className="member-linked-filter-bar">
            <input
              type="search"
              id="member_linked_filter_search"
              className="member-linked-filter-search"
              placeholder={t("linkedFilterSearch")}
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="member-linked-filter-bulk">
              <button type="button" className="member-linked-bulk-btn" onClick={selectAll}>
                {t("linkedFilterSelectAll")}
              </button>
              <button type="button" className="member-linked-bulk-btn" onClick={clearAll}>
                {t("linkedFilterClear")}
              </button>
            </div>
          </div>
          <div id="member_linked_filter_checkbox_area" className="member-linked-filter-checkboxes">
            {visible.map((acc) => {
              const id = Number(acc.id);
              const label = String(acc.account_id || acc.name || id).trim() || String(id);
              return (
                <label key={id} className="member-linked-cb-row">
                  <input type="checkbox" value={String(id)} checked={draft.includes(id)} onChange={() => toggle(id)} />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="member-linked-filter-footer">
          <button type="button" className="transaction-submit-btn" id="member_linked_filter_apply" onClick={apply}>
            {t("linkedFilterApply")}
          </button>
          <button type="button" className="btn btn-secondary member-linked-filter-cancel-btn" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
