import { createPortal } from "react-dom";

/** Render process/bank modals on document.body so they stack above the fixed sidebar. */
export default function ProcessModalPortal({ children }) {
  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(children, document.body);
}

/** Inline backdrop layer — avoids trapped stacking inside #root .container on tablet. */
export const processModalBackdropStyle = {
  display: "block",
  position: "fixed",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  zIndex: 10050,
};

/** Dropdowns portaled to body must sit above the modal backdrop (10050). */
export const processModalDropdownZIndex = 10060;
export const profitSharingModalDropdownZIndex = 10101;
export const accountModalDropdownZIndex = 20001;
/** Add Account modal above ProcessModalPortal bank modals (10050). */
export const accountModalOverlayZIndex = 20050;
/** Company picker above Add Account modal; below validation toast (26000). */
export const accountCompanyPickerZIndex = 25500;
/** Toast above bank/process modals (10050); below Add Account (20050). */
export const processNotificationZIndex = 10100;
/** Toast above Add Account modal and company picker. */
export const processNotificationAboveAccountZIndex = 26000;

/** Portal any modal/overlay node to document.body (escapes #root .container stacking). */
export function portalToDocumentBody(node) {
  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(node, document.body);
}

/** Resolve portal dropdown z-index from the nearest open process/bank modal. */
export function getProcessModalDropdownZIndex(fromEl) {
  if (!fromEl?.closest) return processModalDropdownZIndex;
  if (fromEl.closest("#addAccountModal, .account-modal")) return accountModalDropdownZIndex;
  if (fromEl.closest("#profitSharingModal")) return profitSharingModalDropdownZIndex;
  return processModalDropdownZIndex;
}
