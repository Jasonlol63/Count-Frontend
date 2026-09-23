export function buildApiUrl(pathAndQuery) {
  const base = window.location.origin;
  return new URL(pathAndQuery, base).href;
}
