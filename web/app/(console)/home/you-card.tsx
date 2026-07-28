"use client";
// You, at a glance — persona chips with self-serve edits. Only your own
// attributes (the future permission model starts on this surface).
// Editing happens in a modal popup; list fields are add/remove pills.
import { useEffect, useState } from "react";
import { updateSelf } from "./actions";

export interface YouProps {
  name: string;
  personaLabel: string | null;
  availability: string | null;
  cuisines: string[];
  hardNos: string[];
}

function TagInput({
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
      {/* the server action still reads a comma-joined string */}
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

export function YouCard({ you }: { you: YouProps }) {
  const [editing, setEditing] = useState(false);
  const [cuisines, setCuisines] = useState(you.cuisines);
  const [hardNos, setHardNos] = useState(you.hardNos);

  useEffect(() => {
    if (!editing) return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setEditing(false);
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [editing]);

  function open() {
    setCuisines(you.cuisines);
    setHardNos(you.hardNos);
    setEditing(true);
  }

  return (
    <div className="card widget you-card">
      <div className="you-head">
        <h2>You</h2>
        <button type="button" className="you-edit" onClick={open}>
          edit
        </button>
      </div>

      <p className="widget-big">{you.name}</p>
      <p className="muted" style={{ margin: "2px 0 8px" }}>
        {you.personaLabel ?? "still figuring you out"}
      </p>
      <div className="chips">
        {you.cuisines.map((c) => (
          <span key={c} className="chip chip-likes">{c}</span>
        ))}
        {you.hardNos.map((n) => (
          <span key={n} className="chip chip-no">no {n}</span>
        ))}
        {you.availability && <span className="chip chip-vibe">{you.availability}</span>}
      </div>

      {editing && (
        <div
          className="auth-overlay wl-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Edit your profile"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(false);
          }}
        >
          <div className="card auth-modal you-modal">
            <button type="button" className="pop-close" onClick={() => setEditing(false)} aria-label="Close">
              ×
            </button>
            <h2>Edit you</h2>
            <p className="muted" style={{ margin: "0 0 4px" }}>only you can change these.</p>
            <form action={updateSelf} className="you-form" onSubmit={() => setEditing(false)}>
              <label>
                Name
                <input name="name" defaultValue={you.name} />
              </label>
              <label>
                Usually free
                <input name="availability" defaultValue={you.availability ?? ""} placeholder="weekend evenings" />
              </label>
              <label>
                Into
                <TagInput
                  name="cuisines"
                  tags={cuisines}
                  onChange={setCuisines}
                  chipClass="chip-likes"
                  placeholder="sushi, tacos…"
                />
              </label>
              <label>
                Hard nos
                <TagInput
                  name="hard_nos"
                  tags={hardNos}
                  onChange={setHardNos}
                  chipClass="chip-no"
                  placeholder="clubs…"
                />
              </label>
              <button className="primary" type="submit">Save</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
