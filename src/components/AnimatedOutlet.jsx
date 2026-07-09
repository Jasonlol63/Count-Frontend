import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PageShellLoading from "./PageShellLoading.jsx";

/** Single outlet mount — no element cache (cache duplicated routes and cancelled data fetches). */
export default function AnimatedOutlet() {
  const { pathname } = useLocation();

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
