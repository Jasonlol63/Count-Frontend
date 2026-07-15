import { Suspense, useLayoutEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PageShellLoading from "./PageShellLoading.jsx";
import { resetMaintenanceCalendarPopupOnNavigation } from "../utils/date/dateRangePicker.js";

/** Single outlet mount — no element cache (cache duplicated routes and cancelled data fetches). */
export default function AnimatedOutlet() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    resetMaintenanceCalendarPopupOnNavigation();
  }, [pathname]);

  return (
    <main className="ec-page-shell" aria-live="polite">
      <Suspense fallback={<PageShellLoading />} key={pathname}>
        <div className="ec-page-shell__content">
          <Outlet />
        </div>
      </Suspense>
    </main>
  );
}
