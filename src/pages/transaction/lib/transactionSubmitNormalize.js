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

/**
 * `useTransactionForm.js` submits PROFIT as legacy `transaction_type: "WIN"|"LOSE"`
 * (sign encodes direction, amount is abs). Spring only understands literal "PROFIT"
 * with unsigned amount + explicit to/from — see the WIN/LOSE branch below for the
 * account-swap translation. Treat WIN/LOSE as Spring-routable here so callers don't
 * need to know about this legacy quirk.
 */
export function isSpringSubmitType(transactionType) {
  const t = String(transactionType || "").toUpperCase().trim();
  return SPRING_SUBMIT_TYPES.has(t) || t === "WIN" || t === "LOSE";
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
  const isProfitWinLose = type === "WIN" || type === "LOSE";
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
    // leg2_amount is the Spring-only net amount (gross - Rate-Mul commission - net fee); the
    // legacy rate_currency_to_amount is gross and would fail the backend's expectedNet check.
    const leg2Amount = parseSignedAmount(p.leg2_amount);
    if (leg1Amount <= 0 || leg2Amount <= 0) {
      throw new Error("invalidAmount");
    }

    const exchangeRate = parseSignedAmount(p.rate_exchange_rate ?? p.exchange_rate);
    if (exchangeRate <= 0) {
      throw new Error("invalidAmount");
    }

    const rateExpression = String(p.rate_expression ?? "").trim();

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

    const middleAccountId = Number(p.middleman_account_id ?? p.rate_middleman_account_id);
    // Raw Rate-Mul text (e.g. "/1.55" or "2.93") — backend parses divide vs multiply mode itself.
    const middleRateRaw = String(p.middleman_rate_expression ?? p.rate_middleman_rate ?? "")
      .replace(/,/g, "")
      .trim();
    // Fee face value, second (leg2) currency. Do NOT fall back to rate_middleman_amount /
    // middleman_amount — those hold the TOTAL middleman profit (rate-mul + fee - platform fee),
    // not the raw fee input, and would silently mislabel Rate-Mul-only submits as a Fee.
    const middleFeeRaw = String(p.middleman_fee_amount ?? p.rate_middleman_input_amount ?? "")
      .replace(/,/g, "")
      .trim();
    const platformFeeRaw = String(
      p.middleman_platform_fee_amount ?? p.rate_platform_fee_amount ?? p.rate_middleman_platform_fee ?? "",
    )
      .replace(/,/g, "")
      .trim();
    const hasMiddleAccount = Number.isFinite(middleAccountId) && middleAccountId > 0;
    const hasMiddleRate = middleRateRaw !== "";
    const hasMiddleFee = middleFeeRaw !== "" && Number(middleFeeRaw) > 0;
    const hasMiddlePlatformFee = platformFeeRaw !== "" && Number(platformFeeRaw) > 0;

    if ((hasMiddleRate || hasMiddleFee || hasMiddlePlatformFee) && !hasMiddleAccount) {
      throw new Error("middleManAccountRequired");
    }
    if (hasMiddleAccount && !hasMiddleRate && !hasMiddleFee && !hasMiddlePlatformFee) {
      throw new Error("middleManRateOrFeeRequired");
    }
    if (hasMiddleAccount) {
      body.middlemanAccountId = middleAccountId;
      if (hasMiddleRate) {
        body.middlemanRateExpression = middleRateRaw;
      }
      if (hasMiddleFee) {
        const feeInput = parseSignedAmount(middleFeeRaw);
        if (feeInput <= 0) {
          throw new Error("invalidAmount");
        }
        body.middlemanAmount = feeInput;
      }
      if (hasMiddlePlatformFee) {
        const platformInput = parseSignedAmount(platformFeeRaw);
        if (platformInput <= 0) {
          throw new Error("invalidAmount");
        }
        body.platformFeeAmount = platformInput;
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

  const fromAccountId = Number(p.from_account_id);
  if (!Number.isFinite(fromAccountId) || fromAccountId <= 0) {
    throw new Error("fromAccountRequired");
  }

  if (isProfitWinLose) {
    // Legacy: WIN → To −/From + (normal direction); LOSE → To +/From − (reversed).
    // Spring PROFIT is always From +/To − with a positive amount, so LOSE needs the
    // accounts swapped to reproduce the same balance effect. `payload.amount` is
    // already abs()'d by useTransactionForm.js for this branch.
    const amount = parseSignedAmount(p.amount);
    if (amount <= 0) {
      throw new Error("invalidAmount");
    }
    const swap = type === "LOSE";
    return {
      tenantId,
      transactionType: "PROFIT",
      transactionDate,
      toAccountId: swap ? fromAccountId : toAccountId,
      fromAccountId: swap ? toAccountId : fromAccountId,
      currencyCode,
      amount,
      remark: remark || undefined,
    };
  }

  if (!SPRING_TRANSFER_TYPES.has(type)) {
    throw new Error("unsupportedSpringSubmitType");
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
      amount: d.amountDisplay ?? "",
      transaction_date: d.transactionDate ?? "",
      remark: d.remark ?? "",
      rate_group_id: d.rateGroupId ?? null,
      leg1_id: d.leg1Id ?? null,
      leg2_id: d.leg2Id ?? null,
      middleman_id: d.middlemanId ?? null,
      middleman_rate_id: d.middlemanRateId ?? null,
      middleman_fee_id: d.middlemanFeeId ?? null,
      exchange_rate: d.exchangeRateDisplay ?? "",
      rate_expression: d.rateExpression ?? "",
    },
  };
}
