/** Window event for app-wide invalidate bus (from MobileRealtimeBridge). */
export const REALTIME_INVALIDATE_EVENT = "ec:realtime-invalidate";

/**
 * Wire names must match the backend's `RealtimeDomain` enum and desktop's `REALTIME_DOMAINS`
 * verbatim — the transport subscribes `/topic/global/{domain}` + `/topic/company/{id}/{domain}`
 * for each of these.
 */
export const REALTIME_DOMAINS = Object.freeze({
  LEDGER: "ledger",
  ACCOUNTS: "accounts",
  PROCESSES: "processes",
  DATACAPTURE: "datacapture",
  OWNERSHIP: "ownership",
  USERS: "users",
  MAINTENANCE: "maintenance",
  ANNOUNCEMENTS: "announcements",
  DOMAIN: "domain",
  APP: "app",
  /** IT "kick everyone" switch (`SystemMaintenanceModeServiceImpl` → `maintenance_mode_enabled`,
   *  global topic only). Consumed by the forced-logout handler, not by a cache rule. */
  SESSION_KICK: "session_kick",
});

/**
 * @param {object} detail
 * @param {string} [detail.type]
 * @param {string} [detail.domain]
 * @param {string} [detail.source]
 * @param {string} [detail.rev]
 */
export function dispatchRealtimeInvalidate(detail = {}) {
  const type = String(detail.type || "domain_changed");
  let domain = String(detail.domain || "").trim().toLowerCase();
  if (!domain && type === "ledger_changed") domain = REALTIME_DOMAINS.LEDGER;
  if (!domain) domain = REALTIME_DOMAINS.APP;

  try {
    window.dispatchEvent(
      new CustomEvent(REALTIME_INVALIDATE_EVENT, {
        detail: {
          type,
          domain,
          source: detail.source || "unknown",
          rev: detail.rev || "",
          ts: detail.ts || Date.now(),
          raw: detail,
        },
      }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe to realtime invalidate for one or more domains.
 * @param {string|string[]} domains
 * @param {(detail: object) => void} handler
 * @returns {() => void}
 */
export function onRealtimeInvalidate(domains, handler) {
  const set = new Set(
    (Array.isArray(domains) ? domains : [domains])
      .map((d) => String(d || "").trim().toLowerCase())
      .filter(Boolean),
  );

  const listener = (ev) => {
    const detail = ev?.detail || {};
    const domain = String(detail.domain || "").toLowerCase();
    if (set.size > 0 && !set.has(domain) && !set.has("*")) return;
    try {
      handler(detail);
    } catch (e) {
      console.warn("[realtime] handler error", e);
    }
  };

  window.addEventListener(REALTIME_INVALIDATE_EVENT, listener);
  return () => window.removeEventListener(REALTIME_INVALIDATE_EVENT, listener);
}
