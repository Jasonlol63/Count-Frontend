/** Group payroll UI process choices (Data Capture group-only / company payroll channel). */

export const GROUP_PAYROLL_PROCESS_CODES = ["PROFIT", "SALARY", "COMMISSION", "BONUS"];

/** Table edits for these codes auto-save to group payroll draft storage (not PROFIT). */
export const GROUP_PAYROLL_DRAFT_PROCESS_CODES = ["SALARY", "COMMISSION", "BONUS"];

/** @deprecated alias — use GROUP_PAYROLL_PROCESS_CODES */
export const GROUP_ONLY_PROCESS_CODES = GROUP_PAYROLL_PROCESS_CODES;

const toIdSet = (codes) => new Set(codes.map((code) => code.toLowerCase()));

export const GROUP_PAYROLL_PROCESS_IDS = toIdSet(GROUP_PAYROLL_PROCESS_CODES);
export const GROUP_PAYROLL_DRAFT_PROCESS_IDS = toIdSet(GROUP_PAYROLL_DRAFT_PROCESS_CODES);

/** @deprecated alias */
export const GROUP_ONLY_PROCESS_IDS = GROUP_PAYROLL_PROCESS_IDS;

export function isGroupPayrollProcessId(id) {
  return GROUP_PAYROLL_PROCESS_IDS.has(String(id || "").toLowerCase());
}

/** @deprecated alias */
export function isGroupOnlyProcessId(id) {
  return isGroupPayrollProcessId(id);
}

export function isGroupPayrollDraftProcessId(id) {
  return GROUP_PAYROLL_DRAFT_PROCESS_IDS.has(String(id || "").toLowerCase());
}

/** Group payroll Process dropdown labels: uppercase codes only (no "1." / "2." prefix). */
export function getGroupOnlyProcessOptions() {
  return GROUP_PAYROLL_PROCESS_CODES.map((code) => ({
    id: code.toLowerCase(),
    process_id: code,
    displayText: code,
  }));
}

/**
 * Map saved capture session process fields to dropdown shape (salary/commission/bonus/profit ids).
 * Submit stores API numeric process id; dropdown uses lowercase code ids.
 */
export function selectedProcessFromGroupOnlySession(processData) {
  if (!processData) return null;
  const options = getGroupOnlyProcessOptions();
  const pcode = String(processData.processCode || processData.process_code || "")
    .trim()
    .toUpperCase();
  if (pcode) {
    const byCode = options.find((o) => o.process_id === pcode);
    if (byCode) {
      return {
        id: byCode.id,
        displayText: byCode.displayText,
        process_id: byCode.process_id,
        description_name: null,
      };
    }
  }
  const rawPid = processData.process != null ? String(processData.process) : "";
  if (isGroupPayrollProcessId(rawPid)) {
    const byId = options.find((o) => o.id === rawPid.toLowerCase());
    if (byId) {
      return {
        id: byId.id,
        displayText: byId.displayText,
        process_id: byId.process_id,
        description_name: null,
      };
    }
  }
  const pname = String(processData.processName || processData.process_name || "")
    .trim()
    .toUpperCase();
  if (pname) {
    const byName = options.find((o) => o.process_id === pname || o.displayText === pname);
    if (byName) {
      return {
        id: byName.id,
        displayText: byName.displayText,
        process_id: byName.process_id,
        description_name: null,
      };
    }
  }
  return null;
}
