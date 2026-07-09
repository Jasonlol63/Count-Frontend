import { useEffect, useMemo, useState } from "react";
import { DASHBOARD_I18N } from "../../../translateFile/shell/dashboardTranslate.js";

export function useDashboardLang() {
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const i18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") {
        setLang(e.newValue === "zh" ? "zh" : "en");
      }
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  return { lang, i18n };
}
