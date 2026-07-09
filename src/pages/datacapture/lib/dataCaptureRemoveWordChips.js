import { toDataCaptureWordFieldCase } from "./dataCaptureFormRules.js";

const STORAGE_PREFIX = "dc_remove_word_chips:";

export function parseRemoveWordChips(value) {
  const seen = new Set();
  const chips = [];
  for (const part of String(value || "").split(";")) {
    const word = toDataCaptureWordFieldCase(part.trim());
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(word);
  }
  return chips;
}

export function serializeRemoveWordChips(chips) {
  return parseRemoveWordChips(chips.join(";")).join(";");
}

export function mergeRemoveWordChips(...lists) {
  return parseRemoveWordChips(lists.flat().join(";"));
}

function storageKey(scopeCompanyId, processId) {
  const company = scopeCompanyId != null && Number(scopeCompanyId) > 0 ? Number(scopeCompanyId) : 0;
  const process = processId != null ? String(processId).trim() : "";
  return `${STORAGE_PREFIX}${company}:${process}`;
}

export function loadStoredRemoveWordChips(scopeCompanyId, processId) {
  if (!processId) return [];
  try {
    const raw = localStorage.getItem(storageKey(scopeCompanyId, processId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parseRemoveWordChips(parsed.join(";")) : [];
  } catch {
    return [];
  }
}

export function saveStoredRemoveWordChips(scopeCompanyId, processId, chips) {
  if (!processId) return;
  const normalized = parseRemoveWordChips(chips.join(";"));
  if (!normalized.length) {
    localStorage.removeItem(storageKey(scopeCompanyId, processId));
    return;
  }
  localStorage.setItem(storageKey(scopeCompanyId, processId), JSON.stringify(normalized));
}
