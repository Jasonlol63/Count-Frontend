/** Remove inline overflow locks left by maintenance modals / overlays (SPA route changes). */
export function clearInlineScrollLock() {
  const targets = [document.documentElement, document.body, document.getElementById("root")].filter(Boolean);
  targets.forEach((el) => {
    el.style.removeProperty("overflow");
    el.style.removeProperty("overflow-y");
    el.style.removeProperty("overflow-x");
  });
}
