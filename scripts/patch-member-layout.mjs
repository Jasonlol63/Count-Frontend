import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/pages/member/MemberPage.jsx");
let c = fs.readFileSync(file, "utf8");

c = c.replace(
  `<h1 className="transaction-title">Win/Loss</h1>
        <div className="transaction-main-content">
          <div className="transaction-search-section" style={{ flex: 1 }}>`,
  `<h1 className="transaction-title">Win/Loss</h1>
        <div className="transaction-separator-line" />
        <motionMain className="transaction-main-content member-winloss-dash">
          <motionSearch className="transaction-search-section member-dash-unified-bar">
            <motionCols className={\`member-dash-columns\${showMiniRail ? "" : " member-dash-columns--no-mini-rail"}\`}>
              <motionColF className="member-dash-col member-dash-col-filters">`,
);

const railInsert = `            </div>
              </motionColF>
              {showMiniRail && (
                <motionRail className="member-dash-right-rail" aria-hidden="false">
                  <motionToolbar className="member-dash-rail-toolbar">
                    <motionMini className="member-dash-mini-toolbar">
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
                    </motionMini>
                  </motionToolbar>
                  <motionMatrix className="member-dash-rail-matrix member-dash-col member-dash-col-grid member-dash-col-split">
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
                  </motionMatrix>
                  <motionTotalCol className="member-dash-rail-total member-dash-col member-dash-col-total-col member-dash-col-split" />
                </motionRail>
              )}
            </motionCols>
          </motionSearch>
        </motionMain>`;

const oldClose = `            </div>
          </div>
        </motionMain>`;
if (c.includes(oldClose)) {
  c = c.replace(oldClose, railInsert);
} else {
  const alt = `            </div>
          </div>
        </div>`;
  c = c.replace(alt, railInsert);
}

const tagMap = {
  motionMain: "motionMain",
  motionSearch: "motionSearch",
  motionCols: "motionCols",
  motionColF: "motionColF",
  motionRail: "motionRail",
  motionToolbar: "motionToolbar",
  motionMini: "motionMini",
  motionMatrix: "motionMatrix",
  motionTotalCol: "motionTotalCol",
};
for (const [tag] of Object.entries(tagMap)) {
  c = c.replace(new RegExp(`<${tag} `, "g"), "<div ");
  c = c.replace(new RegExp(`</${tag}>`, "g"), "</div>");
}

const modal = `
      <MemberLinkedFilterModal
        open={showLinkedFilterModal}
        linkedAccounts={linkedAccounts}
        selectedIds={wlGridSelectedIds}
        onClose={() => setShowLinkedFilterModal(false)}
        onApply={applyWlGridSelection}
        onNotify={showNotification}
      />
`;

if (!c.includes("MemberLinkedFilterModal")) {
  c = c.replace("<ConfirmLogoutModal", `${modal}\n      <ConfirmLogoutModal`);
}

fs.writeFileSync(file, c);
console.log("layout patched");
