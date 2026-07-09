/** Full-viewport boot overlay while auth/session bootstraps (dashboard chrome, not login bg). */
export default function AppBootLoading({ label = "Loading…" }) {
  return (
    <div className="ec-app-boot-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="ec-app-boot-loading__spinner" aria-hidden="true" />
      <span className="ec-app-boot-loading__label">{label}</span>
    </div>
  );
}
