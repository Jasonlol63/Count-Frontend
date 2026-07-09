/** Keep uppercase A–Z only (strips digits, spaces, punctuation, etc.). */
export function sanitizeCapitalLettersOnly(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z]/g, "");
}

export function isCapitalLettersOnly(value) {
  const s = String(value ?? "").trim();
  return s.length > 0 && /^[A-Z]+$/.test(s);
}
