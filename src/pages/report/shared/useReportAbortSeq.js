import { useCallback, useEffect, useMemo, useRef } from "react";

/** AbortController + monotonic seq for stale async completion guards. */
export function useReportAbortSeq() {
  const seqRef = useRef(0);
  const abortRef = useRef(null);

  const invalidate = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    seqRef.current += 1;
  }, []);

  const begin = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const seq = ++seqRef.current;
    return { ac, seq, signal: ac.signal };
  }, []);

  const isCurrent = useCallback((seq) => seq === seqRef.current, []);

  useEffect(() => () => invalidate(), [invalidate]);

  return useMemo(
    () => ({ begin, invalidate, isCurrent, seqRef }),
    [begin, invalidate, isCurrent],
  );
}
