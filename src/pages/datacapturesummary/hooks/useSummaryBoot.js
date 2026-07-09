import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DATA_CAPTURE_HOME_PATH,
  resolveSummaryPageAccess,
} from "../../datacapture/lib/dataCaptureCompanyAccess.js";
import {
  dataCaptureScopeIsReady,
  dataCaptureScopeLedgerCompanyId,
  normalizeGroupCaptureScope,
  resolveDataCaptureScopeFromSessionMeta,
} from "../../datacapture/lib/dataCaptureScope.js";
import { readCaptureSessionMeta } from "../../datacapture/lib/dataCaptureStorage.js";
import {
  isDashboardGroupOnlyMode,
  readPersistedDashboardGcFilter,
} from "../../../utils/company/sharedCompanyFilter.js";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import { consumeSummaryFreshNavigation, loadSummaryCaptureSession } from "../lib/summaryStorage.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { usePartnershipAuditReadOnlyLocked } from "../../../utils/audit/partnershipAuditReadOnly.js";

/**
 * Session boot for Summary SPA — reuses AuthenticatedLayout session (no duplicate API).
 */
export function useSummaryBoot() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();

  const mutationsBlocked = usePartnershipAuditReadOnlyLocked(me);

  const captureScope = useMemo(() => {
    if (!sessionReady) return null;

    const session = loadSummaryCaptureSession();
    const processData = session?.processData ?? null;
    const groupOnly =
      processData?.groupOnlyCapture === true && processData?.groupPayrollCapture !== true;

    const resolveGroupScope = (meta, processMetaForNormalize = meta) => {
      const fromMeta = resolveDataCaptureScopeFromSessionMeta(meta);
      if (fromMeta) {
        return normalizeGroupCaptureScope(fromMeta, processMetaForNormalize);
      }
      const groupKey = meta?.captureSelectedGroup
        ? String(meta.captureSelectedGroup).trim().toUpperCase()
        : "";
      if (!groupKey) return null;
      return normalizeGroupCaptureScope(
        {
          mode: "group",
          groupId: groupKey,
          viewGroup: groupKey,
          scopeCompanyId: 0,
          resolveCompanyViaGroupId: true,
        },
        processMetaForNormalize,
      );
    };

    if (groupOnly) {
      const scoped = resolveGroupScope(processData, processData);
      if (scoped) return scoped;
    }

    if (processData) {
      const fromSession = resolveDataCaptureScopeFromSessionMeta(processData);
      if (fromSession) {
        return normalizeGroupCaptureScope(fromSession, processData);
      }
    }

    const pointerMeta = readCaptureSessionMeta();
    if (pointerMeta?.groupOnlyCapture && !pointerMeta?.groupPayrollCapture) {
      const scoped = resolveGroupScope(
        {
          groupOnlyCapture: true,
          captureSelectedGroup: pointerMeta.captureSelectedGroup,
          scopeCompanyId: pointerMeta.scopeCompanyId,
          captureScopeMode: pointerMeta.captureScopeMode,
        },
        {
          groupOnlyCapture: true,
          captureSelectedGroup: pointerMeta.captureSelectedGroup,
        },
      );
      if (scoped) return scoped;
    }

    if (isDashboardGroupOnlyMode() && canUseGroupOnlyMode(me)) {
      const persisted = readPersistedDashboardGcFilter();
      const groupKey = persisted.selectedGroup
        ? String(persisted.selectedGroup).trim().toUpperCase()
        : "";
      if (groupKey) {
        const scoped = resolveGroupScope(
          {
            groupOnlyCapture: true,
            captureSelectedGroup: groupKey,
          },
          {
            groupOnlyCapture: true,
            captureSelectedGroup: groupKey,
          },
        );
        if (scoped) return scoped;
      }
    }

    const sessionCompanyId =
      me?.company_id != null && Number.isFinite(Number(me.company_id))
        ? Number(me.company_id)
        : null;
    if (sessionCompanyId) {
      return {
        mode: "company",
        scopeCompanyId: sessionCompanyId,
        uiCompanyId: sessionCompanyId,
        groupId: null,
        viewGroup: null,
      };
    }
    return null;
  }, [me, sessionReady]);

  const companyId = dataCaptureScopeLedgerCompanyId(captureScope);

  useEffect(() => {
    if (!sessionReady || !me) return;

    const freshNav =
      consumeSummaryFreshNavigation() ||
      window.isNavigatingAwayByBackOrSubmit ||
      new URLSearchParams(window.location.search).get("success") === "1";

    if (freshNav) {
      window.isNavigatingAwayByBackOrSubmit = false;
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const session = loadSummaryCaptureSession(captureScope);
      const hasSession = Boolean(session?.tableData && session?.processData);
      const scopeCid =
        captureScope?.scopeCompanyId != null && Number(captureScope.scopeCompanyId) > 0
          ? Number(captureScope.scopeCompanyId)
          : companyId;
      const companyCode =
        captureScope?.mode === "group" && captureScope?.groupId
          ? String(captureScope.groupId)
          : me.company_code != null && String(me.company_code).trim() !== ""
            ? String(me.company_code).trim()
            : scopeCid != null
              ? String(scopeCid)
              : "";

      const allowed = await resolveSummaryPageAccess({
        captureScope,
        companyId: scopeCid,
        companyCode,
        sessionUser: me,
        sessionProcessData: session?.processData,
        hasStoredCaptureSession: hasSession,
      });
      if (!cancelled && !allowed) {
        navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, companyId, captureScope, sessionReady, navigate]);

  const hasStoredCaptureSession = useMemo(() => {
    if (!sessionReady) return false;
    const session = loadSummaryCaptureSession(captureScope);
    return Boolean(session?.tableData && session?.processData);
  }, [sessionReady, captureScope]);

  const scopeReady = dataCaptureScopeIsReady(captureScope) || hasStoredCaptureSession;

  return {
    me,
    companyId,
    captureScope,
    scopeReady,
    mutationsBlocked,
    bootLoading: !sessionReady,
    bootError: sessionReady && !me,
  };
}
