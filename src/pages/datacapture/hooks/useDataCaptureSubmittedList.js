import { useCallback, useLayoutEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataCaptureQueryKeys, fetchSubmissionsByCaptureDate } from "../lib/dataCaptureApi.js";
import { dataCaptureScopeCacheKey, dataCaptureScopeIsReady } from "../lib/dataCaptureScope.js";
import { registerDataCaptureRuntime, unregisterDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

export function useDataCaptureSubmittedList(captureScope, captureDate) {
  const queryClient = useQueryClient();
  const scopeKey = dataCaptureScopeCacheKey(captureScope);
  const enabled = dataCaptureScopeIsReady(captureScope);

  const query = useQuery({
    queryKey: dataCaptureQueryKeys.submissions(scopeKey, captureDate),
    queryFn: async () => {
      const res = await fetchSubmissionsByCaptureDate(captureDate, captureScope);
      if (res.success) return Array.isArray(res.data) ? res.data : [];
      return [];
    },
    enabled,
  });

  const refreshSubmitted = useCallback(async () => {
    if (!enabled) return;
    await queryClient.invalidateQueries({
      queryKey: dataCaptureQueryKeys.submissions(scopeKey, captureDate),
    });
  }, [queryClient, scopeKey, captureDate, enabled]);

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
  };
}
