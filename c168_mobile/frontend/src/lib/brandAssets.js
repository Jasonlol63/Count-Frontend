/** Site-root brand assets (shared with desktop under /images). */

const LOGO_CANDIDATES = [
  "/images/count_logo.png",
  "/images/count_whitelogo.png",
  "/frontend/dist/images/count_brandlogo.png",
];

export function brandLogoUrl() {
  if (typeof window === "undefined") return LOGO_CANDIDATES[0];
  return new URL(LOGO_CANDIDATES[0], window.location.origin).href;
}

export function brandWhiteLogoUrl() {
  if (typeof window === "undefined") return "/images/count_whitelogo.png";
  return new URL("/images/count_whitelogo.png", window.location.origin).href;
}

const WHITE_LOGO_FALLBACKS = [
  "/images/count_whitelogo.png",
  "/frontend/dist/images/count_whitelogo.png",
  "/images/count_logo.png",
];

/** Prefer known live-root logos; fall back across candidates on error. */
export function onBrandLogoError(event) {
  const img = event?.currentTarget;
  if (!img) return;
  const isWhite = /whitelogo/i.test(img.src || "") || img.dataset.logoKind === "white";
  const list = isWhite ? WHITE_LOGO_FALLBACKS : LOGO_CANDIDATES;
  const idx = Number(img.dataset.logoIdx || 0) + 1;
  if (idx >= list.length) return;
  img.dataset.logoIdx = String(idx);
  img.src = new URL(list[idx], window.location.origin).href;
}
