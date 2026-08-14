import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTypeAheadState,
  isTypeAheadKey,
  matchTypeAheadIndex,
  resetTypeAheadState,
} from "./typeAheadMatch.js";

/** Mirrors Add User Role SimpleSelect labels (en) — includes Partnership like live. */
const ROLE_LABELS = [
  "Select Role",
  "Partnership",
  "Admin",
  "Manager",
  "Supervisor",
  "Accountant",
  "Audit",
  "Customer Service",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("typeAheadMatch", () => {
  it("isTypeAheadKey accepts single printable chars", () => {
    assert.equal(isTypeAheadKey("a"), true);
    assert.equal(isTypeAheadKey("1"), true);
    assert.equal(isTypeAheadKey(" "), false);
    assert.equal(isTypeAheadKey("Enter"), false);
    assert.equal(isTypeAheadKey("ArrowDown"), false);
  });

  it("jumps to first label starting with typed letter", () => {
    const state = createTypeAheadState();
    const labels = ["Alpha", "Beta", "Charlie", "Delta"];
    assert.equal(matchTypeAheadIndex(labels, "c", state), 2);
  });

  it("cycles same letter across matching options", () => {
    const state = createTypeAheadState();
    const labels = ["Apple", "Apricot", "Banana"];
    assert.equal(matchTypeAheadIndex(labels, "a", state), 0);
    assert.equal(matchTypeAheadIndex(labels, "a", state), 1);
    assert.equal(matchTypeAheadIndex(labels, "a", state), 0);
  });

  it("resetTypeAheadState clears buffer", () => {
    const state = createTypeAheadState();
    matchTypeAheadIndex(["Foo", "Bar"], "f", state);
    resetTypeAheadState(state);
    assert.equal(state.buffer, "");
    assert.equal(state.lastIndex, -1);
  });
});

describe("typeAheadMatch — first-letter only (Role)", () => {
  it("A jumps to Admin", () => {
    const state = createTypeAheadState();
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "a", state)], "Admin");
  });

  it("A then C switches to Customer Service (not stuck on AC/Accountant)", () => {
    const state = createTypeAheadState();
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "a", state)], "Admin");
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "c", state)], "Customer Service");
    assert.equal(state.buffer, "c");
  });

  it("A A A cycles Admin → Accountant → Audit, then C → Customer Service", () => {
    const state = createTypeAheadState();
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "a", state)], "Admin");
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "a", state)], "Accountant");
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "a", state)], "Audit");
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "c", state)], "Customer Service");
  });

  it("C alone jumps to Customer Service", () => {
    const state = createTypeAheadState();
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "c", state)], "Customer Service");
  });

  it("after reset, same letter starts from first match again", async () => {
    const state = createTypeAheadState();
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "a", state)], "Admin");
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "a", state)], "Accountant");
    await sleep(850);
    assert.equal(state.lastKey, "");
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "a", state)], "Admin");
  });

  it("unknown letter returns -1", () => {
    const state = createTypeAheadState();
    assert.equal(matchTypeAheadIndex(ROLE_LABELS, "z", state), -1);
  });

  it("S cycles Select Role → Supervisor", () => {
    const state = createTypeAheadState();
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "s", state)], "Select Role");
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "s", state)], "Supervisor");
    assert.equal(ROLE_LABELS[matchTypeAheadIndex(ROLE_LABELS, "s", state)], "Select Role");
  });

  it("zh role labels: Latin A/C do not match", () => {
    const zh = ["选择角色", "管理员", "经理", "主管", "会计", "审计", "客服"];
    const state = createTypeAheadState();
    assert.equal(matchTypeAheadIndex(zh, "a", state), -1);
    assert.equal(matchTypeAheadIndex(zh, "c", state), -1);
  });
});
