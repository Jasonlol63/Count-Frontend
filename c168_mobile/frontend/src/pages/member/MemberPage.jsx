import { Fragment, useMemo, useState } from "react";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useMobileMember } from "../../hooks/useMobileMember.js";
import { computeTableTotals } from "../../lib/memberHelpers.js";
import { moneyToneClass } from "../../lib/money/moneyToneClass.js";
import {
  formatHistoryBalanceMoney,
  formatHistoryMoney,
  formatRateForHistoryDisplay,
  getHistoryRemark,
  toUpperDisplay,
} from "../../lib/transactionFormat.js";
import { historyTypeCardClass } from "../../lib/transactionTypeStyles.js";
import { formatMemberRowDescription } from "../../translateFile/memberTranslate.js";
import ExportPdfSheet from "../transaction/ExportPdfSheet.jsx";
import MemberBalancesStrip from "./MemberBalancesStrip.jsx";
import MemberFilterSheet from "./MemberFilterSheet.jsx";
import "../account/account.css";
import "../transaction/transaction-history.css";
import "../transaction/transaction-history-types.css";
import "./member.css";

function MoneyTone({ value, children }) {
  return <span className={moneyToneClass(value)}>{children}</span>;
}

function productLabel(row) {
  if (row?.is_bank_process_transaction && row?.card_owner) {
    return toUpperDisplay(row.card_owner);
  }
  return toUpperDisplay(row?.id_product || row?.product || row?.process || "-");
}

function rowKey(currency, row, idx) {
  const id = Number(row?.transaction_id ?? row?.id ?? 0);
  return `${currency}-${id || idx}-${row?.date || ""}`;
}

function CurrencySection({ currency, rows, t, lang, expandedKey, setExpandedKey }) {
  const totals = useMemo(() => computeTableTotals(rows), [rows]);

  return (
    <section className="m-member-ccy" aria-label={t("currencyTitle", { currency })}>
      <h2 className="m-member-ccy-title">{t("currencyTitle", { currency })}</h2>
      <div className="m-tx-hist-dense-wrap">
        <table className="m-tx-hist-dense-table">
          <colgroup>
            <col className="m-tx-hist-col--date" />
            <col className="m-tx-hist-col--product" />
            <col className="m-tx-hist-col--num" span={3} />
            <col className="m-tx-hist-col--chev" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="m-tx-hist-dense-th m-tx-hist-dense-th--date">
                {t("colDate")}
              </th>
              <th scope="col" className="m-tx-hist-dense-th m-tx-hist-dense-th--product">
                {t("colIdProduct")}
              </th>
              <th scope="col" className="m-tx-hist-dense-th m-tx-hist-dense-th--num">
                {t("colWinLoss")}
              </th>
              <th scope="col" className="m-tx-hist-dense-th m-tx-hist-dense-th--num">
                {t("colCrDr")}
              </th>
              <th scope="col" className="m-tx-hist-dense-th m-tx-hist-dense-th--num">
                {t("colBalance")}
              </th>
              <th scope="col" className="m-tx-hist-dense-th m-tx-hist-dense-th--chev">
                <span className="sr-only">{t("paymentHistoryDetails")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              <tr className="m-tx-hist-row m-tx-hist-row--total" aria-label={t("total")}>
                <td colSpan={2} className="m-tx-hist-dense-td m-tx-hist-dense-td--total-label">
                  {t("total")}
                </td>
                <td className="m-tx-hist-dense-td m-tx-hist-dense-td--num m-tx-hist-dense-td--total">
                  <MoneyTone value={totals.totalWinLoss.toString()}>
                    {formatHistoryMoney(totals.totalWinLoss.toString())}
                  </MoneyTone>
                </td>
                <td className="m-tx-hist-dense-td m-tx-hist-dense-td--num m-tx-hist-dense-td--total">
                  <MoneyTone value={totals.totalCrDr.toString()}>
                    {formatHistoryMoney(totals.totalCrDr.toString())}
                  </MoneyTone>
                </td>
                <td className="m-tx-hist-dense-td m-tx-hist-dense-td--num m-tx-hist-dense-td--total">
                  <MoneyTone value={totals.closingBalance.toString()}>
                    {formatHistoryBalanceMoney(totals.closingBalance.toString())}
                  </MoneyTone>
                </td>
                <td className="m-tx-hist-dense-td m-tx-hist-dense-td--chev m-tx-hist-dense-td--total" aria-hidden="true" />
              </tr>
            ) : null}
            {rows.map((row, idx) => {
              const key = rowKey(currency, row, idx);
              const expanded = expandedKey === key;
              const typeCls = historyTypeCardClass(row);
              const idProductDisplay = productLabel(row);
              const createdRaw = row.created_by;
              const createdBy =
                createdRaw == null ||
                String(createdRaw).trim() === "" ||
                String(createdRaw).toLowerCase() === "null"
                  ? "-"
                  : String(createdRaw);
              const remark = getHistoryRemark(row);
              const description = formatMemberRowDescription(lang, row);
              const detailId = `member-hist-detail-${key}`;
              const toggle = () => setExpandedKey(expanded ? null : key);

              return (
                <Fragment key={key}>
                  <tr
                    className={`m-tx-hist-row ${typeCls}${idx % 2 === 1 ? " m-tx-hist-row--alt" : ""}${
                      expanded ? " m-tx-hist-row--expanded" : ""
                    }`}
                    tabIndex={0}
                    role="button"
                    aria-expanded={expanded}
                    aria-controls={detailId}
                    onClick={toggle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle();
                      }
                    }}
                  >
                    <td className="m-tx-hist-dense-td m-tx-hist-dense-td--date">{row.date || "—"}</td>
                    <td className="m-tx-hist-dense-td m-tx-hist-dense-td--product">
                      {idProductDisplay || "—"}
                    </td>
                    <td className="m-tx-hist-dense-td m-tx-hist-dense-td--num">
                      <MoneyTone value={row.win_loss}>{formatHistoryMoney(row.win_loss)}</MoneyTone>
                    </td>
                    <td className="m-tx-hist-dense-td m-tx-hist-dense-td--num">
                      <MoneyTone value={row.cr_dr}>{formatHistoryMoney(row.cr_dr)}</MoneyTone>
                    </td>
                    <td className="m-tx-hist-dense-td m-tx-hist-dense-td--num">
                      <MoneyTone value={row.balance}>{formatHistoryBalanceMoney(row.balance)}</MoneyTone>
                    </td>
                    <td className="m-tx-hist-dense-td m-tx-hist-dense-td--chev">
                      <i
                        className={`fas fa-chevron-${expanded ? "up" : "down"} m-tx-hist-chev`}
                        aria-hidden="true"
                      />
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="m-tx-hist-detail-row" id={detailId}>
                      <td className="m-tx-hist-detail" colSpan={6}>
                        <div className="m-tx-hist-detail-panel">
                          <div className="m-tx-hist-detail-block">
                            <span className="m-tx-hist-detail-label">{t("colDescription")}</span>
                            <p
                              className={
                                description && description !== "-"
                                  ? "m-tx-hist-detail-desc"
                                  : "m-tx-hist-detail-desc m-tx-hist-detail-desc--muted"
                              }
                            >
                              {description && description !== "-" ? description : "—"}
                            </p>
                          </div>

                          <div className="m-tx-hist-detail-meta">
                            <div className="m-tx-hist-detail-meta-item">
                              <span className="m-tx-hist-detail-label">{t("currency")}</span>
                              <span className="m-tx-hist-detail-value">{currency}</span>
                            </div>
                            <div className="m-tx-hist-detail-meta-item">
                              <span className="m-tx-hist-detail-label">{t("createdBy")}</span>
                              <span
                                className={
                                  createdBy && createdBy !== "-"
                                    ? "m-tx-hist-detail-value"
                                    : "m-tx-hist-detail-value m-tx-hist-detail-value--muted"
                                }
                              >
                                {createdBy && createdBy !== "-" ? createdBy : "—"}
                              </span>
                            </div>
                          </div>

                          {row.rate && row.rate !== "-" ? (
                            <div className="m-tx-hist-detail-block m-tx-hist-detail-block--inline">
                              <span className="m-tx-hist-detail-label">{t("colRate")}</span>
                              <span className="m-tx-hist-detail-value">
                                {formatRateForHistoryDisplay(row.rate)}
                              </span>
                            </div>
                          ) : null}

                          {remark && remark !== "-" ? (
                            <div className="m-tx-hist-detail-block">
                              <span className="m-tx-hist-detail-label">{t("colRemark")}</span>
                              <p className="m-tx-hist-detail-desc">{remark}</p>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function MemberPage() {
  const api = useMobileMember();
  const { i18n, t, lang } = api;
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [balancesOpen, setBalancesOpen] = useState(false);

  const exportScope = useMemo(
    () => ({
      accountDbId: api.viewAccountId,
      companyId: api.companyId || undefined,
      groupId: api.groupId || undefined,
      dateFrom: api.dateFromYmd,
      dateTo: api.dateToYmd,
      currency: api.isAllSelected ? "ALL" : api.selectedCurrencies.join(","),
    }),
    [
      api.viewAccountId,
      api.companyId,
      api.groupId,
      api.dateFromYmd,
      api.dateToYmd,
      api.isAllSelected,
      api.selectedCurrencies,
    ],
  );

  const accountCode = String(api.viewAccount?.account_id || "").toUpperCase();
  const accountName = String(api.viewAccount?.name || "").trim();
  const filterSummary = [
    `${api.dateFromYmd} — ${api.dateToYmd}`,
    accountCode || null,
    api.isAllSelected ? t("all") : api.selectedCurrencies.join(", ") || t("selectCurrency"),
  ]
    .filter(Boolean)
    .join(" · ");

  const stickyBar = (
    <div className="m-member-sticky">
      <div className="m-member-heading">
        <div>
          <h1>{t("winLoss")}</h1>
          <p>{t("pageSubtitle")}</p>
        </div>
        <div className="m-member-heading-actions">
          <button
            type="button"
            className="m-member-icon-btn tap-scale"
            onClick={() => setFilterOpen(true)}
            aria-label={t("filters")}
          >
            <i className="fas fa-sliders" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="m-member-icon-btn tap-scale"
            onClick={() => setExportOpen(true)}
            aria-label={t("exportPdf")}
          >
            <i className="fas fa-file-pdf" aria-hidden="true" />
          </button>
        </div>
      </div>
      <button type="button" className="m-member-filter-summary tap-scale" onClick={() => setFilterOpen(true)}>
        <i className="fas fa-filter" aria-hidden="true" />
        <span>{filterSummary}</span>
      </button>
    </div>
  );

  if (api.bootLoading) {
    return (
      <div className="m-account-loading" style={{ padding: "3rem 1rem" }}>
        <i className="fas fa-spinner fa-spin" aria-hidden="true" />
        <span>{t("loading")}</span>
      </div>
    );
  }

  return (
    <MobileShell
      i18n={i18n}
      me={api.me}
      companyCode={api.companyCode}
      groupId={api.groupIdLabel}
      onLogout={api.logout}
      onRefresh={api.refresh}
      refreshing={api.refreshing}
      stickyBar={stickyBar}
      lang={lang}
      onLangChange={api.setLang}
      overlayOpen={filterOpen || exportOpen}
      overlay={
        <>
          <MemberFilterSheet
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            t={t}
            companies={api.companies}
            companyId={api.companyId}
            linkedAccounts={api.linkedAccounts}
            viewAccountId={api.viewAccountId}
            dateFromYmd={api.dateFromYmd}
            dateToYmd={api.dateToYmd}
            availableCurrencies={api.availableCurrencies}
            isAllSelected={api.isAllSelected}
            selectedCurrencies={api.selectedCurrencies}
            onApply={api.applyFilters}
            onSwitchCompany={api.switchCompany}
            onSwitchAccount={api.switchAccount}
            onSetCurrencyAll={api.setCurrencyAll}
            onToggleCurrency={api.toggleCurrency}
          />
          <ExportPdfSheet
            open={exportOpen}
            onClose={() => setExportOpen(false)}
            m={i18n}
            scope={exportScope}
            accountCode={accountCode}
            accountName={accountName}
            lang={lang}
          />
        </>
      }
    >
      <div className="m-member-page m-tx-hist-page">
        {api.toast ? (
          <div className={`m-account-toast ${api.toast.tone}`}>{api.toast.message}</div>
        ) : null}

        {api.linkedAccounts.length > 0 || api.balancesLoading ? (
          <MemberBalancesStrip
            expanded={balancesOpen}
            onToggle={() => setBalancesOpen((v) => !v)}
            accounts={api.linkedAccounts}
            currencies={api.balanceCurrencies}
            balanceMap={api.balanceMap}
            balanceTotals={api.balanceTotals}
            linkedAccountCurrenciesMap={api.linkedAccountCurrenciesMap}
            linkedCurrenciesLoaded={api.linkedCurrenciesLoaded}
            loading={api.balancesLoading}
            t={t}
          />
        ) : null}

        {!api.loadingTable && api.groupedRows.length > 0 ? (
          <p className="m-tx-hist-expand-hint">{t("paymentHistoryTapRowHint")}</p>
        ) : null}

        {api.loadingTable ? (
          <div className="m-tx-hist-loading">{t("loading")}</div>
        ) : api.groupedRows.length === 0 ? (
          <p className="m-tx-hist-empty">{t("noDataInRange")}</p>
        ) : (
          api.groupedRows.map(([currency, rows]) => (
            <CurrencySection
              key={currency}
              currency={currency}
              rows={rows}
              t={t}
              lang={lang}
              expandedKey={expandedKey}
              setExpandedKey={setExpandedKey}
            />
          ))
        )}
      </div>
    </MobileShell>
  );
}
