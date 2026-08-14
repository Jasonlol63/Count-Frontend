import test from "node:test";
import assert from "node:assert/strict";

import { mapGroupPayrollProcesses } from "./dataCaptureGroupOnlyProcesses.js";

test("Group maintenance process mapping always returns the fixed four payroll codes", () => {
  const processes = mapGroupPayrollProcesses([
    { id: 12, process_id: "SALARY", display_text: "SALARY" },
    { id: 14, process_id: "BONUS", display_text: "BONUS" },
    { id: 11, process_id: "PROFIT", display_text: "PROFIT" },
    { id: 13, process_id: "COMMISSION", display_text: "COMMISSION" },
  ]);

  assert.deepEqual(
    processes.map((process) => process.process),
    ["PROFIT", "SALARY", "COMMISSION", "BONUS"],
  );
  assert.deepEqual(
    processes.map((process) => process.id),
    [11, 12, 13, 14],
  );
});

test("Group maintenance process mapping keeps a code fallback when an API row is missing", () => {
  const processes = mapGroupPayrollProcesses([]);

  assert.deepEqual(
    processes.map((process) => process.id),
    ["PROFIT", "SALARY", "COMMISSION", "BONUS"],
  );
});
