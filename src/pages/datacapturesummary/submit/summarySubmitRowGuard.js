import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import { resolveSubmitProcessedAmount } from "../table/summaryRowAmount.js";

const AMOUNT_EPS = "0.005";

/** Resolve row account to numeric/string id from the account list. */
export function resolveSubmitAccountId(row, accounts) {
  if (row?.accountId) return String(row.accountId);
  const text = String(row?.account || "").trim();
  if (!text || !Array.isArray(accounts)) return null;
  const found = accounts.find((a) => {
    const display = String(a.account_display || a.account || a.name || "").trim();
    const code = String(a.account_code || a.code || "").trim();
    return display === text || code === text || text.includes(`[${a.id}]`);
  });
  return found?.id != null ? String(found.id) : null;
}

function absAmount(value) {
  try {
    return MoneyDecimal.toDecimal(value, 0).abs();
  } catch {
    return MoneyDecimal.toDecimal(0, 0);
  }
}

function isNonZeroAmount(value) {
  try {
    return absAmount(value).gt(MoneyDecimal.toDecimal(AMOUNT_EPS, 0));
  } catch {
    return false;
  }
}

function rowLabel(row) {
  const id =
    row?.productType === "sub"
      ? String(row.subIdProduct || row.idProduct || "").trim()
      : String(row?.idProduct || "").trim();
  const desc = String(row?.originalDescription || "").trim();
  const account = String(row?.account || "").trim();
  const idPart = desc ? `${id} (${desc})` : id || "(unknown)";
  return account ? `${idPart} → ${account}` : idPart;
}

function rowProductKey(row) {
  const id =
    row?.productType === "sub"
      ? String(row.subIdProduct || row.idProduct || row.parentIdProduct || "").trim()
      : String(row?.idProduct || "").trim();
  const desc = String(row?.originalDescription || "")
    .trim()
    .toUpperCase();
  return `${id.toUpperCase()}||${desc}`;
}

function isCommDescription(row) {
  return /COMM/i.test(String(row?.originalDescription || ""));
}

/**
 * Classify whether a summary row will be included in the submit payload.
 * @returns {{ willSubmit: boolean, reason: null|'selectChecked'|'noAccount'|'unresolvedAccount', amount: number }}
 */
export function classifySubmitRow(row, accounts = [], globalRateInput = "") {
  const amountRaw = resolveSubmitProcessedAmount(row, globalRateInput);
  const amount = Number.isFinite(amountRaw) ? amountRaw : 0;

  if (row?.selectChecked) {
    return { willSubmit: false, reason: "selectChecked", amount };
  }
  if (!String(row?.account || "").trim()) {
    return { willSubmit: false, reason: "noAccount", amount };
  }
  if (!resolveSubmitAccountId(row, accounts)) {
    return { willSubmit: false, reason: "unresolvedAccount", amount };
  }
  return { willSubmit: true, reason: null, amount };
}

/**
 * Guard against silent drops that cause one-sided COMM / money rows.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateSubmitRowGuards(rows, accounts = [], globalRateInput = "") {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: true };
  }

  const classified = rows.map((row) => ({
    row,
    ...classifySubmitRow(row, accounts, globalRateInput),
  }));

  for (const item of classified) {
    if (item.reason === "unresolvedAccount" && isNonZeroAmount(item.amount)) {
      return {
        ok: false,
        message:
          `Cannot submit: account "${String(item.row.account || "").trim()}" on row ` +
          `"${rowLabel(item.row)}" could not be resolved. Fix the account, then submit again ` +
          `(this row would otherwise be skipped silently).`,
      };
    }
  }

  const commGroups = new Map();
  for (const item of classified) {
    if (!isCommDescription(item.row)) continue;
    if (!isNonZeroAmount(item.amount)) continue;
    const key = rowProductKey(item.row);
    if (!commGroups.has(key)) commGroups.set(key, []);
    commGroups.get(key).push(item);
  }

  for (const group of commGroups.values()) {
    if (group.length < 2) continue;
    const submitting = group.filter((g) => g.willSubmit);
    const skipped = group.filter((g) => !g.willSubmit);
    if (submitting.length === 0 || skipped.length === 0) continue;

    const includedLabels = submitting.map((g) => rowLabel(g.row)).join("; ");
    const missingLabels = skipped
      .map((g) => {
        const why =
          g.reason === "selectChecked"
            ? "checkbox excluded"
            : g.reason === "unresolvedAccount"
              ? "unresolved account"
              : g.reason === "noAccount"
                ? "no account"
                : "skipped";
        return `${rowLabel(g.row)} (${why})`;
      })
      .join("; ");

    return {
      ok: false,
      message:
        `Cannot submit: COMM split is incomplete. Included: ${includedLabels}. ` +
        `Missing: ${missingLabels}. Uncheck the exclude checkbox / fix the account on the missing ` +
        `leg(s), then submit so both sides are saved.`,
    };
  }

  return { ok: true };
}
