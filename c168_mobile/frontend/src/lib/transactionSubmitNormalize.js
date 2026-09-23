/**
 * Spring `POST /api/transaction/submit` — PAYMENT / CLAIM / CLEAR / CONTRA / ADJUSTMENT / PROFIT / RATE.
 *
 * Ported from Count-frontend/src/pages/transaction/lib/transactionSubmitNormalize.js (desktop).
 * Mobile previously had no equivalent layer: `AddTransactionSheet` builds a legacy payload (and
 * `buildRatePayload` builds the RATE one) and `transactionApi.submitTransaction` posted it as
 * FormData to `submit_api.php`. The legacy payload keys are kept as the *input* here — the sheet
 * and the post-submit optimistic-delta bookkeeping in `useMobileTransaction` still read them — and
 * this module maps them onto the Spring DTO.
 *
 * Legacy payload convention: `account_id` = To, `from_account_id` = From (omitted for ADJUSTMENT).
 * RATE uses the `leg1_*` / `leg2_*` / `middleman_*` group instead (see `buildRatePayload`).
 *
 * Two things worth not "tidying" later:
 *   - `leg2Amount` is deliberately NOT sent. The backend ignores it outright
 *     (`TransactionSubmitServiceImpl`: "leg2（to account）永远记 flat 毛额，不用前端传的 leg2Amount")
 *     and the old "Leg2 amount must equal…" validation was removed in 2026-08 —
 *     `Count/docs/transaction-rate-middleman-logic.md` §4.7. The older frontend note that says
 *     otherwise (`transaction-rate-springboot-submit.md` §3) predates that removal.
 *   - `middlemanRateExpression` carries the **raw text** ("/1.55" or "2.93"); the backend's
 *     `RateMulCalculator` decides divide vs multiply mode from it. Converting it to a bare number
 *     silently breaks divide mode (and the points mode, which also needs `rateExpression`).
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
 * The RATE/PROFIT form submits PROFIT as legacy `transaction_type: "WIN"|"LOSE"` (the sign encodes
 * direction and the amount is abs). Spring only understands a literal `"PROFIT"` with an unsigned
 * amount plus an explicit to/from — see the WIN/LOSE branch below for the account swap that
 * reproduces the same balance effect. Treated as Spring-routable here so callers don't need to
 * know about the legacy quirk.
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

/**
 * Legacy payload → Spring `TransactionSubmitDTO`.
 * Throws an Error whose `message` is a translation key (`toAccountRequired`, `invalidAmount`, …).
 */
export function buildSpringSubmitRequest({ companyId, payload } = {}) {
  const tenantId = Number(companyId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("tenantIdRequired");
  }

  const p = payload && typeof payload === "object" ? payload : {};
  const type = String(p.transaction_type || "")
    .toUpperCase()
    .trim();
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
    if (leg1Amount <= 0) {
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
      exchangeRate,
      rateExpression: rateExpression || undefined,
      remark: remark || undefined,
    };

    const middleAccountId = Number(p.middleman_account_id ?? p.rate_middleman_account_id);
    // Raw Rate-Mul text (e.g. "/1.55" or "2.93") — the backend parses the mode itself.
    const middleRateRaw = String(p.middleman_rate_expression ?? p.rate_middleman_rate ?? "")
      .replace(/,/g, "")
      .trim();
    // Fee face value, second (leg2) currency. Do NOT fall back to `rate_middleman_amount` /
    // `middleman_amount` — those hold the TOTAL middleman profit (rate-mul commission + net fee),
    // not the raw fee input, and would silently mislabel a Rate-Mul-only submit as a Fee.
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

    // Mirrors the backend's `resolveMiddleman()` three-way rule.
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
    // Legacy: WIN → To −/From + (normal), LOSE → To +/From − (reversed). Spring PROFIT is always
    // From +/To − with a positive amount, so LOSE swaps the accounts to get the same effect.
    // `payload.amount` is already abs()'d by the sheet for this branch.
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

/**
 * Spring `SubmitResult` → the shape `useMobileTransaction.submitTx` already consumes
 * (`success` / `message` / `data.approval_status`, snake_case). The caller also reads the original
 * legacy payload for its optimistic deltas, so nothing here mutates the payload.
 */
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
  return {
    success: true,
    message: json.message || "",
    data: {
      id: d.id ?? null,
      transaction_type: String(d.transactionType || "PAYMENT").toUpperCase(),
      // Contra Inbox: the backend decides APPROVED vs PENDING from role + transaction date
      // (AccessControlUtils.isManualTransactionApprovalExempt / isAutoApproved).
      approval_status: String(d.approvalStatus || "APPROVED").toUpperCase(),
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
