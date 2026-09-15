import { cn } from "../../lib/cn.js";

const VARIANTS = {
  default: "bg-[var(--al-primary)] text-[var(--al-primary-foreground)] hover:opacity-90",
  outline:
    "border border-[var(--al-border)] bg-[var(--al-card)] text-[var(--al-foreground)] hover:bg-[var(--al-muted)]",
  warning:
    "border border-[var(--al-warning)] bg-[var(--al-card)] text-[var(--al-warning-foreground)] hover:bg-[var(--al-warning-muted)]",
  ghost: "text-[var(--al-muted-foreground)] hover:bg-[var(--al-muted)] hover:text-[var(--al-foreground)]",
};

/* px, not Tailwind's default rem scale — see auditlog.css comment on --al-radius. */
const SIZES = {
  sm: "h-[28px] px-[10px] text-[12px] gap-[6px]",
  default: "h-[36px] px-[14px] text-[14px] gap-[8px]",
};

export function Button({ variant = "default", size = "default", className, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--al-radius-sm)] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 cursor-pointer",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
