import { useCallback, useEffect, useRef, useState } from "react";
import { toDataCaptureWordFieldCase } from "../lib/dataCaptureFormRules.js";
import {
  loadStoredRemoveWordChips,
  mergeRemoveWordChips,
  parseRemoveWordChips,
  saveStoredRemoveWordChips,
  serializeRemoveWordChips,
} from "../lib/dataCaptureRemoveWordChips.js";

export default function RemoveWordChipInput({
  value,
  onChange,
  processId = null,
  scopeCompanyId = null,
  id = "capture_remove_word",
  name = "remove_word",
  placeholder = "",
  removeChipAriaLabel = "Remove",
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const chips = parseRemoveWordChips(value);

  const commitChips = useCallback(
    (nextChips) => {
      const serialized = serializeRemoveWordChips(nextChips);
      onChange?.(serialized);
      if (processId) {
        saveStoredRemoveWordChips(scopeCompanyId, processId, nextChips);
      }
    },
    [onChange, processId, scopeCompanyId],
  );

  useEffect(() => {
    if (!processId) return;
    const fromValue = parseRemoveWordChips(value);
    const stored = loadStoredRemoveWordChips(scopeCompanyId, processId);
    const merged = mergeRemoveWordChips(fromValue, stored);
    const serialized = serializeRemoveWordChips(merged);
    if (serialized !== serializeRemoveWordChips(fromValue)) {
      onChange?.(serialized);
    }
    if (merged.length) {
      saveStoredRemoveWordChips(scopeCompanyId, processId, merged);
    }
  }, [processId, scopeCompanyId, value, onChange]);

  const addDraftWord = useCallback(() => {
    const word = toDataCaptureWordFieldCase(draft.trim());
    if (!word) return;
    const exists = chips.some((chip) => chip.toLowerCase() === word.toLowerCase());
    if (exists) {
      setDraft("");
      return;
    }
    commitChips([...chips, word]);
    setDraft("");
  }, [chips, commitChips, draft]);

  const removeChip = useCallback(
    (index) => {
      commitChips(chips.filter((_, i) => i !== index));
    },
    [chips, commitChips],
  );

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraftWord();
      return;
    }
    if (event.key === ";" || event.key === ",") {
      event.preventDefault();
      addDraftWord();
      return;
    }
    if (event.key === "Backspace" && draft === "" && chips.length > 0) {
      event.preventDefault();
      commitChips(chips.slice(0, -1));
    }
  };

  const inputWidthCh = Math.max(
    chips.length === 0 ? Math.min(placeholder.length, 28) : 4,
    draft.length + 1,
    4,
  );

  return (
    <div className="dc-remove-word-chip-input" onClick={handleContainerClick}>
      {chips.map((chip, index) => (
        <span key={`${chip}-${index}`} className="dc-remove-word-chip">
          <span className="dc-remove-word-chip__label">{chip}</span>
          <button
            type="button"
            className="dc-remove-word-chip__remove"
            aria-label={`${removeChipAriaLabel} ${chip}`}
            onClick={(event) => {
              event.stopPropagation();
              removeChip(index);
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        className="dc-remove-word-chip-input__field"
        value={draft}
        placeholder={chips.length ? "" : placeholder}
        style={{ width: `${inputWidthCh}ch` }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
    </div>
  );
}
