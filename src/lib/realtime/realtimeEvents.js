/** Window event for app-wide invalidate bus (from AuthenticatedLayout SSE). */
export const REALTIME_INVALIDATE_EVENT = "ec:realtime-invalidate";

/** Force SSE to remint a ticket (stale 6h ticket / Partnership scope deny). */
export const REALTIME_RECONNECT_EVENT = "ec:realtime-reconnect";

export function requestRealtimeReconnect() {
  try {
    window.dispatchEvent(new CustomEvent(REALTIME_RECONNECT_EVENT));
  } catch {
    /* ignore */
  }
}

/** Domains published by PHP `realtime_publish*` / ledger wrappers. */
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
