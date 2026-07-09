import { useDashboardDateRange, useDashboardDateRangeState } from "./hooks/useDashboardDateRange.js";
import { useDashboardLang } from "./hooks/useDashboardLang.js";
import { useDashboardPage } from "./hooks/useDashboardPage.js";
import { DashboardCalendarPopup } from "./components/DashboardCalendarPopup.jsx";
import { DashboardCompanyAccessModal } from "./components/DashboardCompanyAccessModal.jsx";
import { DashboardEarningsSummary } from "./components/DashboardEarningsSummary.jsx";
import { DashboardFilterPanel } from "./components/DashboardFilterPanel.jsx";
import { DashboardKpiGrid } from "./components/DashboardKpiGrid.jsx";
import { DashboardTrendChart } from "./components/DashboardTrendChart.jsx";
import "../../../public/css/userlist.css";
import "../../../public/css/transaction.css";
import "../../../public/css/report-outlined-fields.css";
import "../../../public/css/date-range-picker.css";

export default function TransactionDashboardPage() {
  const { i18n } = useDashboardLang();
  const { dateFrom, setDateFrom, dateTo, setDateTo } = useDashboardDateRangeState();

  const page = useDashboardPage({ i18n, dateFrom, dateTo, setDateFrom, setDateTo });
  const { effectiveDateRangeText, periodPresets } = useDashboardDateRange({
    me: page.me,
    i18n,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
  });

  return (
    <>
      <div className="dashboard-container">
        <DashboardCompanyAccessModal
          open={page.companyAccessModal.open}
          message={page.companyAccessModal.message}
          onClose={page.closeCompanyAccessModal}
        />

        {page.loadError && (
          <div className="dashboard-card" style={{ marginBottom: 12, color: "#b91c1c" }}>
            {page.loadError}
          </div>
        )}

        <div id="app" className="dashboard-content">
          <DashboardFilterPanel
            i18n={i18n}
            effectiveDateRangeText={effectiveDateRangeText}
            groupIds={page.groupIds}
            selectedGroup={page.selectedGroup}
            groupsAllMode={page.groupsAllMode}
            groupAllMode={page.groupAllMode}
            companiesForPicker={page.companiesForPicker}
            companyId={page.companyId}
            mergedSubsetIds={page.mergedSubsetIds}
            currencies={page.currencies}
            currencyCode={page.currencyCode}
            onPickGroup={page.handlePickGroup}
            onPickAllGroups={page.handlePickAllGroups}
            onPickCompany={page.handlePickCompany}
            onPickAllInGroup={page.handlePickAllInGroup}
            onCurrencyChange={page.handleCurrencyChange}
            onCurrencyDropOn={page.handleCurrencyDropOn}
          />

          <DashboardKpiGrid
            i18n={i18n}
            kpi={page.kpi}
            kpiCompareLabel={page.kpiCompareLabel}
            kpiFooter={page.kpiFooter}
            loading={page.loading}
          />

          <div
            className={`dashboard-panels-row${
              page.showProfitChartTab ? " dashboard-panels-row--with-summary-tabs" : ""
            }`}
          >
            <DashboardTrendChart
              i18n={i18n}
              chartRows={page.chartRows}
              chartSeries={page.chartSeries}
              chartVisible={page.chartVisible}
              onToggleSeries={page.toggleChartSeries}
              chartDateRangeText={page.chartDateRangeText}
              chartXAxisLayout={page.chartXAxisLayout}
              chartDataStable={page.chartDataStable}
              chartScopeKey={page.dashboardScopeKey}
            />
            <DashboardEarningsSummary
              i18n={i18n}
              currencyCode={page.currencyCode}
              currencies={page.currencies}
              earningsCurrencyRows={page.earningsCurrencyRows}
              useConvertedEarnings={page.useConvertedEarnings}
              earningsBreakdownShowsRate={page.earningsBreakdownShowsRate}
              summaryPanelLabel={page.summaryPanelLabel}
              summaryEarningsValue={page.summaryEarningsValue}
              summaryConversionNote={page.summaryConversionNote}
              summaryEarningsLoading={page.summaryEarningsLoading}
              earningsPanelStable={page.earningsPanelStable}
              earningsByCurrencyLoading={page.earningsByCurrencyLoading}
              exchangeRates={page.exchangeRates}
              exchangeRatesError={page.exchangeRatesError}
              exchangeRatesLoading={page.exchangeRatesLoading}
              exchangeRateScopeKey={page.exchangeRateScopeKey}
              rateFootnoteText={page.rateFootnoteText}
              convertedEarningsTotal={page.convertedEarningsTotal}
              showProfitChartTab={page.showProfitChartTab}
              earningsPanelView={page.earningsPanelView}
              onEarningsPanelViewChange={page.setEarningsPanelView}
              companyBreakdownRows={page.companyBreakdownRows}
              companyNetProfitTotal={page.companyNetProfitTotal}
            />
          </div>
        </div>
      </div>

      <DashboardCalendarPopup i18n={i18n} periodPresets={periodPresets} dateFrom={dateFrom} />
    </>
  );
}
