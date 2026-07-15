/**
 * Cross-browser MediaQueryList change listener (supports legacy addListener fallback).
 * Returns an unsubscribe function.
 */
export function bindMediaQueryChange(mediaQueryList, listener) {
  if (!mediaQueryList || typeof listener !== "function") return () => {};
  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", listener);
    return () => {
      if (typeof mediaQueryList.removeEventListener === "function") {
        mediaQueryList.removeEventListener("change", listener);
      }
    };
  }
  if (typeof mediaQueryList.addListener === "function") {
    mediaQueryList.addListener(listener);
    return () => {
      if (typeof mediaQueryList.removeListener === "function") {
        mediaQueryList.removeListener(listener);
      }
    };
  }
  return () => {};
}
