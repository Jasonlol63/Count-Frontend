/**
 * Cross-page notice for the IT "kick everyone" maintenance logout.
 *
 * The backend broadcasts `session_kick` on `/topic/global/session_kick` and every non-IT session
 * is forced to the login page. Without this the user would just find themselves back at the
 * login form with no explanation, so `MobileShell` drops a flag here on the way out and
 * `LoginPage` consumes it once and shows the same copy it uses for a login blocked by
 * maintenance mode.
 *
 * sessionStorage, not localStorage: it is a one-shot hand-off between two pages in the same tab,
 * and it must not resurface in a later session.
 */
export const MAINTENANCE_KICK_NOTICE_KEY = "m-maintenance-kick-notice";

export function markMaintenanceKickNotice() {
  try {
    sessionStorage.setItem(MAINTENANCE_KICK_NOTICE_KEY, "1");
  } catch {
    /* private mode — the forced redirect still happens, just without the explanation */
  }
}

/** True once, then cleared — so a manual reload of the login page doesn't re-show it. */
export function consumeMaintenanceKickNotice() {
  try {
    const value = sessionStorage.getItem(MAINTENANCE_KICK_NOTICE_KEY);
    if (value != null) sessionStorage.removeItem(MAINTENANCE_KICK_NOTICE_KEY);
    return value != null;
  } catch {
    return false;
  }
}
