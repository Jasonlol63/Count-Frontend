import { useLayoutEffect, useRef } from "react";

import {
  accountHoldsMiniGridCurrency,
  formatCompactCurrencyLabel,
  formatMiniGridMoney,
  miniGridAmountTone,
  miniGridShowsTotalRow,
  MEMBER_AMOUNT_NA_MARK,
  MINI_GRID_SHELL_ROWS,
  measureCompactMatrixColumnWidths,
  measureMatrixCurrencyColumnWidths,
} from "../memberPageHelpers.js";

function resolveBalanceCell({
  shellMode,
  idNum,
  cu,
  balanceMap,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
}) {
  const holds =
    shellMode || idNum <= 0
      ? false
      : accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, idNum, cu);
  const key = `${idNum}|${cu}`;
  const balDec = !shellMode && holds && balanceMap?.has(key) ? balanceMap.get(key) : null;
  const hasBalance = balDec != null && typeof balDec.lt === "function";
  const isNa = shellMode || !holds || !hasBalance;
  return { isNa, balDec };
}

function AmountCell({ isNa, balDec }) {
  const tone = isNa ? null : miniGridAmountTone(balDec);
  return isNa ? (
    <span className="member-balance-matrix-na">{MEMBER_AMOUNT_NA_MARK}</span>
  ) : (
    <span className={`member-balance-matrix-amt member-balance-matrix-amt--${tone}`}>
      {formatMiniGridMoney(balDec)}
    </span>
  );
}

function CompactAccountRow({
  idNum,
  code,
  cu,
  isLastRow,
  accIdx,
  shellMode,
  balanceMap,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
}) {
  const { isNa, balDec } = resolveBalanceCell({
    shellMode,
    idNum,
    cu,
    balanceMap,
    linkedCurrenciesLoaded,
    linkedAccountCurrenciesMap,
  });
  return (
    <div
      className={`member-wl-compact-matrix__row${accIdx % 2 === 1 ? " member-wl-compact-matrix__row--alt" : ""}${isLastRow ? " member-wl-compact-matrix__row--last" : ""}`}
      role="row"
    >
      <div className="member-wl-compact-matrix__account" role="rowheader" title={code}>
        {code}
      </div>
      <div
        className={`member-wl-compact-matrix__amt${isNa ? " member-wl-compact-matrix__amt--na" : ""}`}
        role="gridcell"
      >
        <AmountCell isNa={isNa} balDec={balDec} />
      </div>
    </div>
  );
}

function CompactTotalRow({ totalDec, rowIdx, t }) {
  const hasTotal = totalDec != null && typeof totalDec.lt === "function";
  const tone = hasTotal ? miniGridAmountTone(totalDec) : null;
  const isNa = !hasTotal;
  return (
    <div
      className={`member-wl-compact-matrix__row member-wl-compact-matrix__row--total${rowIdx % 2 === 1 ? " member-wl-compact-matrix__row--alt" : ""}`}
      role="row"
    >
      <div className="member-wl-compact-matrix__account member-wl-compact-matrix__account--total" role="rowheader">
        {t?.("total") || "Total"}
      </div>
      <div
        className={`member-wl-compact-matrix__amt member-wl-compact-matrix__amt--total${isNa ? " member-wl-compact-matrix__amt--na" : ""}`}
        role="gridcell"
      >
        {isNa ? (
          <span className="member-balance-matrix-na">{MEMBER_AMOUNT_NA_MARK}</span>
        ) : (
          <span className={`member-balance-matrix-amt member-balance-matrix-amt--${tone}`}>
            {formatMiniGridMoney(totalDec)}
          </span>
        )}
      </div>
    </div>
  );
}

function CompactSingleCurrencyGrid({
  gridRef,
  singleCu,
  listOrdered,
  showTotalRow,
  shellMode,
  balanceMap,
  totalsByCu,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
  t,
}) {
  const lastRi = listOrdered.length - 1;
  return (
    <div
      id="member_balance_grid"
      ref={gridRef}
      className="member-wl-compact-matrix"
      role="grid"
      aria-label={t?.("balancesGridAria") || "Balances by account and currency"}
    >
      <div className="member-wl-compact-matrix__hd" role="row">
        <div className="member-wl-compact-matrix__account-hd" role="columnheader">
          {t?.("colCurrency") || "Currency"}
        </div>
        <div className="member-wl-compact-matrix__amt-hd" role="columnheader">
          {formatCompactCurrencyLabel(singleCu)}
        </div>
      </div>
      {showTotalRow && (
        <CompactTotalRow totalDec={totalsByCu?.get(singleCu)} rowIdx={0} t={t} />
      )}
      {listOrdered.map((acc, accIdx) => (
        <CompactAccountRow
          key={`compact-${acc.id}-${accIdx}`}
          idNum={Number(acc.id)}
          code={String(acc.account_id || acc.name || acc.id).trim() || String(acc.id)}
          cu={singleCu}
          isLastRow={accIdx === lastRi}
          accIdx={showTotalRow ? accIdx + 1 : accIdx}
          shellMode={shellMode}
          balanceMap={balanceMap}
          linkedCurrenciesLoaded={linkedCurrenciesLoaded}
          linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
        />
      ))}
    </div>
  );
}

function MatrixTotalRow({ orderUpper, lastCi, totalsByCu, shellMode, t }) {
  return (
    <>
      <div className="member-balance-matrix-rowhead member-balance-matrix-rowhead--total" role="rowheader">
        {t?.("total") || "Total"}
      </div>
      {orderUpper.map((cu, ci) => {
        const raw = totalsByCu?.get(cu);
        const balDec = raw != null && typeof raw.lt === "function" ? raw : null;
        const hasBalance = balDec != null;
        const tone = hasBalance ? miniGridAmountTone(balDec) : null;
        return (
          <div
            key={`total-${cu}`}
            className={`member-balance-matrix-cell member-balance-matrix-cell--total${!hasBalance ? " member-balance-matrix-cell--na" : ""}${ci === lastCi ? " member-balance-matrix-cell--edge" : ""}`}
            role="gridcell"
          >
            {!hasBalance || shellMode ? (
              <span className="member-balance-matrix-na">{MEMBER_AMOUNT_NA_MARK}</span>
            ) : (
              <span className={`member-balance-matrix-amt member-balance-matrix-amt--${tone}`}>
                {formatMiniGridMoney(balDec)}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

function MatrixAccountRow({
  idNum,
  code,
  isLastRow,
  accIdx,
  orderUpper,
  lastCi,
  shellMode,
  balanceMap,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
}) {
  return (
    <>
      <div
        className={`member-balance-matrix-rowhead${accIdx % 2 === 1 ? " member-balance-matrix-rowhead--alt" : ""}${isLastRow ? " member-balance-matrix-rowhead--edge" : ""}`}
        role="rowheader"
        title={code}
      >
        {code}
      </div>
      {orderUpper.map((cu, ci) => {
        const { isNa, balDec } = resolveBalanceCell({
          shellMode,
          idNum,
          cu,
          balanceMap,
          linkedCurrenciesLoaded,
          linkedAccountCurrenciesMap,
        });
        return (
          <div
            key={`${idNum}-${cu}`}
            className={`member-balance-matrix-cell${isNa ? " member-balance-matrix-cell--na" : ""}${accIdx % 2 === 1 ? " member-balance-matrix-cell--alt" : ""}${ci === lastCi ? " member-balance-matrix-cell--edge" : ""}${isLastRow ? " member-balance-matrix-cell--edge-row" : ""}`}
            role="gridcell"
          >
            <AmountCell isNa={isNa} balDec={balDec} />
          </div>
        );
      })}
    </>
  );
}

function MultiCurrencyGrid({
  gridRef,
  orderUpper,
  listOrdered,
  showTotalRow,
  shellMode,
  balanceMap,
  totalsByCu,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
  t,
  manyCcy,
  scrollMode,
}) {
  const lastCi = orderUpper.length - 1;
  const lastRi = listOrdered.length - 1;

  return (
    <div
      id="member_balance_grid"
      ref={gridRef}
      className={`member-balance-mini-grid member-balance-mini-matrix member-balance-mini-matrix--ccy-compact${manyCcy ? " member-balance-mini-matrix--many-ccy" : ""}${scrollMode ? " member-balance-mini-matrix--ccy-scroll" : ""}`}
      role="grid"
      aria-label={t?.("balancesGridAria") || "Balances by account and currency"}
    >
      <div className="member-balance-matrix-corner" role="columnheader">
        {t?.("colCurrency") || "Currency"}
      </div>
      {orderUpper.map((cu, ci) => (
        <div
          key={`th-${cu}`}
          className={`member-balance-matrix-th${ci === lastCi ? " member-balance-matrix-th--edge" : ""}`}
          role="columnheader"
        >
          {cu}
        </div>
      ))}
      {showTotalRow && (
        <MatrixTotalRow
          orderUpper={orderUpper}
          lastCi={lastCi}
          totalsByCu={totalsByCu}
          shellMode={shellMode}
          t={t}
        />
      )}
      {listOrdered.map((acc, accIdx) => (
        <MatrixAccountRow
          key={`row-${acc.id}-${accIdx}`}
          idNum={Number(acc.id)}
          code={String(acc.account_id || acc.name || acc.id).trim() || String(acc.id)}
          isLastRow={accIdx === lastRi}
          accIdx={showTotalRow ? accIdx + 1 : accIdx}
          orderUpper={orderUpper}
          lastCi={lastCi}
          shellMode={shellMode}
          balanceMap={balanceMap}
          linkedCurrenciesLoaded={linkedCurrenciesLoaded}
          linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
        />
      ))}
    </div>
  );
}

export default function MemberMiniGrid({
  shellMode,
  currencies,
  accounts,
  balanceMap,
  totalsByCu,
  hint,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
  t,
}) {
  const orderUpper = (currencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  const ncu = orderUpper.length;

  let listOrdered = accounts || [];
  if (shellMode && ncu) {
    listOrdered = Array.from({ length: MINI_GRID_SHELL_ROWS }, () => ({
      id: -1,
      account_id: "–",
      name: "",
    }));
  }

  const compactMode = ncu === 1;
  const singleCu = compactMode ? orderUpper[0] : "";
  const manyCcy = ncu >= 12;
  const scrollMode = ncu > 1;
  const showTotalRow = miniGridShowsTotalRow(shellMode, listOrdered);
  const gridRef = useRef(null);

  useLayoutEffect(() => {
    const scroll = gridRef.current?.parentElement;
    const grid = gridRef.current;
    if (!scroll?.classList.contains("member-dash-matrix-scroll") || !grid) return undefined;

    if (compactMode) {
      const syncCompactWidth = () => {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const { accountColPx, amtColPx } = measureCompactMatrixColumnWidths(grid, rem);
        const totalW = accountColPx + amtColPx;
        const accW = `${accountColPx}px`;
        const amtW = `${amtColPx}px`;
        const rail = scroll.closest(".member-dash-rail-matrix");
        const wrap = scroll.closest(".member-dash-matrix-center-wrap");
        scroll.style.setProperty("--member-wl-compact-acc-col-w", accW);
        scroll.style.setProperty("--member-wl-ccy-fill-col-w", amtW);
        grid.style.setProperty("--member-wl-compact-acc-col-w", accW);
        grid.style.setProperty("--member-wl-ccy-fill-col-w", amtW);
        const boxW = `${totalW}px`;
        scroll.style.width = boxW;
        if (rail) rail.style.width = boxW;
        if (wrap) wrap.style.width = boxW;
      };
      syncCompactWidth();
      requestAnimationFrame(syncCompactWidth);
      const ro = new ResizeObserver(syncCompactWidth);
      const matrixColEl = scroll.closest(".member-dash-col-matrix");
      if (matrixColEl) ro.observe(matrixColEl);
      window.addEventListener("resize", syncCompactWidth);
      return () => {
        ro.disconnect();
        window.removeEventListener("resize", syncCompactWidth);
        scroll.style.removeProperty("--member-wl-compact-acc-col-w");
        scroll.style.removeProperty("--member-wl-ccy-fill-col-w");
        scroll.style.removeProperty("width");
        grid.style.removeProperty("--member-wl-compact-acc-col-w");
        grid.style.removeProperty("--member-wl-ccy-fill-col-w");
        scroll.closest(".member-dash-rail-matrix")?.style.removeProperty("width");
        scroll.closest(".member-dash-matrix-center-wrap")?.style.removeProperty("width");
      };
    }

    if (ncu < 1) return undefined;

    const matrixColEl = scroll.closest(".member-dash-col-matrix");

    const syncColWidth = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

      const applyColumns = ({ rowheadPx, colPx }) => {
        const colParts = colPx.map((w) => `${w}px`).join(" ");
        const totalW = rowheadPx + colPx.reduce((sum, w) => sum + w, 0);
        const rail = scroll.closest(".member-dash-rail-matrix");
        const wrap = scroll.closest(".member-dash-matrix-center-wrap");

        grid.style.gridTemplateColumns = `${rowheadPx}px ${colParts}`;
        grid.style.width = `${totalW}px`;
        grid.style.maxWidth = "none";

        const availableW = matrixColEl?.clientWidth || 0;
        const fits = availableW > 0 && totalW <= availableW - 2;
        scroll.classList.toggle("member-dash-matrix-scroll--ccy-fits", fits);
        grid.classList.toggle("member-balance-mini-matrix--ccy-fits", fits);

        const boxW = fits || availableW <= 0 ? `${totalW}px` : `${availableW}px`;
        scroll.style.width = boxW;
        scroll.style.maxWidth = "100%";
        if (rail) {
          rail.style.width = boxW;
          rail.style.maxWidth = "100%";
        }
        if (wrap) {
          wrap.style.width = boxW;
          wrap.style.maxWidth = "100%";
        }
      };

      applyColumns(measureMatrixCurrencyColumnWidths(grid, rem, ncu));
    };

    syncColWidth();
    requestAnimationFrame(syncColWidth);
    const ro = new ResizeObserver(syncColWidth);
    if (matrixColEl) ro.observe(matrixColEl);
    window.addEventListener("resize", syncColWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncColWidth);
      scroll.classList.remove("member-dash-matrix-scroll--ccy-fits");
      grid.classList.remove("member-balance-mini-matrix--ccy-fits");
      scroll.style.removeProperty("--member-wl-ccy-fill-col-w");
      scroll.style.removeProperty("width");
      grid.style.removeProperty("--member-wl-ccy-fill-col-w");
      grid.style.removeProperty("grid-template-columns");
      grid.style.removeProperty("width");
      grid.style.removeProperty("max-width");
      scroll.closest(".member-dash-rail-matrix")?.style.removeProperty("width");
      scroll.closest(".member-dash-matrix-center-wrap")?.style.removeProperty("width");
    };
  }, [ncu, compactMode, orderUpper.join("|"), listOrdered.length, balanceMap?.size, shellMode, showTotalRow]);

  if (!ncu) {
    return (
      <p id="member_balance_grid_hint" className="member-balance-mini-hint">
        {hint || ""}
      </p>
    );
  }

  return (
    <>
      <div className={`member-dash-matrix-scroll${compactMode ? " member-dash-matrix-scroll--compact" : ""}`}>
        {compactMode ? (
          <CompactSingleCurrencyGrid
            gridRef={gridRef}
            singleCu={singleCu}
            listOrdered={listOrdered}
            showTotalRow={showTotalRow}
            shellMode={shellMode}
            balanceMap={balanceMap}
            totalsByCu={totalsByCu}
            linkedCurrenciesLoaded={linkedCurrenciesLoaded}
            linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
            t={t}
          />
        ) : (
          <MultiCurrencyGrid
            gridRef={gridRef}
            orderUpper={orderUpper}
            listOrdered={listOrdered}
            showTotalRow={showTotalRow}
            shellMode={shellMode}
            balanceMap={balanceMap}
            totalsByCu={totalsByCu}
            linkedCurrenciesLoaded={linkedCurrenciesLoaded}
            linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
            t={t}
            manyCcy={manyCcy}
            scrollMode={scrollMode}
          />
        )}
      </div>
      <p id="member_balance_grid_hint" className="member-balance-mini-hint">
        {hint || ""}
      </p>
    </>
  );
}
