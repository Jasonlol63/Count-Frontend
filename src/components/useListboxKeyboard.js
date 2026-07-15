import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTypeAheadState,
  isTypeAheadKey,
  matchTypeAheadIndex,
  resetTypeAheadState,
} from "./typeAheadMatch.js";

/**
 * Keyboard navigation for custom listbox dropdowns (ArrowUp/Down, Enter, Escape, type-ahead).
 */
export function useListboxKeyboard({ open, itemCount, resetToken = null, initialIndex = 0, getItemLabel = null, onTypeAheadChange = null }) {
  const [highlightIdx, setHighlightIdx] = useState(initialIndex);
  const [typeAheadPrefix, setTypeAheadPrefix] = useState("");
  const listRef = useRef(null);
  const typeAheadRef = useRef(createTypeAheadState());

  const clearTypeAhead = useCallback(() => {
    resetTypeAheadState(typeAheadRef.current);
    setTypeAheadPrefix("");
    onTypeAheadChange?.("");
  }, [onTypeAheadChange]);

  useEffect(() => {
    if (!open) {
      setHighlightIdx(initialIndex);
      clearTypeAhead();
    }
  }, [open, initialIndex, clearTypeAhead]);

  useEffect(() => {
    if (open) setHighlightIdx(initialIndex);
  }, [resetToken, initialIndex, open]);

  useEffect(() => {
    if (!open || highlightIdx < 0 || !listRef.current) return;
    const node = listRef.current.querySelector(`[data-kb-idx="${highlightIdx}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open, itemCount]);

  const buildLabels = useCallback(
    (len) => {
      const count = len ?? itemCount;
      if (!getItemLabel || count <= 0) return [];
      return Array.from({ length: count }, (_, idx) => getItemLabel(idx));
    },
    [getItemLabel, itemCount],
  );

  const tryTypeAhead = useCallback(
    (key, len) => {
      if (!getItemLabel) return -1;
      const labels = buildLabels(len);
      const idx = matchTypeAheadIndex(labels, key, typeAheadRef.current);
      if (idx >= 0) {
        setTypeAheadPrefix(typeAheadRef.current.buffer);
        onTypeAheadChange?.(typeAheadRef.current.buffer);
        setHighlightIdx(idx);
      }
      return idx;
    },
    [buildLabels, getItemLabel, onTypeAheadChange],
  );

  const moveDown = useCallback((len) => {
    if (len <= 0) return;
    clearTypeAhead();
    setHighlightIdx((hi) => (hi < 0 ? 0 : (hi + 1) % len));
  }, [clearTypeAhead]);

  const moveUp = useCallback((len) => {
    if (len <= 0) return;
    clearTypeAhead();
    setHighlightIdx((hi) => (hi <= 0 ? len - 1 : hi - 1));
  }, [clearTypeAhead]);

  const handleListKeyDown = useCallback(
    (e, { len, onSelectIndex, onClose }) => {
      const count = len ?? itemCount;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (count <= 0) return;

      if (getItemLabel && isTypeAheadKey(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const idx = tryTypeAhead(e.key, count);
        if (idx >= 0) {
          e.preventDefault();
          return;
        }
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveDown(count);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveUp(count);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const idx = highlightIdx >= 0 ? highlightIdx : 0;
        onSelectIndex?.(idx);
      }
    },
    [highlightIdx, itemCount, getItemLabel, tryTypeAhead, moveDown, moveUp],
  );

  const handleButtonKeyDown = useCallback(
    (e, { isOpen, onToggleOpen, onClose, len, onSelectIndex }) => {
      const count = len ?? itemCount;
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (!isOpen) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleOpen?.();
        }
        return;
      }
      handleListKeyDown(e, { len: count, onSelectIndex, onClose });
    },
    [handleListKeyDown, itemCount],
  );

  const highlightClass = (idx) => (highlightIdx === idx && highlightIdx >= 0 ? " keyboard-focus" : "");

  return {
    highlightIdx,
    setHighlightIdx,
    listRef,
    handleListKeyDown,
    handleButtonKeyDown,
    highlightClass,
    typeAheadPrefix,
    clearTypeAhead,
  };
}
