/** Uppercase A–Z + spaces; strips digits/punctuation; collapses whitespace. */
export function sanitizeCapitalLettersOnly(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function isCapitalLettersOnly(value) {
  const s = String(value ?? "").trim();
  return s.length > 0 && /^[A-Z]+(?: [A-Z]+)*$/.test(s);
}
