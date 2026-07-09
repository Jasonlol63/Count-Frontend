/**
 * Virtual list row estimates — keep aligned with --report-list-* in design-tokens.css
 * and maintenance_unified_filters.css (Customer Report table).
 */
/**
 * Virtual list row estimate (content-box, same as .customer-report-card):
 * min-height + vertical padding + line box slack.
 */
export const MAINTENANCE_REPORT_ROW_HEIGHT = 32;

/** Formula inline-edit rows need extra height for inputs */
export const MAINTENANCE_FORMULA_EDIT_ROW_HEIGHT = 80;
