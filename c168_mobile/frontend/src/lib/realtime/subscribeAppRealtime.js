import { Client } from "@stomp/stompjs";
import { dispatchRealtimeInvalidate, REALTIME_DOMAINS } from "./realtimeEvents.js";

/**
 * Only the domains mobile actually consumes via `useRealtimeDomain`, plus SESSION_KICK.
 *
 * Desktop subscribes every domain on both topic shapes ("a harmless idle subscription"), but
 * that reasoning doesn't hold here: `StompSubscriptionAuthInterceptor` throws on a SUBSCRIBE it
 * won't allow, the server then sends an ERROR frame and closes the session, and the client
 * reconnects — which kills the *global* subscriptions (announcements!) along with the bad one.
 * So every topic we subscribe must be one we can actually receive. Nothing in mobile subscribes
 * to PROCESSES/USERS/APP — add them here together with their consumer.
 */
const SUBSCRIBED_DOMAINS = [
  REALTIME_DOMAINS.LEDGER,
  REALTIME_DOMAINS.ACCOUNTS,
  REALTIME_DOMAINS.ANNOUNCEMENTS,
  REALTIME_DOMAINS.MAINTENANCE,
  REALTIME_DOMAINS.DOMAIN,
  REALTIME_DOMAINS.OWNERSHIP,
  // Globally published, consumed by `MobileShell`'s forced-logout handler — not a cache rule.
  REALTIME_DOMAINS.SESSION_KICK,
];

/**
 * The backend's JWT lives in an httpOnly cookie (see backend's AuthCookieHelper) — JS can't
 * read it to put in a STOMP CONNECT header, so auth instead rides the WebSocket handshake's
 * own HTTP request, which the browser attaches the cookie to automatically (same as every
 * REST call using `credentials: "include"`). See backend's PrincipalHandshakeInterceptor.
 * Plain WebSocket, no SockJS — the backend endpoint isn't registered with `.withSockJS()`.
 *
 * Copied from Count-frontend/src/lib/realtime/subscribeAppRealtime.js (desktop) — the exported
 * signature and the `{ stop, reconnect }` return shape are deliberately identical so the 11
 * `useRealtimeDomain` call sites and the 4 scope publishers don't change.
 */
function brokerUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function resolveCompanyId(scope = {}) {
  const id = Number(scope.companyId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function onDomainMessage(message) {
  try {
    dispatchRealtimeInvalidate(JSON.parse(message.body));
  } catch {
    /* malformed payload — ignore */
  }
}

/**
 * Single STOMP connection for the authenticated mobile shell. Returns { stop, reconnect }.
 *
 * Subscribes each consumed domain on both shapes the backend may publish to (see backend's
 * RealtimeDestinations): `/topic/global/{domain}` (platform-wide, e.g. announcements — always
 * subscribed) and `/topic/company/{companyId}/{domain}` (tenant-scoped, e.g. ledger —
 * re-subscribed whenever the active company changes). A domain that's only ever published on
 * one of the two shapes just never receives anything on the other; that's a harmless idle
 * subscription, not an error.
 *
 * @param {object} opts
 * @param {() => Record<string, string|number|undefined|null>} opts.getScopeParams
 * @param {(err: Error) => void} [opts.onError]
 */
export function subscribeAppRealtime({ getScopeParams, onError } = {}) {
  let closed = false;
  let currentCompanyId = null;
  /**
   * Set when the server rejects a company-scoped subscription. The backend only authorises
   * `/topic/company/{id}` for the tenant bound to the handshake (`tenant_id`), so a page whose
   * viewed company differs from the session tenant gets every company topic rejected — and each
   * rejection is answered with an ERROR frame plus a closed session, which would otherwise take
   * the global announcements subscription down with it on every reconnect. Dropping to
   * globals-only keeps announcements/maintenance alive instead of losing everything; the next
   * scope change (i.e. a company switch, which does re-sync the session tenant) clears this and
   * retries company topics.
   */
  let companyTopicsBlocked = false;
  const globalSubs = new Map();
  const companySubs = new Map();

  const client = new Client({
    brokerURL: brokerUrl(),
    reconnectDelay: 4000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
  });

  const readCompanyId = () =>
    resolveCompanyId(typeof getScopeParams === "function" ? getScopeParams() : {});

  const subscribeGlobalTopics = () => {
    for (const domain of SUBSCRIBED_DOMAINS) {
      if (globalSubs.has(domain)) continue;
      globalSubs.set(domain, client.subscribe(`/topic/global/${domain}`, onDomainMessage));
    }
  };

  const unsubscribeCompanyTopics = () => {
    for (const sub of companySubs.values()) {
      try {
        sub.unsubscribe();
      } catch {
        /* connection already gone — nothing to clean up */
      }
    }
    companySubs.clear();
  };

  const subscribeCompanyTopics = (companyId) => {
    unsubscribeCompanyTopics();
    if (!companyId || companyTopicsBlocked) return;
    for (const domain of SUBSCRIBED_DOMAINS) {
      companySubs.set(domain, client.subscribe(`/topic/company/${companyId}/${domain}`, onDomainMessage));
    }
  };

  client.onConnect = () => {
    subscribeGlobalTopics();
    currentCompanyId = readCompanyId();
    subscribeCompanyTopics(currentCompanyId);
  };

  // The client auto-reconnects on drop, but subscriptions don't survive the dead connection —
  // clear our bookkeeping so onConnect's `has()` checks re-subscribe from scratch next time.
  client.onWebSocketClose = () => {
    globalSubs.clear();
    companySubs.clear();
  };

  client.onStompError = (frame) => {
    const message = frame.headers?.message || "STOMP protocol error";
    // A rejected SUBSCRIBE is the only way this can fire here (globals are always permitted),
    // so treat it as "company topics are not authorised for this session" and stop asking for
    // them until the scope changes — otherwise every auto-reconnect replays the same rejection
    // and closes the session again.
    if (!companyTopicsBlocked && companySubs.size > 0) {
      companyTopicsBlocked = true;
      unsubscribeCompanyTopics();
      console.warn(
        "[realtime] company-scoped subscriptions rejected by the server; continuing with global topics only. " +
          "The viewed company likely differs from the session tenant — the page must sync it via auth/switch-tenant. " +
          `Server said: ${message}`,
      );
    }
    onError?.(new Error(message));
  };

  if (!closed) {
    client.activate();
  }

  return {
    stop: () => {
      closed = true;
      globalSubs.clear();
      companySubs.clear();
      void client.deactivate();
    },
    /**
     * Reconnect only when the active company actually changed.
     *
     * Unlike desktop (which re-subscribes on the live connection), a company change here tears
     * the connection down and re-establishes it. The reason is the handshake: the backend binds
     * the session identity — including `tenant_id` — to the WebSocket at handshake time
     * (`PrincipalHandshakeHandler`), and `StompSubscriptionAuthInterceptor` then rejects any
     * SUBSCRIBE whose `/topic/company/{id}` doesn't match that bound tenant. A company switch
     * goes through `auth/switch-tenant` server-side, so the old connection's Principal points at
     * the previous tenant and re-subscribing on it would be denied. A fresh handshake carries
     * the new tenant. Costs one reconnect on a rare user action; cannot silently lose events.
     */
    reconnect: ({ force = false } = {}) => {
      if (closed) return;
      const nextCompanyId = readCompanyId();
      if (!force && nextCompanyId === currentCompanyId) return;
      currentCompanyId = nextCompanyId;
      // A scope change may have re-synced the session tenant, so give company topics another go.
      companyTopicsBlocked = false;
      void client.deactivate().then(() => {
        if (closed) return;
        globalSubs.clear();
        companySubs.clear();
        client.activate();
      });
    },
  };
}
