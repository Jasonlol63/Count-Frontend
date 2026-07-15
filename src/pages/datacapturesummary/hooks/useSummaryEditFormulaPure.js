import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchSummaryFormCatalog } from "../lib/summaryApi.js";
import {
  addSelectedDescriptionToForm,
  applyCalculatorToForm,
  formatSummaryAccountDisplay,
  buildFormulaDataGridItems,
  buildFormulaSavePatchFromForm,
  buildIdProductSelectOptions,
  buildRowDataOptionsForIdProduct,
  computeFormulaDisplayPreview,
  createBlankEditFormulaForm,
  insertCapturedCellIntoForm,
  resolveDefaultDescriptionSelects,
  rowToEditFormulaForm,
} from "../formula/editFormulaFormState.js";
import { applyFormulaSaveToRows } from "../formula/summaryFormulaSaveTarget.js";
import { saveSummaryTemplatePure } from "../formula/summarySaveTemplatePure.js";
import {
  resequenceSubOrdersInRows,
  syncSubOrderTemplates,
} from "../table/summarySubOrderResequence.js";
import { pushSummaryNotification } from "../lib/summaryNotify.js";
import { removeSuppressedRow } from "../lib/summarySuppressedRows.js";
import {
  applyTenantLedgerToParams,
  LEDGER_GROUP,
  resolvePageLedgerScope,
} from "../../../utils/company/tenantLedgerParams.js";

function resolveEditFormulaLedgerScope(captureScope, companyId) {
  const groupId = String(captureScope?.groupId || "")
    .trim()
    .toUpperCase();
  const isGroupLedger =
    captureScope?.mode === "group" &&
    (captureScope?.resolveCompanyViaGroupId || Number(captureScope?.scopeCompanyId ?? 0) <= 0);

  if (isGroupLedger && groupId) {
    return { ledger: LEDGER_GROUP, groupId, companyId: null };
  }

  return resolvePageLedgerScope({
    groupOnly: false,
    selectedGroup: groupId || null,
    companyId: companyId != null && Number(companyId) > 0 ? Number(companyId) : null,
  });
}

function normalizeAccountCurrencyRow(c) {
  const id = c?.currency_id ?? c?.id;
  const code = c?.currency_code ?? c?.code;
  return {
    id,
    code,
    currency_id: id,
    currency_code: code,
    is_linked: c?.is_linked != null ? !!c.is_linked : true,
  };
}

function pickDefaultAccountCurrency(list, preferredCurrencyId = null) {
  if (!Array.isArray(list) || !list.length) return null;

  if (preferredCurrencyId) {
    const preferred = list.find((c) => String(c.id) === String(preferredCurrencyId));
    if (preferred) return preferred;
  }

  const linked = list.filter((c) => c.is_linked);
  const pool = linked.length ? linked : list;
  if (pool.length === 1) return pool[0];

  const myr = pool.find((c) => String(c.code || "").trim().toUpperCase() === "MYR");
  if (myr) return myr;

  return pool[0];
}

async function fetchAccountCurrencies(accountId, captureScope, companyId) {
  if (!accountId) return [];
  const params = new URLSearchParams({ action: "get_account_currencies" });
  params.set("account_id", String(accountId));
  applyTenantLedgerToParams(params, resolveEditFormulaLedgerScope(captureScope, companyId));
  const response = await fetch(
    buildApiUrl(`api/accounts/account_currency_api.php?${params.toString()}`),
    { credentials: "include" }
  );
  const json = await response.json();
  if (json.success && Array.isArray(json.data)) {
    return json.data.map(normalizeAccountCurrencyRow);
  }
  return [];
}

/**
 * Pure React Edit Formula — controlled form state, no DOM bridges.
 */
export function useSummaryEditFormulaPure({
  captureScope,
  companyId,
  processId,
  tableData,
  rows,
  replaceRows,
  t,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("edit");
  const [sessionKey, setSessionKey] = useState(0);
  const [form, setForm] = useState(null);
  const [anchorRow, setAnchorRow] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const anchorRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const idProductSelectOptions = useMemo(
    () => buildIdProductSelectOptions(tableData),
    [tableData]
  );

  const rowDataOptions = useMemo(() => {
    if (!form?.descriptionSelect1) return [];
    return buildRowDataOptionsForIdProduct(tableData, form.descriptionSelect1);
  }, [tableData, form?.descriptionSelect1]);

  const formulaDataGridItems = useMemo(
    () => (open && anchorRow ? buildFormulaDataGridItems(tableData, anchorRow) : []),
    [tableData, anchorRow, open]
  );

  const handleFormChange = useCallback(
    (nextFormOrUpdater) => {
      setForm((prev) => {
        const nextForm =
          typeof nextFormOrUpdater === "function"
            ? nextFormOrUpdater(prev || {})
            : nextFormOrUpdater;
        let patched = nextForm;
        if (nextForm?.descriptionSelect1 !== prev?.descriptionSelect1) {
          const opts = buildRowDataOptionsForIdProduct(tableData, nextForm.descriptionSelect1);
          patched = {
            ...nextForm,
            descriptionSelect2: opts[0]?.value || "",
          };
        }
        return computeFormulaDisplayPreview(patched, anchorRef.current || {});
      });
    },
    [tableData]
  );

  const loadCurrenciesForAccount = useCallback(
    async (accountId, preferredCurrencyId = null) => {
      if (!accountId) return;
      try {
        const list = await fetchAccountCurrencies(accountId, captureScope, companyId);
        setCurrencies(list);
        const picked = pickDefaultAccountCurrency(list, preferredCurrencyId);
        setForm((prev) => {
          if (!prev) return prev;
          if (!picked) {
            return { ...prev, currencyId: "", currencyLabel: "" };
          }
          return {
            ...prev,
            currencyId: String(picked.id),
            currencyLabel: String(picked.code || ""),
          };
        });
      } catch (e) {
        console.warn("Failed to load account currencies:", e);
      }
    },
    [captureScope, companyId]
  );

  const handleAccountSelect = useCallback(
    (accountId) => {
      setCurrencies([]);
      void loadCurrenciesForAccount(accountId);
    },
    [loadCurrenciesForAccount]
  );

  const handleAccountCreated = useCallback(
    async (newAccountId) => {
      if (!open || !captureScope) return;
      try {
        const catalog = await fetchSummaryFormCatalog(captureScope);
        const next = catalog.accounts || [];
        setAccounts(next);
        if (!newAccountId) return;
        const match = next.find((a) => String(a.id) === String(newAccountId));
        if (!match) return;
        const id = String(match.id);
        const label = formatSummaryAccountDisplay(match, id);
        setForm((prev) => (prev ? { ...prev, accountId: id, accountText: label } : prev));
        void loadCurrenciesForAccount(id);
      } catch (e) {
        console.error("Account list refresh after create failed:", e);
      }
    },
    [open, captureScope, loadCurrenciesForAccount]
  );

  const closeEditFormula = useCallback(() => {
    setOpen(false);
    setForm(null);
    setAnchorRow(null);
    anchorRef.current = null;
    document.body.style.overflow = "";
  }, []);

  const openFormulaSession = useCallback(
    (row, nextMode) => {
      if (!row) return;
      anchorRef.current = row;
      setAnchorRow(row);
      setMode(nextMode);
      setSessionKey((k) => k + 1);
      const initial =
        nextMode === "new" ? createBlankEditFormulaForm(row) : rowToEditFormulaForm(row);
      const dataDefaults = resolveDefaultDescriptionSelects(tableData, row);
      setForm(
        computeFormulaDisplayPreview(
          { ...initial, ...dataDefaults },
          row
        )
      );
      setOpen(true);
      document.body.style.overflow = "hidden";
      if (initial.accountId) {
        void loadCurrenciesForAccount(initial.accountId, initial.currencyId);
      }
    },
    [loadCurrenciesForAccount, tableData]
  );

  const showEditFormula = useCallback(
    (row) => {
      openFormulaSession(row, "edit");
    },
    [openFormulaSession]
  );

  const showNewFormula = useCallback(
    (row) => {
      openFormulaSession(row, "new");
    },
    [openFormulaSession]
  );

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    void (async () => {
      try {
        const catalog = await fetchSummaryFormCatalog(captureScope);
        if (!alive) return;
        setAccounts(catalog.accounts || []);
        if (!anchorRef.current?.accountId) {
          setCurrencies(catalog.currencies || []);
        }
      } catch (e) {
        console.error("Edit formula catalog load failed:", e);
        pushSummaryNotification("Error", String(e?.message || e), "error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, sessionKey, captureScope]);

  const handleCalculatorPress = useCallback((payload) => {
    setForm((prev) => {
      if (!prev) return prev;
      return applyCalculatorToForm(prev, payload, anchorRef.current || {});
    });
  }, []);

  const handleAddSelectedData = useCallback(() => {
    setForm((prev) => {
      if (!prev) return prev;
      const result = addSelectedDescriptionToForm(prev, tableData, anchorRef.current || {});
      if (!result.ok) {
        pushSummaryNotification("Info", "Please select row data first.", "info");
        return prev;
      }
      return result.form;
    });
  }, [tableData]);

  const insertCapturedCellValue = useCallback((cellMeta) => {
    setForm((prev) => {
      if (!prev) return prev;
      const result = insertCapturedCellIntoForm(prev, cellMeta, anchorRef.current || {});
      if (!result.ok) {
        if (result.reason === "no_numbers") {
          pushSummaryNotification("Info", "No numbers or symbols were found in the cell.", "info");
        }
        return prev;
      }
      return result.form;
    });
  }, []);

  const handleCapturedCellClick = useCallback(
    (cellMeta) => {
      if (!open || !form) {
        pushSummaryNotification("Info", "Please Open Edit Formula", "info");
        return;
      }
      insertCapturedCellValue(cellMeta);
    },
    [open, form, insertCapturedCellValue]
  );

  const handleFormulaGridItemClick = useCallback(
    (item) => {
      if (!open || !form || !item) return;
      insertCapturedCellValue({
        idProduct: item.idProduct,
        rowLabel: item.rowLabel,
        rowIndex: item.rowIndex,
        displayColumnIndex: item.columnIndex,
        dataColumnIndex: Math.max(0, item.columnIndex - 1),
        value: item.value,
      });
    },
    [open, form, insertCapturedCellValue]
  );

  const handleSave = useCallback(async (formSnapshot) => {
    if (saveInFlightRef.current) return;
    const anchor = anchorRef.current;
    const formToSave = formSnapshot || form;
    if (!anchor || !formToSave) return;

    saveInFlightRef.current = true;
    setSaving(true);
    try {

    const result = buildFormulaSavePatchFromForm(formToSave, anchor);
    if (!result.ok) {
      pushSummaryNotification("Error", result.message, "error");
      return;
    }

    const applied = applyFormulaSaveToRows(rows, anchor, mode, result.patch);
    let nextRows = applied.rows;
    const targetRow = applied.targetRow;

    if (targetRow?.productType === "sub" || applied.action === "insertSub") {
      const parentId = targetRow?.parentIdProduct || anchor.idProduct;
      nextRows = resequenceSubOrdersInRows(nextRows, parentId);
    }
    replaceRows(nextRows);

    if (targetRow) {
      removeSuppressedRow(targetRow);
      const hasFormula =
        String(targetRow.formulaOperators || targetRow.formulaDisplay || result.patch?.formulaOperators || "")
          .trim() !== "";
      const isEmptyNewSub = applied.action === "insertSub" && !hasFormula;
      if (!isEmptyNewSub) {
        try {
          const rowToSave = nextRows.find((r) => r.key === targetRow.key) || targetRow;
          const tpl = await saveSummaryTemplatePure(rowToSave, {
            captureScope,
            companyId,
            processId,
          });
          if (!tpl.success) {
            pushSummaryNotification(
              "Error",
              tpl.message || "Template save failed.",
              "error"
            );
            return;
          }
          if (tpl.templateId || tpl.templateKey || tpl.formulaVariant != null) {
            nextRows = nextRows.map((r) =>
              r.key === targetRow.key
                ? {
                    ...r,
                    templateId: tpl.templateId ?? r.templateId,
                    templateKey: tpl.templateKey ?? r.templateKey,
                    formulaVariant: tpl.formulaVariant ?? r.formulaVariant,
                  }
                : r
            );
            replaceRows(nextRows);
          }
          if (targetRow.productType === "sub" || applied.action === "insertSub") {
            const parentId = targetRow.parentIdProduct || anchor.idProduct;
            await syncSubOrderTemplates(nextRows, parentId, (row) =>
              saveSummaryTemplatePure(row, { captureScope, companyId, processId })
            );
          }
        } catch (e) {
          console.warn("Template save failed:", e);
          pushSummaryNotification(
            "Error",
            String(e?.message || e) || "Template save failed.",
            "error"
          );
          return;
        }
      }
    }

    pushSummaryNotification(t("success") || "Success", t("formulaSaved") || "Formula saved.", "success");
    closeEditFormula();
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [
    form,
    rows,
    mode,
    replaceRows,
    captureScope,
    companyId,
    processId,
    closeEditFormula,
    t,
  ]);

  const saveDisabled =
    !form?.currencyId?.trim() || !form?.accountId?.trim() || !String(form?.formula || "").trim();

  return {
    open,
    sessionKey,
    form,
    accounts,
    currencies,
    idProductOptions: idProductSelectOptions,
    rowDataOptions,
    formulaDataGridItems,
    saveDisabled,
    saving,
    rowKey: anchorRef.current?.key ?? null,
    productValue: anchorRef.current?.idProduct || "",
    showEditFormula,
    showNewFormula,
    closeEditFormula,
    handleFormChange,
    handleAccountSelect,
    handleAccountCreated,
    handleSave,
    handleCalculatorPress,
    onAddSelectedData: handleAddSelectedData,
    onCapturedCellClick: handleCapturedCellClick,
    onFormulaGridItemClick: handleFormulaGridItemClick,
  };
}
