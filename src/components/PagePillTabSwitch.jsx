import { useEffect, useRef } from "react";

/**
 * Capsule tab switcher — sliding thumb like sidebar lang toggle, flat (no gloss).
 */
export default function PagePillTabSwitch({ value, onChange, options, ariaLabel, className = "" }) {
  const thumbRef = useRef(null);
  const prevIndexRef = useRef(-1);
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );

  useEffect(() => {
    const thumb = thumbRef.current;
    const prevIndex = prevIndexRef.current;
    if (!thumb || prevIndex < 0 || prevIndex === activeIndex) {
      prevIndexRef.current = activeIndex;
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      prevIndexRef.current = activeIndex;
      return;
    }

    const fromX = `${prevIndex * 100}%`;
    const toX = `${activeIndex * 100}%`;
    const direction = activeIndex > prevIndex ? 1 : -1;
    const overshootX = `${activeIndex * 100 + direction * 12}%`;
    const reboundX1 = `${activeIndex * 100 - direction * 3}%`;
    const reboundX2 = `${activeIndex * 100 + direction * 1.2}%`;

    thumb.animate(
      [
        { transform: `translateX(${fromX}) scaleX(1) scaleY(1)` },
        { transform: `translateX(${overshootX}) scaleX(1.08) scaleY(0.92)`, offset: 0.46 },
        { transform: `translateX(${reboundX1}) scaleX(0.96) scaleY(1.04)`, offset: 0.68 },
        { transform: `translateX(${reboundX2}) scaleX(1.02) scaleY(0.98)`, offset: 0.86 },
        { transform: `translateX(${toX}) scaleX(0.99) scaleY(1.01)`, offset: 0.94 },
        { transform: `translateX(${toX}) scaleX(1) scaleY(1)` },
      ],
      {
        duration: 720,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        fill: "none",
      },
    );

    prevIndexRef.current = activeIndex;
  }, [activeIndex]);

  return (
    <div
      className={`page-tabs page-tabs--count-${options.length} is-index-${activeIndex}${className ? ` ${className}` : ""}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span ref={thumbRef} className="page-tab-thumb" aria-hidden="true" />
      {options.map((opt) => {
        const isActive = value === opt.value;
        const tabClass = ["page-tab", isActive ? "active" : "", opt.className || ""]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={tabClass}
            onClick={() => onChange(opt.value)}
          >
            {opt.children ?? opt.label}
          </button>
        );
      })}
    </div>
  );
}
