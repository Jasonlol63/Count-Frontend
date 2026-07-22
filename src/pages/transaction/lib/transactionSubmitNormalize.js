/**
 * Spring POST /api/transaction/submit — PAYMENT / CLAIM / CLEAR / CONTRA / ADJUSTMENT.
 * Legacy PHP payload: account_id = To; from_account_id = From (omit for ADJUSTMENT).
 */

const SPRING_SUBMIT_TYPES = new Set(["PAYMENT", "CLAIM", "CLEAR", "CONTRA", "ADJUSTMENT"]);
const SPRING_TRANSFER_TYPES = new Set(["PAYMENT", "CLAIM", "CLEAR", "CONTRA"]);

export function isSpringSubmitType(transactionType) {
  return SPRING_SUBMIT_TYPES.has(String(transactionType || "").toUpperCase().trim());
}

function parseSignedAmount(raw) {
  const amountRaw = String(raw ?? "")
    .replace(/,/g, "")
    .trim();
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) {
    throw new Error("invalidAmount");
  }
  return amount;
}

export function buildSpringSubmitRequest({ companyId, payload } = {}) {
  const tenantId = Number(companyId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("tenantIdRequired");
  }

  const p = payload && typeof payload === "object" ? payload : {};
  const type = String(p.transaction_type || "").toUpperCase().trim();
  if (!isSpringSubmitType(type)) {
    throw new Error("unsupportedSpringSubmitType");
  }

  const toAccountId = Number(p.account_id);
  if (!Number.isFinite(toAccountId) || toAccountId <= 0) {
    throw new Error("toAccountRequired");
  }

  const currencyCode = String(p.currency || "")
    .trim()
    .toUpperCase();
  if (!currencyCode) {
    throw new Error("currencyRequired");
  }

  const transactionDate = String(p.transaction_date || "").trim();
  if (!transactionDate) {
    throw new Error("transactionDateRequired");
  }

  const remark = String(p.sms ?? p.remark ?? "").trim();

  if (type === "ADJUSTMENT") {
    const amount = parseSignedAmount(p.amount);
    if (amount === 0) {
      throw new Error("invalidAmount");
    }
    return {
      tenantId,
      transactionType: "ADJUSTMENT",
      transactionDate,
      toAccountId,
      currencyCode,
      amount,
      remark: remark || undefined,
    };
  }

  if (!SPRING_TRANSFER_TYPES.has(type)) {
    throw new Error("unsupportedSpringSubmitType");
  }

  const fromAccountId = Number(p.from_account_id);
  if (!Number.isFinite(fromAccountId) || fromAccountId <= 0) {
    throw new Error("fromAccountRequired");
  }

  const amount = parseSignedAmount(p.amount);
  if (amount <= 0) {
    throw new Error("invalidAmount");
  }

  return {
    tenantId,
    transactionType: type,
    transactionDate,
    toAccountId,
    fromAccountId,
    currencyCode,
    amount,
    remark: remark || undefined,
  };
}

/** Spring SubmitResult → shape expected by useTransactionForm (snake_case + approval_status). */
export function normalizeSpringSubmitResponse(json) {
  if (!json || typeof json !== "object") {
    return { success: false, message: "submitFailed", data: null };
  }
  if (!json.success) {
    return {
      success: false,
      message: json.message || "submitFailed",
      data: null,
    };
  }

  const d = json.data && typeof json.data === "object" ? json.data : {};
  const transactionType = String(d.transactionType || "PAYMENT").toUpperCase();
  return {
    success: true,
    message: json.message || "",
    data: {
      id: d.id ?? null,
      transaction_type: transactionType,
      approval_status: "APPROVED",
      to_account_id: d.toAccountId ?? null,
      from_account_id: d.fromAccountId ?? null,
      currency: String(d.currencyCode || "").toUpperCase(),
      amount: d.amount ?? "",
      transaction_date: d.transactionDate ?? "",
      remark: d.remark ?? "",
    },
  };
}
