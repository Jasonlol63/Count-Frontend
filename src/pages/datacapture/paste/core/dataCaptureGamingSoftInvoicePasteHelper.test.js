import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeGamingSoftInvoicePlain,
  tryBuildGamingSoftInvoiceMatrix,
} from "./dataCaptureGamingSoftInvoicePasteHelper.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";

function gamingSoftInvoiceTsv(rowCount) {
  const rows = [
    "No.\tPRODUCT BRAND\t\t\t\tCUR\tRATE\tTURNOVER\tNET WIN\tEXTRA FEE",
  ];
  for (let i = 1; i <= rowCount; i += 1) {
    if (i === 92) {
      rows.push(
        `${i}\tEg:Evolution - JDCLUB9SGD\t\t\t\tR\t9.00\t(SGD) 18,474.21\t5,299.62\tEXTRA FEE\t2,187.90\t\t3.1874`,
      );
      continue;
    }
    rows.push(`${i}\tEg:Evolution - ACC${i}\t\t\t\tR\t7.00\t(MYR) 10.00\t1.25`);
  }
  rows.push("Grand Total\t\t\t\t\t\t\t(MYR) 99.00\t12.00");
  return rows.join("\n");
}

test("GamingSoft invoice helper keeps rows after EXTRA FEE width jump", () => {
  const text = gamingSoftInvoiceTsv(110);
  assert.equal(looksLikeGamingSoftInvoicePlain(text), true);
  const matrix = tryBuildGamingSoftInvoiceMatrix(text, "<table><tr><td>truncated</td></tr></table>");
  assert.equal(matrix.length, 112);
  assert.match(String(matrix[92][1]), /JDCLUB9SGD/);
  assert.equal(matrix[110][0], "110");
  assert.match(String(matrix[111][0]), /Grand Total/i);
});

test("parsePlainTextMatrix uses the GamingSoft invoice helper", () => {
  const matrix = parsePlainTextMatrix(gamingSoftInvoiceTsv(110));
  assert.equal(matrix.length, 112);
  assert.equal(matrix[110][0], "110");
});

test("PS38 Win Loss clipboard is not claimed by the invoice helper", () => {
  const text = [
    "No.\tUsername\tName\tLevel\tCurrency\tTurnover\tGross Comm",
    "1\tagent01\tA\t1\tMYR\t100.00\t1.00",
    "2\tagent02\tB\t1\tMYR\t200.00\t2.00",
  ].join("\n");
  assert.equal(looksLikeGamingSoftInvoicePlain(text), false);
  assert.equal(tryBuildGamingSoftInvoiceMatrix(text, ""), null);
});

test("C8 sparse-tab Win Loss is not claimed by the invoice helper", () => {
  const text = Array.from({ length: 40 }, (_, i) =>
    i % 5 === 0 ? `${80 + i}\tAgent\t` : `field-${i}`,
  ).join("\n");
  assert.equal(looksLikeGamingSoftInvoicePlain(text), false);
  assert.equal(tryBuildGamingSoftInvoiceMatrix(text, ""), null);
});

test("generic Net Win report with (MYR) amounts is not claimed as invoice", () => {
  const rows = ["Agent\tGame\tTurnover\tNet Win"];
  for (let i = 1; i <= 12; i += 1) {
    rows.push(`AG${i}\tSlot\t100.00\t(MYR) ${i}.00`);
  }
  const text = rows.join("\n");
  assert.equal(looksLikeGamingSoftInvoicePlain(text), false);
  assert.equal(tryBuildGamingSoftInvoiceMatrix(text, ""), null);
});
