import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dismissExpirationReminderForToday,
  mergeExpirationBellItem,
  resolveExpirationReminder,
} from "../utils/expiration/expirationReminder.js";
import { getExpirationReminderText } from "../translateFile/shell/expirationReminderTranslate.js";

/**
 * 到期提醒：铃铛通知 + 登录弹窗
 * 到期前 30 天内，每个自然日首次登录弹一次（点「知道了」仅关闭当日，次日登录再弹）
 */
export function useExpirationReminder(me, lang = "en") {
  const reminder = useMemo(() => resolveExpirationReminder(me, lang), [me, lang]);
  const [showModal, setShowModal] = useState(false);
  const [bellRead, setBellRead] = useState(false);

  useEffect(() => {
    if (reminder?.shouldShowPopup) {
      setShowModal(true);
    } else {
      setShowModal(false);
    }
  }, [reminder?.shouldShowPopup, reminder?.tier, reminder?.expirationDate, reminder?.companyId, reminder?.daysLeft]);

  useEffect(() => {
    setBellRead(false);
  }, [reminder?.tier, reminder?.expirationDate, reminder?.companyId, reminder?.daysLeft]);

  const dismissModal = useCallback(() => {
    if (reminder) {
      dismissExpirationReminderForToday(reminder.companyId, reminder.expirationDate);
    }
    setShowModal(false);
  }, [reminder]);

  const mergeAnnouncements = useCallback(
    (announcements) => mergeExpirationBellItem(announcements, reminder?.bellItem ?? null),
    [reminder?.bellItem],
  );

  const onBellOpen = useCallback(() => {
    setBellRead(true);
  }, []);

  const modalI18n = useMemo(
    () => ({
      confirm: getExpirationReminderText(lang, "expReminderConfirm"),
    }),
    [lang],
  );

  return {
    reminder,
    showModal,
    dismissModal,
    modalTitle: reminder?.title ?? "",
    modalMessage: reminder?.message ?? "",
    modalI18n,
    mergeAnnouncements,
    hasBellBadge: Boolean(reminder?.bellItem) && !bellRead,
    onBellOpen,
  };
}
