# Transaction list: auto-show today's 0.00-balance rows

## Problem

`/transaction` (Contra Inbox / main grid) hides accounts whose ending `balance` is
0.00 by default. That's correct for old/never-touched accounts, but it also hid an
account that **did** have a transaction posted today which happened to net to
0.00 (e.g. a CONTRA created with amount `0.00`, or Win/Loss that cleared exactly
to zero) — the row (e.g. `G-OK7`) only appeared after manually ticking
**"Show all 0 balance"**, which is meant for browsing historical 0.00 accounts,
not for surfacing today's own activity.

## Behavior now

- **Capture Date range = today only** (single day, equal to `todayDmy`): rows
  with 0.00 balance but with period Cr/Dr or Win/Loss activity (`has_crdr_transactions`
  / `has_win_loss_transactions` / `has_contra_clear_period`, i.e. `rowHasPeriodCrdr()` /
  `rowHasPeriodWinLoss()`) are shown automatically, without needing "Show Payment Only" /
  "Show Win/Loss Only" / "Show all 0 balance" ticked.
- **Any other date / range** (yesterday, a multi-day range, etc.): behavior is
  unchanged — 0.00-balance rows stay hidden unless the user manually enables
  "Show all 0 balance".
- Purely a display-layer decision — the Spring `search` endpoint already returns
  these rows (it only skips truly untouched accounts server-side, see
  `TransactionSearchServiceImpl.java` ~L197-203); no API/request changes were needed.

## Implementation

- `rowPassesHideZeroBalanceFilter(showZero, row, opts)` — added `opts.autoShowTodayActivity`:
  when true, a 0.00-balance row with period Cr/Dr or Win/Loss activity passes the filter
  (same escape hatch as `showPaymentOnly`/`showWinLossOnly`, just auto-applied instead of
  requiring the toggle). ([`lib/transactionPaymentLogic.js`](../src/pages/transaction/lib/transactionPaymentLogic.js))
- `applyTransactionDisplayFilters()` / `filterTransactionTableRows()` — thread
  `autoShowTodayActivity` through to Layer B (does not affect Layer A's
  Payment-Only/Win-Loss-Only row set).
- `countDisplayedRows()` — takes a 5th `autoShowTodayActivity` arg so the
  "found N records" toast count matches what's actually rendered.
- `hooks/useTransactionSearch.js`:
  - `isTodayOnlyRange` — `effectiveDateFrom === todayDmy && effectiveDateTo === todayDmy`.
  - `tablePresentation` memo passes `autoShowTodayActivity: !listPresentationModeActive && isTodayOnlyRange`
    into `filterTransactionTableRows` (Type Search / submit-focus already force
    `showZeroBalance: true`, so the flag is moot there).
  - `runSearch`'s `commitQuiet` computes `queryIsTodayOnlyRange` from the actual
    query dates (`queryDateFrom`/`queryDateTo` vs `todayDmy`) and passes it to
    `countDisplayedRows`.

No backend, API param, or session-cache-key changes — cache keys are already
date-range-scoped, and "today" naturally stops applying once the range rolls
past midnight or the user picks a different date.
