const TYPE_AHEAD_RESET_MS = 800;

export function isTypeAheadKey(key, { allowSpace = false } = {}) {
  if (!key || key.length !== 1) return false;
  if (key === " " && !allowSpace) return false;
  return true;
}

/**
 * Native-select style type-ahead: accumulate prefix, jump to first match;
 * repeat the same letter to cycle through options starting with that letter.
 */
export function matchTypeAheadIndex(labels, key, state) {
  const char = String(key).toLowerCase();
  if (!isTypeAheadKey(char)) return -1;

  const list = Array.isArray(labels) ? labels : [];
  if (list.length === 0) return -1;

  const getLabel = (idx) => String(list[idx] ?? "").toLowerCase();

  if (state.buffer === char && state.lastKey === char) {
    const start = state.lastIndex + 1;
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
  }

  state.buffer += char;
  state.lastKey = char;
  scheduleTypeAheadReset(state);

  const prefix = state.buffer;
  const idx = list.findIndex((label) => String(label ?? "").toLowerCase().startsWith(prefix));
  if (idx >= 0) {
    state.lastIndex = idx;
    return idx;
  }

  state.buffer = state.buffer.slice(0, -1);
  if (state.buffer) {
    const retry = list.findIndex((label) => String(label ?? "").toLowerCase().startsWith(state.buffer));
    if (retry >= 0) {
      state.lastIndex = retry;
      return retry;
    }
  }
  return -1;
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
