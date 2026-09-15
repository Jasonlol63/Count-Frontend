import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Local to auditlog (not added to shared src/lib) per the page's new-files-only styling rule. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
