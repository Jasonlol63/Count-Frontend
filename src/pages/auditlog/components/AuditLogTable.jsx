import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "./ui/Card.jsx";
import { AuditLogRow } from "./AuditLogRow.jsx";
import { cn } from "../lib/cn.js";
import { TABLE_COLS } from "../lib/tableCols.js";

export function AuditLogTable({ logs, loading, page, pageSize, total, onPageChange, selectedLog, onSelectLog }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total || 0);

  return (
    <Card className="overflow-hidden">
      {/* Scrolls internally both ways — the fixed-width columns must never force the
          page body itself to overflow horizontally (that's what pushed content under
          the sidebar), and a long log list must never keep stretching the page taller
          instead of scrolling within this card. Sized off the viewport directly (not
          "fill remaining flex space") so it doesn't depend on the app shell's own
          height/flex chain, which isn't set up for full-bleed pages outside the few
          that opt in via a body class. */}
      <div className="max-h-[calc(100vh-300px)] min-h-[280px] overflow-auto">
        <div className="min-w-[900px]">
          <div
            className={`sticky top-0 z-10 grid ${TABLE_COLS} gap-[12px] border-b border-[var(--al-border)] bg-[var(--al-card)] px-[20px] py-[12px]`}
          >
            {["", "时间", "操作人", "公司", "模块", "类型", "摘要"].map((h, i) => (
              <span
                key={h || i}
                className="text-[length:var(--text-small)] font-semibold uppercase tracking-wide text-[var(--al-muted-foreground)]"
              >
                {h}
              </span>
            ))}
          </div>

          {loading ? (
            <div className="px-[20px] py-[40px] text-center text-[length:var(--text-medium)] text-[var(--al-muted-foreground)]">
              加载中…
            </div>
          ) : logs.length === 0 ? (
            <div className="px-[20px] py-[40px] text-center text-[length:var(--text-medium)] text-[var(--al-muted-foreground)]">
              没有符合筛选条件的日志
            </div>
          ) : (
            <div>
              {logs.map((log) => (
                <AuditLogRow key={log.id} log={log} selected={selectedLog?.id === log.id} onSelect={onSelectLog} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--al-border)] px-[20px] py-[10px]">
        <span className="al-mono text-[length:var(--text-small)] text-[var(--al-muted-foreground)]">
          显示 {startIdx}-{endIdx} / 共 {total || 0} 条
        </span>
        <div className="flex items-center gap-[6px]">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={cn(
              "flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent text-[var(--al-muted-foreground)] hover:bg-[var(--al-muted)]",
              page <= 1 && "cursor-not-allowed opacity-40 hover:bg-transparent",
            )}
            aria-label="上一页"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="al-mono text-[length:var(--text-small)] text-[var(--al-muted-foreground)]">
            第 {page} / {totalPages} 页
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className={cn(
              "flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent text-[var(--al-muted-foreground)] hover:bg-[var(--al-muted)]",
              page >= totalPages && "cursor-not-allowed opacity-40 hover:bg-transparent",
            )}
            aria-label="下一页"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </Card>
  );
}
