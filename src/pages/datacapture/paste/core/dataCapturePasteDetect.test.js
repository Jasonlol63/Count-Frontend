import test from "node:test";
import assert from "node:assert/strict";

import {
  autoDetectCaptureTypeFromPaste,
  pastedPlainTextLooksCitibetReport,
} from "./dataCapturePasteDetect.js";
import { parseCitibetFormatBasedPaste } from "../vendors/dataCaptureCitibetParsers.js";

const CITIBET_FORMAT = [
  "Downline Payment\t",
  "No.\tLvl\tUsername\tType\tTurnover\tWin",
  "1\tMA\tagent1\tMajor\t100.00\t50.00",
  "2\tAG\tagent2\tMajor\t200.00\t-10.00",
].join("\n");

test("1.TEXT auto-detect treats Citibet format Downline Payment sheets as CITIBET", () => {
  assert.equal(pastedPlainTextLooksCitibetReport(CITIBET_FORMAT), true);
  assert.ok(parseCitibetFormatBasedPaste(CITIBET_FORMAT));
  assert.equal(autoDetectCaptureTypeFromPaste(CITIBET_FORMAT), "CITIBET");
});

test("generic Excel TSV is not auto-detected as CITIBET", () => {
  const text = ["Name\tAmount", "A\t1.00", "B\t2.00"].join("\n");
  assert.equal(autoDetectCaptureTypeFromPaste(text), null);
});
