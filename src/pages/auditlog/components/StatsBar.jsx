import { cn } from "../lib/cn.js";

const TONES = {
  neutral: "text-[var(--al-foreground)]",
  success: "text-[var(--al-success-foreground)]",
  primary: "text-[var(--al-primary)]",
  destructive: "text-[var(--al-destructive-foreground)]",
  warning: "text-[var(--al-warning-foreground)]",
};

/**
 * Inline stat pills sitting next to the page title — not a separate boxed card. Four
 * competing colored KPI boxes (the original design) and even a single bordered strip both
 * read as "one more box stacked on the page"; this is just numbers, no card chrome at all.
 */
export function StatsBar({ cells }) {
  return (
    <div className="flex items-center gap-[18px]">
      {cells.map((cell, i) => (
        <div key={cell.label} className="flex items-center gap-[18px]">
          {i > 0 ? <span className="h-[20px] w-px bg-[var(--al-border)]" /> : null}
          <div className="flex items-baseline gap-[6px]">
            <span className={cn("al-mono text-[length:var(--text-h3)] font-bold tabular-nums", TONES[cell.tone || "neutral"])}>
              {cell.value}
            </span>
            <span className="text-[length:var(--text-tiny)] font-semibold uppercase tracking-wide text-[var(--al-muted-foreground)]">
              {cell.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
