import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { buildTemplateKey } from "../formula/summarySaveTemplatePure.js";
import { addSuppressedRows } from "../lib/summarySuppressedRows.js";
import {
  clearRowEditableFields,
  shouldClearSummaryRowOnDelete,
} from "../table/summaryRowData.js";
import {
  mapRowsWithAmountRecalc,
  recalculateRowAmounts,
} from "../table/summaryRowAmount.js";

const SummaryContext = createContext(null);

export function SummaryProvider({ children, initialRows = [] }) {
  const [rows, setRows] = useState(initialRows);
  const [dataPopulating, setDataPopulating] = useState(false);
  const [tableChromeVisible, setTableChromeVisible] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [globalRateInput, setGlobalRateInputState] = useState("");
  const rowsRef = useRef(rows);
  const globalRateInputRef = useRef(globalRateInput);
  rowsRef.current = rows;
  globalRateInputRef.current = globalRateInput;

  const replaceRows = useCallback((next) => {
    flushSync(() => {
      const list = Array.isArray(next) ? next : [];
      setRows(mapRowsWithAmountRecalc(list, globalRateInputRef.current));
    });
  }, []);

  const setGlobalRateInput = useCallback((value) => {
    const next = String(value ?? "");
    globalRateInputRef.current = next;
    setGlobalRateInputState(next);
    setRows((prev) => {
      let changed = false;
      const mapped = prev.map((row) => {
        if (!row.rateChecked || !row.account?.trim()) return row;
        changed = true;
        let merged = { ...row };
        if (next.trim()) merged.rateValue = next.trim();
        return recalculateRowAmounts(merged, next);
      });
      return changed ? mapped : prev;
    });
  }, []);

  const updateRow = useCallback((key, patch) => {
    if (!key) return;
    flushSync(() => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.key !== key) return row;
          let merged = { ...row, ...patch };
          if (patch.rateChecked === true) {
            const globalRate = globalRateInputRef.current.trim();
            if (globalRate && !String(merged.rateValue || "").trim()) {
              merged.rateValue = globalRate;
            }
          } else if (patch.rateChecked === false) {
            merged.rateValue = "";
          }
          return recalculateRowAmounts(merged, globalRateInputRef.current);
        })
      );
    });
  }, []);

  const updateRows = useCallback((predicate, patchFn) => {
    flushSync(() => {
      setRows((prev) =>
        prev.map((row) => {
          if (!predicate(row)) return row;
          const merged = { ...row, ...patchFn(row) };
          return recalculateRowAmounts(merged, globalRateInputRef.current);
        })
      );
    });
  }, []);

  const resetToRows = useCallback(
    (next) => {
      replaceRows(next);
    },
    [replaceRows]
  );

  const deleteSelectedRows = useCallback((explicitRows = null) => {
    const currentRows = rowsRef.current;
    const selected =
      Array.isArray(explicitRows) && explicitRows.length
        ? explicitRows
        : currentRows.filter((r) => r.deleteChecked);
    const selectedKeys = new Set(selected.map((r) => r.key).filter(Boolean));

    const selectedSubRowsToRemove = new Set();
    const selectedMainRowsToClear = new Set();
    const templatesToDelete = [];
    const suppressedForStorage = [];

    for (const row of selected) {
      if (!row?.key || !selectedKeys.has(row.key)) continue;
      if (shouldClearSummaryRowOnDelete(row, currentRows)) {
        selectedMainRowsToClear.add(row.key);
        // Suppress as MAIN skeleton so refresh won't re-apply a deleted formula.
        suppressedForStorage.push({
          ...row,
          productType: "main",
          idProduct: String(row.parentIdProduct || row.idProduct || "").trim() || row.idProduct,
          subOrder: null,
        });
      } else {
        selectedSubRowsToRemove.add(row.key);
        suppressedForStorage.push(row);
      }
      const templateKey = row.templateKey || buildTemplateKey(row) || row.idProduct;
      if (templateKey || row.templateId) {
        templatesToDelete.push({
          templateKey,
          templateId: row.templateId,
          formulaVariant: row.formulaVariant,
          productType: shouldClearSummaryRowOnDelete(row, currentRows) ? "main" : "sub",
        });
      }
    }

    if (suppressedForStorage.length) {
      addSuppressedRows(suppressedForStorage);
    }

    let nextRows = currentRows;
    const beforeCount = currentRows.length;
    flushSync(() => {
      setRows((prev) => {
        let next = prev.filter((row) => !selectedSubRowsToRemove.has(row.key));
        next = next.map((row) => {
          if (!selectedMainRowsToClear.has(row.key)) return row;
          return {
            ...clearRowEditableFields(row, { asMainSkeleton: true }),
            deleteChecked: false,
          };
        });
        nextRows = mapRowsWithAmountRecalc(next, globalRateInputRef.current);
        return nextRows;
      });
    });
    return {
      removed: Math.max(selectedSubRowsToRemove.size, beforeCount - nextRows.length),
      cleared: selectedMainRowsToClear.size,
      templatesToDelete,
      nextRows,
    };
  }, []);

  const toggleAllRate = useCallback(
    (checked) => {
      updateRows(
        (row) => row.account?.trim(),
        (row) => {
          if (!checked) {
            return { rateChecked: false, rateValue: "" };
          }
          const patch = { rateChecked: true };
          const globalRate = globalRateInputRef.current.trim();
          if (globalRate && !String(row.rateValue || "").trim()) {
            patch.rateValue = globalRate;
          }
          return patch;
        }
      );
    },
    [updateRows]
  );

  /** @returns {number} rows updated */
  const applyRateBatch = useCallback((rateInput) => {
    const raw = String(rateInput || "").trim();
    if (!raw) return 0;
    let count = 0;
    flushSync(() => {
      setRows((prev) =>
        prev.map((row) => {
          if (!row.rateChecked || !row.account?.trim()) return row;
          count += 1;
          const merged = { ...row, rateValue: raw, rateChecked: false };
          return recalculateRowAmounts(merged, "");
        })
      );
    });
    return count;
  }, []);

  const value = useMemo(
    () => ({
      rows,
      dataPopulating,
      setDataPopulating,
      tableChromeVisible,
      setTableChromeVisible,
      accounts,
      setAccounts,
      globalRateInput,
      setGlobalRateInput,
      replaceRows,
      updateRow,
      resetToRows,
      deleteSelectedRows,
      toggleAllRate,
      applyRateBatch,
    }),
    [
      rows,
      dataPopulating,
      tableChromeVisible,
      accounts,
      globalRateInput,
      setGlobalRateInput,
      replaceRows,
      updateRow,
      resetToRows,
      deleteSelectedRows,
      toggleAllRate,
      applyRateBatch,
    ]
  );

  return <SummaryContext.Provider value={value}>{children}</SummaryContext.Provider>;
}

export function useSummaryContext() {
  const ctx = useContext(SummaryContext);
  if (!ctx) {
    throw new Error("useSummaryContext must be used within SummaryProvider");
  }
  return ctx;
}
