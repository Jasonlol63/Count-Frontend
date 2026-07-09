import { getExpirationReminderText } from "../../translateFile/shell/expirationReminderTranslate.js";

const STORAGE_KEY = "ec_exp_reminder_dismissed";
export const EXPIRATION_REMINDER_WINDOW_DAYS = 30;
export const EXPIRATION_BELL_ITEM_ID = "__expiration_reminder__";

/** 到期前 30 天内（含当天）需要每日登录弹窗 */
export function isWithinExpirationReminderWindow(daysLeft) {
  if (daysLeft == null || daysLeft < 0) return false;
  return daysLeft <= EXPIRATION_REMINDER_WINDOW_DAYS;
}

/** 弹窗 / 侧栏 urgency：30–16 黄、15–8 橙、7–0 红 */
export function getExpirationUrgencyTier(daysLeft) {
  if (daysLeft == null || daysLeft < 0) return null;
  if (daysLeft <= 7) return "critical";
  if (daysLeft <= 15) return "orange";
  if (daysLeft <= 30) return "yellow";
  return null;
}

export function getDaysUntilExpiration(expirationDate) {
  if (!expirationDate) return null;
  const expStr = String(expirationDate).split(" ")[0];
  const exp = new Date(expStr);
  if (Number.isNaN(exp.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
}

function expirationStatusFromDaysLeft(daysLeft) {
  if (daysLeft == null || Number.isNaN(daysLeft)) return "normal";
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 7) return "exp-critical";
  if (daysLeft <= 15) return "exp-orange";
  if (daysLeft <= 30) return "exp-yellow";
  return "normal";
}

/** Mirror `current_user_api.php` sidebar expiry fields for optimistic UI updates. */
export function buildSidebarExpirationFields(expirationDate) {
  if (!expirationDate) {
    return {
      expiration_date: null,
      expiration_hint: "No expiration date",
      expiration_status: "normal",
      days_until_expiration: null,
    };
  }
  const expDateStr = String(expirationDate).split(" ")[0];
  const daysLeft = getDaysUntilExpiration(expirationDate);
  if (daysLeft == null) {
    return {
      expiration_date: expDateStr,
      expiration_hint: "No expiration date",
      expiration_status: "normal",
      days_until_expiration: null,
    };
  }
  if (daysLeft < 0) {
    return {
      expiration_date: expDateStr,
      expiration_hint: "Expired",
      expiration_status: "expired",
      days_until_expiration: daysLeft,
    };
  }
  if (daysLeft === 0) {
    return {
      expiration_date: expDateStr,
      expiration_hint: "Expires today",
      expiration_status: "exp-critical",
      days_until_expiration: 0,
    };
  }
  if (daysLeft <= 30) {
    return {
      expiration_date: expDateStr,
      expiration_hint: `${daysLeft} day${daysLeft > 1 ? "s" : ""} left`,
      expiration_status: expirationStatusFromDaysLeft(daysLeft),
      days_until_expiration: daysLeft,
    };
  }
  const months = Math.floor(daysLeft / 30);
  const days = daysLeft % 30;
  const hint =
    days === 0
      ? `${months} month${months > 1 ? "s" : ""} left`
      : `${months}m ${days}d left`;
  return {
    expiration_date: expDateStr,
    expiration_hint: hint,
    expiration_status: "normal",
    days_until_expiration: daysLeft,
  };
}

function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readDismissedMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDismissedMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getExpirationReminderStorageKey(companyId, expirationDate) {
  const exp = String(expirationDate || "").split(" ")[0];
  return `${companyId}_${exp}`;
}

/** 今日是否已点「知道了」— 未 dismiss 则每次登录（每天）弹一次 */
export function isExpirationReminderDismissedToday(companyId, expirationDate) {
  if (!companyId || !expirationDate) return true;
  const map = readDismissedMap();
  const key = getExpirationReminderStorageKey(companyId, expirationDate);
  const dismissedOn = map[key];
  if (typeof dismissedOn !== "string") return false;
  return dismissedOn === getLocalDateKey();
}

export function dismissExpirationReminderForToday(companyId, expirationDate) {
  if (!companyId || !expirationDate) return;
  const map = readDismissedMap();
  const key = getExpirationReminderStorageKey(companyId, expirationDate);
  map[key] = getLocalDateKey();
  writeDismissedMap(map);
}

function formatExpirationDate(expirationDate, lang) {
  const expStr = String(expirationDate || "").split(" ")[0];
  const parts = expStr.split("-");
  if (parts.length !== 3) return expStr;
  const [y, m, d] = parts;
  return lang === "zh" ? `${y}年${Number(m)}月${Number(d)}日` : `${d}/${m}/${y}`;
}

function resolveMessageKey(daysLeft, urgency) {
  if (daysLeft === 0) return "expReminderToday";
  if (daysLeft === 1) return "expReminderD1";
  if (urgency === "critical") return "expReminderCritical";
  if (urgency === "orange") return "expReminderOrange";
  return "expReminderDaily";
}

export function resolveExpirationReminder(me, lang = "en") {
  if (!me) return null;
  const companyCode = String(me.company_code || "").toUpperCase();
  if (companyCode === "C168") return null;

  const expirationDate = me.expiration_date || null;
  if (!expirationDate) return null;

  const daysLeft =
    me.days_until_expiration != null
      ? Number(me.days_until_expiration)
      : getDaysUntilExpiration(expirationDate);
  if (!isWithinExpirationReminderWindow(daysLeft)) return null;

  const urgency = getExpirationUrgencyTier(daysLeft);
  const dateLabel = formatExpirationDate(expirationDate, lang);
  const messageKey = resolveMessageKey(daysLeft, urgency);
  const message = getExpirationReminderText(lang, messageKey, {
    days: daysLeft,
    date: dateLabel,
  });
  const title =
    urgency === "critical"
      ? getExpirationReminderText(lang, "expReminderTitleUrgent")
      : getExpirationReminderText(lang, "expReminderTitle");

  const companyId = me.company_id;
  const shouldShowPopup = !isExpirationReminderDismissedToday(companyId, expirationDate);

  return {
    tier: urgency,
    daysLeft,
    expirationDate,
    companyId,
    title,
    message,
    shouldShowPopup,
    bellItem: {
      id: EXPIRATION_BELL_ITEM_ID,
      title: getExpirationReminderText(lang, "expReminderBellTitle"),
      content: message,
      created_at: dateLabel,
      isExpirationReminder: true,
    },
  };
}

export function mergeExpirationBellItem(announcements, bellItem) {
  const list = Array.isArray(announcements) ? announcements : [];
  if (!bellItem) return list;
  const filtered = list.filter((a) => a?.id !== EXPIRATION_BELL_ITEM_ID && !a?.isExpirationReminder);
  return [bellItem, ...filtered];
}
