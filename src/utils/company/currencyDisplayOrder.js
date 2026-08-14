/** Apply saved user order; unknown codes append after ordered ones. Always unique by code. */
export function mergeCurrencyCodesWithSavedOrder(baseCodes, savedOrder) {
  if (!Array.isArray(baseCodes) || !baseCodes.length) return [];
  const codes = [
    ...new Set(baseCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean)),
  ];
  if (!Array.isArray(savedOrder) || !savedOrder.length) return codes;
  const set = new Set(codes);
  const ordered = [
    ...new Set(
      savedOrder
        .map((c) => String(c).trim().toUpperCase())
        .filter((c) => set.has(c)),
    ),
  ];
  const rest = codes.filter((c) => !ordered.includes(c));
  return [...ordered, ...rest];
}

export const CURRENCY_DISPLAY_ORDER_LS_PREFIX = "eazycount:currency_display_order:";
/** User-level pill order (dashboard): survives group/company filter switches. */
export const USER_CURRENCY_DISPLAY_ORDER_LS_KEY = "eazycount:user_currency_display_order";

/** Browser-local fallback when API is slow or unavailable (per company or `g:GROUP`). */
export function persistCurrencyDisplayOrder(orderKey, order) {
  const key = currencyOrderStorageSuffix(orderKey);
  if (!key || !Array.isArray(order) || !order.length) return;
  try {
    localStorage.setItem(
      `${CURRENCY_DISPLAY_ORDER_LS_PREFIX}${key}`,
      JSON.stringify(
        order.map((c) => String(c).trim().toUpperCase()).filter(Boolean),
      ),
    );
  } catch {
    /* ignore quota / private mode */
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

/**
 * Saved pill order for this company / group ledger key.
 * localStorage wins when present (last drag on this browser); otherwise use API (other devices).
 */
export function resolveSavedCurrencyOrder(orderKey, apiOrder) {
  const fromLs = readCurrencyDisplayOrder(orderKey);
  if (fromLs?.length) return fromLs;
  const fromApi = Array.isArray(apiOrder)
    ? apiOrder.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  return fromApi.length ? fromApi : null;
}

/** Numeric company id, or `g:GROUPCODE` for pure Group ledger. */
function currencyOrderStorageSuffix(orderKey) {
  if (orderKey == null || orderKey === "") return null;
  const n = Number(orderKey);
  if (Number.isFinite(n) && n > 0) return String(n);
  const s = String(orderKey).trim();
  if (/^g:/i.test(s) && s.length > 2) return s.toUpperCase();
  return null;
}

export function persistUserCurrencyDisplayOrder(order) {
  if (!Array.isArray(order) || !order.length) return;
  try {
    localStorage.setItem(
      USER_CURRENCY_DISPLAY_ORDER_LS_KEY,
      JSON.stringify(order.map((c) => String(c).trim().toUpperCase()).filter(Boolean)),
    );
  } catch {
    /* ignore quota / private mode */
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

export const PAYMENT_MAINTENANCE_CURRENCY_ORDER_LS_PREFIX =
  "eazycount:payment_maintenance_currency_order:";

/** Payment Maintenance's own drag order (per company/group) — never written to Dashboard's keys. */
export function persistPaymentMaintenanceCurrencyOrder(orderKey, order) {
  const key = currencyOrderStorageSuffix(orderKey);
  if (!key || !Array.isArray(order) || !order.length) return;
  try {
    localStorage.setItem(
      `${PAYMENT_MAINTENANCE_CURRENCY_ORDER_LS_PREFIX}${key}`,
      JSON.stringify(order.map((c) => String(c).trim().toUpperCase()).filter(Boolean)),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPaymentMaintenanceCurrencyOrder(orderKey) {
  const key = currencyOrderStorageSuffix(orderKey);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`${PAYMENT_MAINTENANCE_CURRENCY_ORDER_LS_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : null;
  } catch {
    return null;
  }
}

/**
 * Payment Maintenance pill order: page-local drag override (per company/group) wins when present;
 * otherwise falls back to the shared Dashboard order (global user order, then per-company/group),
 * so the two stay in sync until the user drags inside Payment Maintenance for this scope.
 */
export function resolvePaymentMaintenanceCurrencyOrder(orderKey) {
  const local = readPaymentMaintenanceCurrencyOrder(orderKey);
  if (local?.length) return local;
  const userGlobal = readUserCurrencyDisplayOrder();
  if (userGlobal?.length) return userGlobal;
  return readCurrencyDisplayOrder(orderKey);
}

/**
 * Dashboard currency pills: user drag order (session + localStorage) wins over per-company API.
 * @param {number|null} orderCompanyId
 * @param {{ apiOrder?: string[]|null, displayOrderByCompanyRef?: { current: Map<number, string[]> }, sessionOrderRef?: { current: string[]|null } }} opts
 */
export function resolvePreferredCurrencyDisplayOrder(orderCompanyId, opts = {}) {
  const { apiOrder = null, displayOrderByCompanyRef = null, sessionOrderRef = null } = opts;
  if (sessionOrderRef?.current?.length) {
    return [...sessionOrderRef.current];
  }
  const userGlobal = readUserCurrencyDisplayOrder();
  if (userGlobal?.length) return userGlobal;
  const cid = Number(orderCompanyId);
  if (Number.isFinite(cid) && cid > 0 && displayOrderByCompanyRef?.current) {
    const fromRef = displayOrderByCompanyRef.current.get(cid);
    if (fromRef?.length) return [...fromRef];
  }
  if (Number.isFinite(cid) && cid > 0) {
    const fromLs = readCurrencyDisplayOrder(cid);
    if (fromLs?.length) return fromLs;
  }
  const fromApi = Array.isArray(apiOrder)
    ? apiOrder.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  return fromApi.length ? fromApi : null;
}
