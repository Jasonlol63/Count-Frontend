import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";

/** Capsule tab switcher — sliding gradient thumb, styled to match the app's PagePillTabSwitch look. */
export function PillSwitch({ options, value, onChange }) {
  const containerRef = useRef(null);
  const [thumb, setThumb] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = containerRef.current?.querySelector(`[data-value="${CSS.escape(value)}"]`);
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, options]);

  return (
    <div ref={containerRef} className="al-pill-track">
      {thumb ? <span className="al-pill-thumb" style={{ left: thumb.left, width: thumb.width }} /> : null}
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-value={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn("al-pill-tab", value === opt.value && "is-active")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
