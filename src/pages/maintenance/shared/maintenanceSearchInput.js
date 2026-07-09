/** Maintenance search boxes: coerce user input to uppercase (letters only; keeps digits/symbols). */
export function normalizeMaintenanceSearchInput(value) {
  return String(value ?? "").toUpperCase();
}
