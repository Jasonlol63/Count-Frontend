/**
 * Spring POST /api/transaction/submit — PAYMENT / CLAIM / CLEAR / CONTRA / ADJUSTMENT / PROFIT / RATE.
 * Legacy PHP payload: account_id = To; from_account_id = From (omit for ADJUSTMENT).
 * RATE uses leg1_* / leg2_* fields (see buildRatePayload).
 */

const SPRING_SUBMIT_TYPES = new Set([
  "PAYMENT",
  "CLAIM",
  "CLEAR",
  "CONTRA",
  "ADJUSTMENT",
  "PROFIT",
  "RATE",
]);
const SPRING_TRANSFER_TYPES = new Set(["PAYMENT", "CLAIM", "CLEAR", "CONTRA", "PROFIT"]);

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

function requirePositiveAccountId(raw, errorKey) {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(errorKey);
  }
  return id;
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

  const transactionDate = String(p.transaction_date || "").trim();
  if (!transactionDate) {
    throw new Error("transactionDateRequired");
  }

  const remark = String(p.sms ?? p.remark ?? "").trim();

  if (type === "RATE") {
    const leg1ToAccountId = requirePositiveAccountId(p.leg1_to_account_id, "toAccountRequired");
    const leg1FromAccountId = requirePositiveAccountId(p.leg1_from_account_id, "fromAccountRequired");
    const leg2ToAccountId = requirePositiveAccountId(p.leg2_to_account_id, "toAccountRequired");
    const leg2FromAccountId = requirePositiveAccountId(p.leg2_from_account_id, "fromAccountRequired");

    const leg1CurrencyCode = String(p.leg1_currency || p.rate_currency_from || "")
      .trim()
      .toUpperCase();
    const leg2CurrencyCode = String(p.leg2_currency || p.rate_currency_to || "")
      .trim()
      .toUpperCase();
    if (!leg1CurrencyCode || !leg2CurrencyCode) {
      throw new Error("currencyRequired");
    }

    const leg1Amount = parseSignedAmount(p.leg1_amount ?? p.rate_from_amount ?? p.amount);
    const leg2Amount = parseSignedAmount(p.leg2_amount ?? p.rate_currency_to_amount);
    if (leg1Amount <= 0 || leg2Amount <= 0) {
      throw new Error("invalidAmount");
    }

    const exchangeRate = parseSignedAmount(p.rate_exchange_rate ?? p.exchange_rate);
    if (exchangeRate <= 0) {
      throw new Error("invalidAmount");
    }

    const rateExpression = String(p.rate_expression ?? p.rate_exchange_rate_raw ?? "").trim();

    const body = {
      tenantId,
      transactionType: "RATE",
      transactionDate,
      leg1ToAccountId,
      leg1FromAccountId,
      leg1CurrencyCode,
      leg1Amount,
      leg2ToAccountId,
      leg2FromAccountId,
      leg2CurrencyCode,
      leg2Amount,
      exchangeRate,
      rateExpression: rateExpression || undefined,
      remark: remark || undefined,
    };

    const middleAccountId = Number(p.rate_middleman_account_id ?? p.middleman_account_id);
    const middleRateRaw = String(p.rate_middleman_rate ?? p.middleman_rate ?? "")
      .replace(/,/g, "")
      .trim();
    // Fee input in first currency (prefer rate_middleman_fee / input; fall back to middleman_amount).
    const middleFeeRaw = String(
      p.rate_middleman_fee ?? p.rate_middleman_input_amount ?? p.middleman_amount ?? p.rate_middleman_amount ?? "",
    )
      .replace(/,/g, "")
      .trim();
    const hasMiddleAccount = Number.isFinite(middleAccountId) && middleAccountId > 0;
    const hasMiddleRate = middleRateRaw !== "" && Number(middleRateRaw) > 0;
    const hasMiddleFee = middleFeeRaw !== "" && Number(middleFeeRaw) > 0;

    if ((hasMiddleRate || hasMiddleFee) && !hasMiddleAccount) {
      throw new Error("middleManAccountRequired");
    }
    if (hasMiddleAccount && !hasMiddleRate && !hasMiddleFee) {
      throw new Error("middleManRateOrFeeRequired");
    }
    if (hasMiddleAccount && (hasMiddleRate || hasMiddleFee)) {
      body.middlemanAccountId = middleAccountId;
      if (hasMiddleRate) {
        body.middlemanRate = Number(middleRateRaw);
      }
      if (hasMiddleFee) {
        const feeInput = parseSignedAmount(middleFeeRaw);
        if (feeInput <= 0) {
          throw new Error("invalidAmount");
        }
        body.middlemanAmount = feeInput;
      }
    }

    return body;
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
      rate_group_id: d.rateGroupId ?? null,
      leg1_id: d.leg1Id ?? null,
      leg2_id: d.leg2Id ?? null,
      middleman_id: d.middlemanId ?? null,
      middleman_rate_id: d.middlemanRateId ?? null,
      middleman_fee_id: d.middlemanFeeId ?? null,
      exchange_rate: d.exchangeRate ?? "",
      rate_expression: d.rateExpression ?? "",
    },
  };
}
