/**
 * Obfuscated SPA routes: /p/{uuid} per page (anti-enumeration).
 * Use spaPath(pageKey) for links/navigation; pathnameToPageKey() for active-state checks.
 */

export const PAGE_ROUTE_UUIDS = {
  login: "05659e0a-5121-427b-b5f2-7bbc43e14b23",
  member: "45793aa9-4637-452e-8820-2f4611d8b6f6",
  "reset-password": "d56cf733-0468-4ca0-a14a-231425bc3e83",
  "owner-secondary-password": "41ed85ee-645d-4cb9-b269-10dfc9e9ccdc",
  "user-secondary-password": "d6bcd362-fad8-4124-9225-f6d3adc9b70d",
  dashboard: "f758d9be-bed3-4576-87c0-7c4c39331b87",
  domain: "312d9a6c-8f00-44e5-9b05-dfb64c9c356a",
  announcement: "a4c78818-dd94-4668-8b1e-f6a57abdcfd2",
  "account-list": "92a50b4f-6d9a-4e3a-b306-109a0361e9a3",
  "add-account": "81103520-5bdf-4898-a963-4e63afd1d454",
  "process-list": "c4838280-1a60-4ea1-972d-26db47f30179",
  "games-process-list": "2e555271-6f0a-4cf4-b4a4-6561f605627f",
  "bank-process-list": "ece7de68-15f0-4f0d-b185-88d5df68f873",
  userlist: "e7cf9194-62c9-4fc7-be66-1655421d117d",
  ownership: "51299ec5-6f49-4714-b66f-59b5b76d8fbb",
  datacapture: "b98093de-5939-4b90-befd-c47715b399d0",
  datacapturesummary: "35f3a1b3-8bc3-4dea-8e47-93844d4040c3",
  transaction: "cc41ab63-4ef0-49c3-adf5-13f9e5d15c6b",
  "transaction-payment-history": "00b748c5-f2a4-42fc-9067-1c89c118045b",
  "customer-report": "9baddd5f-c601-4b58-ace6-4d764fc2e3ec",
  "domain-report": "c7c6db2c-40f0-4f01-81a9-8fda54d15e42",
  "capture-maintenance": "80e7440b-4857-44d0-be55-8858a3191787",
  "transaction-maintenance": "54308ffa-1396-4de1-950a-6248b29e3caf",
  "formula-maintenance": "fd9b1d8e-8369-4a85-b176-b34c5c27f063",
  "bankprocess-maintenance": "e4bef560-3371-4a79-96c9-75ae055ca7d9",
  "payment-maintenance": "0cc1f0cd-e901-48ce-8a30-038ccce3344a",
  useraccess: "10049c16-fb17-4889-8228-98bf465544ef",
  "deleted-log": "3f5cf41e-53c2-45c5-a2c2-92e26352d8a1",
  "auto-renew": "148b6740-9f41-47e8-b8ca-e52db63cd4b2",
};

/** @typedef {keyof typeof PAGE_ROUTE_UUIDS} PageKey */

const UUID_TO_PAGE_KEY = Object.fromEntries(
  Object.entries(PAGE_ROUTE_UUIDS).map(([key, uuid]) => [uuid.toLowerCase(), key]),
);

/** Legacy readable paths → page key (302 to UUID in router / Apache). */
export const LEGACY_PATH_TO_PAGE_KEY = {
  "/login": "login",
  "/member": "member",
  "/reset-password": "reset-password",
  "/owner-secondary-password": "owner-secondary-password",
  "/user-secondary-password": "user-secondary-password",
  "/dashboard": "dashboard",
  "/domain": "domain",
  "/announcement": "announcement",
  "/account-list": "account-list",
  "/add-account": "add-account",
  "/process-list": "process-list",
  "/games-process-list": "games-process-list",
  "/bank-process-list": "bank-process-list",
  "/userlist": "userlist",
  "/ownership": "ownership",
  "/datacapture": "datacapture",
  "/datacapturesummary": "datacapturesummary",
  "/transaction": "transaction",
  "/transaction/payment-history": "transaction-payment-history",
  "/customer-report": "customer-report",
  "/domain-report": "domain-report",
  "/capture-maintenance": "capture-maintenance",
  "/transaction-maintenance": "transaction-maintenance",
  "/formula-maintenance": "formula-maintenance",
  "/bankprocess-maintenance": "bankprocess-maintenance",
  "/payment-maintenance": "payment-maintenance",
  "/useraccess": "useraccess",
  "/deleted-log": "deleted-log",
  "/auto-renew": "auto-renew",
  "/transcation": "transaction",
  "/customer_report": "customer-report",
  "/domain_report": "domain-report",
  "/capture_maintenance": "capture-maintenance",
  "/transaction_maintenance": "transaction-maintenance",
  "/formula_maintenance": "formula-maintenance",
  "/bankprocess_maintenance": "bankprocess-maintenance",
  "/payment_maintenance": "payment-maintenance",
  "/auto_renew": "auto-renew",
};

const UUID_PATH_RE = /^\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function normalizePathname(pathname) {
  const raw = String(pathname || "/").split("?")[0].split("#")[0];
  if (!raw || raw === "/") return "/";
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/** SPA path for a page key, e.g. spaPath('dashboard') → /p/f758d9be-... */
export function spaPath(pageKey, { search = "", hash = "" } = {}) {
  const uuid = PAGE_ROUTE_UUIDS[pageKey];
  if (!uuid) {
    throw new Error(`Unknown page key: ${pageKey}`);
  }
  let path = `/p/${uuid}`;
  const q = String(search || "");
  if (q) {
    path += q.startsWith("?") ? q : `?${q}`;
  }
  const h = String(hash || "");
  if (h) {
    path += h.startsWith("#") ? h : `#${h}`;
  }
  return path;
}

export function pathnameToPageKey(pathname) {
  const clean = normalizePathname(pathname);
  const uuidMatch = clean.match(UUID_PATH_RE);
  if (uuidMatch) {
    return UUID_TO_PAGE_KEY[uuidMatch[1].toLowerCase()] ?? null;
  }
  return LEGACY_PATH_TO_PAGE_KEY[clean] ?? null;
}

export function pathnameIs(pageKey, pathname) {
  return pathnameToPageKey(pathname) === pageKey;
}

/** Site root for API / absolute paths — UUID routes live under /p/{uuid}, not /p/ subfolder. */
export function getSiteBasePath() {
  const pathname = normalizePathname(window.location.pathname || "/");
  if (UUID_PATH_RE.test(pathname)) {
    return "/";
  }
  const parent = pathname.replace(/[^/]*$/, "") || "/";
  if (parent === "/") return "/";
  return parent.endsWith("/") ? parent : `${parent}/`;
}

/** Resolve legacy or UUID pathname to canonical UUID SPA path. */
export function resolveCanonicalSpaPath(pathname, { search = "", hash = "" } = {}) {
  const key = pathnameToPageKey(pathname);
  if (!key) return null;
  return spaPath(key, { search, hash });
}

/** All UUID route pathnames (for server SPA fallback). */
export function allUuidRoutePathnames() {
  return Object.values(PAGE_ROUTE_UUIDS).map((uuid) => `/p/${uuid}`);
}

/** Apache/Nginx: match /p/{uuid} */
export const SPA_UUID_PATH_PATTERN =
  "^p/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
