import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 64;
const MAX_PULL = 100;
const ARM_RATIO = 0.88;
const REFRESH_HOLD = 46;
const AXIS_LOCK_PX = 8;
const MIN_SPIN_MS = 320;

function damp(delta) {
  if (delta <= 0) return 0;
  const eased = THRESHOLD * (1 - Math.exp(-delta / (THRESHOLD * 1.1)));
  return Math.min(MAX_PULL, eased);
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * Touch pull-to-refresh for a vertical scroll container (scrollTop≈0 to arm).
 */
export function usePullToRefresh(scrollRef, { onRefresh, enabled = true, refreshing = false } = {}) {
  const [pullPx, setPullPx] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | pulling | armed | refreshing | settling
  const startY = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const axisLocked = useRef(null);
  const locked = useRef(false);
  const sawRefreshing = useRef(false);
  /** True only when a pull/release (or in-flight gesture phase) owns the refresh UI. */
  const gestureRefreshRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pullPxRef = useRef(0);
  const animRef = useRef(0);
  const fallbackTimer = useRef(0);
  const minHoldTimer = useRef(0);
  const refreshStartedAt = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;

  const setPullImmediate = useCallback((px) => {
    pullPxRef.current = px;
    setPullPx(px);
  }, []);

  const cancelAnim = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = 0;
  }, []);

  const animatePull = useCallback(
    (target, { duration = 240, onDone } = {}) => {
      cancelAnim();
      const from = pullPxRef.current;
      if (Math.abs(from - target) < 0.5) {
        setPullImmediate(target);
        onDone?.();
        return;
      }
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const v = from + (target - from) * easeOutCubic(t);
        setPullImmediate(v);
        if (t < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          animRef.current = 0;
          onDone?.();
        }
      };
      animRef.current = requestAnimationFrame(step);
    },
    [cancelAnim, setPullImmediate],
  );

  const settleIdle = useCallback(() => {
    locked.current = false;
    tracking.current = false;
    axisLocked.current = null;
    sawRefreshing.current = false;
    gestureRefreshRef.current = false;
    setPhase("idle");
    animatePull(0, { duration: 260 });
  }, [animatePull]);

  useEffect(() => {
    if (refreshing) {
      locked.current = true;
      window.clearTimeout(fallbackTimer.current);

      const inGestureUi =
        gestureRefreshRef.current ||
        phaseRef.current === "pulling" ||
        phaseRef.current === "armed" ||
        phaseRef.current === "refreshing";

      // Programmatic loads (tab/filter/nav): keep data fetch, skip pull indicator UI.
      if (!inGestureUi) return;

      sawRefreshing.current = true;
      gestureRefreshRef.current = true;
      refreshStartedAt.current = Date.now();
      window.clearTimeout(minHoldTimer.current);
      cancelAnim();
      setPhase("refreshing");
      animatePull(Math.max(pullPxRef.current, REFRESH_HOLD), { duration: 180 });
      return;
    }

    if (!sawRefreshing.current) {
      locked.current = false;
      gestureRefreshRef.current = false;
      return;
    }

    const held = Date.now() - (refreshStartedAt.current || Date.now());
    const wait = Math.max(0, MIN_SPIN_MS - held);
    window.clearTimeout(minHoldTimer.current);
    setPhase("settling");
    minHoldTimer.current = window.setTimeout(() => {
      animatePull(0, {
        duration: 280,
        onDone: () => {
          locked.current = false;
          tracking.current = false;
          axisLocked.current = null;
          sawRefreshing.current = false;
          gestureRefreshRef.current = false;
          setPhase("idle");
        },
      });
    }, wait);
  }, [refreshing, animatePull, cancelAnim]);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || !enabled) return undefined;

    const onTouchStart = (e) => {
      if (locked.current || refreshingRef.current) return;
      if (el.scrollTop > 1) return;
      cancelAnim();
      const t = e.touches[0];
      if (!t) return;
      startY.current = t.clientY;
      startX.current = t.clientX;
      tracking.current = true;
      axisLocked.current = null;
    };

    const onTouchMove = (e) => {
      if (!tracking.current || locked.current || refreshingRef.current) return;

      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      const dx = t.clientX - startX.current;

      if (!axisLocked.current) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        axisLocked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (axisLocked.current === "h") {
          tracking.current = false;
          setPullImmediate(0);
          setPhase("idle");
          return;
        }
      }
      if (axisLocked.current === "h") return;

      if (el.scrollTop > 1) {
        tracking.current = false;
        setPullImmediate(0);
        setPhase("idle");
        return;
      }

      if (dy <= 0) {
        setPullImmediate(0);
        setPhase("idle");
        return;
      }

      cancelAnim();
      const damped = damp(dy);
      setPullImmediate(damped);
      setPhase(damped >= THRESHOLD * ARM_RATIO ? "armed" : "pulling");
      if (damped > 2) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!tracking.current) {
        axisLocked.current = null;
        return;
      }
      tracking.current = false;
      const wasVertical = axisLocked.current === "v";
      axisLocked.current = null;

      const shouldRefresh =
        wasVertical &&
        pullPxRef.current >= THRESHOLD * ARM_RATIO &&
        !refreshingRef.current &&
        typeof onRefreshRef.current === "function";

      if (!shouldRefresh) {
        setPhase("settling");
        animatePull(0, { duration: 220, onDone: () => setPhase("idle") });
        return;
      }

      locked.current = true;
      gestureRefreshRef.current = true;
      setPhase("refreshing");
      animatePull(REFRESH_HOLD, { duration: 160 });
      Promise.resolve(onRefreshRef.current()).catch(() => {});
      window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = window.setTimeout(() => {
        if (!sawRefreshing.current && locked.current) settleIdle();
      }, 1800);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      cancelAnim();
      window.clearTimeout(fallbackTimer.current);
      window.clearTimeout(minHoldTimer.current);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scrollRef, enabled, setPullImmediate, animatePull, cancelAnim, settleIdle]);

  const progress = Math.min(1, pullPx / THRESHOLD);
  const isAnimating = phase === "refreshing" || phase === "settling";

  return {
    pullPx,
    progress,
    phase,
    active: pullPx > 0.5 || isAnimating,
    isAnimating,
  };
}
