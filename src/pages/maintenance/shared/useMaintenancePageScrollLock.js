import { useEffect } from "react";

function getScrollLockTargets() {
  return [document.documentElement, document.body, document.getElementById("root")].filter(Boolean);
}

function snapshotOverflow(el) {
  return {
    el,
    overflow: el.style.getPropertyValue("overflow"),
    overflowPriority: el.style.getPropertyPriority("overflow"),
    overflowY: el.style.getPropertyValue("overflow-y"),
    overflowYPriority: el.style.getPropertyPriority("overflow-y"),
    overflowX: el.style.getPropertyValue("overflow-x"),
    overflowXPriority: el.style.getPropertyPriority("overflow-x"),
  };
}

function restoreOverflow(item) {
  const { el } = item;
  if (item.overflow) el.style.setProperty("overflow", item.overflow, item.overflowPriority);
  else el.style.removeProperty("overflow");
  if (item.overflowY) el.style.setProperty("overflow-y", item.overflowY, item.overflowYPriority);
  else el.style.removeProperty("overflow-y");
  if (item.overflowX) el.style.setProperty("overflow-x", item.overflowX, item.overflowXPriority);
  else el.style.removeProperty("overflow-x");
}

function applyScrollLock(targets) {
  targets.forEach((el) => {
    el.style.setProperty("overflow", "hidden", "important");
    el.style.setProperty("overflow-y", "hidden", "important");
    el.style.setProperty("overflow-x", "hidden", "important");
  });
}

/**
 * Maintenance pages: no window scroll — only .maintenance-virtual-scroll scrolls.
 */
export function useMaintenancePageScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const targets = getScrollLockTargets();
    const originalStyles = targets.map(snapshotOverflow);
    applyScrollLock(targets);
    return () => {
      originalStyles.forEach(restoreOverflow);
    };
  }, [enabled]);
}
