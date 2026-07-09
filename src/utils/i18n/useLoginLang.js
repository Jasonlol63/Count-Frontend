import { useEffect, useState } from "react";

/** Persist language and notify listeners (sidebar toggle, maintenance pages, etc.). */
export function applyLoginLang(nextLang) {
  const normalized = nextLang === "zh" ? "zh" : "en";
  localStorage.setItem("login_lang", normalized);
  window.dispatchEvent(new CustomEvent("eazycount:language-updated", { detail: { lang: normalized } }));
}

/** Syncs with sidebar EN/中 toggle (`login_lang` + `eazycount:language-updated`). */
export function useLoginLang() {
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const next = e?.detail?.lang;
      setLang(next === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  return lang;
}
