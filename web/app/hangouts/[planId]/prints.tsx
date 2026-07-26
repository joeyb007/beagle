"use client";
// Photo wall with post-its: stick a note on any print. Notes feed the agent's
// memory of the night; they live here only, never on the home carousel.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function Prints({
  planId,
  photos,
  notes,
}: {
  planId: string;
  photos: string[];
  notes: Record<string, string>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const router = useRouter();

  async function save(src: string) {
    setEditing(null);
    await fetch(`/api/hangouts/${planId}/photo-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src, note: draft }),
    });
    router.refresh();
  }

  return (
    <div className="prints">
      {photos.map((src) => (
        <div key={src} className="print-stack">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="print"><img src={src} alt="hangout photo" /></div>
          {editing === src ? (
            <textarea
              className="postit editing"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => save(src)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(src); }
                if (e.key === "Escape") setEditing(null);
              }}
              placeholder="what was happening here?"
            />
          ) : notes[src] ? (
            <button className="postit" onClick={() => { setDraft(notes[src]); setEditing(src); }}>
              {notes[src]}
            </button>
          ) : (
            <button className="postit blank" onClick={() => { setDraft(""); setEditing(src); }}>
              + note
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
