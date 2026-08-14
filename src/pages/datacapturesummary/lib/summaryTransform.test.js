import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTextTransformations,
  applyTransformationsToTableData,
} from "./summaryTransform.js";

test("default contain strips Infinity API prefixes glued to product codes", () => {
  const remove = "NET - LOSE - API=,NET - WIN - API=";
  assert.equal(
    applyTextTransformations("NET - WIN - API=UUSLOT - UUSTR8", remove, "", ""),
    "UUSLOT - UUSTR8",
  );
  assert.equal(
    applyTextTransformations("NET - LOSE - API=MEGAH5 - MG5TR8", remove, "", ""),
    "MEGAH5 - MG5TR8",
  );
});

test("exact =WORD does not carve short codes out of longer product ids", () => {
  const remove = "=XX123,=XX1234";
  assert.equal(applyTextTransformations("XX1234", remove, "", ""), "");
  assert.equal(applyTextTransformations("XX1235", remove, "", ""), "XX1235");
  assert.equal(applyTextTransformations("XX123", remove, "", ""), "");
  assert.equal(applyTextTransformations("AAAA", remove, "", ""), "AAAA");
});

test("exact =WORD clears starred product codes without leaving digit leftovers", () => {
  const remove = "=XX123,=XX1234";
  assert.equal(applyTextTransformations("*XX123", remove, "", ""), "*");
  assert.equal(applyTextTransformations("*XX1234", remove, "", ""), "*");
  assert.equal(applyTextTransformations("*XX1235", remove, "", ""), "*XX1235");
});

test("default contain still strips English / Chinese tokens inside a phrase", () => {
  assert.equal(applyTextTransformations("PLAYER FREE BET", "FREE,BONUS", "", ""), "PLAYER  BET");
  assert.equal(applyTextTransformations("玩家免费投注", "免费", "", ""), "玩家投注");
});

test("remove word strips Excel apostrophe chips before matching", () => {
  assert.equal(applyTextTransformations("XX123", "'XX123,'XX1234", "", ""), "");
  // contain: short code still carves longer ids — use =XX123 for exact
  assert.equal(applyTextTransformations("XX1235", "'XX123,'XX1234", "", ""), "5");
  assert.equal(applyTextTransformations("XX1235", "='XX123,='XX1234", "", ""), "XX1235");
});

test("table transform: exact mode keeps XX1235; contain mode strips Infinity prefix", () => {
  const codes = {
    rows: ["AAAA", "XX123", "XX1234", "XX1235"].map((value) => [{ type: "data", value }]),
  };
  const exactOut = applyTransformationsToTableData(codes, "=XX123,=XX1234", "", "");
  assert.deepEqual(
    exactOut.rows.map((row) => row[0].value),
    ["AAAA", "", "", "XX1235"],
  );

  const infinity = {
    rows: ["NET - WIN - API=UUSLOT - UUSTR8", "NET - LOSE - API=MEGAH5 - MG5TR8"].map((value) => [
      { type: "data", value },
    ]),
  };
  const containOut = applyTransformationsToTableData(
    infinity,
    "NET - LOSE - API=,NET - WIN - API=",
    "",
    "",
  );
  assert.deepEqual(
    containOut.rows.map((row) => row[0].value),
    ["UUSLOT - UUSTR8", "MEGAH5 - MG5TR8"],
  );
});
