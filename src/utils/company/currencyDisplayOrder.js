/** Apply saved user order; unknown codes append after ordered ones. */
export function mergeCurrencyCodesWithSavedOrder(baseCodes, savedOrder) {
  if (!Array.isArray(baseCodes) || !baseCodes.length) return [];
  const codes = baseCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  if (!Array.isArray(savedOrder) || !savedOrder.length) return codes;
  const set = new Set(codes);
  const ordered = savedOrder
    .map((c) => String(c).trim().toUpperCase())
    .filter((c) => set.has(c));
  const rest = codes.filter((c) => !ordered.includes(c));
  return [...ordered, ...rest];
}

export const CURRENCY_DISPLAY_ORDER_LS_PREFIX = "eazycount:currency_display_order:";
/** User-level pill order (dashboard): survives group/company filter switches. */
export const USER_CURRENCY_DISPLAY_ORDER_LS_KEY = "eazycount:user_currency_display_order";

/** Browser-local fallback when API is slow or unavailable (per company). */
export function persistCurrencyDisplayOrder(companyId, order) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0 || !Array.isArray(order) || !order.length) return;
  try {
    localStorage.setItem(
      `${CURRENCY_DISPLAY_ORDER_LS_PREFIX}${cid}`,
      JSON.stringify(
        order.map((c) => String(c).trim().toUpperCase()).filter(Boolean),
      ),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function readCurrencyDisplayOrder(companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  try {
    const raw = localStorage.getItem(`${CURRENCY_DISPLAY_ORDER_LS_PREFIX}${cid}`);
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
 * Saved pill order for this company.
 * localStorage wins when present (last drag on this browser); otherwise use API (other devices).
 */
export function resolveSavedCurrencyOrder(companyId, apiOrder) {
  const fromLs = readCurrencyDisplayOrder(companyId);
  if (fromLs?.length) return fromLs;
  const fromApi = Array.isArray(apiOrder)
    ? apiOrder.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  return fromApi.length ? fromApi : null;
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
