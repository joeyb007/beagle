"use client";
// Pill editor for list fields: type + Enter (or comma, or blur) adds a pill,
// x removes, backspace on empty pops the last. Submits as a comma-joined
// hidden input so server actions keep their existing parsing.
// (Same widget as the home You-card inline copy; new consumers import this.)
import { useState } from "react";

export function TagInput({
  name,
  tags,
  onChange,
  chipClass,
  placeholder,
}: {
  name: string;
  tags: string[];
  onChange: (next: string[]) => void;
  chipClass: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim().toLowerCase();
    setDraft("");
    if (v && !tags.includes(v)) onChange([...tags, v]);
  }

  return (
    <div className="tag-input">
      <input type="hidden" name={name} value={tags.join(", ")} />
      {tags.map((t) => (
        <span key={t} className={`chip ${chipClass} tag-pill`}>
          {t}
          <button
            type="button"
            className="tag-x"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            aria-label={`Remove ${t}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-entry"
        value={draft}
        placeholder={tags.length === 0 ? placeholder : ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
