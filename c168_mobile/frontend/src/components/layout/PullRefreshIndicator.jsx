import "./pull-refresh.css";

/** Circular pull / refresh indicator — moves with content, no layout jump. */
export default function PullRefreshIndicator({ pullPx, progress, phase, labels }) {
  const spinning = phase === "refreshing";
  const armed = phase === "armed";
  const settling = phase === "settling";
  const pulling = phase === "pulling" || armed;

  if (pullPx < 0.5 && !spinning && !settling) return null;

  const label = spinning
    ? labels.loading || "Loading…"
    : armed
      ? labels.releaseToRefresh || "Release to refresh"
      : labels.pullToRefresh || "Pull to refresh";

  const size = 28;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const arcLen = circumference * Math.min(1, progress);
  const opacity = Math.min(1, 0.35 + progress * 0.75);

  return (
    <div
      className="m-pull-refresh"
      style={{
        height: Math.max(pullPx, spinning || settling ? 46 : 0),
        opacity,
        transition: settling ? "height 280ms ease, opacity 200ms ease" : undefined,
      }}
      aria-live={spinning ? "polite" : undefined}
      aria-hidden={!pulling && !spinning && !settling}
    >
      <div className="m-pull-refresh-inner">
        <div className="m-pull-refresh-icon-wrap">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={spinning ? "svg--spinning" : ""}
            style={spinning ? { animation: "mPullSpin 0.75s linear infinite" } : undefined}
            aria-hidden="true"
          >
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
            {!spinning ? (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={armed ? "#0d60ff" : "#94a3b8"}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${arcLen} ${circumference}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: pulling ? undefined : "stroke-dasharray 200ms ease" }}
              />
            ) : (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="#0d60ff"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circumference * 0.28} ${circumference}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            )}
          </svg>
          {!spinning && (
            <i
              className={`fas fa-arrow-down m-pull-refresh-arrow ${
                armed ? "m-pull-refresh-arrow--armed" : "m-pull-refresh-arrow--idle"
              }`}
              aria-hidden="true"
            />
          )}
        </div>
        {(pulling || spinning) && (
          <span
            className={`m-pull-refresh-label ${
              armed || spinning ? "m-pull-refresh-label--active" : "m-pull-refresh-label--idle"
            }`}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
