import { useEffect } from "react";

/**
 * Keeps the login background shell on `body.bg` without removing it on unmount.
 * Removing `bg` between login ↔ secondary-password toggles scrollbar-gutter / flex
 * centering and causes a visible layout shift.
 */
export function useAuthBackground() {
  useEffect(() => {
    document.body.classList.add("bg");
  }, []);
}
