import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataCaptureQueryKeys, fetchCompanyPermissionsForDataCapture } from "../lib/dataCaptureApi.js";
import { callDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

const DEFAULT_PERMISSIONS = ["Games", "Bank", "Loan", "Rate", "Money"];

function normalizePermissions(result) {
  const raw =
    result?.success && result.data && Array.isArray(result.data.permissions)
      ? result.data.permissions
      : DEFAULT_PERMISSIONS;
  return raw.filter((p) => p !== "Bank");
}

/**
 * Category pills (Games / Loan / Rate / Money). Same API + localStorage keys as legacy `loadPermissionButtons`.
 */
export function useDataCaptureCategoryPermissions(companyCode) {
  const queryClient = useQueryClient();
  const [selectedPermission, setSelectedPermission] = useState(null);

  const query = useQuery({
    queryKey: dataCaptureQueryKeys.permissions(companyCode),
    queryFn: async () => {
      const result = await fetchCompanyPermissionsForDataCapture(companyCode);
      return normalizePermissions(result);
    },
    enabled: Boolean(companyCode),
  });

  const permissions = query.data;

  useEffect(() => {
    if (!companyCode) {
      setSelectedPermission(null);
      return;
    }
    if (!permissions?.length) return;
    const saved = localStorage.getItem(`selectedPermission_${companyCode}`);
    const pick = saved && permissions.includes(saved) ? saved : permissions[0];
    setSelectedPermission(pick);
  }, [companyCode, permissions]);

  const selectPermission = useCallback(
    (permission) => {
      setSelectedPermission(permission);
      if (companyCode) {
        localStorage.setItem(`selectedPermission_${companyCode}`, permission);
      }
      void callDataCaptureRuntime("reloadProcesses");
      void queryClient.invalidateQueries({
        queryKey: [...dataCaptureQueryKeys.root(), "processesByDay"],
      });
    },
    [companyCode, queryClient],
  );

  return {
    permissions: permissions ?? [],
    selectedPermission,
    selectPermission,
    showPermissionFilter: (permissions ?? []).length > 1,
    permissionsLoading: query.isLoading,
  };
}
