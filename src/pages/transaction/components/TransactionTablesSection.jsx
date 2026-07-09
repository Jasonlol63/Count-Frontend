import { toUpperDisplay } from "../lib/transactionFormat.js";
import TransactionWinLossCell from "./TransactionWinLossCell.jsx";

export default function TransactionTablesSection({
  tablesVisible,
  searchLoading,
  tp,
  searchState,
  getRoleClass,
  fallbackRoleClass,
  openHistory,
  handleBalanceCellClick,
  m,
  t,
}) {
  const hasTableData = tp.mode !== "none";
  const showTablesWhileLoading = searchLoading && hasTableData;

  return (
    <>
      <div className="transaction-tables-section" style={{ display: tablesVisible ? "block" : "none" }}>
        <div id="transaction-tables-loading" className="transaction-tables-loading" style={{ display: searchLoading && !hasTableData ? "flex" : "none" }} aria-live="polite">
          {m.loadingData}
        </div>
        {showTablesWhileLoading ? (
          <div className="transaction-tables-refreshing" aria-live="polite">
            {m.loadingData}
          </div>
        ) : null}
        <div
          id="default-tables-container"
          style={{
            display: tp.mode === "default" && (!searchLoading || showTablesWhileLoading) ? "flex" : "none",
            flexDirection: "column",
            width: "100%",
            opacity: showTablesWhileLoading ? 0.55 : 1,
            pointerEvents: showTablesWhileLoading ? "none" : "auto",
          }}
        >
          {tp.singleCurrencyTitle ? (
            <h3
              id="default-currency-title"
              style={{ margin: "10px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937", display: "block" }}
            >
              {tp.singleCurrencyTitle}
            </h3>
          ) : null}
          <div style={{ display: "flex", gap: 20, width: "100%" }}>
            <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
              <table className="transaction-table" id="table_left">
                <thead>
                  <tr className="transaction-table-header">
                    <th>{m.accountTable}</th>
                    <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>{m.nameTable}</th>
                    <th>{m.bfTable}</th><th>{m.winLossTable}</th><th>{m.crDrTable}</th><th>{m.balanceTable}</th>
                  </tr>
                </thead>
                <tbody id="tbody_left">
                  {(tp.defaultLeft || []).map((row) => {
                    const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                    const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                    return (
                      <tr key={`${row.account_db_id}-${row.currency || ""}`} className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}>
                        <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>{row.account_id}</td>
                        <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>{toUpperDisplay(row.account_name)}</td>
                        <td><TransactionWinLossCell value={row.bf} /></td>
                        <td><TransactionWinLossCell value={row.win_loss} /></td>
                        <td><TransactionWinLossCell value={row.cr_dr} /></td>
                        <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => handleBalanceCellClick(row, "left")}><TransactionWinLossCell value={row.balance} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="transaction-table-footer">
                    <td>{m.total}</td>
                    <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                    <td id="left_total_bf"><TransactionWinLossCell value={tp.totalsLeft?.bf ?? "0"} /></td>
                    <td id="left_total_winloss"><TransactionWinLossCell value={tp.totalsLeft?.win_loss ?? "0"} /></td>
                    <td id="left_total_crdr"><TransactionWinLossCell value={tp.totalsLeft?.cr_dr ?? "0"} /></td>
                    <td id="left_total_balance"><TransactionWinLossCell value={tp.totalsLeft?.balance ?? "0"} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
              <table className="transaction-table" id="table_right">
                <thead>
                  <tr className="transaction-table-header">
                    <th>{m.accountTable}</th>
                    <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>{m.nameTable}</th>
                    <th>{m.bfTable}</th><th>{m.winLossTable}</th><th>{m.crDrTable}</th><th>{m.balanceTable}</th>
                  </tr>
                </thead>
                <tbody id="tbody_right">
                  {(tp.defaultRight || []).map((row) => {
                    const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                    const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                    return (
                      <tr key={`${row.account_db_id}-${row.currency || ""}`} className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}>
                        <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>{row.account_id}</td>
                        <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>{toUpperDisplay(row.account_name)}</td>
                        <td><TransactionWinLossCell value={row.bf} /></td>
                        <td><TransactionWinLossCell value={row.win_loss} /></td>
                        <td><TransactionWinLossCell value={row.cr_dr} /></td>
                        <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => handleBalanceCellClick(row, "right")}><TransactionWinLossCell value={row.balance} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="transaction-table-footer">
                    <td>{m.total}</td>
                    <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                    <td id="right_total_bf"><TransactionWinLossCell value={tp.totalsRight?.bf ?? "0"} /></td>
                    <td id="right_total_winloss"><TransactionWinLossCell value={tp.totalsRight?.win_loss ?? "0"} /></td>
                    <td id="right_total_crdr"><TransactionWinLossCell value={tp.totalsRight?.cr_dr ?? "0"} /></td>
                    <td id="right_total_balance"><TransactionWinLossCell value={tp.totalsRight?.balance ?? "0"} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
        <div
          id="currency-grouped-tables-container"
          style={{
            display: tp.mode === "grouped" && (!searchLoading || showTablesWhileLoading) ? "block" : "none",
            width: "100%",
            opacity: showTablesWhileLoading ? 0.55 : 1,
            pointerEvents: showTablesWhileLoading ? "none" : "auto",
          }}
        >
          {(tp.grouped || []).map((g) => (
            <div key={g.currency} style={{ marginBottom: 24 }}>
              <h3 style={{ margin: "20px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937" }}>
                {m.currencyLabel} {g.currency}
              </h3>
              <div style={{ display: "flex", gap: 20, width: "100%" }}>
                {[
                  { key: "L", rows: g.left || [], totals: g.totalsLeft, isLeft: true },
                  { key: "R", rows: g.right || [], totals: g.totalsRight, isLeft: false },
                ].map((side) => (
                  <div key={side.key} className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                    <table className="transaction-table">
                      <thead>
                        <tr className="transaction-table-header">
                          <th>{m.accountTable}</th>
                          <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>{m.nameTable}</th>
                          <th>{m.bfTable}</th><th>{m.winLossTable}</th><th>{m.crDrTable}</th><th>{m.balanceTable}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {side.rows.map((row) => {
                          const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                          const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                          return (
                            <tr key={`${side.key}-${row.account_db_id}-${row.currency || ""}`} className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}>
                              <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>{row.account_id}</td>
                              <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>{toUpperDisplay(row.account_name)}</td>
                              <td><TransactionWinLossCell value={row.bf} /></td>
                              <td><TransactionWinLossCell value={row.win_loss} /></td>
                              <td><TransactionWinLossCell value={row.cr_dr} /></td>
                              <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => handleBalanceCellClick(row, side.isLeft ? "left" : "right")}><TransactionWinLossCell value={row.balance} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="transaction-table-footer">
                          <td>{m.total}</td>
                          <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                          <td><TransactionWinLossCell value={side.totals?.bf ?? "0"} /></td>
                          <td><TransactionWinLossCell value={side.totals?.win_loss ?? "0"} /></td>
                          <td><TransactionWinLossCell value={side.totals?.cr_dr ?? "0"} /></td>
                          <td><TransactionWinLossCell value={side.totals?.balance ?? "0"} /></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}
              </div>
              <div style={{ margin: "12px auto", maxWidth: 400 }}>
                <table className="transaction-summary-table" style={{ margin: "0 auto", maxWidth: 400 }}>
                  <thead><tr className="transaction-table-header"><th colSpan={2}>{m.total}</th></tr></thead>
                  <tbody>
                    <tr className="transaction-table-row"><td className="transaction-summary-label">{m.bfTable}</td><td><TransactionWinLossCell value={g.totalsSummary?.bf ?? "0"} /></td></tr>
                    <tr className="transaction-table-row"><td className="transaction-summary-label">{m.winLossTable}</td><td><TransactionWinLossCell value={g.totalsSummary?.win_loss ?? "0"} /></td></tr>
                    <tr className="transaction-table-row"><td className="transaction-summary-label">{m.crDrTable}</td><td><TransactionWinLossCell value={g.totalsSummary?.cr_dr ?? "0"} /></td></tr>
                    <tr className="transaction-table-row"><td className="transaction-summary-label">{m.balanceTable}</td><td><TransactionWinLossCell value={g.totalsSummary?.balance ?? "0"} /></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="transaction-summary-section" style={{ display: tablesVisible && tp.mode !== "grouped" ? "flex" : "none" }}>
        <table className="transaction-summary-table">
          <thead><tr className="transaction-table-header"><th colSpan={2}>{m.total}</th></tr></thead>
          <tbody>
            <tr className="transaction-table-row"><td className="transaction-summary-label">{m.bfTable}</td><td id="sum_total_bf"><TransactionWinLossCell value={tp.totalsSummary?.bf ?? "0"} /></td></tr>
            <tr className="transaction-table-row"><td className="transaction-summary-label">{m.winLossTable}</td><td id="sum_total_winloss"><TransactionWinLossCell value={tp.totalsSummary?.win_loss ?? "0"} /></td></tr>
            <tr className="transaction-table-row"><td className="transaction-summary-label">{m.crDrTable}</td><td id="sum_total_crdr"><TransactionWinLossCell value={tp.totalsSummary?.cr_dr ?? "0"} /></td></tr>
            <tr className="transaction-table-row"><td className="transaction-summary-label">{m.balanceTable}</td><td id="sum_total_balance"><TransactionWinLossCell value={tp.totalsSummary?.balance ?? "0"} /></td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
