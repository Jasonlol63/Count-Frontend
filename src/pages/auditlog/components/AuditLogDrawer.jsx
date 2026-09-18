import { useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "./ui/Badge.jsx";
import { DiffTable } from "./DiffTable.jsx";
import { cn } from "../lib/cn.js";
import { resolveModule } from "../lib/moduleMap.js";
import { coarsenAuditSummary, initials } from "../lib/auditFormat.js";

const ACTION_TONE = { CREATE: "success", UPDATE: "primary", DELETE: "destructive" };

function KV({ label, value, mono }) {
  const display = value || "—";
  return (
    <div className="flex items-center justify-between gap-[12px] border-b border-[var(--al-border)] py-[7px] text-[length:var(--text-small)] last:border-b-0">
      <span className="text-[var(--al-muted-foreground)]">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right font-medium",
          value ? "text-[var(--al-foreground)]" : "text-[var(--al-muted-foreground)]",
          mono && "al-mono",
        )}
        title={display}
      >
        {display}
      </span>
    </div>
  );
}

/**
 * Right-side detail panel — replaces the old inline row-expand accordion. Keeps the table
 * itself stable (no rows pushed down) and gives the field-change list real width to breathe
 * in, with prev/next navigation so reviewing many records in a row doesn't mean reopening a
 * fresh expand each time.
 */
export function AuditLogDrawer({ log, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const drawerRef = useRef(null);

  // Clicking anywhere outside the drawer closes it — a row click still switches the
  // selection normally (that row's own onClick fires independently of this listener).
  useEffect(() => {
    if (!log) return undefined;
    const onPointerDown = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [log, onClose]);

  if (!log) return null;
  const { topModule, subLabel } = resolveModule(log.module);
  const createdAt = new Date(log.createdAt);
  const dateLabel = Number.isNaN(createdAt.getTime())
    ? ""
    : `${createdAt.getHours().toString().padStart(2, "0")}:${createdAt.getMinutes().toString().padStart(2, "0")}:${createdAt
        .getSeconds()
        .toString()
        .padStart(2, "0")} · ${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(
        createdAt.getDate(),
      ).padStart(2, "0")}`;

  return (
    <div ref={drawerRef} className="sticky top-0 flex h-screen w-[420px] shrink-0 flex-col border-l border-[var(--al-border)] bg-[var(--al-card)] shadow-[var(--al-shadow)]">
      <div className="border-b border-[var(--al-border)] px-[22px] pb-[16px] pt-[20px]">
        <div className="mb-[12px] flex items-center justify-between">
          <div className="flex gap-[4px]">
            <button
              type="button"
              disabled={!hasPrev}
              onClick={onPrev}
              className={cn(
                "flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[6px] border border-[var(--al-border)] bg-[var(--al-card)] text-[var(--al-muted-foreground)] hover:bg-[var(--al-muted)]",
                !hasPrev && "cursor-not-allowed opacity-40 hover:bg-[var(--al-card)]",
              )}
              aria-label="上一条"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={onNext}
              className={cn(
                "flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[6px] border border-[var(--al-border)] bg-[var(--al-card)] text-[var(--al-muted-foreground)] hover:bg-[var(--al-muted)]",
                !hasNext && "cursor-not-allowed opacity-40 hover:bg-[var(--al-card)]",
              )}
              aria-label="下一条"
            >
              <ChevronRight size={13} />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[6px] border-none bg-[var(--al-muted)] text-[var(--al-muted-foreground)] hover:bg-[var(--al-border)]"
            aria-label="关闭"
          >
            <X size={13} />
          </button>
        </div>

        <div className="mb-[10px] flex items-center gap-[10px]">
          <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-[var(--al-primary-muted)] text-[length:var(--text-small)] font-bold text-[var(--al-primary)]">
            {initials(log.operatorName)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[length:var(--text-base)] font-semibold text-[var(--al-foreground)]">{log.operatorName}</div>
            <div className="truncate text-[length:var(--text-small)] text-[var(--al-muted-foreground)]">
              {log.operatorRole} · {log.tenantCode}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-[8px]">
          <Badge tone="neutral">{topModule}</Badge>
          <Badge tone={ACTION_TONE[log.action] || "neutral"}>{log.action}</Badge>
          <span className="al-mono text-[length:var(--text-small)] text-[var(--al-muted-foreground)]">{dateLabel}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[22px] py-[18px]">
        <div className="mb-[18px]">
          <h4 className="mb-[6px] text-[length:var(--text-small)] font-semibold uppercase tracking-wide text-[var(--al-muted-foreground)]">
            记录信息
          </h4>
          <KV label="摘要" value={coarsenAuditSummary(log.summary)} />
          {subLabel && subLabel !== topModule ? <KV label="子功能" value={subLabel} /> : null}
          <KV label="来源表" value={log.sourceTable} mono />
          <KV label="记录ID" value={log.entityId} mono />
        </div>

        <DiffTable beforeRaw={log.beforeData} afterRaw={log.afterData} action={log.action} />
      </div>
    </div>
  );
}
