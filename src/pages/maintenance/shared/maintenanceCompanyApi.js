import { buildApiUrl } from "../../../utils/core/apiUrl.js";

const DEFAULT_PERMISSIONS_FULL = ["Games", "Bank", "Loan", "Rate", "Money"];
const DEFAULT_PERMISSIONS_FORMULA = ["Games", "Loan", "Rate", "Money"];
const DEFAULT_PERMISSIONS_BANKPROCESS = ["Bank", "Loan", "Rate", "Money"];

async function fetchPermissionsFromApi(companyCode, { credentials = false } = {}) {
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get_company_permissions",
      company_id: companyCode,
    }),
  };
  if (credentials) {
    init.credentials = "include";
  }
  const response = await fetch(buildApiUrl("api/domain/domain_api.php"), init);
  const result = await response.json();
  if (result.success && result.data && Array.isArray(result.data.permissions)) {
    return result.data.permissions;
  }
  return null;
}

/**
 * Domain company permissions with per-page defaults (capture / payment / bankprocess / transaction / formula).
 */
export async function fetchDomainCompanyPermissions(companyCode, options = {}) {
  const {
    emptyForC168 = false,
    excludeGames = false,
    defaultPermissions = DEFAULT_PERMISSIONS_FULL,
    credentials = false,
  } = options;

  if (!companyCode) return [];
  if (emptyForC168 && String(companyCode).trim().toUpperCase() === "C168") {
    return [];
  }

  try {
    const fromApi = await fetchPermissionsFromApi(companyCode, { credentials });
    if (fromApi) {
      return excludeGames ? fromApi.filter((p) => p !== "Games") : fromApi;
    }
  } catch (err) {
    console.error("Error fetching company permissions:", err);
  }
  return [...defaultPermissions];
}

/** Raw permissions for formula (default list omits Bank). */
export async function fetchFormulaCompanyPermissionsRaw(companyCode) {
  return fetchDomainCompanyPermissions(companyCode, {
    defaultPermissions: DEFAULT_PERMISSIONS_FORMULA,
  });
}

export function isBankOnlyCategoryCompany(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  const hasBank = permissions.includes("Bank");
  const hasGames = permissions.includes("Games") || permissions.includes("Gambling");
  return hasBank && !hasGames;
}

/**
 * Process list for maintenance filters.
 */
export async function fetchMaintenanceProcesses(
  companyId,
  { credentials = false, permission } = {},
) {
  const params = new URLSearchParams();
  if (companyId) {
    params.append("company_id", companyId);
  }
  const perm = String(permission ?? "").trim();
  if (perm) {
    params.append("permission", perm);
  }
  const url = buildApiUrl(`api/processes/processlist_api.php?${params.toString()}`);
  const init = credentials ? { credentials: "include" } : {};
  const response = await fetch(url, init);
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to load process list");
  }
  return data.data || [];
}

export { DEFAULT_PERMISSIONS_BANKPROCESS };
