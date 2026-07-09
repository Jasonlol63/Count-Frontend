import { useMemo } from "react"

/**
 * Partnership / Audit 且 read_only 时禁止前端发起写操作（与 current_user_api.read_only 一致）。
 * @param {object|null|undefined} sessionMe current_user_api.data
 * @returns {boolean}
 */
export function isPartnershipAuditReadOnlyLocked(sessionMe) {
  if (!sessionMe || typeof sessionMe !== "object") return false
  const r = String(sessionMe.role || "").trim().toLowerCase()
  if (r !== "partnership" && r !== "audit") return false
  const ro = sessionMe.read_only
  return ro === 1 || ro === true || ro === "1"
}

/** @param {object|null|undefined} sessionMe */
export function usePartnershipAuditReadOnlyLocked(sessionMe) {
  return useMemo(() => isPartnershipAuditReadOnlyLocked(sessionMe), [sessionMe])
}

/**
 * @param {object|null|undefined} sessionMe
 * @param {() => void} [onBlocked]
 * @returns {boolean} true when blocked (caller should return early)
 */
export function guardPartnershipAuditWrite(sessionMe, onBlocked) {
  if (!isPartnershipAuditReadOnlyLocked(sessionMe)) return false
  if (typeof onBlocked === "function") onBlocked()
  return true
}
