import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataCaptureQueryKeys } from "../lib/dataCaptureApi.js";
import { fetchTenantCategoryPermissions } from "../lib/dataCaptureSpringApi.js";

const DEFAULT_PERMISSIONS = ["Games", "Bank"];

function normalizePermissions(result) {
  const raw =
    result?.success && result.data && Array.isArray(result.data.permissions)
      ? result.data.permissions
      : DEFAULT_PERMISSIONS;
  return raw;
}

function pickPermission(permissions) {
  if (!permissions?.length) return null;
  if (permissions.includes("Games")) return "Games";
  if (permissions.includes("Bank")) return "Bank";
  return permissions[0];
}

/**
 * Games vs Bank process-loading mode for this tenant, from Spring `/auth/switch-tenant`
 * tenant flags. No user-facing switcher — auto-picked (Games preferred, else Bank).
 * See ../CATEGORY_REMOVED.md.
 */
export function useDataCaptureCategoryPermissions(tenantId) {
  const [selectedPermission, setSelectedPermission] = useState(null);

  const query = useQuery({
    queryKey: dataCaptureQueryKeys.permissions(tenantId),
    queryFn: async () => normalizePermissions(await fetchTenantCategoryPermissions(tenantId)),
    enabled: Boolean(tenantId),
    placeholderData: (previousData) => previousData,
  });

  const permissions = query.data;

  useEffect(() => {
    if (!tenantId) {
      setSelectedPermission(null);
      return;
    }
    const pick = pickPermission(permissions);
    setSelectedPermission(pick);
    if (pick) {
      try {
        localStorage.setItem(`selectedPermission_${tenantId}`, pick);
      } catch {
        /* ignore */
      }
    }
  }, [tenantId, permissions]);

  return {
    selectedPermission,
    permissionsLoading: query.isLoading,
  };
}
