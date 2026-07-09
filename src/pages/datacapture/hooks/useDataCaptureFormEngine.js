import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildDateOptions,
  displayTextFromProcessRow,
  fetchAddProcessFormData,
  fetchGroupCaptureCurrencies,
  fetchProcessDetail,
  fetchProcessesByDay,
  getLocalDateString,
} from "../lib/dataCaptureApi.js";
import {
  readGroupOnlyProcessPrefs,
  saveGroupOnlyProcessPrefs,
  selectedProcessFromGroupOnlyPrefs,
} from "../lib/dataCaptureGroupOnlyProcessPersistence.js";
import { selectedProcessFromGroupOnlySession } from "../lib/dataCaptureGroupOnlyProcesses.js";
import {
  normalizeGroupOnlyDraftCurrencyId,
  restoreGroupOnlyTableDraft,
  saveGroupOnlyTableDraft,
} from "../lib/dataCaptureGroupOnlyTableDraft.js";
import { loadActiveCaptureSession } from "../lib/dataCaptureStorage.js";
import { isGroupPayrollCaptureSession } from "../../../utils/company/c168CaptureChannel.js";
import { captureTableSnapshot } from "../lib/dataCaptureTableSnapshot.js";
import { toDataCaptureWordFieldCase } from "../lib/dataCaptureFormRules.js";
import { parseRemoveWordChips, serializeRemoveWordChips } from "../lib/dataCaptureRemoveWordChips.js";
import {
  getDataCaptureState,
  registerDataCaptureRuntime,
  unregisterDataCaptureRuntime,
  callDataCaptureRuntime,
} from "../lib/dataCaptureRuntime.js";
import { getBridgeCaptureType } from "../lib/dataCaptureBridge.js";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";

function scheduleRecomputeSubmitState() {
  setTimeout(() => callDataCaptureRuntime("recomputeSubmitState"), 0);
}

function normalizeRemoveWordValue(value) {
  return serializeRemoveWordChips(parseRemoveWordChips(value));
}

const PROCESS_PLACEHOLDER = "Select Process";
/** Cap initial option nodes when list is huge (e.g. Monday with 200+ processes). */
const PROCESS_OPTIONS_RENDER_CAP = 80;

function readRestoredProcessData() {
  try {
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") !== "1") return null;
    const session = loadActiveCaptureSession();
    if (session?.processData) return session.processData;
    const raw = localStorage.getItem("capturedProcessData");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readRestoredSelectedProcess(restoredProcessData, selectedGroup = null, payrollPrefsKey = null) {
  if (isGroupPayrollCaptureSession(restoredProcessData)) {
    const prefsKey =
      payrollPrefsKey ||
      restoredProcessData.payrollPrefsKey ||
      restoredProcessData.captureSelectedGroup ||
      selectedGroup ||
      null;
    return (
      selectedProcessFromGroupOnlySession(restoredProcessData) ||
      selectedProcessFromGroupOnlyPrefs(readGroupOnlyProcessPrefs(prefsKey))
    );
  }
  if (!restoredProcessData?.process) return null;
  const pid = String(restoredProcessData.process);
  const pcode = String(restoredProcessData.processCode || restoredProcessData.process_code || "").trim();
  const pname = String(restoredProcessData.processName || restoredProcessData.process_name || "").trim();
  return {
    id: pid,
    displayText: pname || pcode || pid,
    process_id: pcode,
    description_name: null,
  };
}

function applyProcessDetailToFields(data, setters, currenciesSnapshot, applyCompanyOnlyFields = true) {
  const {
    setCurrencyId,
    setRemoveWord,
    setReplaceFrom,
    setReplaceTo,
    setRemark,
    setDescriptionDisplay,
    setSelectedDescriptions,
  } = setters;

  const pd = data || {};

  if (applyCompanyOnlyFields) {
    if (pd.remove_word) setRemoveWord(normalizeRemoveWordValue(pd.remove_word));
    if (pd.replace_word_from) setReplaceFrom(toDataCaptureWordFieldCase(pd.replace_word_from));
    if (pd.replace_word_to) setReplaceTo(toDataCaptureWordFieldCase(pd.replace_word_to));

    if (pd.description_names) {
      const arr = Array.isArray(pd.description_names) ? pd.description_names : [pd.description_names];
      setSelectedDescriptions?.(arr);
      setDescriptionDisplay(arr.join(", "));
    }
  }

  if (pd.remarks) setRemark(toDataCaptureWordFieldCase(pd.remarks));

  const currencyIdStr = pd.currency_id != null ? String(pd.currency_id) : "";
  const list = currenciesSnapshot || [];
  if (currencyIdStr && list.length) {
    const exists = list.some((c) => String(c.id) === currencyIdStr);
    if (exists) {
      setCurrencyId(currencyIdStr);
      return;
    }
  }
  if (pd.currency_warning && pd.currency_code && list.length) {
    const code = String(pd.currency_code).toUpperCase();
    const match = list.find((c) => String(c.code).toUpperCase() === code);
    if (match) setCurrencyId(String(match.id));
  }
}

function readInitialGroupOnlyPrefs(payrollPrefsKey, restoredProcessData) {
  if (isGroupPayrollCaptureSession(restoredProcessData)) return null;
  if (restoredProcessData?.process) return null;
  return readGroupOnlyProcessPrefs(payrollPrefsKey);
}

export function useDataCaptureFormEngine(
  captureScope,
  {
    applyCompanyOnlyFields = true,
    companyPayrollUi = false,
    payrollPrefsKey = null,
    payrollDraftServerSync = true,
    selectedGroup = null,
    scriptsReady = false,
  } = {},
) {
  const { setSelectedDescriptions, clearSelectedDescriptions } = useDataCaptureContext();
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const defaultDate = useMemo(() => getLocalDateString(), []);
  const restoredProcessData = useMemo(() => readRestoredProcessData(), []);
  const initialGroupOnlyPrefs = useMemo(
    () =>
      !applyCompanyOnlyFields
        ? readInitialGroupOnlyPrefs(payrollPrefsKey || selectedGroup, restoredProcessData)
        : null,
    [applyCompanyOnlyFields, payrollPrefsKey, selectedGroup, restoredProcessData]
  );

  const [captureDate, setCaptureDate] = useState(() => {
    if (restoredProcessData?.date) return restoredProcessData.date;
    if (initialGroupOnlyPrefs?.date) return initialGroupOnlyPrefs.date;
    return defaultDate;
  });
  const [currencies, setCurrencies] = useState([]);
  const currenciesRef = useRef([]);
  currenciesRef.current = currencies;

  const [processRows, setProcessRows] = useState([]);
  const processRowsRef = useRef([]);
  processRowsRef.current = processRows;
  const [currencyId, setCurrencyId] = useState(() => {
    if (restoredProcessData?.currency) return String(restoredProcessData.currency);
    if (initialGroupOnlyPrefs?.currency) return String(initialGroupOnlyPrefs.currency);
    return "";
  });
  const [replaceFrom, setReplaceFrom] = useState(() =>
    restoredProcessData?.replaceWordFrom ? toDataCaptureWordFieldCase(restoredProcessData.replaceWordFrom) : "",
  );
  const [replaceTo, setReplaceTo] = useState(() =>
    restoredProcessData?.replaceWordTo ? toDataCaptureWordFieldCase(restoredProcessData.replaceWordTo) : "",
  );
  const [removeWord, setRemoveWord] = useState(() =>
    restoredProcessData?.removeWord ? normalizeRemoveWordValue(restoredProcessData.removeWord) : "",
  );
  const [remark, setRemark] = useState(() =>
    restoredProcessData?.remark ? toDataCaptureWordFieldCase(restoredProcessData.remark) : "",
  );
  const [descriptionDisplay, setDescriptionDisplay] = useState(() =>
    Array.isArray(restoredProcessData?.descriptions) ? restoredProcessData.descriptions.join(", ") : "",
  );

  const [processOpen, setProcessOpen] = useState(false);
  const [processFilter, setProcessFilter] = useState("");
  const [selectedProcess, setSelectedProcess] = useState(() =>
    readRestoredSelectedProcess(restoredProcessData, selectedGroup, payrollPrefsKey)
  );

  const payrollPrefsKeyRef = useRef(payrollPrefsKey || selectedGroup);
  payrollPrefsKeyRef.current = payrollPrefsKey || selectedGroup;

  const selectedGroupRef = useRef(selectedGroup);
  selectedGroupRef.current = selectedGroup;
  const selectedProcessRef = useRef(selectedProcess);
  selectedProcessRef.current = selectedProcess;
  const companyId = captureScope?.scopeCompanyId ?? null;

  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const captureScopeRef = useRef(captureScope);
  captureScopeRef.current = captureScope;

  const applyCompanyOnlyFieldsRef = useRef(applyCompanyOnlyFields);
  applyCompanyOnlyFieldsRef.current = applyCompanyOnlyFields;
  const companyPayrollUiRef = useRef(companyPayrollUi);
  companyPayrollUiRef.current = companyPayrollUi;

  const usesCompanyCurrencies = () =>
    applyCompanyOnlyFieldsRef.current || companyPayrollUiRef.current;

  useLayoutEffect(() => {
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") === "1") {
      getDataCaptureState().isRestoring = true;
      if (Array.isArray(restoredProcessData?.descriptions)) {
        setSelectedDescriptions(restoredProcessData.descriptions);
      }
    }
  }, [restoredProcessData, setSelectedDescriptions]);

  const reloadProcessesForDate = useCallback(async (dateStr, options = {}) => {
    const { preserveSelection = false } = options;
    if (!applyCompanyOnlyFieldsRef.current) return;
    const cid = companyIdRef.current;
    const scope = captureScopeRef.current;
    if (!cid || !scope) return;
    const result = await fetchProcessesByDay(dateStr, scope);
    if (!result.success) return;
    const rows = Array.isArray(result.data) ? result.data : [];
    setProcessRows(rows);
    const restoring = getDataCaptureState().isRestoring === true;
    if (!preserveSelection && !restoring) {
      setSelectedProcess(null);
      setCurrencyId("");
      if (applyCompanyOnlyFieldsRef.current) {
        setRemoveWord("");
        setReplaceFrom("");
        setReplaceTo("");
        clearSelectedDescriptions();
        setDescriptionDisplay("");
      }
      setRemark("");
    }
    scheduleRecomputeSubmitState();
  }, [clearSelectedDescriptions]);

  const loadInitialForm = useCallback(async () => {
    if (!usesCompanyCurrencies()) return;
    const cid = companyIdRef.current;
    const scope = captureScopeRef.current;
    if (!cid || !scope) return;
    const result = await fetchAddProcessFormData(scope);
    if (!result.success) return;
    const list = Array.isArray(result.currencies) ? result.currencies : [];
    const norm = list.map((c) => ({
      id: String(c.id),
      code: String(c.code || "").trim().toUpperCase(),
    }));
    setCurrencies(norm);
  }, []);

  const loadGroupOnlyCurrencies = useCallback(async () => {
    if (usesCompanyCurrencies()) return;
    const viewGroup = selectedGroupRef.current
      ? String(selectedGroupRef.current).trim().toUpperCase()
      : "";
    if (!viewGroup) {
      setCurrencies([]);
      setCurrencyId("");
      return;
    }
    const list = await fetchGroupCaptureCurrencies(viewGroup);
    setCurrencies(list);
    setCurrencyId((prev) => {
      if (!prev) return "";
      return list.some((c) => String(c.id) === String(prev)) ? prev : "";
    });
  }, []);

  useEffect(() => {
    if (usesCompanyCurrencies()) {
      if (!companyId) {
        setCurrencies([]);
        return;
      }
      void loadInitialForm();
      return;
    }
    void loadGroupOnlyCurrencies();
  }, [
    companyId,
    applyCompanyOnlyFields,
    companyPayrollUi,
    selectedGroup,
    loadInitialForm,
    loadGroupOnlyCurrencies,
  ]);

  useEffect(() => {
    if (!companyId || !applyCompanyOnlyFields) return;
    if (getDataCaptureState().isRestoring) return;
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") === "1") return;
    void reloadProcessesForDate(captureDate, { preserveSelection: false });
  }, [companyId, applyCompanyOnlyFields, captureDate, reloadProcessesForDate]);

  const onDateChange = useCallback(
    (e) => {
      const v = e.target.value;
      setCaptureDate(v);
      // Defer fetch past the native <select> close + layout (avoids insertBefore issues on touch / async flush).
      const run = () => void reloadProcessesForDate(v, { preserveSelection: false });
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          queueMicrotask(run);
        });
      } else {
        queueMicrotask(run);
      }
    },
    [reloadProcessesForDate]
  );

  const persistGroupOnlyFormPrefs = useCallback(
    (processOverride = null) => {
      if (applyCompanyOnlyFieldsRef.current) return;
      const proc = processOverride || selectedProcess;
      if (!proc?.id) return;
      saveGroupOnlyProcessPrefs(payrollPrefsKeyRef.current, {
        process: proc.id,
        processCode: proc.process_id,
        processName: proc.displayText,
        currency: currencyId,
        date: captureDate,
      });
    },
    [selectedProcess, currencyId, captureDate]
  );

  const selectGroupOnlyProcess = useCallback((option) => {
    if (!option?.id) return;
    const next = {
      id: String(option.id),
      displayText: option.displayText || String(option.id),
      process_id: option.process_id || String(option.id).toUpperCase(),
      description_name: null,
    };
    const prev = selectedProcessRef.current;
    if (prev?.id && prev.id !== next.id) {
      const activeCaptureType = getBridgeCaptureType("1.Text");
      saveGroupOnlyTableDraft(
        payrollPrefsKeyRef.current,
        prev.id,
        currencyId,
        {
          tableData: captureTableSnapshot(activeCaptureType),
          captureType: activeCaptureType,
        },
        { captureScope: captureScopeRef.current, serverSync: payrollDraftServerSync },
      );
    }
    setSelectedProcess(next);
    saveGroupOnlyProcessPrefs(payrollPrefsKeyRef.current, {
      process: next.id,
      processCode: next.process_id,
      processName: next.displayText,
      currency: currencyId,
      date: captureDate,
    });
    setProcessOpen(false);
    setProcessFilter("");
    if (normalizeGroupOnlyDraftCurrencyId(currencyId)) {
      void restoreGroupOnlyTableDraft(payrollPrefsKeyRef.current, next.id, currencyId, {
        captureScope: captureScopeRef.current,
        serverSync: payrollDraftServerSync,
      });
    }
    scheduleRecomputeSubmitState();
  }, [currencyId, captureDate]);

  const selectProcessRow = useCallback(async (row) => {
    if (!applyCompanyOnlyFieldsRef.current) return;
    const displayText = displayTextFromProcessRow(row);
    setSelectedProcess({
      id: String(row.id),
      displayText,
      process_id: row.process_id,
      description_name: row.description_name || null,
    });
    setProcessOpen(false);
    setProcessFilter("");
    setRemoveWord("");
    const cid = companyIdRef.current;
    const res = await fetchProcessDetail(row.id, cid);
    if (res.success && res.data) {
      applyProcessDetailToFields(
        res.data,
        {
          setCurrencyId,
          setRemoveWord,
          setReplaceFrom,
          setReplaceTo,
          setRemark,
          setDescriptionDisplay,
          setSelectedDescriptions,
        },
        currenciesRef.current,
        applyCompanyOnlyFieldsRef.current
      );
    }
    scheduleRecomputeSubmitState();
  }, [setSelectedDescriptions]);

  const clearCompanyOnlyFields = useCallback(() => {
    setRemoveWord("");
    setReplaceFrom("");
    setReplaceTo("");
    clearSelectedDescriptions();
    setDescriptionDisplay("");
    scheduleRecomputeSubmitState();
  }, [clearSelectedDescriptions]);

  const applyGroupOnlyPrefsForGroup = useCallback((prefsKey) => {
    if (applyCompanyOnlyFieldsRef.current) return;
    const prefs = readGroupOnlyProcessPrefs(prefsKey);
    const proc = selectedProcessFromGroupOnlyPrefs(prefs);
    const prefCurrency = prefs?.currency ? String(prefs.currency) : "";
    setSelectedProcess(proc);
    if (prefCurrency) setCurrencyId(prefCurrency);
    if (prefs?.date) setCaptureDate(String(prefs.date));
    if (proc?.id && normalizeGroupOnlyDraftCurrencyId(prefCurrency)) {
      void restoreGroupOnlyTableDraft(prefsKey, proc.id, prefCurrency, {
        captureScope: captureScopeRef.current,
        serverSync: payrollDraftServerSync,
      });
    }
    scheduleRecomputeSubmitState();
  }, [payrollDraftServerSync]);

  const clearProcessSelection = useCallback(() => {
    setSelectedProcess(null);
    setCurrencyId("");
    if (applyCompanyOnlyFieldsRef.current) {
      setRemoveWord("");
      setReplaceFrom("");
      setReplaceTo("");
      clearSelectedDescriptions();
      setDescriptionDisplay("");
    }
    setRemark("");
    scheduleRecomputeSubmitState();
  }, [clearSelectedDescriptions]);

  const applyReactFormDefaults = useCallback(() => {
    const today = getLocalDateString();
    setCaptureDate(today);
    if (applyCompanyOnlyFieldsRef.current) {
      clearProcessSelection();
      void reloadProcessesForDate(today, { preserveSelection: false });
      return;
    }
    clearProcessSelection();
  }, [clearProcessSelection, reloadProcessesForDate]);

  const syncRestoreFormFromProcessData = useCallback(async (processData) => {
    if (!processData) return;
    if (processData.date) setCaptureDate(processData.date);
    if (processData.currency) setCurrencyId(String(processData.currency));
    if (processData.removeWord != null) setRemoveWord(normalizeRemoveWordValue(processData.removeWord));
    if (processData.replaceWordFrom != null) {
      setReplaceFrom(toDataCaptureWordFieldCase(processData.replaceWordFrom));
    }
    if (processData.replaceWordTo != null) setReplaceTo(toDataCaptureWordFieldCase(processData.replaceWordTo));
    if (processData.remark != null) setRemark(toDataCaptureWordFieldCase(processData.remark));
    if (processData.descriptions && Array.isArray(processData.descriptions)) {
      setSelectedDescriptions(processData.descriptions);
      setDescriptionDisplay(processData.descriptions.join(", "));
    }

    const pid = processData.process != null ? String(processData.process) : "";
    const pcode = String(processData.processCode || processData.process_code || "").trim();
    const pname = String(processData.processName || processData.process_name || "").trim();
    const rows = processRowsRef.current || [];

    if (!applyCompanyOnlyFieldsRef.current && isGroupPayrollCaptureSession(processData)) {
      const prefsKey =
        processData.payrollPrefsKey ||
        processData.captureSelectedGroup ||
        selectedGroupRef.current;
      const proc =
        selectedProcessFromGroupOnlySession(processData) ||
        selectedProcessFromGroupOnlyPrefs(readGroupOnlyProcessPrefs(prefsKey));
      if (proc) setSelectedProcess(proc);
      if (proc?.id) {
        saveGroupOnlyProcessPrefs(prefsKey, {
          process: proc.id,
          processCode: proc.process_id || pcode,
          processName: proc.displayText || pname,
          currency: processData.currency,
          date: processData.date,
        });
      }
    } else {
      let row = null;
      if (pid) row = rows.find((r) => String(r.id) === pid);
      if (!row && pcode) row = rows.find((r) => String(r.process_id || "").trim() === pcode);
      if (!row && pname) row = rows.find((r) => displayTextFromProcessRow(r) === pname);

      if (row) {
        setSelectedProcess({
          id: String(row.id),
          displayText: displayTextFromProcessRow(row),
          process_id: row.process_id,
          description_name: row.description_name || null,
        });
      } else if (pid || pcode || pname) {
        setSelectedProcess({
          id: pid || pcode,
          displayText: pname || pcode || pid,
          process_id: pcode,
          description_name: null,
        });
      }
    }

    scheduleRecomputeSubmitState();
  }, [setSelectedDescriptions, payrollDraftServerSync]);

  const confirmDescriptionsSelection = useCallback(
    (names) => {
      const arr = Array.isArray(names) ? names : [];
      setSelectedDescriptions(arr);
      setDescriptionDisplay(arr.join(", "));
      scheduleRecomputeSubmitState();
    },
    [setSelectedDescriptions],
  );

  const reloadProcesses = useCallback(async () => {
    const restoring = getDataCaptureState().isRestoring === true;
    const d =
      captureDate || document.getElementById("capture_date")?.value || getLocalDateString();
    await reloadProcessesForDate(d, { preserveSelection: restoring });
  }, [captureDate, reloadProcessesForDate]);

  const clearGroupOnlyProcessForTableReset = useCallback(() => {
    setSelectedProcess(null);
    setCurrencyId("");
  }, []);

  const applyGroupOnlyPrefsForGroupRef = useRef(() => {});

  const formRuntimeRef = useRef({});
  formRuntimeRef.current = {
    syncRestoreFormFromProcessData,
    reloadProcesses,
    applyReactFormDefaults,
    clearGroupOnlyProcessForTableReset,
    applyGroupOnlyPersistedForm: async () => {
      if (applyCompanyOnlyFieldsRef.current) return;
      const prefsKey = payrollPrefsKeyRef.current;
      if (prefsKey) applyGroupOnlyPrefsForGroupRef.current(prefsKey);
    },
  };

  useLayoutEffect(() => {
    const api = {
      syncRestoreForm: (processData) => formRuntimeRef.current.syncRestoreFormFromProcessData(processData),
      reloadProcesses: () => formRuntimeRef.current.reloadProcesses(),
      reactFormReset: () => formRuntimeRef.current.applyReactFormDefaults(),
      clearGroupOnlyProcessForTableReset: () =>
        formRuntimeRef.current.clearGroupOnlyProcessForTableReset(),
      applyGroupOnlyPersistedForm: () => formRuntimeRef.current.applyGroupOnlyPersistedForm(),
      setProcessList: (rows) => {
        startTransition(() => {
          setProcessRows(Array.isArray(rows) ? rows : []);
        });
      },
      onDescriptionsConfirmed: (descriptions) => {
        const arr = Array.isArray(descriptions) ? descriptions : [];
        setSelectedDescriptions(arr);
        setDescriptionDisplay(arr.join(", "));
        scheduleRecomputeSubmitState();
      },
    };
    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, [setSelectedDescriptions]);

  const filteredProcesses = useMemo(() => {
    const q = processFilter.trim().toLowerCase();
    if (!q) return processRows;
    return processRows.filter((r) => displayTextFromProcessRow(r).toLowerCase().includes(q));
  }, [processFilter, processRows]);

  const processListTruncated = useMemo(
    () => !processFilter.trim() && processRows.length > PROCESS_OPTIONS_RENDER_CAP,
    [processFilter, processRows.length]
  );

  const visibleProcesses = useMemo(() => {
    if (!processListTruncated) return filteredProcesses;
    return filteredProcesses.slice(0, PROCESS_OPTIONS_RENDER_CAP);
  }, [filteredProcesses, processListTruncated]);

  const processSearchInputRef = useRef(null);
  useEffect(() => {
    if (processOpen && processSearchInputRef.current) {
      const t = setTimeout(() => processSearchInputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [processOpen]);

  useEffect(() => {
    if (applyCompanyOnlyFields || !selectedGroup || !selectedProcess?.id) return;
    if (getDataCaptureState().isRestoring) return;
    persistGroupOnlyFormPrefs();
  }, [applyCompanyOnlyFields, selectedGroup, selectedProcess?.id, currencyId, captureDate, persistGroupOnlyFormPrefs]);

  /** Restore saved group-only table draft when process/currency is set and grid is ready. */
  useEffect(() => {
    if (applyCompanyOnlyFields || !selectedGroup || !selectedProcess?.id) return;
    if (!scriptsReady) return;
    if (!normalizeGroupOnlyDraftCurrencyId(currencyId)) return;
    if (getDataCaptureState().isRestoring) return;
    try {
      if (new URLSearchParams(window.location.search).get("restore") === "1") return;
    } catch {
      /* ignore */
    }
    void restoreGroupOnlyTableDraft(selectedGroup, selectedProcess.id, currencyId, {
      captureScope,
    });
  }, [
    applyCompanyOnlyFields,
    selectedGroup,
    selectedProcess?.id,
    currencyId,
    scriptsReady,
    captureScope,
  ]);

  applyGroupOnlyPrefsForGroupRef.current = applyGroupOnlyPrefsForGroup;

  return {
    dateOptions,
    captureDate,
    onDateChange,
    currencies,
    currencyId,
    setCurrencyId,
    replaceFrom,
    setReplaceFrom,
    replaceTo,
    setReplaceTo,
    removeWord,
    setRemoveWord,
    remark,
    setRemark,
    descriptionDisplay,
    processOpen,
    setProcessOpen,
    processFilter,
    setProcessFilter,
    processSearchInputRef,
    filteredProcesses,
    visibleProcesses,
    processListTruncated,
    processRowsCount: processRows.length,
    selectedProcess,
    selectProcessRow,
    selectGroupOnlyProcess,
    applyGroupOnlyPrefsForGroup,
    clearProcessSelection,
    displayTextFromProcessRow,
    clearCompanyOnlyFields,
    confirmDescriptionsSelection,
  };
}
