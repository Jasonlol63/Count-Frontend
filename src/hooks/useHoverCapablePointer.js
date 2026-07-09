import { useEffect, useState } from "react";

/** Real mouse/trackpad hover — not touch or sticky mobile :hover. */
export const HOVER_CAPABLE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export function useHoverCapablePointer() {
  const [hoverCapable, setHoverCapable] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(HOVER_CAPABLE_POINTER_QUERY).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(HOVER_CAPABLE_POINTER_QUERY);
    const onChange = () => setHoverCapable(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return hoverCapable;
}
