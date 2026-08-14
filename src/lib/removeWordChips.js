/**
 * Normalize one chip. Leading `=` marks exact-token mode (kept in the stored
 * chip); Excel-style apostrophes are stripped from the body.
 */
function normalizeRemoveWordToken(value) {
  let raw = String(value ?? "")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();
  if (!raw) return "";

  const exact = raw.startsWith("=");
  if (exact) {
    raw = raw
      .slice(1)
      .trim()
      .replace(/^'+|'+$/g, "")
      .trim();
  }
  if (!raw) return "";

  const body = raw.toUpperCase();
  return exact ? `=${body}` : body;
}

/** True when chip uses exact-token mode (`=WORD`). */
export function isExactRemoveWordChip(chip) {
  return String(chip ?? "").startsWith("=");
}

/** Match body without the optional `=` mode prefix. */
export function removeWordChipBody(chip) {
  const raw = String(chip ?? "");
  return isExactRemoveWordChip(raw) ? raw.slice(1) : raw;
}

/** Split on comma or legacy semicolon; store uppercase (preserve `=` prefix). */
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

/** Persist as `FREE,BONUS` or `=XX123,=XX1234` (comma, uppercase). */
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
