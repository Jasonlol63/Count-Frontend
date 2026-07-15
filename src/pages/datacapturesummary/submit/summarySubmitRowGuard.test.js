import test from "node:test";
import assert from "node:assert/strict";

import {
  classifySubmitRow,
  validateSubmitRowGuards,
} from "./summarySubmitRowGuard.js";

const accounts = [
  { id: 1, account_code: "MAXBET", account_display: "MAXBET" },
  { id: 2, account_code: "CS006", account_display: "CS006 [JOEL]" },
];

function commRow(overrides) {
  return {
    productType: "sub",
    idProduct: "SB799WC011",
    subIdProduct: "SB799WC011",
    parentIdProduct: "SB799WC011",
    originalDescription: "COMM(29/6~05/7)",
    formulaDisplay: "147.75",
    formula: "147.75",
    processedAmountDisplay: "147.75",
    selectChecked: false,
    currency: "(MYR)",
    ...overrides,
  };
}

test("classifySubmitRow skips checkbox-excluded rows", () => {
  const result = classifySubmitRow(
    commRow({ account: "MAXBET", accountId: "1", selectChecked: true, processedAmountDisplay: "-147.75", formulaDisplay: "-147.75", formula: "-147.75" }),
    accounts
  );
  assert.equal(result.willSubmit, false);
  assert.equal(result.reason, "selectChecked");
});

test("validateSubmitRowGuards blocks incomplete COMM split when one leg is checkbox-excluded", () => {
  const rows = [
    commRow({
      account: "CS006 [JOEL]",
      accountId: "2",
      processedAmountDisplay: "147.75",
      formulaDisplay: "147.75",
      formula: "147.75",
    }),
    commRow({
      account: "MAXBET",
      accountId: "1",
      selectChecked: true,
      processedAmountDisplay: "-147.75",
      formulaDisplay: "-147.75",
      formula: "-147.75",
    }),
  ];
  const result = validateSubmitRowGuards(rows, accounts);
  assert.equal(result.ok, false);
  assert.match(result.message, /COMM split is incomplete/i);
  assert.match(result.message, /MAXBET/i);
  assert.match(result.message, /CS006/i);
});

test("validateSubmitRowGuards allows complete COMM split", () => {
  const rows = [
    commRow({
      account: "CS006 [JOEL]",
      accountId: "2",
      processedAmountDisplay: "147.75",
      formulaDisplay: "147.75",
      formula: "147.75",
    }),
    commRow({
      account: "MAXBET",
      accountId: "1",
      processedAmountDisplay: "-147.75",
      formulaDisplay: "-147.75",
      formula: "-147.75",
    }),
  ];
  const result = validateSubmitRowGuards(rows, accounts);
  assert.equal(result.ok, true);
});

test("validateSubmitRowGuards blocks unresolved account with non-zero amount", () => {
  const rows = [
    commRow({
      account: "UNKNOWN_ACCT",
      accountId: "",
      processedAmountDisplay: "-147.75",
      formulaDisplay: "-147.75",
      formula: "-147.75",
    }),
  ];
  const result = validateSubmitRowGuards(rows, accounts);
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be resolved/i);
});
