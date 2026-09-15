import { cn } from "../../lib/cn.js";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "h-[32px] rounded-[var(--al-radius-sm)] border border-[var(--al-border)] bg-[var(--al-muted)] px-[10px] text-[12px] text-[var(--al-foreground)] outline-none",
        "focus:border-[var(--al-ring)] focus:bg-[var(--al-card)]",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        "h-[32px] rounded-[var(--al-radius-sm)] border border-[var(--al-border)] bg-[var(--al-muted)] px-[8px] text-[12px] text-[var(--al-foreground)] outline-none",
        "focus:border-[var(--al-ring)] focus:bg-[var(--al-card)]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
