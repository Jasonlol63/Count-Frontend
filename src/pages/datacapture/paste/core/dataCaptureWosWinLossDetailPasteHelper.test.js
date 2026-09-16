import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeWosWinLossDetailPlain,
  tryBuildWosWinLossDetailMatrix,
} from "./dataCaptureWosWinLossDetailPasteHelper.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";
import { looksLikeKing855WinLossPlain } from "./dataCaptureKing855WinLossPasteHelper.js";

const MONEY =
  "4,544.80\t0.00\t3,000.00\t0.00\t0.00\t3,000.00\t-2,640.00\t0.00\t-2,640.00\t0.00\t0.00\t0.00\t-15.00\t0.00\t-15.00\t-345.00";

test("WOS helper merges + expand control with user id onto one row", () => {
  const text = [
    "有效投注额\t总佣金",
    `+\t198823\tJB-KENZO\t${MONEY}`,
    `Total (1)\t${MONEY}`,
  ].join("\n");
  assert.equal(looksLikeWosWinLossDetailPlain(text), true);
  const matrix = tryBuildWosWinLossDetailMatrix(text, "");
  assert.equal(matrix[0][0], "198823");
  assert.equal(matrix[0][1], "JB-KENZO");
  assert.equal(matrix[0][2], "4,544.80");
  assert.equal(matrix[1][0], "Total (1)");
  assert.equal(matrix[1][2], "4,544.80");
});

test("WOS helper reshapes plus/user/name stacked as separate lines", () => {
  const text = ["+", "198823", "JB-KENZO", ...MONEY.split("\t"), "Total (1)", ...MONEY.split("\t")].join(
    "\n",
  );
  const matrix = tryBuildWosWinLossDetailMatrix(text, "");
  assert.equal(matrix[0][0], "198823");
  assert.equal(matrix[0][1], "JB-KENZO");
  assert.equal(matrix[1][0], "Total (1)");
  assert.equal(matrix[1][2], "4,544.80");
});

test("WOS helper merges split L98823 then name+money (Chrome text/plain)", () => {
  const text = [`L98823`, `JB-KENZO\t${MONEY}`, `TOTAL (1)\t${MONEY}`].join("\n");
  assert.equal(looksLikeWosWinLossDetailPlain(text), true);
  const matrix = tryBuildWosWinLossDetailMatrix(text, "");
  assert.equal(matrix.length, 2);
  assert.equal(matrix[0][0], "L98823");
  assert.equal(matrix[0][1], "JB-KENZO");
  assert.equal(matrix[0][2], "4,544.80");
  assert.equal(matrix[0][17], "-345.00");
  assert.equal(matrix[1][0], "TOTAL (1)");
  assert.equal(matrix[1][2], "4,544.80");
});

test("parsePlainTextMatrix uses the WOS helper", () => {
  const text = [`+\t198823\tJB-KENZO\t${MONEY}`, `Total (1)\t${MONEY}`].join("\n");
  const matrix = parsePlainTextMatrix(text);
  assert.equal(matrix[0][0], "198823");
  assert.equal(matrix[0][1], "JB-KENZO");
});

test("KING855 clipboard is not claimed by the WOS helper", () => {
  const text = [
    "No.\tSenior\tName\tCurrency\tShares\tBet Counts\tValid Bet\tSenior",
    "1\t855AL\tKL ALVIN\tMYR\tView\t76\t2,212.00\t2,039.35\t-35.11\t1.75\t-0.08\t1.67",
    "Sub (MYR)\t76\t2,212.00\t2,039.35\t-35.11\t1.75\t-0.08\t1.67",
  ].join("\n");
  assert.equal(looksLikeWosWinLossDetailPlain(text), false);
  assert.equal(looksLikeKing855WinLossPlain(text), true);
  assert.equal(tryBuildWosWinLossDetailMatrix(text, ""), null);
});
