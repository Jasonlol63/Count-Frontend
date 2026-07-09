import { MoneyDecimal } from "../../utils/money/moneyDecimal.js";

export const MINI_GRID_SHELL_CCY = ["MYR", "SGD"];
export const MINI_GRID_SHELL_ROWS = 5;

/** @deprecated 账户矩阵不再纵向滚动，始终展示全部筛选账户 */
export const WINLOSS_MINI_MATRIX_ACCOUNT_SCROLL_THRESHOLD = 5;

/** 账户矩阵始终随内容增高，不启用纵向滚动 */
export function winLossMiniMatrixNeedsAccountScroll() {
  return false;
}

/** Win/Loss Account：每条 segment 白底带最多按钮数，多出的自动再开新带 */
export const WINLOSS_ACCOUNT_SEGMENT_MAX_BUTTONS = 7;
/** 视口较窄（<1410px）时每行更少格，多账户换行展示完整户 名 */
export const WINLOSS_ACCOUNT_SEGMENT_MAX_BUTTONS_NARROW = 4;
export const WINLOSS_ACCOUNT_SEGMENT_NARROW_MQ = "(max-width: 1366px)";

/** Win/Loss Currency：每条 segment 白底带最多按钮数（含第一段的「All」占位），多出的自动再开新带 */
export const WINLOSS_CURRENCY_SEGMENT_MAX_BUTTONS = 8;

/**
 * 按实测按钮宽度将 Account 切成多段；每段为独立 segment 白底条。
 * 当下一项加入后会超出 containerWidth 时，自动开启新一行。
 */
export function splitWinLossAccountBands(accounts, segmentWidths, containerWidth) {
  const list = Array.isArray(accounts) ? accounts : [];
  if (!list.length) return [];
  const widths = Array.isArray(segmentWidths) ? segmentWidths : [];
  const maxW = Number(containerWidth) || 0;
  if (!maxW || widths.length !== list.length) return [list];

  const bands = [];
  let band = [];
  let bandWidth = 0;

  for (let i = 0; i < list.length; i++) {
    const w = Math.max(Number(widths[i]) || 0, 0);
    if (band.length > 0 && bandWidth + w > maxW) {
      bands.push(band);
      band = [list[i]];
      bandWidth = w;
    } else {
      band.push(list[i]);
      bandWidth += w;
    }
  }

  if (band.length) bands.push(band);
  return bands.length ? bands : [list];
}

/** Win/Loss 矩阵：<10 列白卡随内容收缩；≥10 列单列宽=9 列参考宽并横向滚动 */
export const WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD = 10;
/** ≥10 列时在中栏内按此列数均分得到单列参考宽 */
export const WINLOSS_MATRIX_FILL_CCY_COLS = 9;
export const WINLOSS_MATRIX_ROWHEAD_COL_WIDTH = "5.75rem";
/** 单列最小宽：容纳 "-9,999,999.00" 等带千分位金额，窄视口不足时矩阵横向滚动 */
export const WINLOSS_MATRIX_MIN_CCY_COL_WIDTH = "6rem";

/** 单币种紧凑表：列最小宽与单元格水平 padding（须与 member.css 一致） */
export const WINLOSS_COMPACT_ACCOUNT_COL_MIN = "5.5rem";
export const WINLOSS_COMPACT_AMT_COL_MIN = "5.25rem";
export const WINLOSS_COMPACT_ACCOUNT_CELL_PAD_X = 32;
export const WINLOSS_COMPACT_AMT_CELL_PAD_X = 32;
/** 多币种矩阵列：水平 padding 总和 + 右缘缓冲（须与 member.css 单元格 padding 一致） */
export const WINLOSS_MATRIX_CCY_CELL_PAD_X = 32;

export function measureElementTextWidthPx(referenceEl, text) {
  if (!referenceEl || typeof document === "undefined") return 0;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const cs = getComputedStyle(referenceEl);
  ctx.font = `${cs.fontWeight || "600"} ${cs.fontSize || "13px"} ${cs.fontFamily || "sans-serif"}`;
  return ctx.measureText(String(text ?? "").trim()).width;
}

/** 按实际文字量宽（图二紧凑尺寸），避免在窄列里量 scrollWidth 偏小导致裁切 */
export function measureCompactMatrixColumnWidths(gridEl, remPx) {
  const parseRem = (s, fallbackRem) => {
    const hit = String(s).match(/^([\d.]+)rem$/);
    return hit ? parseFloat(hit[1]) * remPx : fallbackRem * remPx;
  };
  const minAccPx = parseRem(WINLOSS_COMPACT_ACCOUNT_COL_MIN, 5.5);
  const minAmtPx = parseRem(WINLOSS_COMPACT_AMT_COL_MIN, 5.25);

  const accProbe =
    gridEl.querySelector(".member-wl-compact-matrix__account") ||
    gridEl.querySelector(".member-wl-compact-matrix__account-hd");
  const amtProbe =
    gridEl.querySelector(".member-wl-compact-matrix__amt .member-balance-matrix-amt") ||
    gridEl.querySelector(".member-wl-compact-matrix__amt") ||
    gridEl.querySelector(".member-wl-compact-matrix__amt-hd");

  let accountColPx = minAccPx;
  gridEl.querySelectorAll(".member-wl-compact-matrix__account-hd, .member-wl-compact-matrix__account").forEach((el) => {
    accountColPx = Math.max(
      accountColPx,
      measureElementTextWidthPx(accProbe || el, el.textContent) + WINLOSS_COMPACT_ACCOUNT_CELL_PAD_X,
    );
  });

  let amtColPx = minAmtPx;
  gridEl.querySelectorAll(".member-wl-compact-matrix__amt-hd").forEach((el) => {
    amtColPx = Math.max(
      amtColPx,
      measureElementTextWidthPx(amtProbe || el, el.textContent) + WINLOSS_COMPACT_AMT_CELL_PAD_X,
    );
  });
  gridEl.querySelectorAll(".member-wl-compact-matrix__amt .member-balance-matrix-amt, .member-balance-matrix-na").forEach((el) => {
    const cell = el.closest(".member-wl-compact-matrix__amt");
    if (!cell) return;
    amtColPx = Math.max(
      amtColPx,
      measureElementTextWidthPx(amtProbe || el, el.textContent) + WINLOSS_COMPACT_AMT_CELL_PAD_X,
    );
  });

  return { accountColPx: Math.ceil(accountColPx), amtColPx: Math.ceil(amtColPx) };
}

/** 多币种矩阵：按列量宽（表头 + 该列各格），避免一列大金额把所有币种列撑同样宽 */
export function measureMatrixCurrencyColumnWidths(gridEl, remPx, ncu) {
  const parseRem = (s, fallbackRem) => {
    const hit = String(s).match(/^([\d.]+)rem$/);
    return hit ? parseFloat(hit[1]) * remPx : fallbackRem * remPx;
  };
  const minColPx = parseRem(WINLOSS_MATRIX_MIN_CCY_COL_WIDTH, 6);
  const minRowheadPx = parseRem(WINLOSS_MATRIX_ROWHEAD_COL_WIDTH, 5.75);
  const pad = WINLOSS_MATRIX_CCY_CELL_PAD_X;
  const probe =
    gridEl.querySelector(".member-balance-matrix-amt") ||
    gridEl.querySelector(".member-balance-matrix-th") ||
    gridEl.querySelector(".member-balance-matrix-cell");

  const measureText = (el, text) => measureElementTextWidthPx(probe || el, text) + pad;

  let rowheadPx = minRowheadPx;
  gridEl.querySelectorAll(".member-balance-matrix-corner, .member-balance-matrix-rowhead").forEach((el) => {
    rowheadPx = Math.max(rowheadPx, measureText(el, el.textContent));
  });

  const headers = [...gridEl.querySelectorAll(".member-balance-matrix-th")];
  const colCount = ncu > 0 ? ncu : headers.length;
  const colPx = Array.from({ length: colCount }, (_, ci) => {
    const th = headers[ci];
    let w = th ? measureText(th, th.textContent) : minColPx;
    w = Math.max(w, minColPx * 0.55);
    return w;
  });

  const cells = [...gridEl.querySelectorAll(".member-balance-matrix-cell")];
  cells.forEach((cell, idx) => {
    const ci = idx % colCount;
    const amt = cell.querySelector(".member-balance-matrix-amt");
    const na = cell.querySelector(".member-balance-matrix-na");
    if (amt) colPx[ci] = Math.max(colPx[ci], measureText(amt, amt.textContent));
    if (na) colPx[ci] = Math.max(colPx[ci], measureText(na, na.textContent));
  });

  return {
    rowheadPx: Math.ceil(rowheadPx),
    colPx: colPx.map((w) => Math.ceil(w)),
  };
}

export function normalizeNumber(value) {
  try {
    return MoneyDecimal.toDecimal(value || "0", 0);
  } catch {
    return MoneyDecimal.toDecimal("0", 0);
  }
}

export function formatPaymentHistoryMoney(value) {
  if (value === "-" || value === null || value === undefined) return "-";
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return "-";
  try {
    if (MoneyDecimal.toDecimal(cleaned, 0).isZero()) return "-";
  } catch {
    if (/^-?0+(?:\.0+)?$/.test(cleaned)) return "-";
  }
  const exact2 = cleaned.match(/^(-?)(\d+)\.(\d{2})$/);
  if (exact2) {
    const neg = exact2[1] === "-" ? "-" : "";
    const intPart = exact2[2].replace(/^0+/, "") || "0";
    if (intPart === "0" && exact2[3] === "00" && !neg) return "-";
    const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${neg}${intWithSep}.${exact2[3]}`;
  }
  const formatted = MoneyDecimal.formatThousands(cleaned, 2);
  if (formatted === "0.00" || formatted === "-0.00") return "-";
  return formatted;
}

/** Win/Loss 矩阵 / Total：格式金额，0 显示为 "-"。 */
export function formatMiniGridMoney(dec) {
  if (dec == null || typeof dec.isZero !== "function") return "-";
  if (dec.isZero()) return "-";
  return formatPaymentHistoryMoney(dec.toString());
}

/** Win/Loss 矩阵 / Total：金额色调 — pos | neg | zero（0.00）| empty（无有效金额） */
export function miniGridAmountTone(dec) {
  if (dec == null || typeof dec.isZero !== "function") return "empty";
  if (dec.isZero()) return "zero";
  if (dec.lt(0)) return "neg";
  return "pos";
}

/** 无数据占位（en dash，与零值 hyphen 区分） */
export const MEMBER_AMOUNT_NA_MARK = "–";

export function memberHistoryClosingBalancesForAllCurrencies(rows, wantedUpperSet) {
  const map = new Map();
  wantedUpperSet.forEach((cu) => map.set(cu, normalizeNumber("0")));
  (rows || []).forEach((row) => {
    const rc = String(row.currency || "")
      .trim()
      .toUpperCase();
    if (!wantedUpperSet.has(rc)) return;
    if (row.balance !== "-" && row.balance !== null && row.balance !== undefined && String(row.balance).trim() !== "") {
      map.set(rc, normalizeNumber(row.balance));
    }
  });
  return map;
}

export function wlGridStorageKey(companyId, loginRootId) {
  return `member_wl_grid:${companyId}:${loginRootId}`;
}

export function applyDefaultWLGridSelection(linkedIds, companyId, loginRootId) {
  const ids = linkedIds.map((id) => Number(id)).filter((id) => id > 0);
  if (!ids.length) return [];
  try {
    const raw = sessionStorage.getItem(wlGridStorageKey(companyId, loginRootId));
    if (raw) {
      const arr = JSON.parse(raw);
      const selected = arr.map(Number).filter((id) => ids.includes(id));
      if (selected.length) return selected;
    }
  } catch {
    // ignore
  }
  return [...ids];
}

export function saveWLGridSelection(ids, companyId, loginRootId) {
  try {
    sessionStorage.setItem(wlGridStorageKey(companyId, loginRootId), JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function getWlGridIncludedAccountIds(linkedAccounts, wlGridSelectedIds) {
  const allow = new Set(linkedAccounts.map((a) => Number(a.id)).filter(Boolean));
  let sel = wlGridSelectedIds.map(Number).filter((id) => allow.has(id));
  if (!sel.length) sel = [...allow];
  return sel;
}

export function isWlGridAllSelected(linkedAccounts, wlGridSelectedIds) {
  const allow = linkedAccounts.map((a) => Number(a.id)).filter(Boolean);
  if (!allow.length) return true;
  const included = getWlGridIncludedAccountIds(linkedAccounts, wlGridSelectedIds);
  return included.length === allow.length;
}

export function applyWlGridAccountAll(linkedAccounts) {
  return linkedAccounts.map((a) => Number(a.id)).filter(Boolean);
}

export function applyWlGridAccountToggle(linkedAccounts, wlGridSelectedIds, accountId) {
  const allow = linkedAccounts.map((a) => Number(a.id)).filter(Boolean);
  const id = Number(accountId);
  if (!allow.includes(id)) return getWlGridIncludedAccountIds(linkedAccounts, wlGridSelectedIds);

  let sel = wlGridSelectedIds.map(Number).filter((x) => allow.includes(x));
  if (!sel.length) sel = [...allow];

  if (sel.length === allow.length) {
    return [id];
  }

  if (sel.includes(id)) {
    const next = sel.filter((x) => x !== id);
    return next.length ? next : [...allow];
  }

  const next = [...sel, id];
  return next.length === allow.length ? [...allow] : next;
}

export function collectLinkedUnionCurrencyCodes(linkedAccountCurrenciesMap, includedIds) {
  const codes = new Set();
  includedIds.forEach((id) => {
    const set = linkedAccountCurrenciesMap.get(Number(id));
    if (set?.size) {
      set.forEach((c) => {
        if (c) codes.add(String(c).trim().toUpperCase());
      });
    }
  });
  return [...codes];
}

export function accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, accountId, currencyUpper) {
  const cu = String(currencyUpper || "")
    .trim()
    .toUpperCase();
  if (!cu) return true;
  if (!linkedCurrenciesLoaded) return true;
  const set = linkedAccountCurrenciesMap.get(Number(accountId));
  if (!set || set.size === 0) return true;
  return set.has(cu);
}

export function getOrderedMiniGridAccounts(linkedAccounts, wlGridSelectedIds, currenciesUpper, linkedAccountCurrenciesMap, linkedCurrenciesLoaded) {
  const allowIds = new Set(linkedAccounts.map((a) => Number(a.id)));
  const sel = new Set(wlGridSelectedIds.map(Number).filter((id) => allowIds.has(id)));
  if (!sel.size) allowIds.forEach((id) => sel.add(id));
  const uppers = (currenciesUpper || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  return linkedAccounts.filter((a) => {
    if (!sel.has(Number(a.id))) return false;
    return uppers.some((cu) => accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, a.id, cu));
  });
}

export function computeMiniGridTotals(balanceMap, orderUpper, orderedAccounts, linkedAccountCurrenciesMap, linkedCurrenciesLoaded) {
  const totalsByCu = new Map();
  (orderUpper || []).forEach((cu) => totalsByCu.set(cu, normalizeNumber("0")));
  (orderedAccounts || []).forEach((acc) => {
    const id = Number(acc.id);
    if (id <= 0) return;
    orderUpper.forEach((cu) => {
      if (
        linkedCurrenciesLoaded &&
        !accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, id, cu)
      ) {
        return;
      }
      const dec = balanceMap?.get(`${id}|${cu}`);
      if (dec != null && typeof dec.plus === "function") {
        totalsByCu.set(cu, totalsByCu.get(cu).plus(dec));
      }
    });
  });
  return totalsByCu;
}

export function listMiniGridBalanceFetchPairs(
  orderedAccounts,
  orderUpper,
  linkedAccountCurrenciesMap,
  linkedCurrenciesLoaded,
  balanceMap,
) {
  const tasks = [];
  const cached = balanceMap || new Map();
  for (const acc of orderedAccounts || []) {
    const id = Number(acc.id);
    if (id <= 0) continue;
    for (const cu of orderUpper || []) {
      if (
        linkedCurrenciesLoaded &&
        !accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, id, cu)
      ) {
        continue;
      }
      if (cached.has(`${id}|${cu}`)) continue;
      tasks.push({ id, cu });
    }
  }
  return tasks;
}

export function getAvailableCurrenciesFromSummaryOnly(currencySummary, currencySortOrder, currencyDisplayOrder) {
  const codes = [];
  currencySummary.forEach((row) => {
    const code = String(row.currency || "").trim();
    if (!code) return;
    if (!currencySortOrder[code]) {
      const sortValue =
        typeof row.currency_id === "number" ? row.currency_id : parseInt(row.currency_id || "0", 10) || Number.MAX_SAFE_INTEGER;
      currencySortOrder[code] = sortValue;
    }
    codes.push(code);
  });
  const unique = [...new Set(codes)];
  return sortCurrencyList(unique, currencySortOrder, currencyDisplayOrder, false);
}

export function sortCurrencyList(baseOrder, currencySortOrder, currencyDisplayOrder, fromLinkedUnion) {
  if (!baseOrder.length) return [];
  if (currencyDisplayOrder?.length) {
    const orderSet = new Set(currencyDisplayOrder);
    const inOrder = [];
    currencyDisplayOrder.forEach((c) => {
      if (baseOrder.includes(c)) inOrder.push(c);
    });
    const notInOrder = baseOrder.filter((c) => !orderSet.has(c));
    notInOrder.sort((a, b) => compareCurrencySort(a, b, currencySortOrder, fromLinkedUnion));
    return [...inOrder, ...notInOrder];
  }
  return [...baseOrder].sort((a, b) => compareCurrencySort(a, b, currencySortOrder, fromLinkedUnion));
}

function compareCurrencySort(a, b, currencySortOrder, fromLinkedUnion) {
  const orderA = currencySortOrder[a] ?? Number.MAX_SAFE_INTEGER;
  const orderB = currencySortOrder[b] ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  if (!fromLinkedUnion) return a.localeCompare(b);
  return a.localeCompare(b);
}

export function getAvailableCurrencies({
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
  wlGridSelectedIds,
  linkedAccounts,
  ownedCurrencies,
  currencySummary,
  currencySortOrder,
  currencyDisplayOrder,
}) {
  let baseOrder = [];
  let fromLinkedUnion = false;
  if (linkedCurrenciesLoaded) {
    const included = getWlGridIncludedAccountIds(linkedAccounts, wlGridSelectedIds);
    const u = [...new Set(collectLinkedUnionCurrencyCodes(linkedAccountCurrenciesMap, included).map((x) => x.trim().toUpperCase()).filter(Boolean))];
    if (u.length) {
      baseOrder = u;
      fromLinkedUnion = true;
    }
  }
  if (!fromLinkedUnion) {
    const seen = new Set();
    ownedCurrencies.forEach((o) => {
      const c = String(o.code || "")
        .trim()
        .toUpperCase();
      if (!c || seen.has(c)) return;
      seen.add(c);
      baseOrder.push(c);
    });
  }
  if (!baseOrder.length) {
    return getAvailableCurrenciesFromSummaryOnly(currencySummary, currencySortOrder, currencyDisplayOrder);
  }
  return sortCurrencyList(baseOrder, currencySortOrder, currencyDisplayOrder, fromLinkedUnion);
}

export function formatCompactCurrencyLabel(code) {
  return String(code || "").trim().toUpperCase();
}

export function miniGridShowsTotalRow(shellMode, accounts) {
  if (shellMode) return false;
  const list = Array.isArray(accounts) ? accounts : [];
  const real = list.filter((a) => Number(a?.id) > 0);
  return real.length > 1;
}

export function getMemberMiniGridCurrencies(availableCurrencies, isAllSelected, selectedCurrencies) {
  if (!availableCurrencies.length) return [];
  if (isAllSelected) return [...availableCurrencies];
  return availableCurrencies.filter((code) => selectedCurrencies.includes(code));
}

/** 取消 All 时的默认币种 */
export const WINLOSS_DEFAULT_CURRENCY_CODE = "MYR";

/** 点击 All：已选 All 时取消并默认 MYR（无 MYR 时用列表首项）；未选 All 时切回 All。 */
export function applyCurrencyAllToggle(available, isAllSelected) {
  if (!available?.length) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  if (isAllSelected) {
    const defaultCode = available.includes(WINLOSS_DEFAULT_CURRENCY_CODE)
      ? WINLOSS_DEFAULT_CURRENCY_CODE
      : available[0];
    return { isAllSelected: false, selectedCurrencies: [defaultCode] };
  }
  return { isAllSelected: true, selectedCurrencies: [] };
}

/** 切换币种按钮：至少保留一项（无选中时回退为 All）。 */
export function applyCurrencyToggle(available, isAllSelected, selectedCurrencies, code) {
  if (!available?.length) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  if (isAllSelected) {
    return { isAllSelected: false, selectedCurrencies: [code] };
  }
  if (selectedCurrencies.includes(code)) {
    const next = selectedCurrencies.filter((c) => c !== code);
    if (next.length === 0) {
      return { isAllSelected: true, selectedCurrencies: [] };
    }
    return { isAllSelected: false, selectedCurrencies: next };
  }
  return { isAllSelected: false, selectedCurrencies: [...selectedCurrencies, code] };
}

export function sanitizeCurrencySelection(available, isAllSelected, selectedCurrencies, linkedCurrenciesLoaded, linkedAccountCurrenciesMap, wlGridSelectedIds, linkedAccounts) {
  const availSet = new Set(available);
  const retained = selectedCurrencies.filter((c) => availSet.has(c));
  if (!available.length) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  if (isAllSelected) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  if (retained.length === 0) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  return { isAllSelected: false, selectedCurrencies: retained };
}

export function computeTableTotals(rows) {
  let totalWinLoss = normalizeNumber("0");
  let totalCrDr = normalizeNumber("0");
  let closingBalance = normalizeNumber("0");
  (rows || []).forEach((row) => {
    totalWinLoss = totalWinLoss.plus(normalizeNumber(row.win_loss));
    totalCrDr = totalCrDr.plus(normalizeNumber(row.cr_dr));
    if (row.balance !== "-" && row.balance !== null && row.balance !== undefined && String(row.balance).trim() !== "") {
      closingBalance = normalizeNumber(row.balance);
    }
  });
  return { totalWinLoss, totalCrDr, closingBalance };
}

export function groupHistoryForDisplay(historyRows, isAllSelected, selectedCurrencies, availableCurrencies) {
  const map = new Map();
  const rows = Array.isArray(historyRows) ? historyRows : [];
  for (const row of rows) {
    const c = String(row.currency || "-").trim() || "-";
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(row);
  }
  if (isAllSelected) {
    const order = availableCurrencies.length > 0 ? availableCurrencies : Array.from(map.keys());
    return order.map((c) => [c, map.get(c) || []]);
  }
  if (!selectedCurrencies.length) return [];
  return selectedCurrencies.map((c) => [c, map.get(c) || []]);
}

export function miniMatrixGridTemplateColumns(ncu) {
  const rowHead = `minmax(${WINLOSS_MATRIX_ROWHEAD_COL_WIDTH}, max-content)`;
  if (ncu <= 0) return rowHead;
  const colMin = `var(--member-wl-ccy-fill-col-w, ${WINLOSS_MATRIX_MIN_CCY_COL_WIDTH})`;
  return `${rowHead} repeat(${ncu}, minmax(${colMin}, max-content))`;
}
