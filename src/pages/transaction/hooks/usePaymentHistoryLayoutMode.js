import { useLayoutEffect, useState } from "react";
import {
  isPaymentHistoryPopupWindow,
  isPaymentHistorySplitScreenWidth,
  PAYMENT_HISTORY_SPLIT_MAX_WIDTH,
} from "../lib/transactionPaymentHistoryPopup.js";

/**
 * popup 窗口在窄宽时分屏布局；用户拉大窗口后恢复全页样式与完整表头。
 */
export function usePaymentHistoryLayoutMode() {
  const isPopup = isPaymentHistoryPopupWindow();
  const [splitScreen, setSplitScreen] = useState(() =>
    isPopup ? isPaymentHistorySplitScreenWidth() : false,
  );

  useLayoutEffect(() => {
    if (!isPopup) {
      setSplitScreen(false);
      return undefined;
    }

    const sync = () => setSplitScreen(isPaymentHistorySplitScreenWidth());

    sync();
    const mq = window.matchMedia(`(max-width: ${PAYMENT_HISTORY_SPLIT_MAX_WIDTH}px)`);
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);

    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, [isPopup]);

  const activeSplit = isPopup && splitScreen;

  return {
    isPopup,
    splitScreen: activeSplit,
    compactHeaders: activeSplit,
  };
}
