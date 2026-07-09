import { useEffect, useRef, useState } from "react";

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** Interpolate a money metric from 0 toward `target` (positive rises, negative falls). */
export function useAnimatedNumber(target, { duration = 550, active = true } = {}) {
  const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0;
  const [value, setValue] = useState(active ? 0 : safeTarget);
  const rafRef = useRef(0);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (!active) {
      setValue(safeTarget);
      return undefined;
    }

    if (safeTarget === 0) {
      setValue(0);
      return undefined;
    }

    const from = 0;
    const to = safeTarget;
    const start = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(from + (to - from) * easeOutCubic(progress));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setValue(to);
      }
    };

    setValue(from);
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [safeTarget, duration, active]);

  return value;
}
