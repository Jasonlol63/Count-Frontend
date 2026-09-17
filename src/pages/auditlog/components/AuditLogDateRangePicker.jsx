import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * Self-contained date-range picker built only for the Audit Log page — local React state,
 * no window.MaintenanceDateRangePicker global singleton and no shared #calendar-popup DOM
 * node (unlike utils/date/dateRangePicker.js, which several other pages share). Visual/
 * interaction shape mirrors that shared picker's quick-range + calendar layout.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEAR_MIN = 2022;

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
  { key: "lastYear", label: "Last Year" },
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (!y || !m || !d) return null;
  return startOfDay(new Date(y, m - 1, d));
}

function fmtDisplay(d) {
  if (!d) return "--";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}/${m}/${y}`;
}

function getPresetRange(key) {
  const today = startOfDay(new Date());
  let from;
  let to;
  switch (key) {
    case "today":
      from = today;
      to = today;
      break;
    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      from = d;
      to = d;
      break;
    }
    case "thisWeek": {
      const dow = (today.getDay() + 6) % 7;
      from = new Date(today);
      from.setDate(today.getDate() - dow);
      to = today;
      break;
    }
    case "lastWeek": {
      const dow = (today.getDay() + 6) % 7;
      to = new Date(today);
      to.setDate(today.getDate() - dow - 1);
      from = new Date(to);
      from.setDate(to.getDate() - 6);
      break;
    }
    case "thisMonth":
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = today;
      break;
    case "lastMonth":
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case "thisYear":
      from = new Date(today.getFullYear(), 0, 1);
      to = today;
      break;
    case "lastYear": {
      const y = today.getFullYear() - 1;
      from = new Date(y, 0, 1);
      to = new Date(y, 11, 31);
      break;
    }
    default:
      return null;
  }
  return { from: startOfDay(from), to: startOfDay(to) };
}

function matchingPresetKey(from, to) {
  if (!from || !to) return "";
  const match = PRESETS.find(({ key }) => {
    const r = getPresetRange(key);
    return r && r.from.getTime() === from.getTime() && r.to.getTime() === to.getTime();
  });
  return match?.key || "";
}

function buildMonthGrid(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const startOffset = new Date(year, month, 1).getDay();
  const prevMonthLastDate = new Date(year, month, 0).getDate();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) {
    const day = prevMonthLastDate - startOffset + 1 + i;
    cells.push({ date: startOfDay(new Date(year, month - 1, day)), otherMonth: true });
  }
  for (let d = 1; d <= lastDate; d += 1) {
    cells.push({ date: startOfDay(new Date(year, month, d)), otherMonth: false });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: startOfDay(new Date(year, month + 1, nextDay)), otherMonth: true });
    nextDay += 1;
  }
  return cells;
}

function buildYearGrid(centerYear) {
  const maxYear = new Date().getFullYear() + 1;
  const start = Math.max(YEAR_MIN, Math.min(centerYear - 3, maxYear - 7));
  const years = [];
  for (let y = start; y <= Math.min(maxYear, start + 7); y += 1) years.push(y);
  return years;
}

const resetButton = "cursor-pointer border-none bg-transparent";

export function AuditLogDateRangePicker({ dateFrom, dateTo, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState("days");
  const fromDate = useMemo(() => parseIso(dateFrom), [dateFrom]);
  const toDate = useMemo(() => parseIso(dateTo), [dateTo]);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = fromDate || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [pendingStart, setPendingStart] = useState(fromDate);
  const [pendingEnd, setPendingEnd] = useState(toDate);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const base = fromDate || new Date();
    setPendingStart(fromDate);
    setPendingEnd(toDate);
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setViewMode("days");
    // Only re-sync when the popover opens — not on every fromDate/toDate change while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activePreset = matchingPresetKey(fromDate, toDate);
  const days = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const years = useMemo(() => buildYearGrid(viewMonth.getFullYear()), [viewMonth]);

  const commit = (a, b) => {
    if (!a || !b) return;
    const [start, end] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
    onChange?.(toIso(start), toIso(end));
    setOpen(false);
  };

  const handlePreset = (key) => {
    const range = getPresetRange(key);
    if (!range) return;
    setViewMonth(new Date(range.from.getFullYear(), range.from.getMonth(), 1));
    setViewMode("days");
    commit(range.from, range.to);
  };

  const handleDayClick = (day) => {
    if (!pendingStart || (pendingStart && pendingEnd)) {
      setPendingStart(day);
      setPendingEnd(null);
      return;
    }
    setPendingEnd(day);
    commit(pendingStart, day);
  };

  const goMonth = (delta) => {
    if (viewMode === "months") {
      setViewMonth((m) => new Date(m.getFullYear() + delta, m.getMonth(), 1));
      return;
    }
    if (viewMode === "years") {
      setViewMonth((m) => new Date(m.getFullYear() + delta * 8, m.getMonth(), 1));
      return;
    }
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-[36px] items-center gap-[7px] rounded-[var(--al-radius-sm)] border border-[var(--al-border)] bg-[var(--al-muted)] px-[12px] text-[length:var(--text-base)] text-[var(--al-foreground)] outline-none",
          "hover:border-[var(--al-ring)] focus:border-[var(--al-ring)]",
        )}
      >
        <CalendarIcon size={14} className="text-[var(--al-muted-foreground)]" />
        <span className="al-mono whitespace-nowrap">
          {fmtDisplay(fromDate)} - {fmtDisplay(toDate)}
        </span>
        <ChevronDown size={14} className={cn("text-[var(--al-muted-foreground)] transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute left-0 top-[42px] z-30 flex overflow-hidden rounded-[var(--al-radius)] border border-[var(--al-border)] bg-[var(--al-card)] shadow-[var(--al-shadow)]">
          <div className="flex w-[104px] shrink-0 flex-col gap-[2px] border-r border-[var(--al-border)] bg-[var(--al-muted)] p-[6px]">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePreset(key)}
                className={cn(
                  resetButton,
                  "rounded-[6px] px-[8px] py-[6px] text-left text-[length:var(--text-small)] font-medium text-[var(--al-muted-foreground)] hover:bg-[var(--al-card)] hover:text-[var(--al-foreground)]",
                  activePreset === key &&
                    "bg-[var(--al-primary)] font-semibold text-[var(--al-primary-foreground)] hover:bg-[var(--al-primary)] hover:text-[var(--al-primary-foreground)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-[212px] p-[10px]">
            <div className="mb-[8px] flex items-center justify-between">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                className={cn(resetButton, "flex h-[20px] w-[20px] items-center justify-center rounded-[6px] text-[var(--al-muted-foreground)] hover:bg-[var(--al-muted)]")}
                aria-label="Previous"
              >
                <ChevronLeft size={13} />
              </button>

              <div className="flex items-center gap-[3px]">
                <button
                  type="button"
                  onClick={() => setViewMode((v) => (v === "months" ? "days" : "months"))}
                  className={cn(
                    resetButton,
                    "flex items-center gap-[2px] rounded-[6px] px-[6px] py-[3px] text-[length:var(--text-small)] font-semibold text-[var(--al-foreground)] hover:bg-[var(--al-muted)]",
                    viewMode === "months" && "bg-[var(--al-primary-muted)] text-[var(--al-primary)]",
                  )}
                >
                  {MONTHS[viewMonth.getMonth()]}
                  <ChevronDown size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode((v) => (v === "years" ? "days" : "years"))}
                  className={cn(
                    resetButton,
                    "flex items-center gap-[2px] rounded-[6px] px-[6px] py-[3px] text-[length:var(--text-small)] font-semibold text-[var(--al-foreground)] hover:bg-[var(--al-muted)]",
                    viewMode === "years" && "bg-[var(--al-primary-muted)] text-[var(--al-primary)]",
                  )}
                >
                  {viewMonth.getFullYear()}
                  <ChevronDown size={11} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => goMonth(1)}
                className={cn(resetButton, "flex h-[20px] w-[20px] items-center justify-center rounded-[6px] text-[var(--al-muted-foreground)] hover:bg-[var(--al-muted)]")}
                aria-label="Next"
              >
                <ChevronRight size={13} />
              </button>
            </div>

            {viewMode === "days" ? (
              <div className="grid grid-cols-7 gap-[1px]">
                {WEEKDAYS.map((d) => (
                  <span
                    key={d}
                    className="flex h-[20px] items-center justify-center text-[length:var(--text-tiny)] font-semibold uppercase tracking-wide text-[var(--al-muted-foreground)]"
                  >
                    {d[0]}
                  </span>
                ))}
                {days.map(({ date, otherMonth }) => {
                  const time = date.getTime();
                  const inRange = pendingStart && pendingEnd && time > pendingStart.getTime() && time < pendingEnd.getTime();
                  const isStart = pendingStart && time === pendingStart.getTime();
                  const isEnd = pendingEnd && time === pendingEnd.getTime();
                  const isEdge = isStart || isEnd;
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => handleDayClick(date)}
                      className={cn(
                        resetButton,
                        "flex h-[24px] items-center justify-center rounded-[6px] text-[length:var(--text-small)] tabular-nums text-[var(--al-foreground)] hover:bg-[var(--al-muted)]",
                        otherMonth && "text-[var(--al-muted-foreground)] opacity-50",
                        inRange && "rounded-none bg-[var(--al-primary-muted)] hover:bg-[var(--al-primary-muted)]",
                        isEdge && "bg-[var(--al-primary)] text-[var(--al-primary-foreground)] hover:bg-[var(--al-primary)]",
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            ) : viewMode === "months" ? (
              <div className="grid grid-cols-3 gap-[4px]">
                {MONTHS.map((label, idx) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setViewMonth((m) => new Date(m.getFullYear(), idx, 1));
                      setViewMode("days");
                    }}
                    className={cn(
                      resetButton,
                      "rounded-[6px] py-[6px] text-[length:var(--text-small)] font-medium text-[var(--al-foreground)] hover:bg-[var(--al-muted)]",
                      idx === viewMonth.getMonth() && "bg-[var(--al-primary)] text-[var(--al-primary-foreground)] hover:bg-[var(--al-primary)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-[4px]">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setViewMonth((m) => new Date(y, m.getMonth(), 1));
                      setViewMode("days");
                    }}
                    className={cn(
                      resetButton,
                      "rounded-[6px] py-[6px] text-[length:var(--text-small)] font-medium text-[var(--al-foreground)] hover:bg-[var(--al-muted)]",
                      y === viewMonth.getFullYear() && "bg-[var(--al-primary)] text-[var(--al-primary-foreground)] hover:bg-[var(--al-primary)]",
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
