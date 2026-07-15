function normalizeRemoveWordToken(value) {
  return String(value ?? "").trim().toUpperCase();
}

/** Split on comma or legacy semicolon; store uppercase. */
export function parseRemoveWordChips(value) {
  const seen = new Set();
  const chips = [];
  for (const part of String(value || "").split(/[,;]+/)) {
    const word = normalizeRemoveWordToken(part);
    if (!word) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    chips.push(word);
  }
  return chips;
}

/** Persist as `FREE,BONUS` (comma, no spaces, uppercase). */
export function serializeRemoveWordChips(chips) {
  const list = Array.isArray(chips) ? chips : parseRemoveWordChips(chips);
  return parseRemoveWordChips(list.join(",")).join(",");
}

export function mergeRemoveWordChips(...lists) {
  return parseRemoveWordChips(lists.flat().join(","));
}

export function resolveSubmittedRemoveWordChips(value, draft) {
  return serializeRemoveWordChips(mergeRemoveWordChips(value, draft));
}

const STORAGE_PREFIX = "dc_remove_word_chips:";

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
    return Array.isArray(parsed) ? parseRemoveWordChips(parsed.join(",")) : [];
  } catch {
    return [];
  }
}

export function saveStoredRemoveWordChips(scopeCompanyId, processId, chips) {
  if (!processId) return;
  const normalized = parseRemoveWordChips(chips.join(","));
  if (!normalized.length) {
    localStorage.removeItem(storageKey(scopeCompanyId, processId));
    return;
  }
  localStorage.setItem(storageKey(scopeCompanyId, processId), JSON.stringify(normalized));
}
