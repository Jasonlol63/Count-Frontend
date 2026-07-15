import test from "node:test";
import assert from "node:assert/strict";

import {
  parseRemoveWordChips,
  resolveSubmittedRemoveWordChips,
  serializeRemoveWordChips,
} from "./removeWordChips.js";

test("includes an uncommitted draft when the process form is submitted", () => {
  assert.equal(resolveSubmittedRemoveWordChips("", "test"), "TEST");
});

test("merges the draft with existing chips without duplicates", () => {
  assert.equal(resolveSubmittedRemoveWordChips("FIRST,TEST", "test"), "FIRST,TEST");
  assert.equal(resolveSubmittedRemoveWordChips("FIRST", "SECOND"), "FIRST,SECOND");
});

test("uppercases chips on parse and serialize", () => {
  assert.deepEqual(parseRemoveWordChips("Hello,World"), ["HELLO", "WORLD"]);
  assert.equal(serializeRemoveWordChips(["Hello", "mixedCase"]), "HELLO,MIXEDCASE");
});

test("dedupes chips case-insensitively", () => {
  assert.deepEqual(parseRemoveWordChips("Hello,hello,HELLO"), ["HELLO"]);
  assert.equal(resolveSubmittedRemoveWordChips("Hello", "HELLO"), "HELLO");
});

test("parses legacy semicolon values and serializes as uppercase commas", () => {
  assert.deepEqual(parseRemoveWordChips("sad;aa;aaa"), ["SAD", "AA", "AAA"]);
  assert.equal(serializeRemoveWordChips(parseRemoveWordChips("sad;aa;aaa")), "SAD,AA,AAA");
  assert.deepEqual(parseRemoveWordChips("sad, aa; aaa"), ["SAD", "AA", "AAA"]);
});
