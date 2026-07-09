import React from "react";

function FilterChip({ selected, label, onToggle }) {
  return (
    <button
      type="button"
      className={`user-filter-chip${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <span className="user-filter-chip__dot" aria-hidden>
        {selected ? (
          <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12l4 4 8-8" />
          </svg>
        ) : null}
      </span>
      <span className="user-filter-chip__label">{label}</span>
    </button>
  );
}

export default function BankProcessFilterChips({
  t,
  layout = "inline",
  showInactive,
  setShowInactive,
  showAll,
  setShowAll,
  showOfficial,
  setShowOfficial,
  showEInvoice,
  setShowEInvoice,
  showBlock,
  setShowBlock,
}) {
  const isDropdown = layout === "dropdown";
  return (
    <div
      className={[
        "userlist-filter-chips",
        "userlist-filter-chips--bank-process",
        isDropdown ? "userlist-filter-chips--bank-process-dropdown" : "",
      ].filter(Boolean).join(" ")}
      role="group"
    >
      <FilterChip
        selected={showInactive}
        label={t("showInactive")}
        onToggle={() => setShowInactive((v) => !v)}
      />
      <FilterChip
        selected={showAll}
        label={t("showAll")}
        onToggle={() => setShowAll((v) => !v)}
      />
      <FilterChip
        selected={showOfficial}
        label={t("showOfficial")}
        onToggle={() => setShowOfficial((v) => !v)}
      />
      <FilterChip
        selected={showEInvoice}
        label={t("showEInvoice")}
        onToggle={() => setShowEInvoice((v) => !v)}
      />
      <FilterChip
        selected={showBlock}
        label={t("showBlock")}
        onToggle={() => setShowBlock((v) => !v)}
      />
    </div>
  );
}
