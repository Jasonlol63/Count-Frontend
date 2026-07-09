import { createPortal } from "react-dom";

/**
 * Render domain modals on document.body (above sidebar / shell).
 * Avoid useState+useEffect deferral — it interacted badly with StrictMode and delayed hit targets.
 */
export default function DomainModalPortal({ children }) {
  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(children, document.body);
}
