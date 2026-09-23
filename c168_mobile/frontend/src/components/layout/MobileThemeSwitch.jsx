import "./MobileLangSwitch.css";

/**
 * Compact Light / Dark segmented control — same chrome as MobileLangSwitch.
 */
export default function MobileThemeSwitch({
  theme = "light",
  onChange,
  ariaLabel = "Appearance",
  lightLabel = "Light",
  darkLabel = "Dark",
}) {
  const isDark = theme === "dark";

  return (
    <div
      className="mobile-lang-switch mobile-lang-switch--light mobile-theme-switch"
      role="group"
      aria-label={ariaLabel}
      data-theme={isDark ? "dark" : "light"}
    >
      <span className="mobile-lang-switch__thumb" aria-hidden="true" />
      <button
        type="button"
        className={`mobile-lang-switch__seg${isDark ? "" : " is-active"}`}
        aria-pressed={!isDark}
        onClick={() => onChange?.("light")}
      >
        {lightLabel}
      </button>
      <button
        type="button"
        className={`mobile-lang-switch__seg${isDark ? " is-active" : ""}`}
        aria-pressed={isDark}
        onClick={() => onChange?.("dark")}
      >
        {darkLabel}
      </button>
    </div>
  );
}
