/** In-memory snapshots so Customer/Domain report remounts avoid a blank "Loading…" flash. */
const snapshots = {
  customer: null,
  domain: null,
};

export function buildReportSnapshotKey(params) {
  try {
    return JSON.stringify(params);
  } catch {
    return "";
  }
}

export function getReportSnapshot(pageKey) {
  return snapshots[pageKey] ?? null;
}

export function setReportSnapshot(pageKey, key, data) {
  if (!pageKey || !key) return;
  snapshots[pageKey] = { key, data };
}
