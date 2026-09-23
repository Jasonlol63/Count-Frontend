import { memo, useMemo } from "react";

/**
 * iOS-style segmented control: recessed track + sliding white thumb.
 * Active text stays near-black (not brand blue) — hierarchy comes from the thumb.
 */
const EarningsSegmentControl = memo(function EarningsSegmentControl({
  ariaLabel,
  tabs,
  value,
  onChange,
}) {
  const items = useMemo(
    () => (Array.isArray(tabs) ? tabs.filter((t) => t && t.id && t.label) : []),
    [tabs],
  );
  const activeIndex = Math.max(
    0,
    items.findIndex((t) => t.id === value),
  );
  const count = items.length;
  if (count < 2) return null;

  return (
    <div
      className="m-dash-segment"
      style={{
        "--seg-count": count,
        "--seg-index": activeIndex,
      }}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span className="m-dash-segment-thumb" aria-hidden="true" />
      {items.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`m-dash-segment-btn${active ? " is-active" : ""}`}
            onPointerDown={(e) => {
              // Instant press feedback (Apple: respond on down, not click-up).
              e.currentTarget.classList.add("is-pressed");
            }}
            onPointerUp={(e) => e.currentTarget.classList.remove("is-pressed")}
            onPointerCancel={(e) => e.currentTarget.classList.remove("is-pressed")}
            onPointerLeave={(e) => e.currentTarget.classList.remove("is-pressed")}
            onClick={() => onChange?.(tab.id)}
          >
            <span className="m-dash-segment-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
});

export default EarningsSegmentControl;
