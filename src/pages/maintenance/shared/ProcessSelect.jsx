import { useEffect, useRef, useState } from "react";

/**
 * Searchable process dropdown for maintenance pages.
 * @param {"id"|"processName"} valueMode — capture uses DB id; formula/transaction use process_name
 */
export default function ProcessSelect({
  processes,
  selectedValue,
  onSelect,
  valueMode = "processName",
  placeholder = "--Select All--",
  unsetPlaceholder,
  searchPlaceholder = "Search process...",
  noResultsText = "No results found",
  ariaLabelledBy,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const useIdValue = valueMode === "id";
  const useTransactionSelectAll = valueMode === "processName" && unsetPlaceholder == null;

  const filteredProcesses = (Array.isArray(processes) ? processes : []).filter((p) => {
    const name = String(p.process_name ?? p.process ?? p.process_id ?? "").trim();
    const text = p.description ? `${name} (${p.description})` : name;
    if (!text) return false;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const selectAllSeed = useTransactionSelectAll
    ? { id: null, process_name: placeholder }
    : { id: "", process_name: placeholder };

  const displayProcesses = [selectAllSeed, ...filteredProcesses];

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isSelectAllOption = (process) => {
    if (useIdValue) {
      return !(process?.id != null && process.process_name !== placeholder);
    }
    if (useTransactionSelectAll) {
      return (
        process == null ||
        process.id == null ||
        process.id === "" ||
        process.process_name === placeholder
      );
    }
    return !(process?.id != null && process.process_name !== placeholder);
  };

  const resolveValue = (process) => {
    if (isSelectAllOption(process)) return "";
    if (useIdValue) return String(process.id);
    return String(process.process_name);
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
    setSearchTerm("");
    setHighlightedIndex(0);
  };

  const handleSelect = (process) => {
    onSelect(resolveValue(process));
    setIsOpen(false);
  };

  const getDisplayText = (value) => {
    if (value === null || value === undefined) {
      return unsetPlaceholder || placeholder;
    }
    if (!value || value === placeholder) return placeholder;

    const list = Array.isArray(processes) ? processes : [];
    const p = useIdValue
      ? list.find((proc) => String(proc.id) === String(value))
      : list.find((proc) => String(proc.process_name ?? proc.process ?? "") === value);
    if (!p) return placeholder;
    const name = String(p.process_name ?? p.process ?? p.process_id ?? "").trim();
    return p.description ? `${name} (${p.description})` : name || placeholder;
  };

  const handleKeyDown = (e) => {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % displayProcesses.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + displayProcesses.length) % displayProcesses.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(displayProcesses[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="custom-select-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`custom-select-button ${isOpen ? "open" : ""}`}
        onClick={handleToggle}
        aria-labelledby={ariaLabelledBy || undefined}
      >
        {getDisplayText(selectedValue)}
      </button>

      {isOpen && (
        <div className="custom-select-dropdown show">
          <div className="custom-select-search">
            <input
              type="text"
              placeholder={searchPlaceholder}
              autoComplete="off"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              ref={searchInputRef}
            />
          </div>
          <div className="custom-select-options">
            {displayProcesses.length > 0 ? (
              displayProcesses.map((p, index) => {
                const value = resolveValue(p);
                let text;
                if (isSelectAllOption(p)) {
                  text = placeholder;
                } else if (useTransactionSelectAll) {
                  const name = String(p.process_name ?? p.process ?? "").trim();
                  text = p.description ? `${name} (${p.description})` : name;
                } else {
                  const name = String(p.process_name ?? p.process ?? "").trim();
                  text =
                    name && name !== placeholder
                      ? p.description
                        ? `${name} (${p.description})`
                        : name
                      : placeholder;
                }

                return (
                  <div
                    key={index}
                    className={`custom-select-option ${selectedValue === value ? "selected" : ""} ${highlightedIndex === index ? "highlighted" : ""}`}
                    onClick={() => handleSelect(p)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {text}
                  </div>
                );
              })
            ) : (
              <div className="custom-select-no-results">{noResultsText}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
