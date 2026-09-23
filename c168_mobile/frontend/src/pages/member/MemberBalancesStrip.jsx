import { accountHoldsMiniGridCurrency } from "../../lib/memberHelpers.js";
import { formatHistoryMoney } from "../../lib/transactionFormat.js";
import { moneyToneClass } from "../../lib/money/moneyToneClass.js";

function MoneyTone({ value, children }) {
  return <span className={moneyToneClass(value)}>{children}</span>;
}

/** Desktop mini-grid parity: zero → "-", missing hold → "–". */
function formatDec(dec) {
  if (dec == null || typeof dec.isZero !== "function") return "–";
  if (dec.isZero()) return "-";
  return formatHistoryMoney(dec.toString());
}

function cellContent({
  id,
  cu,
  balanceMap,
  linkedAccountCurrenciesMap,
  linkedCurrenciesLoaded,
}) {
  const holds = accountHoldsMiniGridCurrency(
    linkedAccountCurrenciesMap,
    linkedCurrenciesLoaded,
    id,
    cu,
  );
  if (!holds) return { text: "–", value: "" };
  const dec = balanceMap?.get(`${id}|${cu}`);
  return { text: formatDec(dec), value: dec != null ? dec.toString() : "" };
}

/**
 * Concept A — expandable Balances strip (desktop mini-grid closing balances).
 */
export default function MemberBalancesStrip({
  expanded,
  onToggle,
  accounts,
  currencies,
  balanceMap,
  balanceTotals,
  linkedAccountCurrenciesMap,
  linkedCurrenciesLoaded,
  loading,
  t,
}) {
  const list = (accounts || []).filter((a) => Number(a?.id) > 0);
  const orderUpper = (currencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  const n = list.length;
  const compact = orderUpper.length <= 1;
  const singleCu = compact ? orderUpper[0] || "" : "";
  const primaryTotal = singleCu ? balanceTotals?.get(singleCu) : null;
  const summaryRight =
    loading && n > 0
      ? t("loading")
      : singleCu && primaryTotal != null
        ? `${formatDec(primaryTotal)} ${singleCu}`
        : orderUpper.length > 1
          ? t("balancesCurrencies", { count: orderUpper.length })
          : "";

  return (
    <section className="m-member-balances" aria-label={t("balances")}>
      <button
        type="button"
        className={`m-member-balances-toggle tap-scale${expanded ? " is-open" : ""}`}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="m-member-balances-toggle-left">
          <i className={`fas fa-chevron-${expanded ? "up" : "down"}`} aria-hidden="true" />
          <span className="m-member-balances-title">{t("balances")}</span>
          <span className="m-member-balances-count">{t("balancesAccounts", { count: n })}</span>
        </span>
        {summaryRight ? (
          <span className="m-member-balances-summary">
            {loading ? (
              summaryRight
            ) : singleCu && primaryTotal != null ? (
              <MoneyTone value={primaryTotal.toString()}>{summaryRight}</MoneyTone>
            ) : (
              summaryRight
            )}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="m-member-balances-panel">
          {loading && n === 0 ? (
            <p className="m-member-balances-empty">{t("loading")}</p>
          ) : n === 0 ? (
            <p className="m-member-balances-empty">{t("balancesEmpty")}</p>
          ) : orderUpper.length === 0 ? (
            <p className="m-member-balances-empty">{t("selectCurrency")}</p>
          ) : compact ? (
            <div className="m-member-balances-table-wrap">
              <table className="m-member-balances-table">
                <thead>
                  <tr>
                    <th scope="col">{t("account")}</th>
                    <th scope="col" className="m-member-balances-num">
                      {singleCu || t("colBalance")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((acc, idx) => {
                    const id = Number(acc.id);
                    const code = String(acc.account_id || acc.id).toUpperCase();
                    const cell = cellContent({
                      id,
                      cu: singleCu,
                      balanceMap,
                      linkedAccountCurrenciesMap,
                      linkedCurrenciesLoaded,
                    });
                    return (
                      <tr key={id} className={idx % 2 === 1 ? "is-alt" : undefined}>
                        <th scope="row">{code}</th>
                        <td className="m-member-balances-num">
                          <MoneyTone value={cell.value}>{cell.text}</MoneyTone>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="m-member-balances-total">
                    <th scope="row">{t("total")}</th>
                    <td className="m-member-balances-num">
                      <MoneyTone value={primaryTotal != null ? primaryTotal.toString() : ""}>
                        {formatDec(primaryTotal)}
                      </MoneyTone>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="m-member-balances-table-wrap m-member-balances-table-wrap--scroll">
              <table className="m-member-balances-table m-member-balances-table--matrix">
                <thead>
                  <tr>
                    <th scope="col">{t("account")}</th>
                    {orderUpper.map((cu) => (
                      <th key={cu} scope="col" className="m-member-balances-num">
                        {cu}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((acc, idx) => {
                    const id = Number(acc.id);
                    const code = String(acc.account_id || acc.id).toUpperCase();
                    return (
                      <tr key={id} className={idx % 2 === 1 ? "is-alt" : undefined}>
                        <th scope="row">{code}</th>
                        {orderUpper.map((cu) => {
                          const cell = cellContent({
                            id,
                            cu,
                            balanceMap,
                            linkedAccountCurrenciesMap,
                            linkedCurrenciesLoaded,
                          });
                          return (
                            <td key={cu} className="m-member-balances-num">
                              <MoneyTone value={cell.value}>{cell.text}</MoneyTone>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="m-member-balances-total">
                    <th scope="row">{t("total")}</th>
                    {orderUpper.map((cu) => {
                      const dec = balanceTotals?.get(cu);
                      return (
                        <td key={cu} className="m-member-balances-num">
                          <MoneyTone value={dec != null ? dec.toString() : ""}>
                            {formatDec(dec)}
                          </MoneyTone>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
