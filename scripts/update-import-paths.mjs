/**
 * One-off path updates for translateFile + utils reorganization.
 * Run: node scripts/update-import-paths.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

const replacements = [
  // translateFile
  ["translateFile/dashboardTranslate.js", "translateFile/shell/dashboardTranslate.js"],
  ["translateFile/loginTranslate.js", "translateFile/auth/authTranslate.js"],
  ["translateFile/resetPasswordTranslate.js", "translateFile/auth/authTranslate.js"],
  ["translateFile/secondaryPasswordVerifyTranslate.js", "translateFile/auth/authTranslate.js"],
  ["translateFile/maintenanceTranslate.js", "translateFile/pages/maintenanceTranslate.js"],
  ["translateFile/memberTranslate.js", "translateFile/pages/memberTranslate.js"],
  ["translateFile/domainTranslate.js", "translateFile/pages/domainTranslate.js"],
  ["translateFile/userListTranslate.js", "translateFile/pages/userListTranslate.js"],
  ["translateFile/bankProcessTranslate.js", "translateFile/pages/bankProcessTranslate.js"],
  ["translateFile/accountTranslate.js", "translateFile/pages/accountTranslate.js"],
  ["translateFile/processListTranslate.js", "translateFile/pages/processListTranslate.js"],
  ["translateFile/reportTranslate.js", "translateFile/pages/reportTranslate.js"],
  ["translateFile/transactionTranslate.js", "translateFile/pages/transactionTranslate.js"],
  ["translateFile/ownershipTranslate.js", "translateFile/pages/ownershipTranslate.js"],
  ["translateFile/announcementTranslate.js", "translateFile/pages/announcementTranslate.js"],
  // utils
  ["utils/apiUrl.js", "utils/core/apiUrl.js"],
  ["utils/injectStylesheet.js", "utils/core/injectStylesheet.js"],
  ["utils/unsetWindowProperty.js", "utils/core/unsetWindowProperty.js"],
  ["utils/useLoginLang.js", "utils/i18n/useLoginLang.js"],
  ["utils/dateUtils.js", "utils/date/dateUtils.js"],
  ["utils/maintenanceDateRangePicker.js", "utils/date/dateRangePicker.js"],
  ["utils/moneyDecimal.js", "utils/money/moneyDecimal.js"],
  ["utils/decimalEngine.js", "utils/money/decimalEngine.js"],
  ["utils/sharedCompanyFilter.js", "utils/company/sharedCompanyFilter.js"],
  ["utils/companySessionEvents.js", "utils/company/companySessionEvents.js"],
  ["utils/dashboardMerge.js", "utils/dashboard/dashboardMerge.js"],
  ["utils/frankfurterRates.js", "utils/dashboard/frankfurterRates.js"],
  ["utils/maintenanceStylesheets.js", "utils/maintenance/maintenanceStylesheets.js"],
  ["utils/dataCaptureRoundStorage.js", "utils/capture/dataCaptureRoundStorage.js"],
  ["utils/partnershipAuditReadOnly.js", "utils/audit/partnershipAuditReadOnly.js"],
  ["utils/sanitizeCapitalLettersOnly.js", "utils/input/sanitizeCapitalLettersOnly.js"],
];

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === "dist") continue;
      walk(p, files);
    } else if (/\.(js|jsx|mjs|md)$/.test(name.name)) {
      files.push(p);
    }
  }
  return files;
}

let changed = 0;
for (const file of walk(root)) {
  if (file.includes("update-import-paths.mjs")) continue;
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  for (const [from, to] of replacements) {
    text = text.split(from).join(to);
  }
  if (text !== before) {
    fs.writeFileSync(file, text);
    changed += 1;
    console.log("updated:", path.relative(root, file));
  }
}
console.log(`Done. ${changed} file(s) updated.`);
