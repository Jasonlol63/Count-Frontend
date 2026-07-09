/** Lightweight loader while a lazy route chunk downloads (main content only). */
export default function PageShellLoading({ label = "Loading…" }) {
  return (
    <div className="ec-page-shell-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="ec-app-boot-loading__spinner" aria-hidden="true" />
      <span className="ec-app-boot-loading__label">{label}</span>
    </div>
  );
}
