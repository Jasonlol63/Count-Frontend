import { useCallback } from "react"
import {
  guardPartnershipAuditWrite,
  isPartnershipAuditReadOnlyLocked,
  usePartnershipAuditReadOnlyLocked,
} from "./partnershipAuditReadOnly.js"

/**
 * @param {object|null|undefined} sessionMe current_user_api.data
 * @param {(message: string, type?: string) => void} [notify]
 * @param {string} [blockedMessage]
 */
export function usePartnershipAuditWriteGuard(sessionMe, notify, blockedMessage) {
  const mutationsBlocked = usePartnershipAuditReadOnlyLocked(sessionMe)
  const defaultMsg = "Read-only account: this action is not allowed."

  const guardWrite = useCallback(() => {
    return guardPartnershipAuditWrite(sessionMe, () => {
      if (typeof notify === "function") {
        notify(blockedMessage || defaultMsg, "danger")
      }
    })
  }, [sessionMe, notify, blockedMessage])

  return { mutationsBlocked, guardWrite, isLocked: mutationsBlocked }
}

export { isPartnershipAuditReadOnlyLocked }
