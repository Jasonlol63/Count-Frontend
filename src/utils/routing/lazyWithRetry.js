import { lazy } from "react";

const CHUNK_RELOAD_KEY = "ec-chunk-reload";

export function isChunkLoadError(error) {
  const msg = String(error?.message || error || "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed/i.test(
    msg,
  );
}

function reloadOnceOnChunkError(error) {
  if (!isChunkLoadError(error)) throw error;
  if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    window.location.reload();
    return new Promise(() => {});
  }
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  throw error;
}

export function lazyWithRetry(importer) {
  return lazy(() => importer().catch(reloadOnceOnChunkError));
}

export function clearChunkReloadFlag() {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}
