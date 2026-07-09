import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/pages/member/MemberPage.jsx");
const TAG = "___D___";
let c = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const needle = `            </${TAG}>
          </${TAG}>
        </${TAG}>
        <${TAG} className="member-currency-section"`.replaceAll(TAG, "motionCurrency").replaceAll("motionCurrency", "div");

const rail = `            </${TAG}>
              </${TAG}>
              {showMiniRail && (
                <${TAG} className="member-dash-right-rail" aria-hidden="false">
                  <${TAG} className="member-dash-rail-toolbar">
                    <${TAG} className="member-dash-mini-toolbar">
                      {linkedAccounts.length > 0 && (
                        <button
                          type="button"
                          className="member-dash-filter-trigger"
                          id="member_linked_filter_btn"
                          title="Choose which linked accounts appear in the grid"
                          onClick={() => setShowLinkedFilterModal(true)}
                        >
                          <i className="fas fa-filter" aria-hidden="true" />
                          <span>Accounts</span>
                        </button>
                      )}
                      <span className="member-dash-grid-curr" id="member_balance_grid_currency_line" />
                    </${TAG}>
                  </${TAG}>
                  <${TAG} className="member-dash-rail-matrix member-dash-col member-dash-col-grid member-dash-col-split">
                    <MemberMiniGrid
                      shellMode={miniGridShell}
                      currencies={miniGridShell ? MINI_GRID_SHELL_CCY : miniGridCurrencies}
                      accounts={miniGridAccounts}
                      balanceMap={miniGridBalances}
                      totalsByCu={miniGridTotals}
                      hint={miniGridHint}
                      linkedCurrenciesLoaded={linkedCurrenciesLoaded}
                      linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
                    />
                  </${TAG}>
                </${TAG}>
              )}
            </${TAG}>
          </${TAG}>
        </${TAG}>
        <${TAG} className="member-currency-section"`.replaceAll(TAG, "div");

if (!c.includes(needle)) {
  console.error("needle missing");
  process.exit(1);
}

c = c.replace(needle, rail);

if (!c.includes("MemberLinkedFilterModal")) {
  c = c.replace(
    "      <ConfirmLogoutModal",
    `      <MemberLinkedFilterModal
        open={showLinkedFilterModal}
        linkedAccounts={linkedAccounts}
        selectedIds={wlGridSelectedIds}
        onClose={() => setShowLinkedFilterModal(false)}
        onApply={applyWlGridSelection}
        onNotify={showNotification}
      />
      <ConfirmLogoutModal`,
  );
}

fs.writeFileSync(file, c);
console.log("ok");
