import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

function NotificationToast({ id, message, type, onRemove }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 10);
    const hideTimer = setTimeout(() => setVisible(false), 1510);
    const removeTimer = setTimeout(() => onRemove(id), 1810);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [id, message, type, onRemove]);

  return (
    <div className={`process-notification process-notification-${type}${visible ? " show" : ""}`.trim()}>{message}</div>
  );
}

export default function ProcessNotificationContainer() {
  const [items, setItems] = useState([]);

  const pushImpl = useCallback((message, type = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setItems((prev) => {
      const trimmed = prev.length >= 2 ? prev.slice(1) : prev;
      return [...trimmed, { id, message, type: type || "success" }];
    });
  }, []);

  const pushRef = useRef(pushImpl);
  pushRef.current = pushImpl;

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  useLayoutEffect(() => {
    const api = {
      pushNotification: (message, type) => pushRef.current(message, type),
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, []);

  return (
    <div id="processNotificationContainer" className="process-notification-container">
      {items.map((it) => (
        <NotificationToast key={it.id} id={it.id} message={it.message} type={it.type} onRemove={removeItem} />
      ))}
    </div>
  );
}
