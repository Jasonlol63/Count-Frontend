/** Visual-only loader for Data Capture Summary (no loading text). */
export default function SummaryPageLoading({ compact = false }) {
  return (
    <div
      className={`loading-container${compact ? " loading-container--compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-spinner" aria-hidden="true" />
    </div>
  );
}
