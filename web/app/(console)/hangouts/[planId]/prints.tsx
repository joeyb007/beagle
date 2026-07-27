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

  // keys starting "note:" are free-standing post-its, pinned between the prints
  const standalone = Object.entries(notes).filter(([k]) => k.startsWith("note:"));

  async function save(src: string) {
    setEditing(null);
    await fetch(`/api/hangouts/${planId}/photo-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src, note: draft }),
    });
    router.refresh();
  }

  function editor(key: string) {
    return (
      <textarea
        className="postit editing"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => save(key)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(key); }
          if (e.key === "Escape") setEditing(null);
        }}
        placeholder="what do you want to remember?"
      />
    );
  }

  return (
    <div className="prints">
      {photos.map((src) => (
        <div key={src} className="print-stack">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="print"><img src={src} alt="hangout photo" /></div>
          {editing === src ? (
            editor(src)
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

      {standalone.map(([key, text]) => (
        <div key={key} className="print-stack solo">
          {editing === key ? (
            editor(key)
          ) : (
            <button className="postit solo" onClick={() => { setDraft(text); setEditing(key); }}>
              {text}
            </button>
          )}
        </div>
      ))}
      <div className="print-stack solo">
        <button
          className="postit blank solo"
          onClick={() => { setDraft(""); setEditing(`note:${Date.now()}`); }}
        >
          + post-it
        </button>
        {editing?.startsWith("note:") && !notes[editing] && editor(editing)}
      </div>
    </div>
  );
}
