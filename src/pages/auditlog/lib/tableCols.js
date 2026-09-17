/**
 * Shared column template for the log table header (AuditLogTable) and each row
 * (AuditLogRow) — must stay identical between the two or columns misalign.
 * Fixed/max widths instead of `fr` on every column: unbounded `fr` columns stretch to
 * fill whatever's left on a wide screen, leaving short values like a name or
 * "system_maintenance_mode" stranded in a lot of empty space. Only the summary column
 * stays flexible — it's meant to take the remaining room — everything else is sized to
 * what it actually needs. The leading column is the colored timeline-rail dot.
 */
export const TABLE_COLS = "grid-cols-[22px_90px_200px_90px_170px_90px_1fr]";
