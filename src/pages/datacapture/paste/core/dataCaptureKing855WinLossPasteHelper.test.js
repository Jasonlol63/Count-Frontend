import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeKing855WinLossPlain,
  tryBuildKing855WinLossMatrix,
} from "./dataCaptureKing855WinLossPasteHelper.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";
import { sanitizePasteMatrix } from "./dataCapturePasteMatrixSanitize.js";

const HEADER =
  "No.\tSenior\tName\tCurrency\tShares\tBet Counts\tTotal Bet\tValid Bet\tSenior\tWinloss\tComm\tTotal\tSuperior";
const AGENT =
  "1\t855AL\tKL ALVIN\tMYR\tView\t76\t2,212.00\t2,039.35\t-35.11\t1.75\t-0.08\t1.67\t33.43";
const SUB = "Sub (MYR)\t76\t2,212.00\t2,039.35\t-35.11\t1.75\t-0.08\t1.67\t33.43";

test("KING855 helper keeps No. and aligns Sub (MYR) under Name", () => {
  const text = [HEADER, AGENT, SUB].join("\n");
  assert.equal(looksLikeKing855WinLossPlain(text), true);
  const matrix = tryBuildKing855WinLossMatrix(text, "");
  assert.equal(matrix.length, 2);
  assert.equal(matrix[0][0], "1");
  assert.equal(matrix[0][1], "855AL");
  assert.equal(matrix[0][4], "View");
  assert.equal(matrix[1][2], "Sub (MYR)");
  assert.equal(matrix[1][5], "76");
  assert.equal(matrix[1][12], "33.43");
});

test("parsePlainTextMatrix uses the KING855 helper", () => {
  const matrix = parsePlainTextMatrix([HEADER, AGENT, SUB].join("\n"));
  assert.equal(matrix[0][0], "1");
  assert.equal(matrix[1][2], "Sub (MYR)");
  assert.equal(matrix[1][5], "76");
});

test("GamingSoft invoice is not claimed by the KING855 helper", () => {
  const text = [
    "No.\tPRODUCT BRAND\tNET WIN\tEXTRA FEE",
    "1\tEg:Evolution - ACC1\t(MYR) 10.00\tEXTRA FEE",
  ].join("\n");
  assert.equal(looksLikeKing855WinLossPlain(text), false);
  assert.equal(tryBuildKing855WinLossMatrix(text, ""), null);
});

test("sanitizePasteMatrix keeps Sub (MYR) footer", () => {
  const agent = AGENT.split("\t");
  const sub = Array.from({ length: 13 }, () => "");
  sub[2] = "Sub (MYR)";
  sub[5] = "76";
  sub[6] = "2,212.00";
  const out = sanitizePasteMatrix([agent, sub]);
  assert.equal(out.length, 2);
  assert.equal(String(out[1][2]).trim(), "Sub (MYR)");
});
