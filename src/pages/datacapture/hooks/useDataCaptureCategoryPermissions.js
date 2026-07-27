import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataCaptureQueryKeys, fetchCompanyPermissionsForDataCapture } from "../lib/dataCaptureApi.js";

const DEFAULT_PERMISSIONS = ["Games", "Bank"];

function normalizePermissions(result) {
  const raw =
    result?.success && result.data && Array.isArray(result.data.permissions)
      ? result.data.permissions
      : DEFAULT_PERMISSIONS;
  return raw.filter((p) => p === "Games" || p === "Gambling" || p === "Bank");
}

/** Prefer Games/Gambling for data capture; Bank only when that is all the tenant has. */
function pickCapturePermission(permissions) {
  if (!permissions?.length) return null;
  if (permissions.includes("Games")) return "Games";
  if (permissions.includes("Gambling")) return "Gambling";
  if (permissions.includes("Bank")) return "Bank";
  return permissions[0];
}

/**
 * Resolve capture category from Spring tenant flags (Games vs Bank).
 * Category pills are not shown on Data Capture — permission is locked automatically.
 */
export function useDataCaptureCategoryPermissions(tenantId) {
  const [selectedPermission, setSelectedPermission] = useState(null);
  const tenantKey = tenantId != null && Number(tenantId) > 0 ? String(tenantId) : null;

  const query = useQuery({
    queryKey: dataCaptureQueryKeys.permissions(tenantKey),
    queryFn: async () => {
      const result = await fetchCompanyPermissionsForDataCapture(Number(tenantKey));
      return normalizePermissions(result);
    },
    enabled: Boolean(tenantKey),
    placeholderData: (previousData) => previousData,
  });

  const permissions = query.data;

  useEffect(() => {
    if (!tenantKey) {
      setSelectedPermission(null);
      return;
    }
    if (!permissions?.length) return;
    const pick = pickCapturePermission(permissions);
    setSelectedPermission(pick);
    if (pick) {
      localStorage.setItem(`selectedPermission_tenant_${tenantKey}`, pick);
    }
  }, [tenantKey, permissions]);

  return {
    permissions: permissions ?? [],
    selectedPermission,
    permissionsLoading: query.isLoading,
  };
}
