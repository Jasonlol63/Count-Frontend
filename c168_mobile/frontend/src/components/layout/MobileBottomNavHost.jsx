import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMobileSession } from "../../hooks/useMobileSession.js";
import { LANGUAGE_UPDATED_EVENT, readLoginLang } from "../../lib/loginLang.js";
import { DASHBOARD_I18N } from "../../translateFile/dashboardTranslate.js";
import { isMobileMoreStackPath, mobileNavItems } from "../../utils/mobilePermissions.js";
import MobileBottomNav from "./MobileBottomNav.jsx";
import "./mobile-shell.css";

function shouldShowBottomNav(pathname) {
  if (pathname === "/" || pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/owner-secondary-password")) return false;
  if (pathname.startsWith("/user-secondary-password")) return false;
  if (pathname.startsWith("/reset-password")) return false;
  if (pathname.startsWith("/transaction/history")) return false;
  if (isMobileMoreStackPath(pathname)) return false;
  return true;
}

/**
 * Persistent bottom nav — stays mounted across route changes so layoutId
 * indicator animation does not flash when switching tabs.
 */
export default function MobileBottomNavHost() {
  const { pathname } = useLocation();
  const me = useMobileSession();
  const [lang, setLang] = useState(() => readLoginLang());

  useEffect(() => {
    const sync = (next) => setLang(next === "zh" ? "zh" : "en");
    const onStorage = (e) => {
      if (e.key === "login_lang" && e.newValue) sync(e.newValue);
    };
    const onLangUpdated = (e) => {
      sync(e?.detail?.lang || readLoginLang());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LANGUAGE_UPDATED_EVENT, onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LANGUAGE_UPDATED_EVENT, onLangUpdated);
    };
  }, []);

  const labels = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);
  const items = me ? mobileNavItems(me) : [];
  const visible = Boolean(me) && items.length > 0 && shouldShowBottomNav(pathname);

  if (!visible) return null;

  return (
    <nav className="m-shell-nav" data-persistent-nav aria-label="Main">
      <MobileBottomNav items={items} labels={labels} />
    </nav>
  );
}
