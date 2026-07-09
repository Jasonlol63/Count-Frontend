import React, { useEffect, useRef, useState } from "react";
import OwnAccountSelect from "./OwnAccountSelect.jsx";
import { accountsForRowPicker, ownershipRowClientId } from "../ownershipRowHelpers.js";

function normalizePct(value) {
  const p = parseFloat(value);
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, p));
}

function applySliderBg(sliderEl, value) {
  if (!sliderEl) return;
  const min = Number(sliderEl.min) || 0;
  const max = Number(sliderEl.max) || 100;
  const pct = ((Number(value) || 0) - min) / (max - min || 1);
  const p = Math.max(0, Math.min(100, pct * 100));
  sliderEl.style.background = `linear-gradient(to right, var(--own-primary-blue) ${p}%, var(--own-gray-border) ${p}%)`;
}

export default function AccountEditorRow({
  companyId,
  idx,
  row,
  accounts,
  maxPercentage = 100,
  onUpdate,
  onRemove,
  onDragStart,
  onDrop,
  onDragEnd,
  dragContextRef,
  enableDrag = true,
  readOnlyMode = false,
  structureLocked = false,
  t,
}) {
  const sliderRef = useRef(null);
  const rowRef = useRef(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const rowClientId = ownershipRowClientId(row, idx);
  const pctMax = Math.max(0, Math.min(100, Number(maxPercentage) || 0));
  const storedPct = normalizePct(row.percentage);
  const [displayPct, setDisplayPct] = useState(storedPct);
  const [inputValue, setInputValue] = useState(() => `${storedPct}%`);
  const isEditingPctRef = useRef(false);

  useEffect(() => {
    if (isEditingPctRef.current) return;
    setDisplayPct(storedPct);
    setInputValue(`${storedPct}%`);
  }, [rowClientId, storedPct]);

  useEffect(() => {
    requestAnimationFrame(() => applySliderBg(sliderRef.current, displayPct));
  }, [displayPct]);

  useEffect(() => {
    if (!dragEnabled) return undefined;
    const up = () => setDragEnabled(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [dragEnabled]);

  const isPartnership = String(row.role || "").toLowerCase() === "partnership";
  const showRo = isPartnership || row.is_external_partner;

  const commitSliderPct = (raw) => {
    const next = Math.min(normalizePct(raw), pctMax);
    setDisplayPct(next);
    setInputValue(`${next}%`);
    onUpdate(idx, "slider", next);
  };

  const sliderDisabled =
    readOnlyMode || row.is_external_partner || (pctMax <= 0 && storedPct <= 0);
  const layoutLocked = readOnlyMode || structureLocked;

  const clearDragStyles = () => {
    const el = rowRef.current;
    if (!el) return;
    el.style.borderTop = "";
    el.style.borderBottom = "";
    el.style.transform = "";
  };

  return (
    <div
      ref={rowRef}
      className="own-account-row"
      data-row-id={rowClientId}
      data-index={idx}
      data-group-entry={String(row.account_id || "").startsWith("G_") ? "true" : undefined}
      draggable={!layoutLocked && enableDrag && dragEnabled}
      onDragStart={(e) => {
        if (!enableDrag || !dragEnabled) {
          e.preventDefault();
          return;
        }
        onDragStart?.(e);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
        window.setTimeout(() => rowRef.current?.classList.add("own-dragging"), 0);
      }}
      onDragOver={(e) => {
        if (!enableDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const d = dragContextRef?.current;
        if (!d || d.companyId !== companyId || d.idx === idx) return;
        const el = rowRef.current;
        if (!el) return;
        const bounding = el.getBoundingClientRect();
        const offset = bounding.y + bounding.height / 2;
        if (e.clientY > offset) {
          el.style.borderBottom = "2px solid var(--own-primary-blue)";
          el.style.borderTop = "";
          el.style.transform = "translateY(-2px)";
        } else {
          el.style.borderTop = "2px solid var(--own-primary-blue)";
          el.style.borderBottom = "";
          el.style.transform = "translateY(2px)";
        }
      }}
      onDragLeave={() => {
        clearDragStyles();
      }}
      onDrop={(e) => {
        e.preventDefault();
        clearDragStyles();
        onDrop?.(e);
      }}
      onDragEnd={() => {
        rowRef.current?.classList.remove("own-dragging");
        setDragEnabled(false);
        if (enableDrag && dragContextRef?.current?.companyId === companyId) {
          const container = rowRef.current?.parentElement;
          container?.querySelectorAll(".own-account-row").forEach((r) => {
            r.style.borderTop = "";
            r.style.borderBottom = "";
            r.style.transform = "";
          });
        }
        onDragEnd?.();
      }}
    >
      <div
        className="own-drag-handle"
        style={{ display: layoutLocked ? "none" : "" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (!layoutLocked && enableDrag) setDragEnabled(true);
        }}
        onMouseLeave={() => setDragEnabled(false)}
      >
        ⋮⋮
      </div>
      <OwnAccountSelect
        value={row.account_id}
        accounts={accountsForRowPicker(accounts, row.account_id)}
        displayLabel={row.account_label}
        disabled={layoutLocked || row.is_external_partner}
        t={t}
        onChange={(id) => onUpdate(idx, "account_id", id)}
      />
      <div
        className="own-ownership-input-group"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          className="own-percent-input"
          id={`input-${companyId}-${rowClientId}`}
          value={inputValue}
          disabled={readOnlyMode || row.is_external_partner || (pctMax <= 0 && storedPct <= 0)}
          onFocus={() => {
            isEditingPctRef.current = true;
          }}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={(e) => {
            isEditingPctRef.current = false;
            const next = Math.min(normalizePct(e.target.value), pctMax);
            setDisplayPct(next);
            setInputValue(`${next}%`);
            onUpdate(idx, "percent_input", next);
          }}
        />
        <div className="own-slider-container">
          <input
            ref={sliderRef}
            type="range"
            className="own-slider"
            id={`slider-${companyId}-${rowClientId}`}
            min={0}
            max={100}
            step={1}
            value={displayPct}
            disabled={sliderDisabled}
            onPointerDown={() => {
              isEditingPctRef.current = true;
            }}
            onPointerUp={() => {
              isEditingPctRef.current = false;
            }}
            onPointerCancel={() => {
              isEditingPctRef.current = false;
            }}
            onInput={(e) => commitSliderPct(e.target.value)}
          />
          <div className="own-slider-labels">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <div className="own-row-actions">
        <div className="own-read-only-badge" style={{ display: showRo ? "flex" : "none" }}>
            <span className="own-read-only-text">{t("readOnly")}</span>
          <label className="own-ro-toggle">
            <input
              type="checkbox"
              checked={row.read_only === 1}
              disabled={layoutLocked || !showRo}
              onChange={(e) => onUpdate(idx, "read_only", e.target.checked ? 1 : 0)}
            />
            <span className="own-ro-slider" />
          </label>
        </div>
        <button type="button" className="own-btn-square own-btn-delete" title={t("remove")} disabled={layoutLocked} onClick={() => onRemove(idx)}>
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
