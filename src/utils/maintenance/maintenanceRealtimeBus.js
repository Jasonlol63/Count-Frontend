const MAINTENANCE_BUS_STORAGE_KEY = "ec_maintenance_mode_event";
const MAINTENANCE_BROADCAST_CHANNEL = "ec-maintenance-mode";

let busChannel = null;

function getBroadcastChannel() {
  if (typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") {
    return null;
  }
  if (!busChannel) {
    busChannel = new window.BroadcastChannel(MAINTENANCE_BROADCAST_CHANNEL);
  }
  return busChannel;
}

function normalizeEventPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    enabled: Boolean(raw.enabled),
    message: typeof raw.message === "string" ? raw.message : "",
    timestamp: Number(raw.timestamp || Date.now()),
  };
}

export function publishMaintenanceModeEvent(payload) {
  if (typeof window === "undefined") return;
  const event = normalizeEventPayload({
    ...payload,
    timestamp: Date.now(),
  });
  if (!event) return;

  try {
    window.localStorage.setItem(MAINTENANCE_BUS_STORAGE_KEY, JSON.stringify(event));
  } catch {
    // ignore localStorage failures
  }

  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage(event);
    } catch {
      // ignore BroadcastChannel failures
    }
  }
}

export function subscribeMaintenanceModeEvent(onEvent) {
  if (typeof window === "undefined" || typeof onEvent !== "function") {
    return () => {};
  }

  const handleStorage = (event) => {
    if (event.key !== MAINTENANCE_BUS_STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue);
      const normalized = normalizeEventPayload(parsed);
      if (normalized) onEvent(normalized);
    } catch {
      // ignore malformed event payload
    }
  };

  window.addEventListener("storage", handleStorage);

  const channel = getBroadcastChannel();
  const handleChannel = (event) => {
    const normalized = normalizeEventPayload(event?.data);
    if (normalized) onEvent(normalized);
  };
  if (channel) {
    channel.addEventListener("message", handleChannel);
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    if (channel) {
      channel.removeEventListener("message", handleChannel);
    }
  };
}
