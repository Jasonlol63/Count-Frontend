import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "../lib/cn.js";
import { safeParse, formatFieldValue } from "../lib/auditFormat.js";

/**
 * A code-block-styled line per field — one neutral color for everything unchanged (no
 * per-type "rainbow" syntax coloring, that read as noisy), with a single dedicated amber
 * accent reserved for "this field changed": left border + a faint full-row wash so the
 * change reads as one visual block, not just a thin line easy to miss. Deliberately not
 * the app's primary blue — that's already "selected row", reusing it here would blur the
 * two meanings together.
 */
function DiffRow({ field, before, after, hasBefore, hasAfter }) {
  const changed = hasBefore && hasAfter && JSON.stringify(before) !== JSON.stringify(after);
  const bText = hasBefore ? formatFieldValue(before) : null;
  const aText = hasAfter ? formatFieldValue(after) : null;

  return (
    <div
      className={cn(
        "px-[13px] py-[7px]",
        changed && "border-l-[3px] border-[var(--al-warning)] bg-[var(--al-warning-muted)] pl-[10px]",
      )}
    >
      <div
        className={cn(
          "al-mono mb-[2px] break-all text-[length:var(--text-small)]",
          changed ? "font-semibold text-[var(--al-warning-foreground)]" : "text-[var(--al-muted-foreground)]",
        )}
      >
        {field}
      </div>
      {changed ? (
        <div className="flex flex-wrap items-center gap-[6px]">
          <span className="al-mono break-all text-[length:var(--text-medium)] text-[var(--al-muted-foreground)] line-through">{bText}</span>
          <span className="shrink-0 text-[length:var(--text-medium)] font-bold text-[var(--al-warning)]">→</span>
          <span className="al-mono break-all text-[length:var(--text-medium)] font-bold text-[var(--al-foreground)]">{aText}</span>
        </div>
      ) : (
        <div className="al-mono break-all text-[length:var(--text-medium)] text-[var(--al-foreground)]">{bText ?? aText ?? "—"}</div>
      )}
    </div>
  );
}

const SECTION_TITLE = { CREATE: "创建内容", DELETE: "删除前数据" };

export function DiffTable({ beforeRaw, afterRaw, action }) {
  const [copied, setCopied] = useState(false);
  const before = safeParse(beforeRaw);
  const after = safeParse(afterRaw);
  const fields = [...new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])])];
  const title = SECTION_TITLE[action] || "字段改动";

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(JSON.stringify({ before, after }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — no-op, user can still select the text manually */
    }
  };

  if (fields.length === 0) {
    return (
      <div className="rounded-[8px] border border-dashed border-[var(--al-border)] bg-[var(--al-muted)] px-[12px] py-[10px] text-[length:var(--text-medium)] text-[var(--al-muted-foreground)]">
        没有字段数据
      </div>
    );
  }

  return (
    <div>
      <div className="mb-[6px] flex items-center justify-between">
        <h4 className="text-[length:var(--text-small)] font-semibold uppercase tracking-wide text-[var(--al-muted-foreground)]">
          {title}
        </h4>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "flex cursor-pointer items-center gap-[4px] rounded-[6px] border border-[var(--al-border)] bg-[var(--al-card)] px-[8px] py-[2px] text-[length:var(--text-small)] font-semibold text-[var(--al-muted-foreground)]",
            copied && "border-[var(--al-success)] text-[var(--al-success-foreground)]",
          )}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "已复制" : "复制 JSON"}
        </button>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-[var(--al-border)] bg-[var(--al-muted)] py-[2px]">
        {fields.map((field) => (
          <DiffRow
            key={field}
            field={field}
            before={before ? before[field] : undefined}
            after={after ? after[field] : undefined}
            hasBefore={before != null}
            hasAfter={after != null}
          />
        ))}
      </div>
    </div>
  );
}
