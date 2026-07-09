# Data Capture page (React)

Route: `/datacapture` (see `App.jsx`). Entry: `DataCapturePage.jsx`.

Related: `/datacapturesummary` — `pages/datacapturesummary/` (see `datacapturesummary/README.md`).

Pure React SPA — no runtime load of `js/datacapture.js` or other legacy scripts. Cross-module APIs use `lib/dataCaptureRuntime.js` (registered by hooks), not `window.__DC_*`.

## Where to change what

| Task | Location |
|------|----------|
| Page shell, company filter, page-ready chrome | `DataCapturePage.jsx` |
| Form fields, capture type, submit/reset | `hooks/useDataCaptureFormEngine.js`, `hooks/useDataCaptureCaptureType.js`, `hooks/useDataCaptureSubmitReset.js` |
| Category / permission gates | `hooks/useDataCaptureCategoryPermissions.js` |
| Submitted process list (right panel) | `hooks/useDataCaptureSubmittedList.js` |
| Page lifecycle (first load, URL params) | `hooks/useDataCapturePageLifecycle.js` |
| Runtime registry (replaces legacy globals) | `lib/dataCaptureRuntime.js`, `lib/dataCaptureBridge.js` |
| Table section JSX | `components/DataCaptureTableSection.jsx` |
| Editable grid JSX | `components/DataCaptureGrid.jsx` |
| Grid state & lifecycle | `hooks/useDataCaptureGrid.js`, `hooks/useDataCaptureGridWindowBridges.js` |
| Grid interaction (selection, keyboard, context menu) | `hooks/useDataCapturePureReactGridInteraction.js` |
| Grid constants, row labels, active flag | `grid/dataCaptureGridMeta.js` |
| Grid DOM / keyboard / selection | `grid/dataCaptureGrid*.js`, `grid/gridCellInteraction.js` |
| Row/column CRUD on grid model | `grid/gridRowColumnModel.js` |
| Format display & format-mode paste | `hooks/useDataCaptureFormat.js`, `format/dataCaptureFormat.js` |
| Cell paste (orchestration + typed router) | `hooks/useDataCapturePaste.js` → `paste/core/dataCapturePasteHandler.js` |
| Typed capture paste (VPOWER, WBET, …) | `paste/core/dataCapturePasteHandler.js` (`TYPED_CAPTURE_TYPES`) + `paste/vendors/*` |
| Citibet auto-detect / parsers | `paste/core/dataCapturePasteDetect.js`, `paste/vendors/dataCaptureCitibet*.js` |
| Generic / HTML / text paste | `paste/core/dataCaptureGenericPaste.js`, `paste/core/dataCaptureText*.js` |
| Clipboard + HTML table helpers | `paste/core/dataCaptureClipboard.js` |
| Apply matrix to grid | `paste/core/dataCapturePasteApply.js` |
| API, storage | `lib/dataCaptureApi.js`, `lib/dataCaptureStorage.js` |
| Form validation, capture types, descriptions | `lib/dataCaptureFormRules.js` |
| Company session / games access | `lib/dataCaptureCompanyAccess.js` |
| Context menus, delete dialog, modals | `components/DataCaptureContextMenus.jsx`, `components/DataCaptureDeleteDialog.jsx`, `components/DescriptionSelectionModal.jsx` |
| Notifications | `components/ProcessNotificationContainer.jsx`, `lib/dataCaptureNotify.js` |
| Submit table conversion | `lib/dataCaptureConvertTableOnSubmit.js`, `lib/dataCaptureTableSnapshot.js` |

## Folder layout

```
datacapture/
  DataCapturePage.jsx
  context/DataCaptureContext.jsx
  hooks/                       # 12 useDataCapture*.js
  components/
  grid/
    dataCaptureGridMeta.js     # DEFAULT_GRID_*, getRowLabel, tableActive
    gridModel.js               # empty grid, resize, snapshot
    gridDomAdapter.js          # applyCellModelToElement (display sync from model)
    dataCaptureGrid*.js        # interaction modules
  format/
    dataCaptureFormat.js       # preview storage + display toggles
  lib/
    dataCaptureRuntime.js      # module-scoped registry (no window.__DC_*)
  paste/
    core/
    vendors/
```

**Add a new capture-type paste handler:** add `paste/vendors/dataCaptureXxxPaste.js`, then register in `paste/core/dataCapturePasteHandler.js` (`TYPED_CAPTURE_TYPES` + `handleTypedCapturePaste` switch).

## External imports

- `datacapturesummary/hooks/useSummaryBoot.js` → `datacapture/lib/dataCaptureCompanyAccess.js`

## Styles

- CSS: `frontend/public/css/datacapture.css`, `userlist.css`, `global-13inch.css`

## Grid architecture

- **React grid model is the single source of truth** (`DataCaptureContext.grid` + `grid/gridModel.js`).
- Cells use contentEditable for input UX; `onInput` / `onBlur` commit to the model via `updateCell`.
- Paste, undo, submit snapshot, and row/column CRUD all read/write the model — not live DOM scraping.
- `gridDomAdapter.applyCellModelToElement` only pushes model → DOM for display (paste html/styles, version bumps).
