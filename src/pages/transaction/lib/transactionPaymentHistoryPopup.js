const CARD_MAX_WIDTH = 1320;
const POPUP_CHROME_PAD = 48;
const POPUP_MIN_WIDTH = 680;
const POPUP_MIN_HEIGHT = 320;
const POPUP_MARGIN = 12;

/** 窄于此宽度视为分屏布局（紧凑表头、无横向滚动等）；更宽则恢复全页样式 */
export const PAYMENT_HISTORY_SPLIT_MAX_WIDTH = 960;

export function isPaymentHistoryPopupWindow() {
  try {
    return Boolean(window.opener && !window.opener.closed);
  } catch {
    return false;
  }
}

export function isPaymentHistorySplitScreenWidth(width = window.innerWidth) {
  return width <= PAYMENT_HISTORY_SPLIT_MAX_WIDTH;
}

/** popup 窗口且当前宽度处于分屏区间 */
export function isPaymentHistorySplitScreenLayout(width = window.innerWidth) {
  return isPaymentHistoryPopupWindow() && isPaymentHistorySplitScreenWidth(width);
}

function screenAvailRect() {
  const left = window.screen.availLeft ?? 0;
  const top = window.screen.availTop ?? 0;
  const width = window.screen.availWidth ?? 1280;
  const height = window.screen.availHeight ?? 800;
  return { left, top, width, height };
}

/** 分屏：优先贴在 Transaction 窗口右侧，宽度为剩余可用区域。 */
export function resolvePaymentHistoryPopupPosition(outerWidth, outerHeight) {
  const screen = screenAvailRect();
  let left = Math.round(screen.left + (screen.width - outerWidth) / 2);
  let top = Math.round(screen.top + (screen.height - outerHeight) / 2);

  try {
    const opener = window.opener;
    if (opener && !opener.closed) {
      const ox = opener.screenX ?? opener.screenLeft ?? screen.left;
      const oy = opener.screenY ?? opener.screenTop ?? screen.top;
      const ow = opener.outerWidth ?? 0;
      left = ox + ow + 8;
      top = oy + 32;
      const rightEdge = screen.left + screen.width - POPUP_MARGIN;
      if (left + outerWidth > rightEdge) {
        left = Math.max(screen.left + POPUP_MARGIN, rightEdge - outerWidth);
      }
      const bottomEdge = screen.top + screen.height - POPUP_MARGIN;
      if (top + outerHeight > bottomEdge) {
        top = Math.max(screen.top + POPUP_MARGIN, bottomEdge - outerHeight);
      }
    }
  } catch {
    /* ignore cross-origin opener */
  }

  return { left, top };
}

/** 分屏宽度：Transaction 右侧剩余空间，上限 1320 卡片宽。 */
export function resolvePaymentHistoryPopupOpenSize() {
  const screen = screenAvailRect();
  let width = Math.min(CARD_MAX_WIDTH + POPUP_CHROME_PAD, screen.width - POPUP_MARGIN * 2);

  try {
    const opener = window.opener;
    if (opener && !opener.closed) {
      const ox = opener.screenX ?? opener.screenLeft ?? screen.left;
      const ow = opener.outerWidth ?? 0;
      const spaceRight = screen.left + screen.width - (ox + ow) - POPUP_MARGIN * 2;
      width = Math.min(CARD_MAX_WIDTH + POPUP_CHROME_PAD, Math.max(POPUP_MIN_WIDTH, spaceRight));
    }
  } catch {
    /* ignore */
  }

  width = Math.max(POPUP_MIN_WIDTH, Math.min(width, screen.width - POPUP_MARGIN * 2));

  let height = screen.height - POPUP_MARGIN * 2;
  try {
    const opener = window.opener;
    if (opener && !opener.closed) {
      const oh = opener.outerHeight ?? 0;
      if (oh > POPUP_MIN_HEIGHT) {
        height = Math.min(height, oh);
      }
    }
  } catch {
    /* ignore cross-origin opener */
  }

  return { width, height: Math.max(POPUP_MIN_HEIGHT, height) };
}

export function buildPaymentHistoryPopupFeatures() {
  const { width, height } = resolvePaymentHistoryPopupOpenSize();
  const { left, top } = resolvePaymentHistoryPopupPosition(width, height);
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

