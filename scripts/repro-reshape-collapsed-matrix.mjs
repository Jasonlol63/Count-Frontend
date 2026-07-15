import { parseHTML } from "linkedom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.Node = window.Node;

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { reshapeCollapsedFormatMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);

const collapsed = [
  [
    {
      value:
        "SDSPDA95\n2,881\n$0.00\n$4,378.65\n$4,378.65\n$3,000\n$4,378.65\n$0.00\n$1,000.00",
    },
    { value: "" },
    { value: "" },
  ],
  [
    {
      value:
        "SUBTOTAL\n2,881\n$0.00\n$4,378.65\n$4,378.65\n$3,000\n$4,378.65\n$0.00\n$1,000.00",
    },
    { value: "" },
    { value: "" },
  ],
  [
    {
      value:
        "TOTAL AMOUNT\n2,881\n$0.00\n$4,378.65\n$4,378.65\n$3,000\n$4,378.65\n$0.00\n$1,000.00",
    },
    { value: "" },
    { value: "" },
  ],
];

const out = reshapeCollapsedFormatMatrix(collapsed);
const cols = out[0]?.length || 0;
const ok = out.length === 3 && cols >= 8;
console.log(ok ? "PASS" : "FAIL", `reshape -> ${out.length}x${cols}`);
out.forEach((r, i) => console.log(" ", i, r.map((c) => c.value).slice(0, 4)));
if (!ok) process.exit(1);
