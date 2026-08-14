import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchProcesses,
  mapProcessesForMaintenanceSelect,
  syncEditFormDescriptionInput,
  syncEditFormFormulaInput,
  syncEditFormSourcePercent,
} from "./formulaMaintenanceLogic.js";
import { resolveFormulaMaintenanceScope } from "./formulaMaintenanceScope.js";

const editForm = {
  source_percent: "1",
  formula: "123.456789 + 234.567892",
};

test("source edit preserves decimal intermediate states and trailing zeroes", () => {
  const withDecimalPoint = syncEditFormSourcePercent(editForm, "0.");
  assert.equal(withDecimalPoint.source_percent, "0.");

  const withDecimal = syncEditFormSourcePercent(withDecimalPoint, "0.6");
  assert.equal(withDecimal.source_percent, "0.6");

  const withTrailingZero = syncEditFormSourcePercent(withDecimal, "0.60");
  assert.equal(withTrailingZero.source_percent, "0.60");
  assert.equal(withTrailingZero.formula, "123.456789 + 234.567892 * (0.6)");
});

test("source edit preserves an empty value instead of restoring one", () => {
  const cleared = syncEditFormSourcePercent(editForm, "");

  assert.equal(cleared.source_percent, "");
  assert.equal(cleared.formula, "123.456789 + 234.567892");
});

test("source edit accepts a decimal above one", () => {
  const changed = syncEditFormSourcePercent(editForm, "1.5");

  assert.equal(changed.source_percent, "1.5");
  assert.equal(changed.formula, "123.456789 + 234.567892 * (1.5)");
});

test("source edit accepts a leading decimal point", () => {
  const pointOnly = syncEditFormSourcePercent(editForm, ".");
  assert.equal(pointOnly.source_percent, ".");

  const changed = syncEditFormSourcePercent(pointOnly, ".5");
  assert.equal(changed.source_percent, ".5");
});

test("source edit rejects text, operators, spaces, and multiple decimal points", () => {
  for (const invalidValue of ["abc", "测试", "1a", "1+2", "-0.5", "1 2", "1.2.3"]) {
    const changed = syncEditFormSourcePercent(editForm, invalidValue);
    assert.strictEqual(changed, editForm);
  }
});

test("formula edit permits numeric operations and reference symbols", () => {
  const form = { ...editForm, formula: "$2 + [AAAA, 2]" };
  const changed = syncEditFormFormulaInput(form, "$2 + [AAAA, 2] * (1.5)");

  assert.equal(changed.formula, "$2 + [AAAA, 2] * (1.5)");
});

test("formula edit preserves existing reference letters but rejects new letters", () => {
  const form = { ...editForm, formula: "$2 + [AAAA, 2]" };

  assert.strictEqual(syncEditFormFormulaInput(form, "$2 + [AAAA, 2]B"), form);
  assert.strictEqual(syncEditFormFormulaInput(form, "$2 + [AAAA, 2]测试"), form);
  assert.equal(syncEditFormFormulaInput(form, "$2 + [AAA, 2]").formula, "$2 + [AAA, 2]");
});

test("description edit converts letters to uppercase", () => {
  const changed = syncEditFormDescriptionInput(
    { ...editForm, description: "" },
    "test 1 - abc",
  );

  assert.equal(changed.description, "TEST 1 - ABC");
});

test("bank-only company scope is marked as a payroll channel", () => {
  const scope = resolveFormulaMaintenanceScope({
    companies: [
      { id: 42, company_id: "CX", permissions: ["Bank"], group_id: "CX" },
    ],
    selectedGroup: "CX",
    companyId: 42,
  });

  assert.equal(scope.c168Channel, false);
  assert.equal(scope.companyPayrollChannel, true);
});

test("payroll channel exposes the fixed process list including PROFIT", async () => {
  const processes = await fetchProcesses(42, { companyPayrollChannel: true });

  assert.deepEqual(
    processes.map((process) => process.process_name),
    ["PROFIT", "SALARY", "COMMISSION", "BONUS"],
  );
});

test("PROFIT uses the same payroll display normalization as other payroll codes", () => {
  const [process] = mapProcessesForMaintenanceSelect([
    { id: 1, process_name: "PROFIT", description: "Legacy description" },
  ]);

  assert.equal(process.description, "PROFIT");
});
