import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { SUMMARY_NOTIFICATION_AUTO_HIDE_MS, normalizeSummaryNotificationArgs } from "../lib/summaryNotify.js";

import { registerSummaryRuntime, unregisterSummaryRuntime } from "../lib/summaryRuntime.js";



const EMPTY_NOTIFICATION = {

  open: false,

  title: "Notification",

  message: "",

  type: "success",

};



export function useSummaryOverlays({ translateNotification } = {}) {

  const [notification, setNotification] = useState(EMPTY_NOTIFICATION);

  const [notificationShown, setNotificationShown] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [confirmMessage, setConfirmMessage] = useState("");

  const confirmCallbackRef = useRef(null);

  const hideTimerRef = useRef(null);

  const fadeTimerRef = useRef(null);

  const translateRef = useRef(translateNotification);

  translateRef.current = translateNotification;



  const hideNotification = useCallback(() => {

    if (hideTimerRef.current) {

      window.clearTimeout(hideTimerRef.current);

      hideTimerRef.current = null;

    }

    setNotificationShown(false);

    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);

    fadeTimerRef.current = window.setTimeout(() => {

      setNotification(EMPTY_NOTIFICATION);

    }, 300);

  }, []);



  const showNotification = useCallback(

    (title, message, type = "success") => {

      const normalized = normalizeSummaryNotificationArgs(title, message, type);

      if (hideTimerRef.current) {

        window.clearTimeout(hideTimerRef.current);

        hideTimerRef.current = null;

      }

      if (fadeTimerRef.current) {

        window.clearTimeout(fadeTimerRef.current);

        fadeTimerRef.current = null;

      }

      setNotification({

        open: true,

        title: normalized.title,

        message: normalized.message,

        type: normalized.type,

      });

      window.setTimeout(() => setNotificationShown(true), 100);

      hideTimerRef.current = window.setTimeout(() => {

        hideNotification();

      }, SUMMARY_NOTIFICATION_AUTO_HIDE_MS);

    },

    [hideNotification]

  );



  const closeConfirmDelete = useCallback(() => {

    setConfirmOpen(false);

    setConfirmMessage("");

    confirmCallbackRef.current = null;

    document.body.style.overflow = "";

  }, []);



  const showConfirmDelete = useCallback((message, callback) => {

    confirmCallbackRef.current = typeof callback === "function" ? callback : null;

    setConfirmMessage(message || "This action cannot be undone.");

    setConfirmOpen(true);

    document.body.style.overflow = "hidden";

  }, []);



  const confirmDelete = useCallback(() => {

    const cb = confirmCallbackRef.current;

    closeConfirmDelete();

    cb?.();

  }, [closeConfirmDelete]);



  const showNotificationRef = useRef(showNotification);

  showNotificationRef.current = showNotification;



  useLayoutEffect(() => {

    registerSummaryRuntime({

      showNotification: (...args) => showNotificationRef.current?.(...args),

      translateNotification: (payload) => translateRef.current?.(payload) ?? payload,

    });

    return () => unregisterSummaryRuntime();

  }, []);



  useEffect(

    () => () => {

      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);

      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);

      document.body.style.overflow = "";

    },

    []

  );



  return {

    notification,

    notificationShown,

    confirmOpen,

    confirmMessage,

    showNotification,

    hideNotification,

    showConfirmDelete,

    closeConfirmDelete,

    confirmDelete,

  };

}

