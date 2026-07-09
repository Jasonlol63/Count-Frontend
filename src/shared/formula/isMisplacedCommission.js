/** Values in (0.85, 1) stored in source_percent are misplaced row commission coefficients. */
export function isMisplacedCommission(value) {
  if (value === null || value === undefined || value === "") return false;
  const num = typeof value === "number" ? value : Number(String(value).trim().replace(/%/g, ""));
  if (!Number.isFinite(num)) return false;
  return num > 0.85 && num < 1 - 1e-9;
}

export function isSourceOne(value) {
  if (value === null || value === undefined || value === "") return true;
  const num = typeof value === "number" ? value : Number(String(value).trim().replace(/%/g, ""));
  if (!Number.isFinite(num)) return false;
  return Math.abs(num - 1) < 1e-9;
}
