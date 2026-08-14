import { useEffect, useRef } from "react";
import { onRealtimeInvalidate } from "./realtimeEvents.js";

/**
 * Run handler when the app SSE bus invalidates matching domain(s).
 * Debounced 200ms. Queues a follow-up when hidden or previous handler still in flight
 * (so rapid maintenance writes are not dropped until a slow poll).
 *
 * @param {string|string[]} domains
 * @param {(detail: object) => void} onInvalidate
 * @param {{ enabled?: boolean }} [opts]
 */
export function useRealtimeDomain(domains, onInvalidate, { enabled = true } = {}) {
  const handlerRef = useRef(onInvalidate);
  handlerRef.current = onInvalidate;

  useEffect(() => {
    if (!enabled) return undefined;
    let debounceTimer = null;
    let pending = false;
    let inFlight = false;
    let lastDetail = {};

    const run = (detail) => {
      lastDetail = detail || lastDetail;
      if (document.visibilityState !== "visible") {
        pending = true;
        return;
      }
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      pending = false;
      const payload = lastDetail;
      Promise.resolve()
        .then(() => handlerRef.current?.(payload))
        .catch((e) => {
          console.warn("[realtime] domain handler error", e);
        })
        .finally(() => {
          inFlight = false;
          if (pending) {
            pending = false;
            run(lastDetail);
          }
        });
    };

    const unsub = onRealtimeInvalidate(domains, (detail) => {
      lastDetail = detail || {};
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        run(lastDetail);
      }, 200);
    });

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!pending) return;
      pending = false;
      run(lastDetail);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", onVis);
      unsub();
    };
  }, [enabled, Array.isArray(domains) ? domains.join("|") : String(domains || "")]);
}
