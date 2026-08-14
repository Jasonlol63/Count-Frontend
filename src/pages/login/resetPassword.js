const JSON_HEADERS = { "Content-Type": "application/json" };

async function safeParseJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function sendResetTac({ companyId, email }) {
  const response = await fetch("/api/users/send_reset_tac_api.php", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      company_id: companyId,
      email,
    }),
  });

  return safeParseJson(response);
}

export async function submitResetPassword({ companyId, email, tac, newPassword }) {
  const response = await fetch("/api/users/reset_password_api.php", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      company_id: companyId,
      email,
      tac,
      new_password: newPassword,
    }),
  });

  return safeParseJson(response);
}
