import { useEffect, useRef } from "react";

/** iOS-style EN/中 toggle — same markup/classes as admin sidebar (sidebar.css). */
export default function SidebarLangSwitch({ lang, onLanguageChange, ariaLabel = "Switch language" }) {
  const sidebarLangThumbRef = useRef(null);
  const prevSidebarLangRef = useRef(lang);

  useEffect(() => {
    const thumb = sidebarLangThumbRef.current;
    const prevLang = prevSidebarLangRef.current;
    if (!thumb || prevLang === lang) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      prevSidebarLangRef.current = lang;
      return;
    }

    const fromX = prevLang === "zh" ? "100%" : "0%";
    const toX = lang === "zh" ? "100%" : "0%";
    const overshootX = lang === "zh" ? "112%" : "-12%";
    const reboundX1 = lang === "zh" ? "97%" : "3%";
    const reboundX2 = lang === "zh" ? "101.2%" : "-1.2%";

    thumb.animate(
      [
        { transform: `translateX(${fromX}) scaleX(1) scaleY(1)` },
        { transform: `translateX(${overshootX}) scaleX(1.1) scaleY(0.9)`, offset: 0.46 },
        { transform: `translateX(${reboundX1}) scaleX(0.95) scaleY(1.05)`, offset: 0.68 },
        { transform: `translateX(${reboundX2}) scaleX(1.03) scaleY(0.97)`, offset: 0.86 },
        { transform: `translateX(${toX}) scaleX(0.99) scaleY(1.01)`, offset: 0.94 },
        { transform: `translateX(${toX}) scaleX(1) scaleY(1)` },
      ],
      {
        duration: 980,
        easing: "cubic-bezier(0.34, 1.72, 0.64, 1)",
        fill: "none",
      },
    );

    prevSidebarLangRef.current = lang;
  }, [lang]);

  return (
    <div className="sidebar-lang-switch-wrap">
      <div
        className={`sidebar-lang-switch ${lang === "zh" ? "is-zh" : "is-en"}`}
        role="group"
        aria-label={ariaLabel}
      >
        <span ref={sidebarLangThumbRef} className="sidebar-lang-thumb" />
        <button
          type="button"
          className={`sidebar-lang-option${lang === "en" ? " active" : ""}`}
          onClick={() => onLanguageChange("en")}
          aria-pressed={lang === "en"}
          aria-label="English"
          lang="en"
        >
          <span className="sidebar-lang-option-label" aria-hidden="true">
            EN
          </span>
        </button>
        <button
          type="button"
          className={`sidebar-lang-option${lang === "zh" ? " active" : ""}`}
          onClick={() => onLanguageChange("zh")}
          aria-pressed={lang === "zh"}
          aria-label="中文"
          lang="zh"
        >
          <span className="sidebar-lang-option-label" aria-hidden="true">
            中
          </span>
        </button>
      </div>
    </div>
  );
}
