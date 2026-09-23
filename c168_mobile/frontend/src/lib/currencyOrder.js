/** Same keys as desktop `frontend/src/utils/company/currencyDisplayOrder.js`. */
export const CURRENCY_DISPLAY_ORDER_LS_PREFIX = "eazycount:currency_display_order:";
export const USER_CURRENCY_DISPLAY_ORDER_LS_KEY = "eazycount:user_currency_display_order";

/** Apply saved user/company order; unknown codes append after ordered ones. */
export function mergeCurrencyCodesWithSavedOrder(baseCodes, savedOrder) {
  if (!Array.isArray(baseCodes) || !baseCodes.length) return [];
  const codes = [...new Set(baseCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
  if (!Array.isArray(savedOrder) || !savedOrder.length) return codes;
  const set = new Set(codes);
  const ordered = [
    ...new Set(savedOrder.map((c) => String(c).trim().toUpperCase()).filter((c) => set.has(c))),
  ];
  const rest = codes.filter((c) => !ordered.includes(c));
  return [...ordered, ...rest];
}

/** Numeric company id, or a `g:GROUPCODE` string key — same convention as desktop. */
function currencyOrderStorageSuffix(orderKey) {
  if (orderKey == null || orderKey === "") return null;
  const n = Number(orderKey);
  if (Number.isFinite(n) && n > 0) return String(n);
  const s = String(orderKey).trim();
  if (/^g:/i.test(s) && s.length > 2) return s.toUpperCase();
  return null;
}

export function persistCurrencyDisplayOrder(orderKey, order) {
  const key = currencyOrderStorageSuffix(orderKey);
  if (!key || !Array.isArray(order) || !order.length) return;
  try {
    localStorage.setItem(
      `${CURRENCY_DISPLAY_ORDER_LS_PREFIX}${key}`,
      JSON.stringify(order.map((c) => String(c).trim().toUpperCase()).filter(Boolean)),
    );
  } catch {
    /* private mode */
  }
}

export function readCurrencyDisplayOrder(orderKey) {
  const key = currencyOrderStorageSuffix(orderKey);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`${CURRENCY_DISPLAY_ORDER_LS_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : null;
  } catch {
    return null;
  }
}

export function readUserCurrencyDisplayOrder() {
  try {
    const raw = localStorage.getItem(USER_CURRENCY_DISPLAY_ORDER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : null;
  } catch {
    return null;
  }
}

export function persistUserCurrencyDisplayOrder(order) {
  if (!Array.isArray(order)) return;
  try {
    localStorage.setItem(
      USER_CURRENCY_DISPLAY_ORDER_LS_KEY,
      JSON.stringify(order.map((c) => String(c).trim().toUpperCase())),
    );
  } catch {
    /* private mode */
  }
}

/**
 * Saved pill order for this key (numeric company id or `g:GROUP`).
 * User-global order wins when present, else the per-key saved order, else `apiOrder`
 * (kept for call-site compatibility; there is no server order source any more — see
 * {@link orderCurrencyCodesForCompany}).
 */
export function resolveSavedCurrencyOrder(orderKey, apiOrder) {
  const userGlobal = readUserCurrencyDisplayOrder();
  if (userGlobal?.length) return userGlobal;
  const fromLs = readCurrencyDisplayOrder(orderKey);
  if (fromLs?.length) return fromLs;
  const fromApi = Array.isArray(apiOrder)
    ? apiOrder.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  return fromApi.length ? fromApi : null;
}

/**
 * Reorder filter currency codes to match the saved per-company order.
 * Spring has no user-level currency order API (confirmed against desktop's
 * `pages/transaction/lib/transactionApi.js`: "Spring has no user-level currency order
 * API; persist in localStorage") — this is now localStorage-only, no network call.
 */
export async function orderCurrencyCodesForCompany(codes, companyId) {
  if (!Array.isArray(codes) || !codes.length) return [];
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  }
  const saved = resolveSavedCurrencyOrder(cid, null);
  return mergeCurrencyCodesWithSavedOrder(codes, saved);
}

/**
 * Persist the user's currency pill order (per company, or per group when no company is
 * selected) — localStorage only, see {@link orderCurrencyCodesForCompany}.
 */
export async function saveUserCurrencyOrder(order, { companyId, groupId } = {}) {
  const codes = Array.isArray(order)
    ? [...new Set(order.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))]
    : [];
  if (!codes.length) return { success: true, data: { order: codes } };
  const cid = companyId != null && companyId !== "" ? Number(companyId) : 0;
  if (Number.isFinite(cid) && cid > 0) {
    persistCurrencyDisplayOrder(cid, codes);
  } else {
    const gid = groupId != null ? String(groupId).trim().toUpperCase() : "";
    if (gid) persistCurrencyDisplayOrder(`g:${gid}`, codes);
  }
  return { success: true, data: { order: codes } };
}
