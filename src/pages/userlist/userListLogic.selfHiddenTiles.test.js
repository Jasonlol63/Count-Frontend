import test from "node:test";
import assert from "node:assert/strict";
import { mergeModalAccountsWithGranted, mergeModalProcessesWithGranted } from "./userListLogic.js";

test("self-hidden compact grants without labels become empty tiles (catalog hidden)", () => {
  const merged = mergeModalAccountsWithGranted([], [{ id: 10, self_hidden: true }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 10);
  assert.equal(merged[0].account_id, "");
  assert.equal(merged[0].name, "");
});

test("self-hidden grants keep codes/names when Acc list API returns empty", () => {
  const merged = mergeModalAccountsWithGranted([], [
    { id: 10, account_id: "JK-ACC", name: "JK Bank", self_hidden: true },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].account_id, "JK-ACC");
  assert.equal(merged[0].name, "JK Bank");
});

test("labeled grants fill missing catalog fields without duplicating tiles", () => {
  const merged = mergeModalAccountsWithGranted(
    [{ id: 10, account_id: "", name: "" }],
    [{ id: 10, account_id: "JK-ACC", name: "JK Bank", self_hidden: true }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].account_id, "JK-ACC");
  assert.equal(merged[0].name, "JK Bank");
});

test("self-hidden process grants keep codes when process list API returns empty", () => {
  const merged = mergeModalProcessesWithGranted([], [
    { id: 7, process_id: "P1", description: "Deposit", self_hidden: true },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].process_id, "P1");
  assert.equal(merged[0].description, "Deposit");
});
