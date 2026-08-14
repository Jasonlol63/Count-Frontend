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

test("strips Excel leading/trailing apostrophes from chips", () => {
  assert.deepEqual(parseRemoveWordChips("'XX123,'XX1234"), ["XX123", "XX1234"]);
  assert.deepEqual(parseRemoveWordChips("'FREE'"), ["FREE"]);
  assert.equal(serializeRemoveWordChips(parseRemoveWordChips("'XX123,'XX1234")), "XX123,XX1234");
});

test("preserves leading = for exact-token mode", () => {
  assert.deepEqual(parseRemoveWordChips("=XX123,=XX1234"), ["=XX123", "=XX1234"]);
  assert.deepEqual(parseRemoveWordChips("='XX123"), ["=XX123"]);
  assert.equal(serializeRemoveWordChips(parseRemoveWordChips("=xx123,FREE")), "=XX123,FREE");
  assert.deepEqual(parseRemoveWordChips("NET - WIN - API="), ["NET - WIN - API="]);
});
