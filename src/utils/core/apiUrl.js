import {
  getSiteBasePath,
  pathnameToPageKey,
  resolveCanonicalSpaPath,
  spaPath,
} from "../routing/pageRoutes.js";

export function buildApiUrl(pathAndQuery) {
  const base = window.location.origin + getSiteBasePath();
  const raw = String(pathAndQuery || "").replace(/^\//, "");

  // Redirect legacy PHP auth endpoints to Spring Boot API.
  const rewritten = (() => {
    if (raw.startsWith("api/session/current_user_api.php")) return "auth/current-user";
    if (raw.startsWith("api/session/login_api.php")) return "auth/login";
    if (raw.startsWith("api/session/verify_owner_secondary_password_api.php")) {
      return "auth/verify-owner-secondary-password";
    }
    if (raw.startsWith("api/session/verify_user_secondary_password_api.php")) {
      return "auth/verify-user-secondary-password";
    }
    if (raw.startsWith("api/session/logout_api.php")) return "auth/logout";
    if (raw.startsWith("api/transactions/get_owner_companies_api.php")) {
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      return `auth/tenant-accessible${q}`;
    }
    if (raw.startsWith("api/session/update_company_session_api.php")) {
      const qIndex = raw.indexOf("?");
      if (qIndex >= 0) {
        const params = new URLSearchParams(raw.slice(qIndex + 1));
        const tenantId = params.get("company_id") ?? params.get("tenant_id");
        const next = new URLSearchParams();
        if (tenantId) next.set("tenant_id", tenantId);
        const qs = next.toString();
        return qs ? `auth/switch-tenant?${qs}` : "auth/switch-tenant";
      }
      return "auth/switch-tenant";
    }
    if (raw.startsWith("api/users/send_reset_tac_api.php")) return "auth/send-reset-tac";
    if (raw.startsWith("api/users/reset_password_api.php")) return "auth/reset-password";
    if (raw.startsWith("api/subscription/auto_renew_api.php")) {
      return "api/auto-renew/list";
    }
    // Redirect legacy PHP ownership endpoints to Spring Boot API
    if (raw.startsWith("api/ownership/get_companies_api.php")) {
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      return `auth/tenant-accessible${q}`;
    }
    if (raw.startsWith("api/ownership/get_group_earnings_api.php")) {
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      return `auth/tenant-accessible${q}`;
    }
    if (raw.startsWith("api/ownership/get_owners_api.php")) {
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      const params = new URLSearchParams(q);
      const companyId = params.get("company_id");
      const month = params.get("month");
      const newParams = new URLSearchParams();
      if (companyId) newParams.set("tenant_id", companyId);
      if (month) newParams.set("month", month);
      return `api/ownership/list?${newParams.toString()}`;
    }
    if (raw.startsWith("api/ownership/get_group_owners_api.php")) {
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      const params = new URLSearchParams(q);
      const groupId = params.get("group_id");
      const month = params.get("month");
      const newParams = new URLSearchParams();
      if (groupId) newParams.set("tenant_id", groupId);
      if (month) newParams.set("month", month);
      return `api/ownership/list?${newParams.toString()}`;
    }
    if (raw.startsWith("api/ownership/get_available_accounts_api.php")) {
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      const params = new URLSearchParams(q);
      const companyId = params.get("company_id");
      return `api/ownership/available-accounts?tenant_id=${companyId || ""}`;
    }
    if (raw.startsWith("api/ownership/get_group_available_accounts_api.php")) {
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      const params = new URLSearchParams(q);
      const groupId = params.get("group_id");
      return `api/ownership/available-accounts?tenant_id=${groupId || ""}`;
    }
    // Announcement page — fully migrated to Spring Boot.
    if (raw.startsWith("api/announcements/announcement_list_api.php")) {
      return "api/announcement/listAnnouncement";
    }
    if (raw.startsWith("api/announcements/announcement_create_api.php")) {
      return "api/announcement/addAnnouncementContent";
    }
    if (raw.startsWith("api/announcements/announcement_update_api.php")) {
      return "api/announcement/updateAnnouncement";
    }
    if (raw.startsWith("api/announcements/announcement_delete_api.php")) {
      return "api/announcement/deleteAnnouncement";
    }
    if (raw.startsWith("api/announcements/announcement_get_dashboard_api.php")) {
      return "api/announcement/getDashboardAnnouncements";
    }
    if (raw.startsWith("api/maintenance/list_api.php")) {
      return "api/announcement/listMaintenance";
    }
    if (raw.startsWith("api/maintenance/create_api.php")) {
      return "api/announcement/addMaintenanceContent";
    }
    if (raw.startsWith("api/maintenance/update_api.php")) {
      return "api/announcement/updateMaintenance";
    }
    if (raw.startsWith("api/maintenance/delete_api.php")) {
      return "api/announcement/deleteMaintenance";
    }
    if (raw.startsWith("api/maintenance/get_public_api.php")) {
      return "api/announcement/getMaintenanceInLogin";
    }
    return raw;
  })();

  return new URL(rewritten, base).href;
}

/**
 * In-app route path (respects subdirectory deploy).
 * Accepts page key ("dashboard"), legacy path ("/dashboard"), or "dashboard?x=1".
 */
export function buildSpaPath(pathAndQuery) {
  const raw = String(pathAndQuery || "").trim();
  if (!raw) return spaPath("login");

  const qIndex = raw.indexOf("?");
  const hIndex = raw.indexOf("#");
  let pathPart = raw;
  let search = "";
  let hash = "";
  if (qIndex >= 0 && (hIndex < 0 || qIndex < hIndex)) {
    pathPart = raw.slice(0, qIndex);
    search = raw.slice(qIndex);
    if (hIndex >= 0) {
      search = raw.slice(qIndex, hIndex);
      hash = raw.slice(hIndex);
    }
  } else if (hIndex >= 0) {
    pathPart = raw.slice(0, hIndex);
    hash = raw.slice(hIndex);
  }

  const normalized = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const pageKey = pathnameToPageKey(normalized);
  const canonical = pageKey
    ? spaPath(pageKey, { search, hash })
    : resolveCanonicalSpaPath(normalized, { search, hash }) || normalized;

  // UUID and legacy SPA paths are site-root absolute (/p/... or /login).
  if (canonical.startsWith("/")) {
    return canonical;
  }

  const url = new URL(canonical.replace(/^\//, ""), window.location.origin + getSiteBasePath());
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Static assets (css/js) under Vite base URL / asset folder — stable across SPA routes. */
export function assetUrl(path) {
  const clean = String(path || "").replace(/^\//, "");
  if (clean.startsWith("images/")) {
    return new URL(`/${clean}`, window.location.origin).href;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL != null && import.meta.env.BASE_URL !== "") {
      const baseHref = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      return new URL(clean, baseHref).href;
    }
  } catch {
    /* fall through */
  }
  const entryScript = document.querySelector('script[type="module"][src*="/assets/"]');
  const src = entryScript?.getAttribute("src");
  if (src) {
    try {
      const pathname = new URL(src, window.location.origin).pathname;
      const marker = "/assets/";
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const assetBasePath = pathname.slice(0, markerIndex + 1);
        return new URL(`${assetBasePath}${clean}`, window.location.origin).href;
      }
    } catch {
      /* Fallback to legacy path resolution. */
    }
  }
  return buildApiUrl(clean);
}
