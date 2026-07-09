import { interpolate } from "../shared/i18nHelpers.js";

export const EXPIRATION_REMINDER_I18N = {
  en: {
    expReminderTitle: "Subscription Expiring Soon",
    expReminderTitleUrgent: "Subscription Expiring Very Soon",
    expReminderBellTitle: "Company subscription expiring soon",
    expReminderDaily: "Your company subscription expires in {days} days (on {date}). Please renew to avoid service interruption.",
    expReminderOrange: "Your company subscription expires in {days} days (on {date}). Please renew soon.",
    expReminderCritical: "Your company subscription expires in {days} day(s) (on {date}). Please renew immediately.",
    expReminderD1: "Your company subscription expires tomorrow (on {date}). Please renew immediately.",
    expReminderToday: "Your company subscription expires today. Please renew immediately.",
    expReminderConfirm: "Got it",
    expReminderAutoRenew: "Set Auto Renew",
  },
  zh: {
    expReminderTitle: "订阅即将到期",
    expReminderTitleUrgent: "订阅即将到期（紧急）",
    expReminderBellTitle: "公司订阅即将到期",
    expReminderDaily: "您的公司订阅将在 {days} 天后到期（{date}），请续费以免影响使用。",
    expReminderOrange: "您的公司订阅将在 {days} 天后到期（{date}），请尽快续费。",
    expReminderCritical: "您的公司订阅将在 {days} 天后到期（{date}），请立即续费。",
    expReminderD1: "您的公司订阅将于明天到期（{date}），请立即续费。",
    expReminderToday: "您的公司订阅今日到期，请立即续费。",
    expReminderConfirm: "知道了",
    expReminderAutoRenew: "设置自动续费",
  },
};

export function getExpirationReminderText(lang, key, params = {}) {
  const locale = lang === "zh" ? "zh" : "en";
  const raw = EXPIRATION_REMINDER_I18N[locale]?.[key] ?? EXPIRATION_REMINDER_I18N.en[key] ?? key;
  return interpolate(raw, params);
}
