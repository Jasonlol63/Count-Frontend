import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "../src/pages/member/MemberPage.jsx");
let c = fs.readFileSync(file, "utf8");

const start = c.indexOf('        <h1 className="transaction-title">Win/Loss</h1>');
const end = c.indexOf('        <div className="member-currency-section"');
if (start === -1 || end === -1) {
  console.error("markers not found", start, end);
  process.exit(1);
}

const replacement = `        <h1 className="transaction-title">Win/Loss</h1>
        <motionSep className="transaction-separator-line" />
        <motionMain className="transaction-main-content member-winloss-dash">
          <motionSearch className="transaction-search-section member-dash-unified-bar">
            <motionCols className={\`member-dash-columns\${showMiniRail ? "" : " member-dash-columns--no-mini-rail"}\`}>
              <motionColF className="member-dash-col member-dash-col-filters">
`;

c = c.slice(0, start) + replacement + c.slice(c.indexOf('            <motionForm', end) !== -1 ? c.indexOf('            <motionForm', end) : c.indexOf('            <div className="transaction-form-group"', end));

// Fix motion* placeholders to div
c = c.replace(/<motionSep /g, "<div ");
c = c.replace(/<motionMain /g, "<motionMain ".replace("motionMain", "div")); // wrong

fs.writeFileSync(file, c);
