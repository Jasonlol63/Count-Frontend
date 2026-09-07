/**
 * Sidebar idle / layout warm — used to prefetch `dashboard_bootstrap_api.php` for the
 * persisted scope. That PHP endpoint has no Spring equivalent (only the KPI cards were
 * migrated, to `/api/dashboard/kpi`, fetched directly by `useDashboardPage`'s own effect —
 * no prefetch/warm layer for it, it's a light single GET). This is a perceived-performance
 * optimization only, not a correctness requirement, so it is a deliberate no-op rather than
 * being rewired: warming the new endpoint here would just race/duplicate the live fetch for
 * no real benefit.
 * @param {{ me?: object|null }} options
 */
export function warmDashboardRouteCache(_options = {}) {
  return null;
}
