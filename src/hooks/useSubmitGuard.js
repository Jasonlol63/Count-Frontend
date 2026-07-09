import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Prevents duplicate async submits from rapid clicks.
 * Ref blocks synchronously before React re-renders; state drives button disabled UI.
 */
export function useSubmitGuard(active = true) {
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    submittingRef.current = false;
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!active) reset();
  }, [active, reset]);

  const guardSubmit = useCallback((handler) => {
    return (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      Promise.resolve(handler?.(e)).finally(() => {
        submittingRef.current = false;
        setSubmitting(false);
      });
    };
  }, []);

  const runGuarded = useCallback((handler) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    Promise.resolve(handler?.()).finally(() => {
      submittingRef.current = false;
      setSubmitting(false);
    });
  }, []);

  return { submitting, guardSubmit, runGuarded, reset };
}
