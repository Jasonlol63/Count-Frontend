/** Strip whitespace, lowercase, and remove CJK characters while typing. */
export function sanitizeEmailInput(value) {
  return String(value ?? "")
    .replace(/[\u4e00-\u9fa5]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Final normalized email for submit/storage. */
export function normalizeEmail(value) {
  return sanitizeEmailInput(value).trim();
}

const DANGEROUS_EMAIL_PATTERN = /[<>\"'`;\\]|(\/\/)|javascript:|data:|\0/i;

function hasDangerousContent(email) {
  return DANGEROUS_EMAIL_PATTERN.test(email);
}

function isValidLocalPart(local) {
  if (!local || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (local.includes("..")) return false;
  if (!/^[a-z0-9.+_-]+$/.test(local)) return false;
  return true;
}

function isValidDomainLabel(label) {
  if (!label || label.length > 63) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;
  return /^[a-z0-9-]+$/.test(label);
}

function isValidDomainPart(domain) {
  if (!domain || domain.length > 253) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("..")) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) return false;

  return labels.every(isValidDomainLabel);
}

/** Real-world email format validation (providers, subdomains, + alias, dotted local). */
export function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return false;
  if (hasDangerousContent(email)) return false;
  if ((email.match(/@/g) || []).length !== 1) return false;

  const atIndex = email.indexOf("@");
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (!local || !domain) return false;

  return isValidLocalPart(local) && isValidDomainPart(domain);
}

/** @returns {{ ok: boolean, normalized: string, error: 'empty' | 'invalid' | null }} */
export function validateEmail(value) {
  const normalized = normalizeEmail(value);
  if (!normalized) {
    return { ok: false, normalized: "", error: "empty" };
  }
  if (!isValidEmail(normalized)) {
    return { ok: false, normalized, error: "invalid" };
  }
  return { ok: true, normalized, error: null };
}
