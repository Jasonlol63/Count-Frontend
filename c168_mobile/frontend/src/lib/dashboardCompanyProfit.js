/** Normalize API / merge `subsidiary_earnings_by_company` rows (desktop parity). */
export function normalizeSubsidiaryEarningsByCompany(apiRows) {
  if (!Array.isArray(apiRows)) return [];
  return apiRows
    .map((row) => {
      const netProfit = parseFloat(row.net_profit) || 0;
      const groupEquityPct = parseFloat(row.group_equity_pct) || 0;
      const groupShareRaw = parseFloat(row.group_share);
      const groupShare = Number.isFinite(groupShareRaw)
        ? groupShareRaw
        : netProfit * (groupEquityPct / 100);
      return {
        company_pk: row.company_pk,
        company_id: String(row.company_id || "").trim(),
        group_id: String(row.group_id || "").trim().toUpperCase(),
        net_profit: netProfit,
        group_equity_pct: groupEquityPct,
        account_pct: parseFloat(row.account_pct) || 0,
        group_share: groupShare,
        company_earning: parseFloat(row.company_earning) || 0,
        my_earning: parseFloat(row.my_earning) || 0,
      };
    })
    .filter((row) => row.company_id);
}
