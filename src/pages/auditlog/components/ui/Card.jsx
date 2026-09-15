import { cn } from "../../lib/cn.js";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[var(--al-radius)] border border-[var(--al-border)] bg-[var(--al-card)] shadow-[var(--al-shadow)]",
        className,
      )}
      {...props}
    />
  );
}
