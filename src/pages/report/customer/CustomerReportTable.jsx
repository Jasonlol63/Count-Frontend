import { formatAmount, reportAdd } from "./customerReportApi.js";

function cellUpperOrDash(v) {
  if (v == null || String(v).trim() === "") return "-";
  return String(v).trim().toUpperCase();
}

function rowKey(it, idx) {
  const a = String(it.account_id ?? "").trim();
  const c = String(it.currency ?? "").trim();
  const n = String(it.name ?? "").trim();
  return `${a}|${c}|${n}|${idx}`;
}

export default function CustomerReportTable({
  reportData,
  reportSyncing = false,
  error,
  currencyList = [],
  showAllCurrencies = false,
  selectedCurrencies = [],
  t,
}) {
  const listClass = "customer-report-list-container customer-report-list-container--company";

  const tableHeader = (
    <div className="customer-report-table-header customer-report-table-header--company">
      <div>{t("colAccount")}</div>
      <div>{t("colName")}</div>
      <div>{t("colCurrency")}</div>
      <div>{t("colWin")}</div>
      <div>{t("colLose")}</div>
    </div>
  );

  const renderEmpty = (message) => (
    <div className={listClass}>
      {tableHeader}
      <div className="customer-report-cards">
        <div className="customer-report-card">
          <div
            className="customer-report-card-item"
            style={{
              textAlign: "center",
              padding: 20,
              gridColumn: "1 / -1",
              justifyContent: "center",
            }}
          >
            {message}
          </div>
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className={listClass}>
        {tableHeader}
        <div className="customer-report-cards">
          <div className="customer-report-card">
            <div
              className="customer-report-card-item"
              style={{
                textAlign: "center",
                padding: 20,
                gridColumn: "1 / -1",
                justifyContent: "center",
                color: "red",
              }}
            >
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = !reportData?.data?.length;
  if (isEmpty) {
    const awaitingData = reportData == null && !error;
    if (awaitingData || reportSyncing) {
      return (
        <div className={listClass}>
          {tableHeader}
          <div className="customer-report-cards" />
        </div>
      );
    }
    return renderEmpty(t("noDataFound"));
  }

  const data = reportData.data;

  const grouped = {};
  data.forEach((item) => {
    const c = item.currency || "null";
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(item);
  });

  const reportCurrencies = Object.keys(grouped).filter((c) => c !== "null");
  const sortedCurrencies = [];

  currencyList.forEach((cItem) => {
    if (reportCurrencies.includes(cItem.code)) {
      sortedCurrencies.push(cItem.code);
    }
  });

  reportCurrencies.forEach((c) => {
    if (!sortedCurrencies.includes(c)) {
      sortedCurrencies.push(c);
    }
  });

  const hasNull = !!grouped["null"];

  const rowCells = (it) => (
    <>
      <div className="customer-report-card-item">{(it.account_id || "").toUpperCase()}</div>
      <div className="customer-report-card-item">{(it.name || "").toUpperCase()}</div>
      <div className="customer-report-card-item">{cellUpperOrDash(it.currency)}</div>
      <div className="customer-report-card-item customer-report-amount win">{formatAmount(it.win)}</div>
      <div className="customer-report-card-item customer-report-amount lose">{formatAmount(it.lose)}</div>
    </>
  );

  const showCurrencyHeaders =
    showAllCurrencies || (Array.isArray(selectedCurrencies) && selectedCurrencies.length > 1);

  const shouldGroupWithHeaders =
    showCurrencyHeaders && (sortedCurrencies.length > 0 || hasNull);

  if (shouldGroupWithHeaders) {
    return (
      <div className={listClass} id="currency-grouped-reports-container">
        {sortedCurrencies.map((c) => {
          const items = grouped[c];
          const win = items.reduce((acc, cur) => reportAdd(acc, cur.win), "0");
          const lose = items.reduce((acc, cur) => reportAdd(acc, cur.lose), "0");
          return (
            <div key={c} className="customer-report-currency-section" style={{ marginBottom: 30 }}>
              <h3
                style={{
                  margin: "20px 0 10px 0",
                  fontSize: "clamp(14px, 1.2vw, 18px)",
                  fontWeight: "bold",
                  color: "#1f2937",
                }}
              >
                {t("currencyLine", { code: c.toUpperCase() })}
              </h3>
              {tableHeader}
              <div className="customer-report-cards">
                {items.map((it, idx) => (
                  <div key={rowKey(it, idx)} className="customer-report-card">
                    {rowCells(it)}
                  </div>
                ))}
              </div>
              <div className="customer-report-total">
                <div className="customer-report-total-label">{t("totalColon")}</div>
                <div className="customer-report-amount win customer-report-total-win">{formatAmount(win)}</div>
                <div className="customer-report-amount lose customer-report-total-lose">{formatAmount(lose)}</div>
              </div>
            </div>
          );
        })}
        {hasNull && (
          <div className="customer-report-currency-section" style={{ marginBottom: 30 }}>
            <h3
              style={{
                margin: "20px 0 10px 0",
                fontSize: "clamp(14px, 1.2vw, 18px)",
                fontWeight: "bold",
                color: "#1f2937",
              }}
            >
              {t("currencyDash")}
            </h3>
            {tableHeader}
            <div className="customer-report-cards">
              {grouped["null"].map((it, idx) => (
                <div key={rowKey(it, idx)} className="customer-report-card">
                  {rowCells(it)}
                </div>
              ))}
            </div>
            <div className="customer-report-total">
              <div className="customer-report-total-label">{t("totalColon")}</div>
              <div className="customer-report-amount win customer-report-total-win">
                {formatAmount(grouped["null"].reduce((acc, cur) => reportAdd(acc, cur.win), "0"))}
              </div>
              <div className="customer-report-amount lose customer-report-total-lose">
                {formatAmount(grouped["null"].reduce((acc, cur) => reportAdd(acc, cur.lose), "0"))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={listClass} id="default-report-container">
      {tableHeader}
      <div className="customer-report-cards">
        {data.map((it, idx) => (
          <div key={rowKey(it, idx)} className="customer-report-card">
            {rowCells(it)}
          </div>
        ))}
      </div>
      <div className="customer-report-total">
        <div className="customer-report-total-label">{t("totalColon")}</div>
        <div className="customer-report-amount win customer-report-total-win">{formatAmount(reportData.total_win)}</div>
        <div className="customer-report-amount lose customer-report-total-lose">{formatAmount(reportData.total_lose)}</div>
      </div>
    </div>
  );
}
