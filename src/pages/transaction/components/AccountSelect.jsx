import { useEffect, useMemo, useRef, useState } from "react";

export function AccountSelect({
  placeholder,
  options,
  value,
  onChange,
  disabled,
  profitType,
  selectedCategories,
  ariaLabelledBy,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const searchRef = useRef(null);
  const optionsContainerRef = useRef(null);
  const containerRef = useRef(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toUpperCase();
    let rows = Array.isArray(options) ? options : [];
    if (Array.isArray(selectedCategories) && selectedCategories.length > 0) {
      const set = new Set(selectedCategories.map((c) => String(c).toUpperCase()));
      rows = rows.filter((r) => set.has(String(r.role || "").toUpperCase()));
    }
    if (!q) return rows;
    return rows.filter((r) => String(r.display_text || "").toUpperCase().includes(q));
  }, [options, filter, selectedCategories]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
      setHighlightIdx(-1);
    } else {
      setFilter("");
      setHighlightIdx(-1);
    }
  }, [open]);

  useEffect(() => {
    setHighlightIdx(-1);
  }, [filter]);

  useEffect(() => {
    setHighlightIdx((hi) => {
      if (hi < 0) return hi;
      return hi >= filtered.length ? -1 : hi;
    });
  }, [filtered.length]);

  useEffect(() => {
    if (!open || highlightIdx < 0 || !optionsContainerRef.current) return;
    const node = optionsContainerRef.current.querySelector(`[data-opt-idx="${highlightIdx}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open, filtered]);

  const displayText = value?.display_text ? value.display_text : placeholder;

  return (
    <div className="custom-select-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        aria-label={ariaLabel || undefined}
        aria-labelledby={ariaLabel ? undefined : ariaLabelledBy || undefined}
        data-placeholder={placeholder}
        data-value={value?.id ?? ""}
        data-account-id={value?.id ?? ""}
        data-account-code={value?.account_id ?? ""}
        data-currency={value?.currency != null && String(value.currency).trim() !== "" ? String(value.currency).trim().toUpperCase() : ""}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        {displayText}
      </button>
      <div className={`custom-select-dropdown${open ? " show" : ""}`}>
        <div className="custom-select-search">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search account..."
            autoComplete="off"
            disabled={disabled}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
              if (e.key === "Backspace" && !filter) {
                e.preventDefault();
                onChange?.(null);
                return;
              }
              const len = filtered.length;
              if (len === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIdx((hi) => (hi < 0 ? 0 : (hi + 1) % len));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIdx((hi) => (hi <= 0 ? len - 1 : hi - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const pick = highlightIdx >= 0 ? filtered[highlightIdx] : filtered[0];
                if (pick) {
                  onChange(pick);
                  setOpen(false);
                }
              }
            }}
          />
        </div>
        <div className="custom-select-options" ref={optionsContainerRef}>
          {filtered.length === 0 ? (
            <div className="custom-select-no-results">No results</div>
          ) : (
            filtered.map((opt, idx) => (
              <div
                key={opt.id}
                data-opt-idx={idx}
                className={`custom-select-option${String(value?.id) === String(opt.id) ? " selected" : ""}${
                  highlightIdx === idx && highlightIdx >= 0 ? " keyboard-focus" : ""
                }`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                {opt.display_text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AccountSelect;
