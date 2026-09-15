import { buildApiUrl } from "../../utils/core/apiUrl.js";

async function postJson(path, body) {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function getJson(path) {
  const res = await fetch(buildApiUrl(path), { credentials: "include" });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export async function fetchTelegramLink() {
  return getJson("api/settings/getTelegramLink");
}

export async function saveTelegramLink(telegramSupportLink) {
  return postJson("api/settings/updateTelegramLink", { telegramSupportLink });
}
