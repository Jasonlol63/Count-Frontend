import { cn } from "../../lib/cn.js";

const TONES = {
  neutral: "bg-[var(--al-muted)] text-[var(--al-muted-foreground)] border-[var(--al-border)]",
  primary: "bg-[var(--al-primary-muted)] text-[var(--al-primary)] border-transparent",
  success: "bg-[var(--al-success-muted)] text-[var(--al-success-foreground)] border-transparent",
  destructive: "bg-[var(--al-destructive-muted)] text-[var(--al-destructive-foreground)] border-transparent",
  warning: "bg-[var(--al-warning-muted)] text-[var(--al-warning-foreground)] border-transparent",
};

export function Badge({ tone = "neutral", className, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-[10px] py-[2px] text-[11px] font-bold tracking-wide",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
