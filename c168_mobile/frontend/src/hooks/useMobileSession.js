import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchCurrentUser } from "../lib/authApi.js";

const AUTH_PATHS = [
  "/login",
  "/owner-secondary-password",
  "/user-secondary-password",
  "/reset-password",
];

export function isMobileAuthPath(pathname) {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Cached session user for app chrome (bottom nav). */
export function useMobileSession() {
  const { pathname } = useLocation();
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (isMobileAuthPath(pathname)) {
      setMe(null);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const { ok, json } = await fetchCurrentUser();
        if (!ok || !json?.success) throw new Error(json?.message || "Not logged in");
        if (!cancelled) setMe(json.data || null);
      } catch {
        if (!cancelled) setMe(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return me;
}
