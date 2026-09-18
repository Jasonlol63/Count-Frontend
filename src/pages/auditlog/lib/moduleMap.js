/**
 * "Module" filter semantics: the fixed top-level sidebar entries, not the raw
 * `@Audited(module = "...")` strings the backend writes (see AuditLogAspect).
 * Those raw strings are sub-features under a top-level module (e.g. PAYMENT_MAINTENANCE
 * and BANK_PROCESS_MAINTENANCE are both sub-pages of the "Maintenance" sidebar entry) —
 * they show up as a secondary label next to the row summary, never as the module badge.
 *
 * TOP_LEVEL_MODULES never changes with backend data — it mirrors the sidebar. When a new
 * `@Audited` module is added on the backend, add its mapping to RAW_MODULE_MAP; it will
 * automatically become filterable under whichever top-level module it belongs to.
 */
export const TOP_LEVEL_MODULES = [
  "Home",
  "Domain",
  "Announcement",
  "Auto Renew",
  "Admin",
  "Account",
  "Ownership",
  "Process",
  "Data Capture",
  "Transaction Payment",
  "Report",
  "Maintenance",
  "System",
];

const RAW_MODULE_MAP = {
  ANNOUNCEMENT: { topModule: "Announcement", subLabel: "Announcement" },
  AUTO_RENEW: { topModule: "Auto Renew", subLabel: "Auto Renew" },
  ADMIN: { topModule: "Admin", subLabel: "Admin" },
  ACCOUNT: { topModule: "Account", subLabel: "Account" },
  DOMAIN: { topModule: "Domain", subLabel: "Domain" },
  DOMAIN_FEE_SETTINGS: { topModule: "Domain", subLabel: "Domain Fee Settings" },
  // Not a real separate page — it's the "Company Settings" modal on the Domain page
  // (expiration/permissions/share %). subLabel === topModule so no pill renders, same as
  // plain Owner create/update rows.
  DOMAIN_TENANT_SETTING: { topModule: "Domain", subLabel: "Domain" },
  // Process definitions (Bank/Game category) and their descriptions both live under the
  // "Process" sidebar entry — neither is its own top-level page.
  PROCESS: { topModule: "Process", subLabel: "Process" },
  PROCESS_DESCRIPTION: { topModule: "Process", subLabel: "Process Description" },
  DATA_CAPTURE: { topModule: "Data Capture", subLabel: "Data Capture" },
  CAPTURE_MAINTENANCE: { topModule: "Maintenance", subLabel: "Data Capture Maintenance" },
  FORMULA_MAINTENANCE: { topModule: "Maintenance", subLabel: "Formula Maintenance" },
  PAYMENT_MAINTENANCE: { topModule: "Maintenance", subLabel: "Payment Maintenance" },
  BANK_PROCESS_MAINTENANCE: { topModule: "Maintenance", subLabel: "Bank Process Maintenance" },
  TRANSACTION: { topModule: "Transaction Payment", subLabel: "Transaction Payment" },
  TRANSACTION_CONTRA_INBOX: { topModule: "Transaction Payment", subLabel: "Transaction Contra Inbox" },
  SYSTEM_MAINTENANCE: { topModule: "System", subLabel: "System Maintenance" },
};

/** Raw backend module string → { topModule, subLabel }. Falls back to the raw string itself for unmapped values. */
export function resolveModule(rawModule) {
  return RAW_MODULE_MAP[rawModule] || { topModule: rawModule || "—", subLabel: rawModule || "" };
}
