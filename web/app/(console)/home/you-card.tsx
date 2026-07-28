"use client";
// You, at a glance — persona chips with self-serve edits. Only your own
// attributes (the future permission model starts on this surface).
import { useState } from "react";
import { updateSelf } from "./actions";

export interface YouProps {
  name: string;
  personaLabel: string | null;
  availability: string | null;
  cuisines: string[];
  hardNos: string[];
}

export function YouCard({ you }: { you: YouProps }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="card widget you-card">
      <div className="you-head">
        <h2>You</h2>
        <button type="button" className="you-edit" onClick={() => setEditing((e) => !e)}>
          {editing ? "close" : "edit"}
        </button>
      </div>

      {!editing && (
        <>
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
        </>
      )}

      <div className={`reveal${editing ? " open" : ""}`} aria-hidden={!editing}>
        <div className="reveal-inner">
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
              Into <span className="muted">(comma-separated)</span>
              <input name="cuisines" defaultValue={you.cuisines.join(", ")} placeholder="sushi, tacos" />
            </label>
            <label>
              Hard nos <span className="muted">(comma-separated)</span>
              <input name="hard_nos" defaultValue={you.hardNos.join(", ")} placeholder="clubs" />
            </label>
            <button className="primary" type="submit">Save</button>
          </form>
        </div>
      </div>
    </div>
  );
}
