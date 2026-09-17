import { Badge } from "./ui/Badge.jsx";
import { cn } from "../lib/cn.js";
import { resolveModule } from "../lib/moduleMap.js";
import { TABLE_COLS } from "../lib/tableCols.js";
import { formatTime, initials } from "../lib/auditFormat.js";

const ACTION_TONE = { CREATE: "success", UPDATE: "primary", DELETE: "destructive" };
const ACTION_DOT = { CREATE: "bg-[var(--al-success)]", UPDATE: "bg-[var(--al-primary)]", DELETE: "bg-[var(--al-destructive)]" };

export function AuditLogRow({ log, selected, onSelect }) {
  const { topModule, subLabel } = resolveModule(log.module);

  return (
    <div
      className={cn(
        `grid cursor-pointer ${TABLE_COLS} items-center gap-[12px] border-b border-[var(--al-border)] px-[20px] py-[12px] last:border-b-0 hover:bg-[var(--al-muted)]`,
        selected && "bg-[var(--al-primary-muted)] hover:bg-[var(--al-primary-muted)]",
      )}
      onClick={() => onSelect(log)}
    >
      <span className={cn("h-[8px] w-[8px] rounded-full", ACTION_DOT[log.action] || "bg-[var(--al-muted-foreground)]")} />
      <span className="al-mono text-[length:var(--text-medium)] tabular-nums text-[var(--al-muted-foreground)]">
        {formatTime(log.createdAt)}
      </span>
      <span className="flex min-w-0 items-center gap-[8px]">
        <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[var(--al-primary-muted)] text-[length:var(--text-tiny)] font-bold text-[var(--al-primary)]">
          {initials(log.operatorName)}
        </span>
        <span className="min-w-0">
          <b className="block truncate text-[length:var(--text-base)] font-semibold">{log.operatorName}</b>
          <span className="text-[length:var(--text-tiny)] text-[var(--al-muted-foreground)]">{log.operatorRole}</span>
        </span>
      </span>
      <span className="truncate text-[length:var(--text-base)] font-medium">{log.tenantCode}</span>
      <Badge tone="neutral" className="w-fit">
        {topModule}
      </Badge>
      <Badge tone={ACTION_TONE[log.action] || "neutral"}>{log.action}</Badge>
      <span className="min-w-0 truncate text-[length:var(--text-base)]" title={log.summary || undefined}>
        {log.summary || <span className="text-[var(--al-muted-foreground)]">—</span>}
        {subLabel && subLabel !== topModule ? (
          <span className="ml-[8px] inline-flex w-fit items-center rounded-full bg-[var(--al-muted)] px-[8px] py-[1px] text-[length:var(--text-tiny)] text-[var(--al-muted-foreground)]">
            {subLabel}
          </span>
        ) : null}
      </span>
    </div>
  );
}
