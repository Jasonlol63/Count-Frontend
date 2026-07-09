import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import { useNavigate, useSearchParams } from "react-router-dom";

import { injectStylesheet } from "../../utils/core/injectStylesheet.js";

import SummaryProcessInfo from "./components/SummaryProcessInfo.jsx";

import SummaryTable, { SummaryEmptyState } from "./components/SummaryTable.jsx";

import EditFormulaModal from "./components/EditFormulaModal.jsx";

import AccountModal from "../../components/AccountModal.jsx";

import SummaryActionBar from "./components/SummaryActionBar.jsx";

import SummarySubmitBar from "./components/SummarySubmitBar.jsx";
import SummaryPageLoading from "./components/SummaryPageLoading.jsx";

import SummaryNotification from "./components/SummaryNotification.jsx";

import { useSummaryBoot } from "./hooks/useSummaryBoot.js";

import { useSummaryCaptureBootstrap } from "./hooks/useSummaryCaptureBootstrap.js";

import { useSummaryTableModel } from "./hooks/useSummaryTableModel.js";

import { useSummaryPageScroll, useSummaryRefreshPersist } from "./hooks/useSummaryRefreshPersist.js";

import { useSummaryPageActionsPure } from "./hooks/useSummaryPageActionsPure.js";

import { useSummaryEditFormulaPure } from "./hooks/useSummaryEditFormulaPure.js";

import { useSummaryAddAccount } from "./hooks/useSummaryAddAccount.js";

import SummaryConfirmDeleteModal from "./components/SummaryConfirmDeleteModal.jsx";

import { SummaryProvider, useSummaryContext } from "./context/SummaryContext.jsx";

import { dataCaptureScopeLedgerCompanyId } from "../datacapture/lib/dataCaptureScope.js";

import { clearSummaryCaptureRoundStorage } from "./lib/summaryStorage.js";

import { clearSummaryFormulaContext, bindSummaryFormulaContext } from "./lib/summaryFormulaContext.js";

import { useSummaryOverlays } from "./hooks/useSummaryOverlays.js";

import { fetchSummaryAccountList } from "./lib/summaryApi.js";
import { saveSummaryTemplatePure } from "./formula/summarySaveTemplatePure.js";
import { recalculateRowAmounts } from "./table/summaryRowAmount.js";
import { pushSummaryNotification } from "./lib/summaryNotify.js";

import { spaPath } from "../../utils/routing/pageRoutes.js";
import {

  getDataCaptureSummaryText,

  translateDataCaptureSummaryNotification,

} from "../../translateFile/pages/dataCaptureSummaryTranslate.js";



function DataCaptureSummaryPureInner() {

  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));

  const t = useCallback((key, params) => getDataCaptureSummaryText(lang, key, params), [lang]);

  const { updateRow, replaceRows, rows, dataPopulating, setAccounts, globalRateInput } =
    useSummaryContext();



  const translateNotification = useCallback(

    ({ title, message }) => translateDataCaptureSummaryNotification(lang, title, message),

    [lang]

  );



  const overlays = useSummaryOverlays({ translateNotification });



  const {

    companyId,

    captureScope,

    scopeReady,

    mutationsBlocked,

    bootLoading: sessionBootLoading,

    bootError,

  } = useSummaryBoot();



  const sessionReady = !sessionBootLoading && !bootError && scopeReady;



  const capture = useSummaryCaptureBootstrap({

    captureScope,

    companyId,

    searchParams,

    enabled: sessionReady,

  });



  const effectiveCompanyId = dataCaptureScopeLedgerCompanyId(captureScope, capture.processData);



  const { runPopulate } = useSummaryTableModel({

    enabled: sessionReady,

    tableData: capture.transformedTableData,

    hasCaptureData: capture.hasCaptureData,

    processId: capture.processId,

    processCode: capture.processCode,

    processData: capture.processData,

    companyId: effectiveCompanyId,

    captureScope,

    freshFromCapture: capture.freshFromCapture,

    serverState: capture.serverState,

    serverStateLoading: capture.serverStateLoading,

    serverStateQueryEnabled: capture.serverStateQueryEnabled,

    searchParams,

    t,

  });



  useSummaryRefreshPersist({

    captureScope,

    processId: capture.processId,

    processCode: capture.processCode,

    enabled: sessionReady && capture.hasCaptureData,

  });



  const pageActions = useSummaryPageActionsPure({

    captureScope,

    companyId: effectiveCompanyId,

    mutationsBlocked,

    t,

    processId: capture.processId,

    processCode: capture.processCode,

    runPopulate,

    showConfirmDelete: overlays.showConfirmDelete,

    showNotification: overlays.showNotification,

    tableData: capture.transformedTableData,

    replaceRows,

  });



  const editFormula = useSummaryEditFormulaPure({

    captureScope,

    companyId: effectiveCompanyId,

    processId: capture.processId,

    tableData: capture.transformedTableData,

    rows,

    replaceRows,

    t,

  });



  const refreshAccountList = useCallback(async () => {

    if (!captureScope) return;

    const accounts = await fetchSummaryAccountList(captureScope);

    setAccounts(accounts);

  }, [captureScope, setAccounts]);



  const handleAccountCreated = useCallback(

    async (newAccountId) => {

      await refreshAccountList();

      await editFormula.handleAccountCreated(newAccountId);

    },

    [refreshAccountList, editFormula.handleAccountCreated],

  );



  const addAccount = useSummaryAddAccount({

    companyId: effectiveCompanyId,

    captureScope,

    processData: capture.processData,

    notify: overlays.showNotification,

    onAccountCreated: handleAccountCreated,

  });



  useEffect(() => {

    const onStorage = (e) => {

      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");

    };

    const onLangUpdated = (e) => {

      const next = e?.detail?.lang;

      setLang(next === "zh" ? "zh" : "en");

    };

    window.addEventListener("storage", onStorage);

    window.addEventListener("eazycount:language-updated", onLangUpdated);

    return () => {

      window.removeEventListener("storage", onStorage);

      window.removeEventListener("eazycount:language-updated", onLangUpdated);

    };

  }, []);



  useLayoutEffect(() => {

    document.body.classList.remove(

      "bg",

      "account-page",

      "announcement-page",

      "transaction-page",

      "process-page",

      "datacapture-page"

    );

    document.body.classList.add("dashboard-page", "datacapture-summary-page");

    void injectStylesheet("https://fonts.googleapis.com/css?family=Amaranth").catch(() => {});



    return () => {

      document.body.classList.remove("page-ready", "datacapture-summary-page");

      clearSummaryFormulaContext();

    };

  }, []);

  useSummaryPageScroll(capture.hasCaptureData ? rows.length : 0);



  useEffect(() => {

    if (!sessionReady) return;

    bindSummaryFormulaContext({

      tableData: capture.transformedTableData,

      processData: capture.processData,

      processId: capture.processId,

      processCode: capture.processCode,

      companyId: effectiveCompanyId,

      captureScope,

      serverState: capture.serverState,

      freshFromCapture: capture.freshFromCapture,

    });

  }, [

    sessionReady,

    capture.transformedTableData,

    capture.processData,

    capture.processId,

    capture.processCode,

    capture.serverState,

    capture.freshFromCapture,

    effectiveCompanyId,

    captureScope,

  ]);



  useEffect(() => {

    function navigateToDataCaptureFresh() {

      window.isNavigatingAwayByBackOrSubmit = true;

      clearSummaryCaptureRoundStorage();

      navigate(spaPath("datacapture"), { replace: true });

    }



    let tries = 0;

    const timer = window.setInterval(() => {

      tries += 1;

      const dcSection = document.getElementById("sidebar-datacapture-section");

      const dcTitle = dcSection?.querySelector(".informationmenu-section-title");

      if (dcTitle && dcTitle.dataset.summaryFreshNavBound !== "1") {

        dcTitle.dataset.summaryFreshNavBound = "1";

        dcTitle.addEventListener(

          "click",

          (e) => {

            e.preventDefault();

            e.stopPropagation();

            navigateToDataCaptureFresh();

          },

          true

        );

        window.clearInterval(timer);

      }

      if (tries >= 50) window.clearInterval(timer);

    }, 100);



    return () => window.clearInterval(timer);

  }, [navigate]);



  const showEmptyState =
    sessionReady &&
    !capture.hasCaptureData &&
    !dataPopulating &&
    !(capture.serverStateQueryEnabled && capture.serverStateLoading);

  const showTableChrome = capture.hasCaptureData;



  const handleEditFormula = useCallback(

    (row) => {

      editFormula.showEditFormula(row);

    },

    [editFormula]

  );



  const handleNewFormula = useCallback(

    (row) => {

      editFormula.showNewFormula(row);

    },

    [editFormula]

  );



  const handleRowChange = useCallback(

    (key, patch) => {

      updateRow(key, patch);

    },

    [updateRow]

  );

  const handleInlineEditSave = useCallback(
    async (row, patch) => {
      updateRow(row.key, patch);
      const merged = recalculateRowAmounts({ ...row, ...patch }, globalRateInput);
      if (!merged.accountId || !merged.account?.trim()) return;
      try {
        const tpl = await saveSummaryTemplatePure(merged, {
          captureScope,
          companyId: effectiveCompanyId,
          processId: capture.processId,
        });
        if (!tpl.success) {
          pushSummaryNotification("Error", tpl.message || "Template save failed.", "error");
        }
      } catch (e) {
        console.warn("Inline edit template save failed:", e);
        pushSummaryNotification(
          "Error",
          String(e?.message || e) || "Template save failed.",
          "error"
        );
      }
    },
    [updateRow, globalRateInput, captureScope, effectiveCompanyId, capture.processId]
  );



  if (bootError) {

    return (

      <div className="container">

        <p role="alert" style={{ color: "#b91c1c" }}>

          {bootError}

        </p>

      </div>

    );

  }



  if (sessionBootLoading) {

    return (

      <div className="container">

        <SummaryPageLoading />

      </div>

    );

  }



  return (

    <div className="container">

      <SummaryActionBar

        t={t}

        lang={lang}

        visible={showTableChrome}

        rateInput={pageActions.rateInput}

        onRateInputChange={pageActions.setRateInput}

        rateSelectAllLabel={pageActions.rateSelectAllLabel}

        rateSelectAllRef={pageActions.rateSelectAllRef}

        onToggleRateSelectAll={pageActions.handleToggleRateSelectAll}

        onRateBatchSubmit={pageActions.handleRateBatchSubmit}

        deleteCount={pageActions.deleteCount}

        deleteDisabled={pageActions.deleteDisabled}

        onDeleteSelected={pageActions.handleDeleteSelected}

      />



      <div
        className="summary-table-container"
        id="summaryTableContainer"
        style={{ display: showTableChrome ? "block" : "none" }}
      >

        <SummaryProcessInfo t={t} processData={capture.processData} rows={rows} visible={capture.hasCaptureData} />

        <SummaryTable

          t={t}

          tableData={capture.transformedTableData}

          rows={rows}

          visible={capture.hasCaptureData}

          onRowChange={handleRowChange}

          onNewFormula={handleNewFormula}

          onEditFormula={handleEditFormula}

          onInlineEditSave={handleInlineEditSave}

          onCapturedCellClick={editFormula.open ? editFormula.onCapturedCellClick : undefined}

          globalRateInput={globalRateInput}

        />

      </div>



      {showEmptyState ? <SummaryEmptyState t={t} /> : null}



      <EditFormulaModal

        t={t}

        key={editFormula.sessionKey}

        open={editFormula.open}

        form={editFormula.form}

        accounts={editFormula.accounts}

        currencies={editFormula.currencies}

        idProductOptions={editFormula.idProductOptions}

        rowDataOptions={editFormula.rowDataOptions}

        formulaDataGridItems={editFormula.formulaDataGridItems}

        saveDisabled={editFormula.saveDisabled}
        saving={editFormula.saving}

        onAccountSelect={editFormula.handleAccountSelect}

        onClose={editFormula.closeEditFormula}

        onSave={editFormula.handleSave}

        onFormChange={editFormula.handleFormChange}

        onCalculatorPress={editFormula.handleCalculatorPress}

        onOpenAddAccount={addAccount.showAddAccount}

        onAddSelectedData={editFormula.onAddSelectedData}

        onFormulaGridItemClick={editFormula.onFormulaGridItemClick}

      />



      <AccountModal {...addAccount.accountModalProps} />



      <SummarySubmitBar

        t={t}

        visible={showTableChrome}

        submitting={pageActions.submitting}

        submitDisabled={pageActions.submitDisabled}

        refreshing={pageActions.refreshing || dataPopulating}

        onSubmit={pageActions.handleSubmitSummary}

        onBack={pageActions.handleBack}

        onRefresh={pageActions.handleRefresh}

      />



      <SummaryNotification

        notification={overlays.notification}

        shown={overlays.notificationShown}

        onClose={overlays.hideNotification}

      />



      <SummaryConfirmDeleteModal

        t={t}

        open={overlays.confirmOpen}

        message={overlays.confirmMessage}

        onCancel={overlays.closeConfirmDelete}

        onConfirm={overlays.confirmDelete}

      />

    </div>

  );

}



export default function DataCaptureSummaryPagePure() {

  return (

    <SummaryProvider>

      <DataCaptureSummaryPureInner />

    </SummaryProvider>

  );

}

