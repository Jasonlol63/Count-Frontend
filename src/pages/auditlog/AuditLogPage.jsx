import { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { PlusCircle, Pencil, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import "./auditlog.css";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { canAccessAuditLog } from "../../utils/auth/sidebarPermissions.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import { KpiCard } from "./components/KpiCard.jsx";
import { AuditLogFilters } from "./components/AuditLogFilters.jsx";
import { AuditLogTable } from "./components/AuditLogTable.jsx";
import { fetchAuditLogs } from "./auditLogApi.js";

const TODAY = new Date();
const WEEK_AGO = new Date(TODAY.getTime() - 6 * 24 * 60 * 60 * 1000);
const isoDate = (d) => d.toISOString().slice(0, 10);

const DEFAULT_FILTERS = {
  dateFrom: isoDate(WEEK_AGO),
  dateTo: isoDate(TODAY),
  tenantCode: "",
  module: "",
  keyword: "",
  action: "ALL",
};

export default function AuditLogPage() {
  const { me, sessionReady } = useAuthSession();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { json } = await fetchAuditLogs({
        ...filters,
        action: filters.action === "ALL" ? undefined : filters.action,
      });
      // Backend always answers HTTP 200 (even for BusinessException — see GlobalExceptionHandler),
      // so success/failure is read from json.success, never from res.ok.
      if (json?.success !== true || !Array.isArray(json?.data)) {
        throw new Error(json?.message || "audit-log endpoint unavailable");
      }
      setLogs(json.data);
      setLoadError("");
    } catch (err) {
      setLogs([]);
      setLoadError(err?.message || "日志加载失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const tenantOptions = useMemo(() => [...new Set(logs.map((l) => l.tenantCode))].sort(), [logs]);
  const moduleOptions = useMemo(() => [...new Set(logs.map((l) => l.module))].sort(), [logs]);

  const summary = useMemo(() => {
    const counts = { CREATE: 0, UPDATE: 0, DELETE: 0 };
    let restorable = 0;
    let restored = 0;
    for (const l of logs) {
      counts[l.action] = (counts[l.action] || 0) + 1;
      if (l.restorable) restorable += 1;
      if (l.restored) restored += 1;
    }
    return { ...counts, restorable, restored };
  }, [logs]);

  if (sessionReady && !canAccessAuditLog(me)) {
    return <Navigate to={spaPath("dashboard")} replace />;
  }

  return (
    <div className="auditlog-shell min-h-screen overflow-x-hidden">
      <div className="flex flex-col gap-[16px] px-[24px] py-[24px]">
        <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
          <h1 className="text-[18px] font-bold text-[var(--al-foreground)]">操作日志</h1>
          <span className="al-mono text-[12px] text-[var(--al-muted-foreground)]">{logs.length} 条</span>
        </div>

        {loadError ? (
          <div className="flex items-center gap-[8px] rounded-[var(--al-radius-sm)] border border-[var(--al-destructive)] bg-[var(--al-destructive-muted)] px-[14px] py-[8px] text-[12.5px] text-[var(--al-destructive-foreground)]">
            <AlertTriangle size={14} />
            {loadError}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-[14px] md:grid-cols-4">
          <KpiCard icon={PlusCircle} label="CREATE" value={summary.CREATE} tone="success" />
          <KpiCard icon={Pencil} label="UPDATE" value={summary.UPDATE} tone="primary" />
          <KpiCard icon={Trash2} label="DELETE" value={summary.DELETE} tone="destructive" />
          <KpiCard
            icon={RotateCcw}
            label="可复原"
            value={summary.restorable}
            delta={`${summary.restored} 已复原`}
            tone="warning"
          />
        </div>

        <AuditLogFilters
          filters={filters}
          onChange={setFilters}
          tenantOptions={tenantOptions}
          moduleOptions={moduleOptions}
        />

        <AuditLogTable logs={logs} loading={loading} />
      </div>
    </div>
  );
}
