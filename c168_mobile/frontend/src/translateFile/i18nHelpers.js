/** Shared i18n helpers — keep per-page `*_I18N` dictionaries separate. */

export function toLocale(lang) {
  return lang === "zh" ? "zh" : "en";
}

export function interpolate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? ""));
}

/** Standard `getXxxText(lang, key, params)` factory for `{ en, zh }` dictionaries. */
export function createGetText(dict) {
  return function getText(lang, key, params = {}) {
    const locale = toLocale(lang);
    const template = dict[locale]?.[key] ?? dict.en?.[key] ?? key;
    return interpolate(template, params);
  };
}
