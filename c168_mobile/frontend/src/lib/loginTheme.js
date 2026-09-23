/** Same-tab theme bus — mirrors `login_lang` persistence. */
export const THEME_STORAGE_KEY = "login_theme";
export const THEME_UPDATED_EVENT = "eazycount:theme-updated";

export function readLoginTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyLoginTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  if (normalized === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
  root.style.colorScheme = "";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", normalized === "dark" ? "#0b1220" : "#004ff9");
  }
  return normalized;
}

/** Persist `login_theme` and paint `html[data-theme]` immediately. */
export function writeLoginTheme(theme) {
  const normalized = applyLoginTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(THEME_UPDATED_EVENT, { detail: { theme: normalized } }),
    );
  } catch {
    /* ignore */
  }
  return normalized;
}
