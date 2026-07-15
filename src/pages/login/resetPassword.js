import { sendResetTacRequest, resetPasswordRequest } from "../../utils/auth/authApi.js";

export async function sendResetTac({ tenantCode, email }) {
  return sendResetTacRequest({ tenantCode, email });
}

export async function submitResetPassword({ tenantCode, email, tac, newPassword }) {
  return resetPasswordRequest({ tenantCode, email, tac, newPassword });
}
