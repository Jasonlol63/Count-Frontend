/** Persist Transaction list filters + search rows so Back from Payment History restores them. */
const MOBILE_TX_LIST_SNAPSHOT_KEY = "ec_mobile_tx_list_snapshot";

export function persistMobileTxListSnapshot(snapshot) {
  if (!snapshot || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      MOBILE_TX_LIST_SNAPSHOT_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), ...snapshot }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function readMobileTxListSnapshot() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MOBILE_TX_LIST_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearMobileTxListSnapshot() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(MOBILE_TX_LIST_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
