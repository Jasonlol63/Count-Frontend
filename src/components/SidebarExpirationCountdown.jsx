export default function SidebarExpirationCountdown({
  status = "normal",
  label = "Exp:",
  hint = "-",
  clickable = false,
  onClick,
  onKeyDown,
  title,
}) {
  return (
    <div
      className={`company-expiration-countdown ${status}${clickable ? " is-clickable" : ""}`}
      title={title}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? onKeyDown : undefined}
    >
      <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <div className="expiration-content">
        <span className="expiration-label">{label}</span>
        <span className="expiration-countdown-text">{hint}</span>
      </div>
    </div>
  );
}
