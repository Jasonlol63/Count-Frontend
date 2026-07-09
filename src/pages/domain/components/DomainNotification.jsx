import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

let _notifyFn = null;

/** Call this from anywhere to show a notification */
export function showDomainAlert(message, type = "success") {
  if (_notifyFn) _notifyFn(message, type);
}

/** Align with UserList / process pages: success | danger | warning */
function toastVariant(type) {
  const t = String(type || "success").toLowerCase();
  if (t === "error" || t === "danger") return "danger";
  if (t === "warning") return "warning";
  return "success";
}

/** Full-viewport anchor so toasts are never trapped under #root or modal stacking contexts */
function getDomainToastAnchor() {
  if (typeof document === "undefined" || !document.body) return null;
  let el = document.getElementById("domain-toast-anchor");
  if (!el) {
    el = document.createElement("div");
    el.id = "domain-toast-anchor";
    el.setAttribute("aria-live", "polite");
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483647",
    });
    document.body.appendChild(el);
  }
  return el;
}

export default function DomainNotification() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    _notifyFn = (message, type) => {
      const id = Date.now() + Math.random();
      const variant = toastVariant(type);
      const duration =
        variant === "danger" ? 3200 : variant === "warning" ? 2800 : 1500;
      setNotes((prev) => {
        const next = prev.length >= 2 ? prev.slice(1) : prev;
        return [...next, { id, message, type, visible: false }];
      });
      setTimeout(() => {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, visible: true } : n))
        );
      }, 10);
      setTimeout(() => {
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, visible: false } : n))
        );
        setTimeout(() => {
          setNotes((prev) => prev.filter((n) => n.id !== id));
        }, 300);
      }, duration);
    };
    return () => {
      _notifyFn = null;
    };
  }, []);

  const layer = (
    <div id="domainNotificationContainer" className="notification-container">
      {notes.map((n) => (
        <div
          key={n.id}
          className={`notification notification-${toastVariant(n.type)} ${
            n.visible ? "show" : ""
          }`.trim()}
        >
          {n.message}
        </div>
      ))}
    </div>
  );

  const anchor = getDomainToastAnchor();
  if (!anchor) return null;
  return createPortal(layer, anchor);
}
