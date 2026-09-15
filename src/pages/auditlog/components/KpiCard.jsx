import { Card } from "./ui/Card.jsx";
import { cn } from "../lib/cn.js";

const TONES = {
  success: {
    icon: "bg-[var(--al-success-muted)] text-[var(--al-success-foreground)]",
    delta: "bg-[var(--al-success-muted)] text-[var(--al-success-foreground)]",
  },
  primary: {
    icon: "bg-[var(--al-primary-muted)] text-[var(--al-primary)]",
    delta: "bg-[var(--al-primary-muted)] text-[var(--al-primary)]",
  },
  destructive: {
    icon: "bg-[var(--al-destructive-muted)] text-[var(--al-destructive-foreground)]",
    delta: "bg-[var(--al-destructive-muted)] text-[var(--al-destructive-foreground)]",
  },
  warning: {
    icon: "bg-[var(--al-warning-muted)] text-[var(--al-warning-foreground)]",
    delta: "bg-[var(--al-warning-muted)] text-[var(--al-warning-foreground)]",
  },
};

export function KpiCard({ icon: Icon, label, value, delta, tone = "primary" }) {
  const t = TONES[tone];
  return (
    <Card className="flex flex-col gap-[10px] p-[16px]">
      <div className="flex items-center gap-[8px]">
        <span className={cn("flex h-[28px] w-[28px] items-center justify-center rounded-[8px]", t.icon)}>
          <Icon size={14} strokeWidth={2.3} />
        </span>
        <span className="text-[12px] font-medium text-[var(--al-muted-foreground)]">{label}</span>
      </div>
      <span className="al-mono text-[24px] font-semibold tabular-nums text-[var(--al-foreground)]">{value}</span>
      {delta ? (
        <span className={cn("w-fit rounded-full px-[8px] py-[2px] text-[11px] font-semibold", t.delta)}>{delta}</span>
      ) : null}
    </Card>
  );
}
