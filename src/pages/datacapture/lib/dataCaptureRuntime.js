/**
 * Module-scoped runtime registry — React hooks register APIs here for paste/grid/lib modules.
 * Replaces legacy `window.__DC_*` globals.
 */

/** @type {Record<string, unknown>} */
let runtime = {};

/** @type {{ isRestoring: boolean, isGroupOnlyGrid: boolean }} */
const state = {
  isRestoring: false,
  isGroupOnlyGrid: false,
};

export function getDataCaptureState() {
  return state;
}

export function getDataCaptureRuntime() {
  return runtime;
}

/** @param {Record<string, unknown>} updates */
export function registerDataCaptureRuntime(updates) {
  runtime = { ...runtime, ...updates };
}

/** @param {string[]} keys */
export function unregisterDataCaptureRuntime(keys) {
  for (const key of keys) {
    delete runtime[key];
  }
}

/** @param {string} name @param  {...unknown} args */
export function callDataCaptureRuntime(name, ...args) {
  const fn = runtime[name];
  if (typeof fn === "function") {
    return fn(...args);
  }
  return undefined;
}

export function resetDataCaptureRuntime() {
  runtime = {};
  state.isRestoring = false;
  state.isGroupOnlyGrid = false;
}
