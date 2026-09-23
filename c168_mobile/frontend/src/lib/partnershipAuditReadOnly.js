/**
 * Partnership / Audit + read_only → block writes (parity with desktop).
 * @param {object|null|undefined} sessionMe
 */
export function isPartnershipAuditReadOnlyLocked(sessionMe) {
  if (!sessionMe || typeof sessionMe !== "object") return false;
  const r = String(sessionMe.role || "").trim().toLowerCase();
  if (r !== "partnership" && r !== "audit") return false;
  const ro = sessionMe.read_only;
  return ro === 1 || ro === true || ro === "1";
}
