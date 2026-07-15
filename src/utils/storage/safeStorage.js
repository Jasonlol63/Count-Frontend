/**
 * Safe wrappers around localStorage / sessionStorage.
 * Silently swallow errors in private-browsing mode, SSR, or when storage is disabled.
 */
function createSafeStorage(kind) {
  return {
    getItem(key) {
      try {
        if (typeof window === "undefined") return null;
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        if (typeof window === "undefined") return;
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        storage.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    removeItem(key) {
      try {
        if (typeof window === "undefined") return;
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const safeLocal = createSafeStorage("local");
export const safeSession = createSafeStorage("session");
