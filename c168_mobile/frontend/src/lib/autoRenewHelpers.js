import {
  calculateCountdown,
  resolveDomainFeePriceForPeriod,
} from "./domainHelpers.js";

export function periodToLabelKey(period) {
  const map = {
    "7days": "period7days",
    "1month": "period1month",
    "3months": "period3months",
    "6months": "period6months",
    "1year": "period1year",
  };
  return map[period] || null;
}

export function formatRemainingForRow(row, t) {
  if (!row?.expiration_date) return t("noExpirationDate");
  const countdown = calculateCountdown(row.expiration_date);
  if (countdown?.text) return countdown.text;
  const days = row.days_until_expiration;
  if (days == null) return t("notSet");
  if (days < 0) return t("expExpired");
  if (days === 0) return t("expToday");
  return t("expDaysLeft", { days });
}

export function rowMatchesSearch(row, searchTerm) {
  const q = String(searchTerm || "").trim().toUpperCase();
  if (!q) return true;
  const company = String(row.company_code || "").toUpperCase();
  const name = String(row.owner_name || "").toUpperCase();
  const group = String(row.group_id || "").toUpperCase();
  return company.includes(q) || name.includes(q) || group.includes(q);
}

export function getRowDraftValues(row, draft = {}) {
  return {
    period: draft.period ?? row.period ?? "",
    fromAccountId: draft.fromAccountId ?? row.from_account_id ?? row.default_from_account_id ?? "",
    toAccountId: draft.toAccountId ?? row.to_account_id ?? row.default_to_account_id ?? "",
  };
}

export function resolveAutoRenewDisplayPrice(row, draft, feeSettings) {
  const isPendingEditable = row.status === "pending" && !row.is_payment_deleted;
  if (!isPendingEditable) {
    const saved = Number(row.price);
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  }
  const { period } = getRowDraftValues(row, draft);
  if (!period || !feeSettings) return 0;
  const feeKind = row?.entity_type === "group" ? "group" : "company";
  return resolveDomainFeePriceForPeriod(feeSettings, period, feeKind);
}

export function canDeleteRow(row) {
  return (
    (row?.status === "approved" || row?.status === "rejected") &&
    Boolean(row?.can_delete) &&
    Number(row?.request_id) > 0 &&
    !row?.is_payment_deleted
  );
}

export function canApproveRow(row, draft, feeSettings) {
  if (row.status !== "pending" || row.is_payment_deleted) return false;
  const { period, fromAccountId, toAccountId } = getRowDraftValues(row, draft);
  const price = resolveAutoRenewDisplayPrice(row, draft, feeSettings);
  return Boolean(period && fromAccountId && toAccountId && price > 0);
}

export function getAutoRenewApproveDisabledReason(row, draft, feeSettings, t) {
  if (row.status !== "pending" || row.is_payment_deleted) return "";
  const { period, fromAccountId, toAccountId } = getRowDraftValues(row, draft);
  const price = resolveAutoRenewDisplayPrice(row, draft, feeSettings);
  if (!period) return t("selectPeriod");
  if (!fromAccountId || !toAccountId) return t("accountsNotResolved");
  if (price <= 0) return t("noPriceHint");
  return "";
}

export function formatAutoRenewAccountLabel(acc) {
  const code = String(acc?.account_code ?? "").trim();
  const name = String(acc?.name ?? "").trim();
  if (code && name) return `${code} (${name})`;
  return code || name || "";
}

export function rowStableKey(row) {
  if (row?.is_payment_deleted && row.deleted_payment_id) {
    return `deleted-${row.deleted_payment_id}`;
  }
  const entity = row?.entity_type === "group" ? "group" : "company";
  return `${entity}-${String(row?.request_id ?? "")}`;
}

export function tenantCode(row) {
  if (row?.entity_type === "group") return String(row.group_id || row.company_code || "—").toUpperCase();
  return String(row.company_code || "—").toUpperCase();
}
