import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  MOBILE_REALTIME_SCOPE_EVENT,
  getMobileRealtimeScope,
} from "./mobileRealtimeScope.js";
import { runRealtimeInvalidationRule } from "./realtimeInvalidationRules.js";
import { onRealtimeInvalidate } from "./realtimeEvents.js";
import { subscribeAppRealtime } from "./subscribeAppRealtime.js";

function isAuthShellPath(pathname) {
  const p = String(pathname || "");
  if (!p || p === "/") return false;
  if (p.startsWith("/login")) return false;
  if (p.startsWith("/reset-password")) return false;
  return true;
}

/**
 * One STOMP connection for authenticated mobile routes.
 *
 * Every incoming event goes through the declarative rules table (see
 * `realtimeInvalidationRules.js`) rather than a branch chain here — adding a domain or changing
 * what it invalidates only means editing that table.
 */
export default function MobileRealtimeBridge() {
  const { pathname } = useLocation();
  const enabled = isAuthShellPath(pathname);

  useEffect(() => {
    if (!enabled) return undefined;

    const ctl = subscribeAppRealtime({
      getScopeParams: getMobileRealtimeScope,
    });

    let filterTimer = null;
    const onScope = () => {
      if (filterTimer) clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        filterTimer = null;
        ctl.reconnect();
      }, 300);
    };
    window.addEventListener(MOBILE_REALTIME_SCOPE_EVENT, onScope);

    return () => {
      window.removeEventListener(MOBILE_REALTIME_SCOPE_EVENT, onScope);
      if (filterTimer) clearTimeout(filterTimer);
      ctl.stop();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    return onRealtimeInvalidate("*", runRealtimeInvalidationRule);
  }, [enabled]);

  return null;
}
