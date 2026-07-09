/**
 * Legacy scripts declare globals with `function foo()` (non-configurable on window).
 * React bridges must not `delete` those keys on cleanup — assign undefined instead.
 */
export function unsetWindowProperty(name, expectedValue) {
  if (expectedValue !== undefined && window[name] !== expectedValue) return;
  try {
    // eslint-disable-next-line no-restricted-globals -- intentional window bridge cleanup
    delete window[name];
  } catch {
    window[name] = undefined;
  }
}
