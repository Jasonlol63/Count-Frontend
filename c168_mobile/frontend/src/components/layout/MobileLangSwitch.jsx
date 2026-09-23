import "./MobileLangSwitch.css";

/**
 * Compact EN / 中 segmented control for dark mobile sidebar.
 * Mirrors login switch density without the light-glass chrome.
 */
export default function MobileLangSwitch({ lang = "en", onChange, ariaLabel = "Language", tone = "dark" }) {
  const isZh = lang === "zh";

  return (
    <div
      className={`mobile-lang-switch${tone === "light" ? " mobile-lang-switch--light" : ""}`}
      role="group"
      aria-label={ariaLabel}
      data-lang={isZh ? "zh" : "en"}
    >
      <span className="mobile-lang-switch__thumb" aria-hidden="true" />
      <button
        type="button"
        className={`mobile-lang-switch__seg${isZh ? "" : " is-active"}`}
        aria-pressed={!isZh}
        onClick={() => onChange?.("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={`mobile-lang-switch__seg${isZh ? " is-active" : ""}`}
        aria-pressed={isZh}
        onClick={() => onChange?.("zh")}
      >
        中
      </button>
    </div>
  );
}
