import { buildApiUrl } from "../../utils/core/apiUrl.js";

async function safeParseJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function sendResetTac({ tenantCode, email }) {
  const fd = new FormData();
  fd.append("tenant_code", tenantCode);
  fd.append("email", email);

  const response = await fetch(buildApiUrl("auth/send-reset-tac"), {
    method: "POST",
    body: fd,
    credentials: "include",
    cache: "no-store",
  });

  return safeParseJson(response);
}

export async function submitResetPassword({ tenantCode, email, tac, newPassword }) {
  const fd = new FormData();
  fd.append("tenant_code", tenantCode);
  fd.append("email", email);
  fd.append("tac", tac);
  fd.append("new_password", newPassword);

  const response = await fetch(buildApiUrl("auth/reset-password"), {
    method: "POST",
    body: fd,
    credentials: "include",
    cache: "no-store",
  });

  return safeParseJson(response);
}
