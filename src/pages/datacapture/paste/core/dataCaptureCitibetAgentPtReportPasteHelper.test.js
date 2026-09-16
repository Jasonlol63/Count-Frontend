import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeCitibetAgentPtReport,
  normalizeCitibetPtTotalRow,
  tryBuildCitibetAgentPtReportMatrix,
} from "./dataCaptureCitibetAgentPtReportPasteHelper.js";
import { tryBuildFooterOnlySubGrandMatrix } from "./dataCaptureWinLoseFooterOnlyPasteHelper.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";

const TOTAL_HTML = `
<table class="ptreport_content">
  <tr name="total_trs" class="user_oddrow_h">
    <td></td>
    <td></td>
    <td><div align="left">Total</div></td>
    <td>&nbsp;</td>
    <td>&nbsp;</td>
    <td>&nbsp;</td>
    <td>$141.38</td>
    <td>$2.63</td>
    <td>$138.75<script>associate('yy5278', '138.7511615105989', 1);</script></td>
  </tr>
</table>
`;

test("Total-only copy matches 3.CITIBET: Total in col 1, amounts in 5-7, no $", () => {
  assert.equal(looksLikeCitibetAgentPtReport("", TOTAL_HTML), true);
  const matrix = tryBuildCitibetAgentPtReportMatrix("", TOTAL_HTML);
  assert.equal(matrix.length, 1);
  assert.deepEqual(matrix[0], ["Total", "", "", "", "141.38", "2.63", "138.75"]);
  assert.equal(matrix[0].join(" ").includes("associate"), false);
});

test("Chrome text/plain Total then tabbed amounts merges into one Total row", () => {
  const text = ["Total", "\t\t\t$141.38\t$2.63\t$138.75"].join("\n");
  assert.equal(looksLikeCitibetAgentPtReport(text, ""), true);
  const matrix = tryBuildCitibetAgentPtReportMatrix(text, "");
  assert.deepEqual(matrix[0], ["Total", "", "", "", "141.38", "2.63", "138.75"]);
  assert.equal(parsePlainTextMatrix(text)[0][0], "Total");
  assert.equal(parsePlainTextMatrix(text)[0][4], "141.38");
});

test("TSV Total row missing two leading empty cells is padded", () => {
  const row = ["Total", "", "", "", "$141.38", "$2.63", "$138.75"];
  const out = normalizeCitibetPtTotalRow(row);
  assert.equal(out[2], "Total");
  assert.equal(out[6], "$141.38");
  assert.equal(out.length, 9);
});

test("Agent PT body + Total row keeps the username and the Total stays aligned", () => {
  const html = `
    <table class="ptreport_content">
      <tr>
        <td>yy5278</td><td>MA</td><td>W/P</td>
        <td>($1,421.85)</td><td>$8.08</td><td>($1,413.77)</td>
        <td>$141.38</td><td>$2.63</td><td>$138.75</td>
      </tr>
      <tr name="total_trs">
        <td></td><td></td>
        <td>Total</td>
        <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
        <td>$141.38</td><td>$2.63</td><td>$138.75</td>
      </tr>
    </table>
  `;
  const matrix = tryBuildCitibetAgentPtReportMatrix("", html);
  assert.equal(matrix.length, 2);
  assert.equal(matrix[0][0], "yy5278");
  assert.equal(matrix[0][3], "(1,421.85)");
  assert.equal(matrix[1][2], "Total");
  assert.equal(matrix[1][6], "141.38");
});

test("Citibet Downline Payment is not claimed", () => {
  const text = [
    "Downline Payment\t",
    "No.\tLvl\tUsername\tType\tTurnover\tWin",
    "1\tMA\tagent1\tMajor\t100.00\t50.00",
  ].join("\n");
  assert.equal(looksLikeCitibetAgentPtReport(text, ""), false);
  assert.equal(tryBuildCitibetAgentPtReportMatrix(text, ""), null);
});

test("fruit16 Sub/Grand footer is not claimed", () => {
  const amounts = "9\t571.00\t571.00\t1.65\t-419.80\t0.00\t377.99\t0.00";
  const text = [`SUB TOTAL\t${amounts}`, `GRAND TOTAL\t${amounts}`].join("\n");
  assert.equal(looksLikeCitibetAgentPtReport(text, ""), false);
  assert.equal(tryBuildCitibetAgentPtReportMatrix(text, ""), null);
  assert.equal(tryBuildFooterOnlySubGrandMatrix(text, "")?.length, 2);
});

test("Superbo TOTAL plus one amount is not claimed", () => {
  const text = ["TOTAL", "20,611.52"].join("\n");
  assert.equal(looksLikeCitibetAgentPtReport(text, ""), false);
  assert.equal(tryBuildCitibetAgentPtReportMatrix(text, ""), null);
});
