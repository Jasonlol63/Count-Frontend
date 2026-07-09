/**
 * Shows a Data Capture toast via runtime registry, with DOM fallback.
 */
import { translateDataCaptureNotification } from "../../../translateFile/pages/dataCaptureTranslate.js";
import { callDataCaptureRuntime, getDataCaptureRuntime } from "./dataCaptureRuntime.js";

function resolveNotificationLang() {
  return localStorage.getItem("login_lang") === "zh" ? "zh" : "en";
}

export function pushDataCaptureNotification(message, type = "success") {
  const localized = translateDataCaptureNotification(resolveNotificationLang(), message);
  if (typeof getDataCaptureRuntime().pushNotification === "function") {
    callDataCaptureRuntime("pushNotification", localized, type);
    return;
  }

  const container = document.getElementById("processNotificationContainer");
  if (!container) {
    console.error("Notification container not found");
    window.alert(localized);
    return;
  }

  const existingNotifications = container.querySelectorAll(".process-notification");
  if (existingNotifications.length >= 2) {
    const oldestNotification = existingNotifications[0];
    oldestNotification.classList.remove("show");
    setTimeout(() => {
      if (oldestNotification.parentNode) {
        oldestNotification.remove();
      }
    }, 300);
  }

  const notification = document.createElement("div");
  notification.className = `process-notification process-notification-${type}`;
  notification.textContent = localized;
  container.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, 1500);
}
