# Data Capture Summary page (pure React)

Route: `/datacapturesummary` (see `App.jsx`). Entry: `DataCaptureSummaryPage.jsx` → `DataCaptureSummaryPagePure.jsx`.

Upstream: `/datacapture` — `saveCaptureSession` → `localStorage` → this page for review, formula edit, and submit.

## Where to change what

| Task | Location |
|------|----------|
| Page shell + error boundary | `DataCaptureSummaryPage.jsx` |
| Session / company access | `hooks/useSummaryBoot.js` → `datacapture/lib/dataCaptureCompanyAccess.js` |
| Capture session + server prefetch | `hooks/useSummaryCaptureBootstrap.js`, `lib/summaryStorage.js`, `lib/summaryTransform.js` |
| Row state | `context/SummaryContext.jsx` |
| Table populate | `hooks/useSummaryTableModel.js`, `table/summaryTemplatePopulatePure.js` |
| Column A / row model | `table/summaryColumnAData.js`, `table/summaryRowData.js`, `table/summaryRowModel.js` |
| Submit (validate → API) | `hooks/useSummarySubmitPure.js`, `submit/buildSubmitRowsFromModel.js`, `submit/summarySubmitExecution.js` |
| Page actions (back / refresh / delete / rate) | `hooks/useSummaryPageActionsPure.js`, `lib/summaryPageActions.js`, `lib/summaryRefreshStatePure.js` |
| Edit Formula | `hooks/useSummaryEditFormulaPure.js`, `formula/editFormulaFormState.js`, `components/EditFormulaModal.jsx` |
| Formula parse / eval | `formula/summaryFormulaReference.js`, `formula/summaryFormulaEvaluate.js` |
| Template save | `formula/summarySaveTemplatePure.js` |
| Add account | `hooks/useSummaryAddAccount.js`, shared `AccountModal.jsx` |
| API | `lib/summaryApi.js` |
| Notifications | `lib/summaryNotify.js`, `lib/summaryRuntime.js`, `hooks/useSummaryOverlays.js` |
| UI chrome | `components/Summary*.jsx` |

## Folder layout

```
datacapturesummary/
  DataCaptureSummaryPage.jsx
  DataCaptureSummaryPagePure.jsx
  context/           # SummaryProvider — rows, rate, delete
  hooks/             # useSummary*Pure.js — boot, populate, submit, formula
  components/        # Summary table shell, bars, modals
  lib/               # API, storage, notify, transform, page actions
  submit/            # payload, execution, validation (from row state)
  table/             # row model, column A, template populate
  formula/           # formula engine + edit form state
```

## Contracts

- Do not change `localStorage` keys in `lib/summaryStorage.js` without updating `datacapture` submit flow.
- Cross-page navigation uses `window.isNavigatingAwayByBackOrSubmit` and `markSummaryFreshNavigation()` in session storage.
- No `js/datacapturesummary.js` — all logic lives in this package.

## Styles

- `frontend/public/css/datacapturesummary.css`, `account-list.css`, `accountCSS.css`, `userlist.css`, `global-13inch.css`
