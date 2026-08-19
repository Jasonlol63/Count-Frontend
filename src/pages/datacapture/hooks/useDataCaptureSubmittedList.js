import { useCallback, useLayoutEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataCaptureQueryKeys } from "../lib/dataCaptureApi.js";
import { postSubmittedProcesses } from "../lib/dataCaptureSpringApi.js";
import { resolveDataCaptureTenantId } from "../lib/dataCaptureTenant.js";
import { dataCaptureScopeCacheKey, dataCaptureScopeIsReady } from "../lib/dataCaptureScope.js";
import { registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

export function useDataCaptureSubmittedList(captureScope, captureDate) {
  const queryClient = useQueryClient();
  const scopeKey = dataCaptureScopeCacheKey(captureScope);
  const enabled = dataCaptureScopeIsReady(captureScope);
  const submissionsKey = dataCaptureQueryKeys.submissions(scopeKey, captureDate);

  const query = useQuery({
    queryKey: submissionsKey,
    queryFn: async () => {
      const tenantId = resolveDataCaptureTenantId(captureScope);
      if (!tenantId) throw new Error("tenantId is required");
      const json = await postSubmittedProcesses({ tenantId, captureDate });
      return Array.isArray(json?.data) ? json.data : [];
    },
    enabled,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const refreshSubmitted = useCallback(async () => {
    if (!enabled) return;
    await queryClient.invalidateQueries({
      queryKey: submissionsKey,
    });
  }, [queryClient, submissionsKey, enabled]);

  const refreshRef = useRef(refreshSubmitted);
  refreshRef.current = refreshSubmitted;

  useLayoutEffect(() => {
    const api = {
      refreshSubmittedProcesses: async () => {
        await refreshRef.current();
      },
    };

    registerDataCaptureRuntime(api);
    return () => unregisterDataCaptureRuntime(Object.keys(api));
  }, []);

  return {
    submittedItems: query.data ?? [],
    refreshSubmitted,
    submissionsLoading: query.isLoading,
    submissionsError: query.error,
  };
}
