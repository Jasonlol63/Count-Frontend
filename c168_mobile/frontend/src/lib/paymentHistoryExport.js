import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { orderCurrencyCodesForCompany } from "./currencyOrder.js";
import { fetchAvailableCurrencies } from "./accountApi.js";
import { fetchTenantIdByCode } from "./tenantAccessibleApi.js";
import { getHistory } from "./transactionApi.js";
import { formatPaymentHistoryMoney, formatRateForHistoryDisplay, getHistoryRemark } from "./transactionFormat.js";
import MoneyDecimal from "./money/moneyDecimal.js";

export function formatDmyFromYmd(ymd) {
  const [y, m, d] = String(ymd || "").split("-");
  if (!y || !m || !d) return "";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function ymdRangeToDmy(dateFromYmd, dateToYmd) {
  return {
    dateFrom: formatDmyFromYmd(dateFromYmd),
    dateTo: formatDmyFromYmd(dateToYmd),
  };
}

/** Currencies linked to this account, for the PDF export currency picker — Spring `/api/currency/available`. */
export async function fetchPaymentHistoryExportCurrencies(accountId, companyId, signal, groupId = "") {
  const id = Number(accountId) || 0;
  const cid = Number(companyId) || 0;
  const gid = String(groupId || "").trim();
  if (!id || (!cid && !gid)) return [];
  const tenantId = cid || (gid ? await fetchTenantIdByCode(gid, { signal }) : null);
  if (!tenantId) return [];
  const rows = await fetchAvailableCurrencies(tenantId, id, signal);
  const codes = rows.filter((row) => row.is_linked).map((row) => row.code).filter(Boolean);
  return orderCurrencyCodesForCompany(codes, tenantId, signal);
}

/** Member's own payment history for PDF/report export — Spring `/api/transaction/history`. */
export async function fetchMemberReportHistory({
  accountId,
  companyId,
  groupId = "",
  dateFrom,
  dateTo,
  currency,
  signal,
}) {
  const id = Number(accountId) || 0;
  const cid = Number(companyId) || 0;
  const gid = String(groupId || "").trim();
  if (!id || (!cid && !gid)) throw new Error("Account or company is missing");
  const result = await getHistory({
    companyId: cid || undefined,
    groupId: gid || undefined,
    accountId: id,
    dateFrom,
    dateTo,
    currency,
    signal,
  });
  if (!result?.success) {
    throw new Error(result?.message || "History request failed");
  }
  return Array.isArray(result.data) ? result.data : [];
}

export function resolveExportCurrenciesDefault(scopeCurrency, currencies) {
  const list = Array.isArray(currencies) ? currencies : [];
  if (!list.length) return { isAllSelected: true, codes: [] };
  if (list.length === 1) return { isAllSelected: false, codes: [list[0]] };
  const raw = String(scopeCurrency || "").trim().toUpperCase();
  if (!raw || raw === "ALL") return { isAllSelected: true, codes: [] };
  const parts = raw.split(",").map((c) => c.trim()).filter(Boolean);
  const matched = parts.filter((p) => list.includes(p));
  if (!matched.length || matched.length === list.length) return { isAllSelected: true, codes: [] };
  return { isAllSelected: false, codes: matched };
}

export function exportCurrencyCodes(isAllSelected, selectedCurrencies, availableCurrencies) {
  const list = Array.isArray(availableCurrencies) ? availableCurrencies : [];
  if (!list.length) return [];
  if (list.length === 1) {
    const code = list[0];
    return (selectedCurrencies || []).includes(code) ? [code] : [];
  }
  if (isAllSelected) return [...list];
  return (selectedCurrencies || []).filter((c) => list.includes(c));
}

export function buildMemberReportFilename({ accountCode, currencies, dateFrom, dateTo }) {
  const code = String(accountCode || "account").replace(/[^\w.-]+/g, "_");
  const ccy = (currencies || []).join("-") || "ALL";
  const from = String(dateFrom || "").replace(/\//g, "");
  const to = String(dateTo || "").replace(/\//g, "");
  return `${code}_${ccy}_${from}-${to}.pdf`;
}

function productCell(row) {
  if (row?.is_bank_process_transaction) return row.card_owner || "-";
  return row?.product || "-";
}

function descriptionCell(row) {
  if (row?.row_type === "bf") return "OPENING BALANCE";
  const desc = String(row?.description || "").trim();
  if (desc.toUpperCase() === "OPENING BALANCE") return "OPENING BALANCE";
  return (desc || "-").toUpperCase();
}

function computeTotals(rows) {
  let wl = MoneyDecimal.toDecimal("0", 0);
  let cr = MoneyDecimal.toDecimal("0", 0);
  let closing = MoneyDecimal.toDecimal("0", 0);
  for (const row of rows || []) {
    try {
      wl = wl.plus(MoneyDecimal.toDecimal(String(row.win_loss ?? "0").replace(/,/g, "") || "0", 0));
    } catch {
      /* skip */
    }
    try {
      cr = cr.plus(MoneyDecimal.toDecimal(String(row.cr_dr ?? "0").replace(/,/g, "") || "0", 0));
    } catch {
      /* skip */
    }
    if (row.balance != null && String(row.balance).trim() !== "" && row.balance !== "-") {
      try {
        closing = MoneyDecimal.toDecimal(String(row.balance).replace(/,/g, "") || "0", 0);
      } catch {
        /* keep previous */
      }
    }
  }
  return {
    totalWinLoss: formatPaymentHistoryMoney(wl.toString()),
    totalCrDr: formatPaymentHistoryMoney(cr.toString()),
    closingBalance: formatPaymentHistoryMoney(closing.toString()),
  };
}

function rowToCells(row) {
  return [
    row?.date || "-",
    productCell(row),
    row?.rate && row.rate !== "-" ? formatRateForHistoryDisplay(row.rate) : "-",
    formatPaymentHistoryMoney(row?.win_loss),
    formatPaymentHistoryMoney(row?.cr_dr),
    formatPaymentHistoryMoney(row?.balance),
    descriptionCell(row),
    getHistoryRemark(row),
  ];
}

/**
 * Client-side PDF download — same APIs as desktop member report export.
 */
export async function downloadMemberReportPdf({
  sections,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  filename,
  title = "WIN/LOSE REPORT",
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 10;
  const list = Array.isArray(sections) ? sections : [];
  const headers = ["Date", "Product", "Rate", "W/L", "Cr/Dr", "Bal.", "Desc.", "Remark"];

  list.forEach((section, idx) => {
    if (idx > 0) doc.addPage();
    const currency = String(section.currency || "").toUpperCase();
    const rows = Array.isArray(section.rows) ? section.rows : [];
    const totals = computeTotals(rows);
    const meta = `${accountCode || ""}${accountName ? ` (${accountName})` : ""} · ${dateFrom} – ${dateTo} · ${currency}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 44, 73);
    doc.text(String(title || "WIN/LOSE REPORT").toUpperCase(), marginX, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(meta, marginX, 20);

    autoTable(doc, {
      startY: 24,
      margin: { left: marginX, right: marginX, top: 24, bottom: 14 },
      head: [headers],
      body: rows.map(rowToCells),
      foot: [
        [
          { content: "TOTAL", colSpan: 3, styles: { fontStyle: "bold", halign: "left" } },
          totals.totalWinLoss,
          totals.totalCrDr,
          totals.closingBalance,
          { content: "", colSpan: 2 },
        ],
      ],
      showFoot: "lastPage",
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 1.1,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [0, 44, 73],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 7.5,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 22 },
        2: { cellWidth: 14 },
        3: { cellWidth: 18, halign: "right" },
        4: { cellWidth: 18, halign: "right" },
        5: { cellWidth: 18, halign: "right" },
        6: { cellWidth: 28 },
        7: { cellWidth: "auto" },
      },
    });
  });

  doc.save(filename || "payment-history.pdf");
}
