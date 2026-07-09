import { useState, useEffect, useCallback, useRef } from "react";
import {
  transactionScopeApiParams,
  transactionScopeCacheKey,
  transactionScopeIsReady,
} from "../lib/transactionScope.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  parseRateExpression,
  buildClientRequestId,
  parseBalanceValue,
  countRateDecimalPlaces,
  formatRateAmount,
} from "../lib/transactionFormat.js";
import { buildRatePayload, toNumberLike } from "../lib/transactionSubmitHelpers.js";
import { submitTransaction, transactionQueryKeys } from "../lib/transactionApi.js";
import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import { resolveGridRowToAccountOption } from "../lib/transactionPaymentLogic.js";

export function useTransactionForm({
  todayDmy,
  pushToast,
  onSearch,
  refreshContraInboxBadge,
  filterSnapshot,
  transactionScope,
  accountOptions,
  m,
  t,
}) {
  const [txType, setTxTypeRaw] = useState("CONTRA");
  const setTxType = useCallback((next) => {
    const v = String(next || "").trim().toUpperCase();
    if (v === "RECEIVE") return;
    setTxTypeRaw(v || "CONTRA");
  }, []);
  useEffect(() => {
    if (txType === "RECEIVE") setTxTypeRaw("CONTRA");
  }, [txType]);
  const [txDate, setTxDate] = useState(null);
  const [txToAccount, setTxToAccount] = useState(null);
  const [txFromAccount, setTxFromAccount] = useState(null);
  const [txCurrency, setTxCurrency] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txRemark, setTxRemark] = useState("");
  const [txConfirm, setTxConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [rateDate, setRateDate] = useState(null);
  const [rateToAccount, setRateToAccount] = useState(null);
  const [rateFromAccount, setRateFromAccount] = useState(null);
  const [rateCurrencyFrom, setRateCurrencyFrom] = useState("");
  const [rateCurrencyTo, setRateCurrencyTo] = useState("");
  const [rateCurrencyFromAmount, setRateCurrencyFromAmount] = useState("");
  const [rateExchangeRateRaw, setRateExchangeRateRaw] = useState("");
  const [rateCurrencyToAmount, setRateCurrencyToAmount] = useState("");
  /** Legacy `rate_currency_to_amount.dataset.grossAmount` — submit uses this, not the net preview in `rateCurrencyToAmount`. */
  const [rateToAmountGrossStr, setRateToAmountGrossStr] = useState("");
  /** Legacy `rate_currency_from_amount.dataset` gross slot (only populated after RATE row Reverse swap). */
  const [rateFromAmountGrossStr, setRateFromAmountGrossStr] = useState("");

  const [rateTransferToAccount, setRateTransferToAccount] = useState(null);
  const [rateTransferFromAccount, setRateTransferFromAccount] = useState(null);

  const [rateMiddlemanAccount, setRateMiddlemanAccount] = useState(null);
  const [rateMiddlemanRate, setRateMiddlemanRate] = useState("");
  const [rateMiddlemanAmount, setRateMiddlemanAmount] = useState("");
  const queryClient = useQueryClient();
  const scopeKeyRef = useRef(transactionScopeCacheKey(transactionScope));

  useEffect(() => {
    const key = transactionScopeCacheKey(transactionScope);
    if (scopeKeyRef.current === key) return;
    scopeKeyRef.current = key;
    setTxToAccount(null);
    setTxFromAccount(null);
    setRateToAccount(null);
    setRateFromAccount(null);
    setRateTransferToAccount(null);
    setRateTransferFromAccount(null);
    setRateMiddlemanAccount(null);
  }, [transactionScope]);

  const submitMutation = useMutation({
    mutationFn: ({ scopeApi, payload, clientRequestId }) =>
      submitTransaction({ ...scopeApi, payload, clientRequestId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInboxRoot() });
    },
  });

    const handleBalanceCellClick = useCallback(
    (row, side) => {
      if (filterSnapshot?.mutationsBlocked) return;
      if (!row) return;
      const isLeftTable = side === "left";
      const balanceAttr =
        row.balance_full != null && String(row.balance_full).trim() !== "" ? row.balance_full : row.balance;
      const rowCurrency =
        row.currency && String(row.currency).trim() ? String(row.currency).trim().toUpperCase() : "";
      const resolved = resolveGridRowToAccountOption(row, accountOptions);
      if (!resolved) {
        pushToast(m.couldNotResolveAccount, "error");
        return;
      }
      const accountCurrency = resolved.currency ? String(resolved.currency).trim().toUpperCase() : "";
      const syncCurrency = rowCurrency || accountCurrency || null;

      const parsedBalance = parseBalanceValue(balanceAttr);
      const isRateView = txType === "RATE";
      const isProfitType = !isRateView && txType === "PROFIT";
      const treatAsPositiveRow = isRateView
        ? isLeftTable
        : isProfitType
          ? (parsedBalance === null ? isLeftTable : parsedBalance >= 0)
          : isLeftTable;

      const parts = [];
      let amountSet = false;
      let amountDisplay = "";

      if (parsedBalance !== null) {
        if (isProfitType) {
          try {
            const balDec = MoneyDecimal.toDecimal(String(parsedBalance), 0);
            amountDisplay = MoneyDecimal.formatFixedHalfUp(balDec.toString(), 2);
          } catch {
            const absStr = MoneyDecimal.abs(String(parsedBalance)).toString();
            amountDisplay = MoneyDecimal.formatFixedHalfUp(absStr, 2);
          }
        } else {
          const absStr = MoneyDecimal.abs(String(parsedBalance)).toString();
          amountDisplay = MoneyDecimal.formatFixedHalfUp(absStr, 2);
        }
        amountSet = true;
      }

      if (isRateView) {
        if (treatAsPositiveRow) {
          setRateToAccount(resolved);
          setRateTransferFromAccount(resolved);
        } else {
          setRateFromAccount(resolved);
          setRateTransferToAccount(resolved);
        }
        if (amountSet) setRateCurrencyFromAmount(amountDisplay);
        if (syncCurrency) setRateCurrencyFrom(syncCurrency);
        parts.push(t("syncedFromAccount", { account: row.account_id || resolved.account_id }).replace("From", treatAsPositiveRow ? m.fromAccount : m.toAccount));
        if (amountSet) parts.push(t("syncedAmountShort", { amount: amountDisplay }));
        if (syncCurrency) parts.push(t("syncedCurrency", { currency: syncCurrency }));
        if (parts.length) pushToast(t("synced", { text: parts.join(", ") }), "success");
        else if (amountSet) pushToast(t("syncedAmount", { amount: amountDisplay }), "success");
        return;
      }

      if (treatAsPositiveRow) {
        setTxToAccount(resolved);
      } else {
        setTxFromAccount(resolved);
      }
      if (amountSet) setTxAmount(amountDisplay);
      if (syncCurrency) setTxCurrency(syncCurrency);

      parts.push(t("syncedFromAccount", { account: row.account_id || resolved.account_id }).replace("From", treatAsPositiveRow ? m.fromAccount : m.toAccount));
      if (amountSet) parts.push(t("syncedAmountShort", { amount: amountDisplay }));
      if (syncCurrency) parts.push(t("syncedCurrency", { currency: syncCurrency }));
      if (parts.length) pushToast(t("synced", { text: parts.join(", ") }), "success");
      else if (amountSet) pushToast(t("syncedAmount", { amount: amountDisplay }), "success");
    },
    [accountOptions, filterSnapshot?.mutationsBlocked, pushToast, txType, m, t],
  );

  const needsFromTo = ["CONTRA", "PAYMENT", "CLAIM", "PROFIT", "CLEAR"].includes(txType);
  const showStandardFromAndReverse = txType !== "RATE" && needsFromTo;
  const isAdjustment = txType === "ADJUSTMENT";

  const onReverseAccounts = useCallback(() => {
    if (filterSnapshot?.mutationsBlocked) return;
    const to = txToAccount;
    const from = txFromAccount;
    setTxToAccount(from);
    setTxFromAccount(to);
  }, [filterSnapshot?.mutationsBlocked, txToAccount, txFromAccount]);

  // RATE: legacy `initMiddleManAmountCalculation` — MoneyDecimal chain, middle-man then gross/net preview.
  useEffect(() => {
    if (txType !== "RATE") return;

    const clean = (v) => String(v ?? "").replace(/,/g, "").trim();

    let middleStr = "";
    try {
      const fromDec = MoneyDecimal.toDecimal(clean(rateCurrencyFromAmount) || "0", 0);
      const mmrDec = MoneyDecimal.toDecimal(clean(rateMiddlemanRate) || "0", 0);
      if (fromDec.gt(0) && mmrDec.gt(0)) {
        middleStr = formatRateAmount(fromDec.times(mmrDec).toString());
      }
    } catch {
      middleStr = "";
    }
    setRateMiddlemanAmount(middleStr);

    const parsed = parseRateExpression(rateExchangeRateRaw);
    try {
      const fromDec = MoneyDecimal.toDecimal(clean(rateCurrencyFromAmount) || "0", 0);
      if (!parsed.valid || !fromDec.gt(0)) {
        setRateCurrencyToAmount("");
        setRateToAmountGrossStr("");
        return;
      }
      const rateDec = MoneyDecimal.toDecimal(parsed.value, 0);
      if (!rateDec.gt(0)) {
        setRateCurrencyToAmount("");
        setRateToAmountGrossStr("");
        return;
      }
      const gross = fromDec.times(rateDec);
      const grossDisplayStr = formatRateAmount(gross.toString());
      setRateToAmountGrossStr(grossDisplayStr);

      let displayVal = gross;
      if (middleStr) {
        try {
          const fee = MoneyDecimal.toDecimal(middleStr.replace(/,/g, ""), 0);
          if (fee.gt(0)) displayVal = gross.minus(fee);
        } catch {
          /* ignore */
        }
      }
      setRateCurrencyToAmount(formatRateAmount(displayVal.toString()));
    } catch {
      setRateCurrencyToAmount("");
      setRateToAmountGrossStr("");
    }
  }, [txType, rateCurrencyFromAmount, rateExchangeRateRaw, rateMiddlemanRate]);

  const onRateCurrencyRowReverse = useCallback(() => {
    const tmpAmt = rateCurrencyFromAmount;
    setRateCurrencyFromAmount(rateCurrencyToAmount);
    setRateCurrencyToAmount(tmpAmt);
    const tmpGrossTo = rateToAmountGrossStr;
    setRateToAmountGrossStr(rateFromAmountGrossStr);
    setRateFromAmountGrossStr(tmpGrossTo);
  }, [rateCurrencyFromAmount, rateCurrencyToAmount, rateToAmountGrossStr, rateFromAmountGrossStr]);

  const onSubmitTx = async () => {
    if (!txConfirm) return;
    if (submitting) return;
    if (filterSnapshot?.mutationsBlocked) {
      pushToast(m.readOnlyModeCannotSubmit, "error");
      return;
    }

    const scopeApi = transactionScopeApiParams(transactionScope);
    if (!transactionScopeIsReady(transactionScope)) {
      pushToast(m.submitFailed, "error");
      return;
    }

    if (!txType) {
      pushToast(m.pleaseSelectTransactionType, "error");
      return;
    }
    if (txType === "RECEIVE") {
      pushToast(m.receiveTypeDisabled, "error");
      return;
    }

    const toId = txToAccount?.id ? String(txToAccount.id) : "";
    const fromId = txFromAccount?.id ? String(txFromAccount.id) : "";

    if (!toId) {
      pushToast(m.pleaseSelectToAccount, "error");
      return;
    }

    const needsFromTo = ["CONTRA", "PAYMENT", "CLAIM", "PROFIT", "CLEAR"].includes(txType);
    const isAdjustment = txType === "ADJUSTMENT";

    if (txType === "PROFIT") {
      if (!fromId) {
        pushToast(m.profitPleaseSelectFromAccount, "error");
        return;
      }
      if (toId && fromId && toId === fromId) {
        pushToast(m.profitSameAccountError, "error");
        return;
      }
    }

    if (needsFromTo && (!fromId || fromId === toId)) {
      pushToast(m.paymentContraEtcNeedFromAccount, "error");
      return;
    }

    if (!txDate) {
      pushToast(m.pleaseSelectTransactionDate, "error");
      return;
    }

    if (txType === "RATE") {
      const toId = rateToAccount?.id ? String(rateToAccount.id) : "";
      const fromId = rateFromAccount?.id ? String(rateFromAccount.id) : "";
      if (!toId) {
        pushToast(m.pleaseSelectToAccount, "error");
        return;
      }
      if (!fromId) {
        pushToast(m.rateTransactionNeedFromAccount, "error");
        return;
      }
      if (!rateCurrencyFrom || !rateCurrencyTo) {
        pushToast(m.pleaseSelectBothCurrencies, "error");
        return;
      }
      const fromAmt = toNumberLike(rateCurrencyFromAmount);
      const toGrossRaw = String(rateToAmountGrossStr || "").trim().replace(/,/g, "");
      const toGrossStr = toGrossRaw !== "" ? toGrossRaw : String(rateCurrencyToAmount || "").trim().replace(/,/g, "");
      const grossNum = toNumberLike(toGrossStr);
      if (!Number.isFinite(fromAmt) || fromAmt <= 0 || !Number.isFinite(grossNum) || grossNum <= 0) {
        pushToast(m.pleaseEnterValidCurrencyAmounts, "error");
        return;
      }
      const parsedRate = parseRateExpression(rateExchangeRateRaw);
      if (!parsedRate.valid) {
        pushToast(m.pleaseEnterValidRateValue, "error");
        return;
      }
      if (!rateDate) {
        pushToast(m.pleaseSelectTransactionDate, "error");
        return;
      }

      const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";

      if ((middleId || String(rateMiddlemanRate || "").trim()) && !middleId) {
        pushToast(m.pleaseSelectMiddleManAccount, "error");
        return;
      }
      if ((middleId || String(rateMiddlemanRate || "").trim()) && (!rateMiddlemanRate || Number(rateMiddlemanRate) <= 0)) {
        pushToast(m.pleaseEnterMiddleManRate, "error");
        return;
      }
      const mmrNorm = String(rateMiddlemanRate ?? "")
        .replace(/,/g, "")
        .trim();
      if (middleId && mmrNorm !== "" && countRateDecimalPlaces(mmrNorm) > 8) {
        pushToast(m.middleManRateMaxDecimals, "error");
        return;
      }

      setSubmitting(true);
      try {
        const clientRequestId = buildClientRequestId();
        const { payload } = buildRatePayload({
          toId,
          fromId,
          fromAmt: rateCurrencyFromAmount,
          toGrossStr,
          rateDate,
          txRemark,
          rateCurrencyFrom,
          rateCurrencyTo,
          parsedRateNormalizedStr: parsedRate.value,
          rateMiddlemanRate,
          rateMiddlemanAmount,
          rateMiddlemanAccount,
          rateExchangeRateRaw,
          rateFromAccount,
          rateToAccount,
          rateTransferToAccount,
          rateTransferFromAccount,
        });

        const res = await submitMutation.mutateAsync({ scopeApi, payload, clientRequestId });
        if (res?.success) {
          const approvalStatus = res?.data?.approval_status ? String(res.data.approval_status).toUpperCase() : "";
          if (approvalStatus === "PENDING") {
            pushToast(m.submittedWaitingApproval, "info");
          } else {
            pushToast(res?.message || m.rateTransactionSubmitted, "success");
          }
          await refreshContraInboxBadge(scopeApi);
          setTxConfirm(false);
          setRateCurrencyFromAmount("");
          setRateExchangeRateRaw("");
          setRateCurrencyToAmount("");
          setRateToAmountGrossStr("");
          setRateFromAmountGrossStr("");
          setRateMiddlemanRate("");
          setRateMiddlemanAmount("");
          setRateToAccount(null);
          setRateFromAccount(null);
          setRateTransferToAccount(null);
          setRateTransferFromAccount(null);
          setRateMiddlemanAccount(null);
          await onSearch({ forceRefresh: true });
          return;
        }
        pushToast(res?.message || m.submitFailed, "error");
      } catch (e) {
        console.error(e);
        pushToast(m.networkError, "error");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const cleanedAmt = MoneyDecimal.cleanMoneyInput(txAmount);
    if (cleanedAmt === "") {
      pushToast(
        isAdjustment ? m.pleaseEnterNonZeroAdjustment : m.pleaseEnterValidAmount,
        "error",
      );
      return;
    }

    let amtDec;
    try {
      amtDec = MoneyDecimal.toDecimal(cleanedAmt);
    } catch {
      pushToast(m.pleaseEnterValidAmount, "error");
      return;
    }

    const isProfitTx = txType === "PROFIT";

    if (isAdjustment && amtDec.isZero()) {
      pushToast(m.pleaseEnterNonZeroAdjustment, "error");
      return;
    }
    if (isProfitTx && amtDec.isZero()) {
      pushToast(m.profitEnterNonZeroAmount, "error");
      return;
    }
    if (!isAdjustment && !isProfitTx && amtDec.lt(0)) {
      pushToast(m.pleaseEnterValidAmountGteZero, "error");
      return;
    }

    if (!txCurrency) {
      pushToast(m.pleaseSelectCurrency, "error");
      return;
    }

    setSubmitting(true);
    try {
      const clientRequestId = buildClientRequestId();
      const payload = {
        transaction_type: isProfitTx ? (amtDec.lt(0) ? "LOSE" : "WIN") : txType,
        account_id: toId,
        from_account_id: isAdjustment ? "" : fromId || "",
        amount: isProfitTx ? MoneyDecimal.formatFixedHalfUp(amtDec.abs().toString(), 2) : txAmount,
        transaction_date: txDate,
        description: "",
        sms: txRemark,
        currency: txCurrency,
      };

      const res = await submitMutation.mutateAsync({ scopeApi, payload, clientRequestId });
      if (res?.success) {
        const approvalStatus = res?.data?.approval_status ? String(res.data.approval_status).toUpperCase() : "";
        if (approvalStatus === "PENDING") {
          pushToast(m.submittedWaitingApproval, "info");
        } else {
          pushToast(res?.message || m.transactionSubmitted, "success");
        }
        await refreshContraInboxBadge(scopeApi);
        setTxAmount("");
        setTxConfirm(false);
        await onSearch({ forceRefresh: true });
        return;
      }
      pushToast(res?.message || m.submitFailed, "error");
    } catch (e) {
      console.error(e);
      pushToast(m.networkError, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    txType,
    setTxType,
    txDate,
    setTxDate,
    txToAccount,
    setTxToAccount,
    txFromAccount,
    setTxFromAccount,
    txCurrency,
    setTxCurrency,
    txAmount,
    setTxAmount,
    txRemark,
    setTxRemark,
    txConfirm,
    setTxConfirm,
    submitting,
    setSubmitting,
    needsFromTo,
    showStandardFromAndReverse,
    isAdjustment,
    onReverseAccounts,
    rateDate,
    setRateDate,
    rateToAccount,
    setRateToAccount,
    rateFromAccount,
    setRateFromAccount,
    rateCurrencyFrom,
    setRateCurrencyFrom,
    rateCurrencyTo,
    setRateCurrencyTo,
    rateCurrencyFromAmount,
    setRateCurrencyFromAmount,
    rateExchangeRateRaw,
    setRateExchangeRateRaw,
    rateCurrencyToAmount,
    setRateCurrencyToAmount,
    onRateCurrencyRowReverse,
    rateTransferToAccount,
    setRateTransferToAccount,
    rateTransferFromAccount,
    setRateTransferFromAccount,
    rateMiddlemanAccount,
    setRateMiddlemanAccount,
    rateMiddlemanRate,
    setRateMiddlemanRate,
    rateMiddlemanAmount,
    setRateMiddlemanAmount,
    onSubmitTx,
    handleBalanceCellClick,
  };
}
