/** Map Spring account list rows → Transaction page dropdown shape. */

import { normalizeAccountListItem } from "../../account/accountListApi.js";

const CATEGORY_PRIORITY = [
  "CAPITAL",
  "BANK",
  "CASH",
  "PROFIT",
  "EXPENSES",
  "COMPANY",
  "PARTNER",
  "STAFF",
  "SUPPLIER",
  "AGENT",
  "MEMBER",
  "DEBTOR",
];

export function normalizeTransactionAccountOption(row) {
  const a = normalizeAccountListItem(row);
  if (!a) return null;
  const code = String(a.account_id || "").trim();
  const name = String(a.name || "").trim();
  const role = String(a.role || "").trim().toUpperCase();
  return {
    id: a.id,
    account_id: code,
    name,
    display_text: name ? `${code} (${name})` : code,
    role,
    currency: null,
    status: a.status,
  };
}

export function deriveCategoryList(extraRoles = []) {
  const seen = new Set(CATEGORY_PRIORITY);
  const out = [...CATEGORY_PRIORITY];
  const extras = (Array.isArray(extraRoles) ? extraRoles : [])
    .map((r) => String(r || "").trim().toUpperCase())
    .filter((r) => r && !seen.has(r))
    .sort();
  for (const r of extras) {
    seen.add(r);
    out.push(r);
  }
  return out;
}

export { CATEGORY_PRIORITY };
