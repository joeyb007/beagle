"use client";
// The home hero action: pick a crew, name the occasion, and get the exact
// trigger message for the group thread. Until the dedicated line lands (and
// Beagle sits in every group), the human carries the summons — copy, paste,
// and the agent takes it from there.
import { useState } from "react";

interface Crew {
  id: number;
  name: string;
}

export function SummonCard({ crews }: { crews: Crew[] }) {
  const [picked, setPicked] = useState<number | null>(crews[0]?.id ?? null);
  const [occasion, setOccasion] = useState("");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const crew = crews.find((c) => c.id === picked);
  const trigger = `hey beagle, ${occasion.trim() || "let's hang this week"}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(trigger);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the text is visible to copy by hand */
    }
  }

  return (
    <div className="action-card card">
      <div className="action-main">
        <h2>Plan something</h2>
        <p className="muted">Pick a crew, say the occasion. Beagle texts everyone, finds the overlap, locks the spot.</p>
        <div className="chips">
          {crews.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip chip-likes group-pick${picked === c.id ? " picked" : ""}`}
              onClick={() => setPicked(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <input
          className="occasion"
          type="text"
          placeholder="dinner this weekend? birthday? anything"
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
        />
        <div className={`reveal${open ? " open" : ""}`} aria-hidden={!open}>
          <div className="reveal-inner">
            <div className="summon-out">
              <p className="muted">send this in {crew ? <strong>{crew.name}</strong> : "the group chat"}:</p>
              <code className="summon-trigger">{trigger}</code>
              <button type="button" className="button copy-btn" onClick={copy}>
                {copied ? "copied" : "copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <button type="button" className="primary summon" onClick={() => setOpen((o) => !o)}>
        {open ? "Down, boy" : "Summon Beagle"}
      </button>
    </div>
  );
}
