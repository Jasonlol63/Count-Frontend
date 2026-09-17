import { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import "./auditlog.css";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { canAccessAuditLog } from "../../utils/auth/sidebarPermissions.js";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import { fetchAccessibleTenants } from "../../utils/company/tenantAccessibleApi.js";
import { StatsBar } from "./components/StatsBar.jsx";
import { AuditLogFilters } from "./components/AuditLogFilters.jsx";
import { AuditLogTable } from "./components/AuditLogTable.jsx";
import { AuditLogDrawer } from "./components/AuditLogDrawer.jsx";
import { fetchAuditLogs, fetchAuditLogSummary } from "./auditLogApi.js";
import { resolveModule } from "./lib/moduleMap.js";

const TODAY = new Date();
const WEEK_AGO = new Date(TODAY.getTime() - 6 * 24 * 60 * 60 * 1000);
const isoDate = (d) => d.toISOString().slice(0, 10);
const PAGE_SIZE = 20;

const DEFAULT_FILTERS = {
  dateFrom: isoDate(WEEK_AGO),
  dateTo: isoDate(TODAY),
  tenantCode: "",
  module: "",
  keyword: "",
  action: "ALL",
};

const EMPTY_SUMMARY = { createCount: 0, updateCount: 0, deleteCount: 0, restorableCount: 0, restoredCount: 0 };

export default function AuditLogPage() {
  const { me, sessionReady } = useAuthSession();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [summaryCounts, setSummaryCounts] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tenantOptions, setTenantOptions] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);

  // A filter change should always land back on page 1 — a stale page number from a
  // previous, larger result set would otherwise silently show an out-of-range empty page.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // `filters.module` is a top-level module name (e.g. "Maintenance"), not one of the raw
      // @Audited strings the backend's `module` query param matches exactly — so it's never
      // sent to the API. Filtering by it happens client-side below via resolveModule(), which
      // means pagination totals are computed before that extra client-side narrowing — a page
      // can end up showing fewer than PAGE_SIZE rows once a module filter is applied.
      const { module: _module, ...backendFilters } = filters;
      const { json } = await fetchAuditLogs({
        ...backendFilters,
        action: filters.action === "ALL" ? undefined : filters.action,
        page,
        size: PAGE_SIZE,
      });
      // Backend always answers HTTP 200 (even for BusinessException — see GlobalExceptionHandler),
      // so success/failure is read from json.success, never from res.ok.
      if (json?.success !== true || !Array.isArray(json?.data)) {
        throw new Error(json?.message || "audit-log endpoint unavailable");
      }
      setLogs(json.data);
      setTotal(Number(json.total) || 0);
      setLoadError("");
    } catch (err) {
      setLogs([]);
      setTotal(0);
      setLoadError(err?.message || "日志加载失败");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Stat strip counts every matching row, not just the current page — a dedicated backend
  // aggregate (not the paginated list) so "总记录/CREATE/UPDATE/DELETE" stay accurate no
  // matter which page you're on. Deliberately excludes `action` (the stat strip should show
  // the full breakdown across all types, not collapse to one count when a type pill is
  // selected) and `module` (same top-level-mapping limitation as the list fetch above).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { dateFrom, dateTo, tenantCode, keyword } = filters;
      const { json } = await fetchAuditLogSummary({ dateFrom, dateTo, tenantCode, keyword });
      if (cancelled) return;
      if (json?.success === true && json?.data) {
        setSummaryCounts({ ...EMPTY_SUMMARY, ...json.data });
      } else {
        setSummaryCounts(EMPTY_SUMMARY);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.dateFrom, filters.dateTo, filters.tenantCode, filters.keyword]);

  // All companies the user can access, independent of the log date range/filters — a company
  // with no audit-log rows in the current window must still show up as a filter option.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { tenants } = await fetchAccessibleTenants({ all: true });
      if (cancelled) return;
      const codes = [...new Set(tenants.map((t) => t.tenantCode).filter(Boolean))].sort();
      setTenantOptions(codes);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredLogs = useMemo(() => {
    if (!filters.module) return logs;
    return logs.filter((l) => resolveModule(l.module).topModule === filters.module);
  }, [logs, filters.module]);

  // Drawer prev/next only walks the currently loaded page's rows — stepping across a page
  // boundary would mean fetching the next page first, which isn't wired up here.
  const selectedIndex = selectedLog ? filteredLogs.findIndex((l) => l.id === selectedLog.id) : -1;
  const goToOffset = (offset) => {
    const next = filteredLogs[selectedIndex + offset];
    if (next) setSelectedLog(next);
  };

  const statCells = useMemo(
    () => [
      { label: "总记录", value: summaryCounts.createCount + summaryCounts.updateCount + summaryCounts.deleteCount, tone: "neutral" },
      { label: "CREATE", value: summaryCounts.createCount, tone: "success" },
      { label: "UPDATE", value: summaryCounts.updateCount, tone: "primary" },
      { label: "DELETE", value: summaryCounts.deleteCount, tone: "destructive" },
      { label: "可复原", value: summaryCounts.restorableCount, tone: "warning" },
    ],
    [summaryCounts],
  );

  if (sessionReady && !canAccessAuditLog(me)) {
    return <Navigate to={spaPath("dashboard")} replace />;
  }

  return (
    <div className="auditlog-shell flex min-h-screen overflow-x-hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-[14px] px-[24px] py-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-[16px]">
          <div>
            <h1 className="text-[length:var(--text-h1)] font-bold tracking-tight text-[var(--al-foreground)]">操作日志</h1>
            <p className="text-[length:var(--text-small)] text-[var(--al-muted-foreground)]">追踪系统内所有关键操作与配置变更</p>
          </div>
          <StatsBar cells={statCells} />
        </div>

        {loadError ? (
          <div className="flex items-center gap-[8px] rounded-[var(--al-radius-sm)] border border-[var(--al-destructive)] bg-[var(--al-destructive-muted)] px-[14px] py-[8px] text-[length:var(--text-medium)] text-[var(--al-destructive-foreground)]">
            <AlertTriangle size={14} />
            {loadError}
          </div>
        ) : null}

        <AuditLogFilters filters={filters} onChange={setFilters} tenantOptions={tenantOptions} />

        <AuditLogTable
          logs={filteredLogs}
          loading={loading}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          selectedLog={selectedLog}
          onSelectLog={setSelectedLog}
        />
      </div>

      {selectedLog ? (
        <AuditLogDrawer
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onPrev={() => goToOffset(-1)}
          onNext={() => goToOffset(1)}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex >= 0 && selectedIndex < filteredLogs.length - 1}
        />
      ) : null}
    </div>
  );
}
