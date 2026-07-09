import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  formatOwnershipMonthShort,
  getOwnershipCurrentMonthKey,
  getOwnershipMonthLabels,
} from "../ownershipMonthHelpers.js";

export default function OwnershipMonthBar({
  selectedMonth,
  onMonthChange,
  isHistoricalView,
  historyBanner,
  t,
  lang,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const shortLabel = formatOwnershipMonthShort(selectedMonth, lang);
  const currentMonthKey = getOwnershipCurrentMonthKey();
  const currentYear = parseInt(currentMonthKey.slice(0, 4), 10);

  const [viewYear, setViewYear] = useState(() => parseInt(selectedMonth.slice(0, 4), 10));
  const monthLabels = useMemo(() => getOwnershipMonthLabels(lang), [lang]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setViewYear(parseInt(selectedMonth.slice(0, 4), 10));
  }, [selectedMonth, open]);

  const pickMonth = (monthIndex) => {
    const key = `${viewYear}-${String(monthIndex).padStart(2, "0")}`;
    if (key > currentMonthKey) return;
    onMonthChange(key);
    setOpen(false);
  };

  const isMonthDisabled = (monthIndex) => {
    const key = `${viewYear}-${String(monthIndex).padStart(2, "0")}`;
    return key > currentMonthKey;
  };

  const isMonthSelected = (monthIndex) => selectedMonth === `${viewYear}-${String(monthIndex).padStart(2, "0")}`;

  return (
    <div className="own-month-picker-wrap" ref={wrapRef}>
      <div className="own-month-picker">
        <div className="own-month-trigger-wrap">
          <button
            type="button"
            className={`own-month-trigger${open ? " is-open" : ""}${isHistoricalView ? " is-history" : ""}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={t("viewMonth")}
          >
            <span className="own-month-trigger-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            <span className="own-month-trigger-label">{shortLabel}</span>
            {isHistoricalView ? (
              <span className="own-month-trigger-tag">{t("historicalView")}</span>
            ) : null}
            <span className="own-month-trigger-chevron" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>

          {open ? (
            <div className="own-month-popover" role="dialog" aria-label={t("viewMonth")}>
              <div className="own-month-popover-year">
                <button
                  type="button"
                  className="own-month-year-btn"
                  aria-label="Previous year"
                  onClick={() => setViewYear((y) => y - 1)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <span className="own-month-year-label">{viewYear}</span>
                <button
                  type="button"
                  className="own-month-year-btn"
                  aria-label="Next year"
                  disabled={viewYear >= currentYear}
                  onClick={() => setViewYear((y) => Math.min(currentYear, y + 1))}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
              <div className="own-month-popover-grid">
                {monthLabels.map((label, idx) => {
                  const monthIndex = idx + 1;
                  const disabled = isMonthDisabled(monthIndex);
                  const selected = isMonthSelected(monthIndex);
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`own-month-cell${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
                      disabled={disabled}
                      onClick={() => pickMonth(monthIndex)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {isHistoricalView ? (
          <button
            type="button"
            className="own-month-back-btn"
            onClick={() => {
              setOpen(false);
              onMonthChange(currentMonthKey);
            }}
          >
            {t("currentMonth")}
          </button>
        ) : null}
      </div>
      {historyBanner ? (
        <p className={`own-month-hint${historyBanner.empty ? " is-warn" : ""}`}>
          {historyBanner.empty
            ? t("noSnapshotShort")
            : t("snapshotSavedShort", { savedAt: historyBanner.savedAt })}
          {isHistoricalView ? ` · ${t("historicalEditHint")}` : null}
        </p>
      ) : isHistoricalView ? (
        <p className="own-month-hint">{t("historicalEditHint")}</p>
      ) : null}
    </div>
  );
}
