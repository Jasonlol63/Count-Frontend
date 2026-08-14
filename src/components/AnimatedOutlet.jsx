import { Suspense, useLayoutEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PageShellLoading from "./PageShellLoading.jsx";
import { resetMaintenanceCalendarPopupOnNavigation } from "../utils/date/dateRangePicker.js";

/**
 * Single outlet mount — no element cache (cache duplicated routes and cancelled data fetches).
 * `pageRefreshKey` bumps when the user re-clicks the active sidebar item so the page remounts
 * to default state without a full browser reload.
 */
export default function AnimatedOutlet({ pageRefreshKey = 0 }) {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    resetMaintenanceCalendarPopupOnNavigation();
  }, [pathname, pageRefreshKey]);

  return (
    <main className="ec-page-shell" aria-live="polite">
      <Suspense fallback={<PageShellLoading />}>
        <div className="ec-page-shell__content" key={`${pathname}:${pageRefreshKey}`}>
          <Outlet context={{ pageRefreshKey }} />
        </div>
      </Suspense>
    </main>
  );
}
