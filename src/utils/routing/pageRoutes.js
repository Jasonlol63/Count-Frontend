/**
 * Readable SPA routes with fixed UUID suffix: /dashboard/{uuid}, /login/{uuid}, …
 * Use spaPath(pageKey) for navigation; pathnameToPageKey() for active-state checks.
 */

export const PAGE_PATHS = {
  login: "/login",
  member: "/member",
  "reset-password": "/reset-password",
  "owner-secondary-password": "/owner-secondary-password",
  "user-secondary-password": "/user-secondary-password",
  dashboard: "/dashboard",
  domain: "/domain",
  announcement: "/announcement",
  "account-list": "/account-list",
  "add-account": "/add-account",
  "process-list": "/process-list",
  "games-process-list": "/games-process-list",
  "bank-process-list": "/bank-process-list",
  userlist: "/userlist",
  ownership: "/ownership",
  datacapture: "/datacapture",
  datacapturesummary: "/datacapturesummary",
  transaction: "/transaction",
  "transaction-payment-history": "/transaction/payment-history",
  "customer-report": "/customer-report",
  "domain-report": "/domain-report",
  "capture-maintenance": "/capture-maintenance",
  "transaction-maintenance": "/transaction-maintenance",
  "formula-maintenance": "/formula-maintenance",
  "bankprocess-maintenance": "/bankprocess-maintenance",
  "payment-maintenance": "/payment-maintenance",
  useraccess: "/useraccess",
  "deleted-log": "/deleted-log",
  "auto-renew": "/auto-renew",
};

/** @typedef {keyof typeof PAGE_PATHS} PageKey */

/** Fixed UUID per page (anti-guess; paired with readable path). */
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

const UUID_TO_PAGE_KEY = Object.fromEntries(
  Object.entries(PAGE_ROUTE_UUIDS).map(([key, uuid]) => [uuid.toLowerCase(), key]),
);

/** Alternate paths (underscore URLs, typos) → page key. */
export const PATH_ALIASES_TO_PAGE_KEY = {
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

/** @deprecated Use PATH_ALIASES_TO_PAGE_KEY */
export const LEGACY_PATH_TO_PAGE_KEY = PATH_ALIASES_TO_PAGE_KEY;

const PATH_TO_PAGE_KEY = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([key, path]) => [path, key]),
);

const FULL_PATH_TO_PAGE_KEY = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([key, path]) => [`${path}/${PAGE_ROUTE_UUIDS[key]}`.toLowerCase(), key]),
);

/** Match UUID segment (case-insensitive). */
export const UUID_SEGMENT_RE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const UUID_SEGMENT_PATH_RE = new RegExp(`^/(${UUID_SEGMENT_RE})$`, "i");
const LEGACY_P_UUID_PATH_RE = new RegExp(`^/p/(${UUID_SEGMENT_RE})$`, "i");

export function normalizePathname(pathname) {
  const raw = String(pathname || "/").split("?")[0].split("#")[0];
  if (!raw || raw === "/") return "/";
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/** Canonical route: /dashboard/f758d9be-... */
export function spaPath(pageKey, { search = "", hash = "" } = {}) {
  const path = PAGE_PATHS[pageKey];
  const uuid = PAGE_ROUTE_UUIDS[pageKey];
  if (!path || !uuid) {
    throw new Error(`Unknown page key: ${pageKey}`);
  }
  let result = `${path}/${uuid}`;
  const q = String(search || "");
  if (q) {
    result += q.startsWith("?") ? q : `?${q}`;
  }
  const h = String(hash || "");
  if (h) {
    result += h.startsWith("#") ? h : `#${h}`;
  }
  return result;
}

function matchReadablePlusUuid(pathname) {
  const uuidMatch = pathname.match(UUID_SEGMENT_PATH_RE);
  if (!uuidMatch) return null;
  const uuid = uuidMatch[1].toLowerCase();
  const basePath = pathname.slice(0, -uuidMatch[0].length);
  const pageKey = UUID_TO_PAGE_KEY[uuid];
  if (!pageKey || PAGE_PATHS[pageKey] !== basePath) return null;
  return pageKey;
}

export function pathnameToPageKey(pathname) {
  const clean = normalizePathname(pathname);

  const full = FULL_PATH_TO_PAGE_KEY[clean.toLowerCase()];
  if (full) return full;

  const fromReadableUuid = matchReadablePlusUuid(clean);
  if (fromReadableUuid) return fromReadableUuid;

  if (PATH_TO_PAGE_KEY[clean]) return PATH_TO_PAGE_KEY[clean];
  if (PATH_ALIASES_TO_PAGE_KEY[clean]) return PATH_ALIASES_TO_PAGE_KEY[clean];

  const legacyP = clean.match(LEGACY_P_UUID_PATH_RE);
  if (legacyP) {
    return UUID_TO_PAGE_KEY[legacyP[1].toLowerCase()] ?? null;
  }

  return null;
}

export function pathnameIs(pageKey, pathname) {
  return pathnameToPageKey(pathname) === pageKey;
}

/** Site root for API / absolute paths on known SPA routes. */
export function getSiteBasePath() {
  const pathname = normalizePathname(window.location.pathname || "/");
  if (pathnameToPageKey(pathname)) {
    return "/";
  }
  const parent = pathname.replace(/[^/]*$/, "") || "/";
  if (parent === "/") return "/";
  return parent.endsWith("/") ? parent : `${parent}/`;
}

/** Resolve any known pathname to canonical /{page}/{uuid}. */
export function resolveCanonicalSpaPath(pathname, { search = "", hash = "" } = {}) {
  const key = pathnameToPageKey(pathname);
  if (!key) return null;
  return spaPath(key, { search, hash });
}

/** All canonical /{page}/{uuid} pathnames (for server SPA fallback). */
export function allSpaRoutePathnames() {
  return Object.keys(PAGE_PATHS).map((pageKey) => spaPath(pageKey));
}

/** @deprecated Use allSpaRoutePathnames */
export function allUuidRoutePathnames() {
  return allSpaRoutePathnames();
}

/** Nginx/Apache: readable route names (optional /{uuid} suffix). */
export const SPA_READABLE_ROUTE_PATTERN =
  "login|member|reset-password|owner-secondary-password|user-secondary-password|dashboard|domain|announcement|auto-renew|account-list|add-account|process-list|games-process-list|bank-process-list|userlist|useraccess|deleted-log|ownership|datacapture|datacapturesummary|transaction|customer-report|domain-report|capture-maintenance|transaction-maintenance|formula-maintenance|bankprocess-maintenance|payment-maintenance|transcation|customer_report|domain_report|capture_maintenance|transaction_maintenance|formula_maintenance|bankprocess_maintenance|payment_maintenance|auto_renew";

/** Nginx: UUID suffix in /{page}/{uuid}. */
export const SPA_UUID_SUFFIX_PATTERN =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";

/** @deprecated Old /p/{uuid} only pattern */
export const SPA_UUID_PATH_PATTERN = `^p/${UUID_SEGMENT_RE}$`;
