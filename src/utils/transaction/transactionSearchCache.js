const MAX_ENTRIES = 32;

/** @type {Map<string, unknown>} */
const store = new Map();

export function getTxSearchCache(requestKey) {
  return store.get(requestKey) ?? null;
}

export function setTxSearchCache(requestKey, data) {
  if (!requestKey || !data) return;
  if (store.has(requestKey)) store.delete(requestKey);
  store.set(requestKey, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function clearTxSearchCache() {
  store.clear();
}
