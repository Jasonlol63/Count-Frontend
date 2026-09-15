import { useState } from "react";
import { ChevronRight, Copy, Check } from "lucide-react";
import { Badge } from "./ui/Badge.jsx";
import { cn } from "../lib/cn.js";

const ACTION_TONE = { CREATE: "success", UPDATE: "primary", DELETE: "destructive" };

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * before_data/after_data come back from the API as JSON *text* (the DB column is TEXT, not the
 * native JSON type — see docs/it-role-audit-log.md), so this must be JSON.parse()'d before use.
 * Re-stringifying a still-encoded string (the previous bug here) double-escapes every quote.
 */
function safeParse(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "object") return raw; // already parsed — defensive, shouldn't normally happen
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DiffPanel({ title, raw, compareRaw, borderClass }) {
  const [copied, setCopied] = useState(false);
  const data = safeParse(raw);
  const compareData = safeParse(compareRaw);
  const fields = data ? Object.keys(data) : [];

  const handleCopy = async (e) => {
    e.stopPropagation();
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — no-op, user can still select the text manually */
    }
  };

  return (
    <div className={borderClass}>
      <div className="mb-[6px] flex items-center justify-between">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--al-muted-foreground)]">
          {title}
        </h4>
        {data ? (
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-[4px] rounded-[6px] border border-[var(--al-border)] bg-[var(--al-card)] px-[8px] py-[2px] text-[10.5px] font-semibold text-[var(--al-muted-foreground)]",
              copied && "border-[var(--al-success)] text-[var(--al-success-foreground)]",
            )}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? "已复制" : "复制 JSON"}
          </button>
        ) : null}
      </div>

      {data ? (
        <div className="overflow-hidden rounded-[8px] border border-[var(--al-border)] bg-[var(--al-card)]">
          {fields.map((field) => {
            const changed =
              compareData != null &&
              JSON.stringify(compareData[field]) !== JSON.stringify(data[field]);
            return (
              <div
                key={field}
                className={cn(
                  "flex items-start justify-between gap-[10px] border-b border-[var(--al-border)] px-[10px] py-[6px] last:border-b-0",
                  changed && "al-diff-changed",
                )}
              >
                <span className="al-mono shrink-0 text-[11px] text-[var(--al-muted-foreground)]">{field}</span>
                <span className="al-mono break-all text-right text-[11px] tabular-nums text-[var(--al-foreground)]">
                  {formatFieldValue(data[field])}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[8px] border border-dashed border-[var(--al-border)] bg-[var(--al-card)] px-[12px] py-[10px] text-[11px] text-[var(--al-muted-foreground)]">
          {title === "操作前" ? "(不存在 / 新建)" : "(已删除)"}
        </div>
      )}
    </div>
  );
}

export function AuditLogRow({ log }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-[var(--al-border)] last:border-b-0">
      <div
        className={cn("al-row grid cursor-pointer grid-cols-[86px_1fr_70px_170px_92px_1.7fr_100px] items-center gap-[12px] px-[20px] py-[12px] hover:bg-[var(--al-muted)]", open && "is-open")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="al-mono text-[11.5px] tabular-nums text-[var(--al-muted-foreground)]">
          {formatTime(log.createdAt)}
        </span>
        <span className="min-w-0">
          <b className="block truncate text-[12.5px] font-semibold">{log.operatorName}</b>
          <span className="text-[10.5px] text-[var(--al-muted-foreground)]">{log.operatorRole}</span>
        </span>
        <span className="text-[12.5px] font-medium">{log.tenantCode}</span>
        <Badge tone="neutral" className="al-mono w-fit">
          {log.module}
        </Badge>
        <Badge tone={ACTION_TONE[log.action] || "neutral"}>{log.action}</Badge>
        <span className="min-w-0 text-[12.5px]">
          {log.summary}
          <span className="al-mono block truncate text-[11px] text-[var(--al-muted-foreground)]">{log.entityId}</span>
        </span>
        <span className="flex items-center justify-end gap-[8px]" onClick={(e) => e.stopPropagation()}>
          <ChevronRight size={14} className="al-chevron text-[var(--al-muted-foreground)]" />
        </span>
      </div>

      <div className={cn("al-detail", open && "is-open")}>
        <div className="bg-[var(--al-muted)] px-[20px] pb-[20px] pt-[16px]">
          <div className="mb-[12px] flex items-center gap-[8px] border-b border-[var(--al-border)] pb-[10px] text-[11.5px] text-[var(--al-muted-foreground)]">
            来源表
            <span className="al-mono rounded-[6px] border border-[var(--al-border)] bg-[var(--al-card)] px-[8px] py-[2px] text-[var(--al-foreground)]">
              {log.sourceTable}
            </span>
            · 字段名与数据库列名一致，可直接用于人工补数据
          </div>

          <div className="mb-[12px] grid grid-cols-1 gap-[14px] sm:grid-cols-2">
            <DiffPanel title="操作前" raw={log.beforeData} compareRaw={log.afterData} borderClass="al-diff-before" />
            <DiffPanel title="操作后" raw={log.afterData} compareRaw={log.beforeData} borderClass="al-diff-after" />
          </div>
        </div>
      </div>
    </div>
  );
}
