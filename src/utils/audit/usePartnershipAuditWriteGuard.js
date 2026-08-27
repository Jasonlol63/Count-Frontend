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
        // "danger" 不是 maintenance-notification-* 里定义过的 type，样式会 fallback 成无色边框；
        // 各 *_maintenance.css 只定义了 success/error/info，统一用 "error" 才能对上红色填充样式。
        notify(blockedMessage || defaultMsg, "error")
      }
    })
  }, [sessionMe, notify, blockedMessage])

  return { mutationsBlocked, guardWrite, isLocked: mutationsBlocked }
}

export { isPartnershipAuditReadOnlyLocked }
