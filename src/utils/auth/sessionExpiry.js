/**
 * Tracks whether this tab has ever held an authenticated session, so a 401 from
 * `/auth/current-user` can be told apart from "never logged in" (plain redirect,
 * no notice) vs "was logged in, token/session just expired" (redirect + notice
 * shown once the Login page mounts). Access tokens have a flat 1h TTL with no
 * refresh/sliding renewal (see application.yml `spring.jwt.access-token-expiration`),
 * so this is the only signal that distinguishes the two cases client-side.
 */
import { safeSession } from "../storage/safeStorage.js";

const HAD_SESSION_KEY = "ec_had_session";
const EXPIRED_NOTICE_KEY = "ec_session_expired_notice";

export function markSessionActive() {
  safeSession.setItem(HAD_SESSION_KEY, "1");
}

export function clearSessionActive() {
  safeSession.removeItem(HAD_SESSION_KEY);
}

function hadActiveSession() {
  return safeSession.getItem(HAD_SESSION_KEY) === "1";
}

/** Hard-redirects to Login; leaves a notice for LoginPage only if a real session expired. */
export function redirectToLoginForSessionExpiry(spaPath) {
  const shouldNotify = hadActiveSession();
  clearSessionActive();
  if (shouldNotify) {
    safeSession.setItem(EXPIRED_NOTICE_KEY, "1");
  }
  window.location.assign(new URL(spaPath("login"), window.location.origin).href);
}

export function consumeSessionExpiredNotice() {
  const flagged = safeSession.getItem(EXPIRED_NOTICE_KEY) === "1";
  if (flagged) safeSession.removeItem(EXPIRED_NOTICE_KEY);
  return flagged;
}
