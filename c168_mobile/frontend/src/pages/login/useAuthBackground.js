import { useEffect } from "react";

export function useAuthBackground() {
  useEffect(() => {
    document.body.classList.add("bg");
    return () => {
      document.body.classList.remove("bg");
    };
  }, []);
}
