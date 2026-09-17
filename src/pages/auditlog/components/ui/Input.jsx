import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn.js";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "h-[36px] rounded-[var(--al-radius-sm)] border border-[var(--al-border)] bg-[var(--al-muted)] px-[10px] text-[length:var(--text-small)] text-[var(--al-foreground)] outline-none",
        "focus:border-[var(--al-ring)] focus:bg-[var(--al-card)]",
        className,
      )}
      {...props}
    />
  );
}

/** Native arrow swapped for our own chevron (appearance-none) so it matches the date picker's look. */
export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-[36px] w-full appearance-none rounded-[var(--al-radius-sm)] border border-[var(--al-border)] bg-[var(--al-muted)] py-0 pl-[10px] pr-[26px] text-[length:var(--text-small)] text-[var(--al-foreground)] outline-none",
          "focus:border-[var(--al-ring)] focus:bg-[var(--al-card)]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-[9px] top-1/2 -translate-y-1/2 text-[var(--al-muted-foreground)]" />
    </div>
  );
}
