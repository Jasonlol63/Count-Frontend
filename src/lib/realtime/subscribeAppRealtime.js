import { Client } from "@stomp/stompjs";
import { dispatchRealtimeInvalidate, REALTIME_DOMAINS } from "./realtimeEvents.js";

const DOMAINS = Object.values(REALTIME_DOMAINS);

/**
 * The backend's JWT lives in an httpOnly cookie (see backend's AuthCookieHelper) — JS can't
 * read it to put in a STOMP CONNECT header, so auth instead rides the WebSocket handshake's
 * own HTTP request, which the browser attaches the cookie to automatically (same as every
 * REST call using `credentials: "include"`). See backend's PrincipalHandshakeInterceptor.
 * Plain WebSocket, no SockJS — the backend endpoint isn't registered with `.withSockJS()`
 * (see WebSocketConfig's javadoc for why: SockJS's internal websocket sub-transport was
 * bypassing our custom HandshakeHandler, so the Principal never attached and every
 * SUBSCRIBE got rejected server-side).
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
 * Single STOMP connection for the authenticated shell. Returns { stop, reconnect }.
 *
 * Subscribes every domain on both shapes the backend may publish to (see backend's
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
  const globalSubs = new Map();
  const companySubs = new Map();

  const client = new Client({
    brokerURL: brokerUrl(),
    reconnectDelay: 4000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
  });

  const subscribeGlobalTopics = () => {
    for (const domain of DOMAINS) {
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
    if (!companyId) return;
    for (const domain of DOMAINS) {
      companySubs.set(domain, client.subscribe(`/topic/company/${companyId}/${domain}`, onDomainMessage));
    }
  };

  client.onConnect = () => {
    subscribeGlobalTopics();
    currentCompanyId = resolveCompanyId(typeof getScopeParams === "function" ? getScopeParams() : {});
    subscribeCompanyTopics(currentCompanyId);
  };

  // The client auto-reconnects on drop, but subscriptions don't survive the dead connection —
  // clear our bookkeeping so onConnect's `has()` checks re-subscribe from scratch next time.
  client.onWebSocketClose = () => {
    globalSubs.clear();
    companySubs.clear();
  };

  client.onStompError = (frame) => {
    onError?.(new Error(frame.headers?.message || "STOMP protocol error"));
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
    /** Reconnect only when company scope actually changed. */
    reconnect: ({ force = false } = {}) => {
      if (closed) return;
      const nextCompanyId = resolveCompanyId(typeof getScopeParams === "function" ? getScopeParams() : {});
      if (!force && nextCompanyId === currentCompanyId) return;
      currentCompanyId = nextCompanyId;
      if (client.connected) {
        subscribeCompanyTopics(currentCompanyId);
      }
      // else: still connecting/reconnecting — onConnect will pick up currentCompanyId once open.
    },
  };
}
