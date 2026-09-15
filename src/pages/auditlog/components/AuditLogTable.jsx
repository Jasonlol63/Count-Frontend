import { Card } from "./ui/Card.jsx";
import { AuditLogRow } from "./AuditLogRow.jsx";

const COLS = "grid-cols-[86px_1fr_70px_170px_92px_1.7fr_100px]";

export function AuditLogTable({ logs, loading }) {
  return (
    <Card className="overflow-hidden">
      {/* Scrolls internally when narrow — the fixed-width columns must never force
          the page body itself to overflow horizontally (that's what pushed content
          under the sidebar). */}
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className={`grid ${COLS} gap-[12px] border-b border-[var(--al-border)] px-[20px] py-[10px]`}>
            {["时间", "操作人", "公司", "模块", "类型", "摘要", ""].map((h, i) => (
              <span key={h || i} className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--al-muted-foreground)]">
                {h}
              </span>
            ))}
          </div>

          {loading ? (
            <div className="px-[20px] py-[40px] text-center text-[12.5px] text-[var(--al-muted-foreground)]">加载中…</div>
          ) : logs.length === 0 ? (
            <div className="px-[20px] py-[40px] text-center text-[12.5px] text-[var(--al-muted-foreground)]">
              没有符合筛选条件的日志
            </div>
          ) : (
            <div>
              {logs.map((log) => (
                <AuditLogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
