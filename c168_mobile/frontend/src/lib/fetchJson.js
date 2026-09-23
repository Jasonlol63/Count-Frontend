/** Shared fetch helper for mobile APIs — abort-safe, no throw on empty body. */

export async function fetchJson(pathAndQuery, { signal, method = "GET", body, headers } = {}) {
  const options = {
    method,
    credentials: "include",
    cache: "no-store",
    signal,
  };
  if (headers) options.headers = headers;
  if (body !== undefined) options.body = body;

  const res = await fetch(pathAndQuery, options);
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { res, json, text };
}

export function assertApiOk(res, json, fallbackMessage) {
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || json?.error || fallbackMessage || "Request failed");
  }
  return json;
}
