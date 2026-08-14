const TYPE_AHEAD_RESET_MS = 800;

export function isTypeAheadKey(key, { allowSpace = false } = {}) {
  if (!key || key.length !== 1) return false;
  if (key === " " && !allowSpace) return false;
  return true;
}

/**
 * First-letter-only type-ahead (native-select style cycling):
 * - New letter → jump to the first option starting with that letter
 * - Same letter again → cycle through options with that first letter
 * Does NOT accumulate multi-char prefixes (A then C → "C…", not "AC…").
 */
export function matchTypeAheadIndex(labels, key, state) {
  const char = String(key).toLowerCase();
  if (!isTypeAheadKey(char)) return -1;

  const list = Array.isArray(labels) ? labels : [];
  if (list.length === 0) return -1;

  const getLabel = (idx) => String(list[idx] ?? "").toLowerCase();

  const cycleFrom = (start) => {
    for (let i = 0; i < list.length; i += 1) {
      const idx = (start + i) % list.length;
      if (getLabel(idx).startsWith(char)) {
        state.lastIndex = idx;
        state.buffer = char;
        state.lastKey = char;
        scheduleTypeAheadReset(state);
        return idx;
      }
    }
    return -1;
  };

  // Same letter again → cycle to the next match
  if (state.lastKey === char && state.lastIndex >= 0) {
    const idx = cycleFrom(state.lastIndex + 1);
    return idx;
  }

  // Different letter (or fresh) → first option starting with this letter
  const idx = cycleFrom(0);
  return idx;
}

export function createTypeAheadState() {
  return { buffer: "", lastKey: "", lastIndex: -1, timer: null };
}

export function resetTypeAheadState(state) {
  if (!state) return;
  state.buffer = "";
  state.lastKey = "";
  state.lastIndex = -1;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

function scheduleTypeAheadReset(state) {
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => resetTypeAheadState(state), TYPE_AHEAD_RESET_MS);
}
