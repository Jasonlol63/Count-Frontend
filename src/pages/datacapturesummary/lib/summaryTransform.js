/** Text transforms applied to captured grid before summary rows are built. */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyTextTransformations(text, removeWord, replaceWordFrom, replaceWordTo) {
  if (!text || typeof text !== "string") return text;

  let result = text;

  if (removeWord && removeWord.trim() !== "") {
    const wordsToRemove = removeWord
      .split(/[,;]+/)
      .map((word) => word.trim())
      .filter((word) => word !== "");
    wordsToRemove.forEach((word) => {
      const removeRegex = new RegExp(escapeRegex(word), "gi");
      result = result.replace(removeRegex, "");
    });
  }

  if (replaceWordFrom && replaceWordFrom.trim() !== "" && replaceWordTo !== undefined) {
    const replaceRegex = new RegExp(escapeRegex(replaceWordFrom.trim()), "gi");
    result = result.replace(replaceRegex, replaceWordTo);
  }

  return result.trim();
}

export function applyTransformationsToTableData(tableData, removeWord, replaceWordFrom, replaceWordTo) {
  const transformedData = JSON.parse(JSON.stringify(tableData));

  if (transformedData.rows?.length > 0) {
    transformedData.rows.forEach((row) => {
      row.forEach((cell) => {
        if (cell.type === "data" && cell.value) {
          cell.value = applyTextTransformations(
            cell.value,
            removeWord,
            replaceWordFrom,
            replaceWordTo
          );
        }
      });
    });
  }

  return transformedData;
}

/** Normalize process metadata from capturedProcessData localStorage blob. */
export function parseSummaryProcessMeta(processData) {
  if (!processData || typeof processData !== "object") {
    return { processId: null, processCode: null, processData: null };
  }

  let processCodeRaw = processData.processCode ?? processData.process_code ?? "";
  let processCode =
    typeof processCodeRaw === "string" && processCodeRaw.trim() !== ""
      ? processCodeRaw.trim().toUpperCase()
      : null;

  const rawProcess =
    processData.process ?? processData.processId ?? processData.process_id ?? null;
  const parsed = rawProcess != null ? Number.parseInt(String(rawProcess), 10) : Number.NaN;
  const processId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  // Bank four-code session may keep code in processName / string process id.
  if (!processCode) {
    const fromName = String(processData.processName || "").trim().toUpperCase();
    if (["PROFIT", "SALARY", "COMMISSION", "BONUS"].includes(fromName)) {
      processCode = fromName;
    } else if (typeof rawProcess === "string") {
      const fromRaw = rawProcess.trim().toUpperCase();
      if (["PROFIT", "SALARY", "COMMISSION", "BONUS"].includes(fromRaw)) {
        processCode = fromRaw;
      }
    }
  }

  const normalized = { ...processData, processCode };
  if (processId != null) {
    normalized.process = processId;
  } else if (rawProcess != null && !Number.isFinite(Number(rawProcess))) {
    normalized.process = null;
  }

  return { processId, processCode, processData: normalized };
}

export function formatSummaryProcessDescriptions(processData) {
  if (!processData) return "-";
  if (Array.isArray(processData.descriptions) && processData.descriptions.length > 0) {
    return processData.descriptions.join(", ");
  }
  return "-";
}

export function formatSummaryProcessCurrency(processData) {
  if (!processData) return "-";
  const value = processData.currencyName || processData.currency;
  return value != null && String(value).trim() !== "" ? String(value).trim() : "-";
}

/** Summary header: prefer display label, then business code, then numeric process pk. */
export function formatSummaryProcessLabel(processData) {
  if (!processData || typeof processData !== "object") return "-";
  const name = String(processData.processName || "").trim();
  if (name) return name;
  const code = String(processData.processCode ?? processData.process_code ?? "").trim();
  if (code) return code;
  const pk = processData.process ?? processData.processId ?? processData.process_id;
  return pk != null && String(pk).trim() !== "" ? String(pk).trim() : "-";
}
