/**
 * Games Data Capture: any process the company flags via `enable_save_draft`
 * (a checkbox on the Process List add/edit form) gets the same save-draft
 * behavior as Bank's fixed payroll processes — independent of process name.
 *
 * This lets a company tell apart two processes that share a name (e.g. an
 * external-facing BONUS and an internal-staff BONUS): whichever row has the
 * flag checked gets drafts, the other keeps the normal submit-only flow.
 *
 * Requires a numeric process id so the Bank category pill's hard-coded rows
 * (literal string ids like "salary" from BANK_PROCESSES in
 * useDataCaptureFormEngine.js) are never eligible, even if flagged somehow.
 */
import { isGroupPayrollDraftProcessId } from "./dataCaptureGroupOnlyProcesses.js";

function isRealProcessId(id) {
  return /^\d+$/.test(String(id ?? "").trim());
}

/** True for a real (numeric-id) process row with enable_save_draft checked. */
export function isGamesDraftEnabledProcess(selectedProcess) {
  if (!selectedProcess?.id || !isRealProcessId(selectedProcess.id)) return false;
  return Boolean(selectedProcess.enable_save_draft);
}

/** Company-scoped draft bucket, matching the "company:<id>" convention used for Bank/C168. */
export function gamesPayrollDraftBucket(companyId) {
  const id = Number(companyId);
  return Number.isFinite(id) && id > 0 ? `company:${id}` : "";
}

/**
 * Resolve the draft process_key for the current mode.
 * groupPayrollUi=true → Bank/AP-IG group payroll UI (fixed synthetic ids: salary/bonus/commission).
 * groupPayrollUi=false → Games company UI (the process's own numeric id, gated on enable_save_draft).
 */
export function resolvePayrollDraftProcessKey(selectedProcess, groupPayrollUi) {
  if (!selectedProcess?.id) return null;
  if (groupPayrollUi) {
    return isGroupPayrollDraftProcessId(selectedProcess.id) ? String(selectedProcess.id) : null;
  }
  return isGamesDraftEnabledProcess(selectedProcess) ? String(selectedProcess.id) : null;
}
