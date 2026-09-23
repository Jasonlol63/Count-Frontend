/** Presentation-only currency metadata (flag emoji + display name). No business logic. */
const CURRENCY_META = {
  MYR: { flag: "🇲🇾", name: { en: "Malaysian Ringgit", zh: "马来西亚林吉特" } },
  SGD: { flag: "🇸🇬", name: { en: "Singapore Dollar", zh: "新加坡元" } },
  USD: { flag: "🇺🇸", name: { en: "US Dollar", zh: "美元" } },
  EUR: { flag: "🇪🇺", name: { en: "Euro", zh: "欧元" } },
  CNY: { flag: "🇨🇳", name: { en: "Chinese Yuan", zh: "人民币" } },
  HKD: { flag: "🇭🇰", name: { en: "Hong Kong Dollar", zh: "港元" } },
  IDR: { flag: "🇮🇩", name: { en: "Indonesian Rupiah", zh: "印尼盾" } },
  THB: { flag: "🇹🇭", name: { en: "Thai Baht", zh: "泰铢" } },
  GBP: { flag: "🇬🇧", name: { en: "British Pound", zh: "英镑" } },
  JPY: { flag: "🇯🇵", name: { en: "Japanese Yen", zh: "日元" } },
  AUD: { flag: "🇦🇺", name: { en: "Australian Dollar", zh: "澳元" } },
  VND: { flag: "🇻🇳", name: { en: "Vietnamese Dong", zh: "越南盾" } },
  PHP: { flag: "🇵🇭", name: { en: "Philippine Peso", zh: "菲律宾比索" } },
  KRW: { flag: "🇰🇷", name: { en: "South Korean Won", zh: "韩元" } },
  TWD: { flag: "🇹🇼", name: { en: "New Taiwan Dollar", zh: "新台币" } },
  INR: { flag: "🇮🇳", name: { en: "Indian Rupee", zh: "印度卢比" } },
  BND: { flag: "🇧🇳", name: { en: "Brunei Dollar", zh: "文莱元" } },
  CAD: { flag: "🇨🇦", name: { en: "Canadian Dollar", zh: "加元" } },
  NZD: { flag: "🇳🇿", name: { en: "New Zealand Dollar", zh: "新西兰元" } },
};

export function getCurrencyMeta(code, lang = "en") {
  const key = String(code || "").trim().toUpperCase();
  const meta = CURRENCY_META[key];
  return {
    flag: meta?.flag || "🏳️",
    name: meta?.name?.[lang] || meta?.name?.en || key,
  };
}
