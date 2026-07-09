import { useEffect, useRef } from "react";

export default function SummaryInlineEditInput({ value, onChange, onSave, onCancel, placeholder }) {
  const inputRef = useRef(null);
  const skipBlurSaveRef = useRef(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      className="inline-edit-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          skipBlurSaveRef.current = true;
          onSave(inputRef.current?.value ?? value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          skipBlurSaveRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (skipBlurSaveRef.current) {
          skipBlurSaveRef.current = false;
          return;
        }
        onSave(inputRef.current?.value ?? value);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
