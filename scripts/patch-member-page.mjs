import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/pages/member/MemberPage.jsx");
let c = fs.readFileSync(file, "utf8");

const fixes = [
  ['accountId', 'viewAccountId'],
  ['setIsAllSelected(true);\n                      setSelectedCurrencies([]);', 'onCurrencyAll();'],
  ['onClick={() => switchCompany(company.company_id)}', 'onClick={() => switchCompany(company.company_id, company.company_code)'],
  ['onClick={() => switchAccount(acc.id)}', 'onClick={() => switchAccount(acc.id, acc.account_id, acc.name)'],
  ['setCurrencyOrder(next);\n                      persistCurrencyOrder(next);', 'persistCurrencyOrder(next);'],
  ['formatHistoryMoney', 'formatPaymentHistoryMoney'],
  ['parseMoneyToCents', 'REMOVED_PARSE'],
];

for (const [from, to] of fixes) {
  if (c.includes(from)) c = c.split(from).join(to);
}

// Currency All button - show when 0 or >1 currencies
c = c.replace(
  `{availableCurrencies.length > 0 && (
                  <button
                    type="button"
                    className={\`transaction-company-btn member-currency-all \${isAllSelected ? "active" : ""}\`}
                    onClick={() => {
                      if (isAllSelected) return;
                      onCurrencyAll();
                    }}
                  >
                    All
                  </button>
                )}`,
  `{(availableCurrencies.length === 0 || availableCurrencies.length > 1) && (
                  <button
                    type="button"
                    className={\`transaction-company-btn member-currency-all \${isAllSelected ? "active" : ""}\`}
                    onClick={onCurrencyAll}
                  >
                    All
                  </button>
                )}`,
);

c = c.replace(
  `onClick={() => {
                      setIsAllSelected(false);
                      setSelectedCurrencies((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
                    }}`,
  `onClick={() => onCurrencyToggle(code)}`,
);

// Layout header
c = c.replace(
  `<h1 className="transaction-title">Win/Loss</h1>
        <div className="transaction-main-content">
          <motionSearch className="transaction-search-section" style={{ flex: 1 }}>`,
  `<h1 className="transaction-title">Win/Loss</h1>
        <TAG className="transaction-separator-line" />
        <TAG className="transaction-main-content member-winloss-dash">
          <TAG className="transaction-search-section member-dash-unified-bar">
            <TAG className={\`member-dash-columns\${showMiniRail ? "" : " member-dash-columns--no-mini-rail"}\`}>
              <TAG className="member-dash-col member-dash-col-filters">`,
);
c = c.replace(/<TAG /g, "<div ");
c = c.replace(/<motionSearch /g, "<motionSearch "); // noop if any left

// Close filters col + add right rail before closing search section
const closeFiltersNeedle = `            </div>
          </motionSearch>`;
const closeFiltersIdx = c.indexOf(`            </motionCurrency>
          </motionSearch>`);
// find member_currency_filter closing
const currencyFilterEnd = c.indexOf(
  '            <div className="transaction-company-filter member-currency-filter"',
);
const currencySectionEnd = c.indexOf('            </div>\n          </div>\n        </motionMain>', currencyFilterEnd);
if (currencySectionEnd === -1) {
  const alt = c.indexOf('            </motionCurrency>\n          </motionSearch>', currencyFilterEnd);
}

// Insert rail after currency filter block ends
const needle = `              </div>
            </div>
          </div>
        </motionMain>`;
const railBlock = `              </div>
            </div>
              </TAG>
              {showMiniRail && (
                <TAG className="member-dash-right-rail" aria-hidden="false">
                  <TAG className="member-dash-rail-toolbar">
                    <TAG className="member-dash-mini-toolbar">
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
                    </TAG>
                  </TAG>
                  <TAG className="member-dash-rail-matrix member-dash-col member-dash-col-grid member-dash-col-split">
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
                  </TAG>
                  <TAG className="member-dash-rail-total member-dash-col member-dash-col-total-col member-dash-col-split" />
                </TAG>
              )}
            </TAG>
          </TAG>
        </TAG>`;

if (c.includes(needle)) {
  c = c.replace(needle, railBlock);
}
c = c.replace(/<TAG /g, "<motionRail "); // wrong again

fs.writeFileSync(file, c);
console.log("patched");
