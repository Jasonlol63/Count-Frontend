import test from "node:test";
import assert from "node:assert/strict";

import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";
import {
  looksLikePs38WinLossPlain,
  tryReshapePs38WinLossPlainMatrix,
} from "./dataCapturePs38WinLossPasteHelper.js";

const AGENT_FIELDS = [
  "1",
  "BCA10A1",
  "JH093",
  "Agent",
  "MYR",
  "153",
  "3,428.44",
  "3,094.86",
  "8.67",
  "-265.52",
  "0.00",
  "-265.52",
  "0.00",
  "8.66",
  "8.66",
  "208.43",
  "-6.80",
  "201.63",
  "55.22",
];

const TOTAL_FIELDS = [
  "Total",
  "153",
  "3,428.44",
  "3,094.86",
  "8.67",
  "-265.52",
  "0.00",
  "-265.52",
  "0.00",
  "8.66",
  "8.66",
  "208.43",
  "-6.80",
  "201.63",
  "55.22",
];

const HEADER = [
  "No.",
  "Username",
  "Name",
  "Level",
  "Currency",
  "Total Wager",
  "Turnover",
  "Volume",
  "Gross Comm",
  "Member",
  "Win/Loss",
  "Comm",
  "Total",
  "Agent",
  "Win/Loss",
  "Comm",
  "Total",
  "Master Agent",
  "Win/Loss",
  "Comm",
  "Total",
  "Company",
];

test("looksLikePs38WinLossPlain gates the div-grid one-field dump", () => {
  const pasted = [...HEADER, ...AGENT_FIELDS, ...TOTAL_FIELDS].join("\n");
  assert.equal(looksLikePs38WinLossPlain(pasted), true);
  assert.equal(looksLikePs38WinLossPlain("hello\nworld"), false);
});

test("tryReshapePs38WinLossPlainMatrix keeps No. when it was copied", () => {
  const pasted = [...HEADER, ...AGENT_FIELDS, ...TOTAL_FIELDS].join("\n");
  const matrix = tryReshapePs38WinLossPlainMatrix(pasted);
  assert.ok(matrix);
  assert.equal(matrix.length, 2);
  assert.equal(matrix[0].length, 19);
  assert.equal(matrix[0][0], "1");
  assert.equal(matrix[0][1], "BCA10A1");
  assert.equal(matrix[0][2], "JH093");
  assert.equal(matrix[0][3], "Agent");
  assert.equal(matrix[0][4], "MYR");
  assert.equal(matrix[0][5], "153");
  assert.equal(matrix[0][18], "55.22");
  assert.equal(matrix[1][0], "");
  assert.equal(matrix[1][1], "Total");
  assert.equal(matrix[1][2], "");
  assert.equal(matrix[1][3], "");
  assert.equal(matrix[1][4], "");
  assert.equal(matrix[1][5], "153");
  assert.equal(matrix[1][18], "55.22");
});

test("copy starting at Username still lines Total money with the agent row", () => {
  const agentFromUsername = AGENT_FIELDS.slice(1);
  const compactTotal = [
    "Total",
    "153",
    "3,428.44",
    "3,094.86",
    "8.67",
    "-265.52",
    "0.00",
    "-265.52",
    "0.00",
    "8.66",
    "8.66",
    "208.43",
    "-6.80",
    "201.63",
    "55.22",
  ];
  const matrix = tryReshapePs38WinLossPlainMatrix(
    [...agentFromUsername, ...compactTotal].join("\n"),
  );
  assert.equal(matrix[0][0], "BCA10A1");
  assert.equal(matrix[0].length, 18);
  assert.equal(matrix[1][0], "Total");
  assert.equal(matrix[1][4], "153");
  assert.equal(matrix[1][17], "55.22");
});

test("HTML-like TSV with empty No. on Total only does not shift columns", () => {
  const agent = AGENT_FIELDS.slice(1).join("\t");
  const total = [
    "",
    "Total",
    "153",
    "3,428.44",
    "3,094.86",
    "8.67",
    "-265.52",
    "0.00",
    "-265.52",
    "0.00",
    "8.66",
    "8.66",
    "208.43",
    "-6.80",
    "201.63",
    "55.22",
  ].join("\t");
  const matrix = tryReshapePs38WinLossPlainMatrix(`${agent}\n${total}`);
  assert.equal(matrix[0][0], "BCA10A1");
  assert.equal(matrix[1][0], "Total");
  assert.equal(matrix[1][4], matrix[0][4]);
  assert.equal(matrix[1][17], matrix[0][17]);
});

test("parsePlainTextMatrix uses the PS38 helper for 1.TEXT", () => {
  const pasted = [...AGENT_FIELDS, ...TOTAL_FIELDS].join("\n");
  const matrix = parsePlainTextMatrix(pasted);
  assert.equal(matrix.length, 2);
  assert.equal(matrix[0][0], "1");
  assert.equal(matrix[0][1], "BCA10A1");
  assert.equal(matrix[1][1], "Total");
  assert.equal(matrix[1][5], "153");
});

const MONEY_14 = AGENT_FIELDS.slice(5);

test("two agent rows plus Total keep every username and money column", () => {
  const agent2 = ["2", "AG88B2", "NICK2", "Agent", "USD", ...MONEY_14];
  const matrix = tryReshapePs38WinLossPlainMatrix(
    [...HEADER, ...AGENT_FIELDS, ...agent2, ...TOTAL_FIELDS].join("\n"),
  );
  assert.equal(matrix.length, 3);
  assert.equal(matrix[0][1], "BCA10A1");
  assert.equal(matrix[1][1], "AG88B2");
  assert.equal(matrix[1][4], "USD");
  assert.equal(matrix[2][1], "Total");
  assert.equal(matrix[2][18], "55.22");
});

const SUPERBO_AMOUNTS = ["275.10", "0.00", "-83.68", "-83.68", "0.00", "0.00", "83.68", "83.68"];

test("Superbo WinLossSimple has no Name column and must not be claimed", () => {
  const tsv = [
    ["JKR9520", "AGENT", "MYR", ...SUPERBO_AMOUNTS].join("\t"),
    ["TOTAL", "", "", ...SUPERBO_AMOUNTS].join("\t"),
  ].join("\n");
  const vertical = ["JKR9520", "AGENT", "MYR", ...SUPERBO_AMOUNTS, "TOTAL", ...SUPERBO_AMOUNTS].join(
    "\n",
  );

  assert.equal(tryReshapePs38WinLossPlainMatrix(tsv), null);
  assert.equal(tryReshapePs38WinLossPlainMatrix(vertical), null);
});

test("Superbo WinLossSimple keeps agent columns 1-4 contiguous in 1.TEXT", () => {
  const matrix = parsePlainTextMatrix(
    [
      ["JKR9520", "AGENT", "MYR", ...SUPERBO_AMOUNTS].join("\t"),
      ["TOTAL", "", "", ...SUPERBO_AMOUNTS].join("\t"),
    ].join("\n"),
  );
  assert.deepEqual(matrix[0], ["JKR9520", "AGENT", "MYR", ...SUPERBO_AMOUNTS]);
  assert.deepEqual(matrix[1], ["TOTAL", "", "", ...SUPERBO_AMOUNTS]);
});

test("usernames that are not BCA10A1-shaped still parse via Level+Currency", () => {
  const agent = ["abc123", "my nick", "Agent", "MYR", ...MONEY_14];
  const matrix = tryReshapePs38WinLossPlainMatrix([...agent, ...TOTAL_FIELDS].join("\n"));
  assert.equal(matrix[0][0], "abc123");
  assert.equal(matrix[0][1], "my nick");
  assert.equal(matrix[0][17], "55.22");
  assert.equal(matrix[1][0], "Total");
  assert.equal(matrix[1][4], "153");
});
