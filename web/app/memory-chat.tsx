"use client";
// Ask Beagle about one hangout (past or upcoming). Reusable: compact mode
// lives inside the string's memory card; full mode is the event page pane.
import { useRef, useState } from "react";

interface Msg {
  role: "user" | "beagle";
  text: string;
}

export function MemoryChat({
  planId,
  compact = false,
  endpoint = "/api/memory-chat",
  body = {},
  placeholder,
}: {
  planId?: string;
  compact?: boolean;
  endpoint?: string;
  body?: Record<string, unknown>;
  placeholder?: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: question }]);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(planId ? { plan_id: planId } : {}), ...body, question, history: msgs }),
    });
    const { reply } = await resp.json();
    setMsgs((m) => [...m, { role: "beagle", text: reply }]);
    setBusy(false);
    requestAnimationFrame(() =>
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
    );
  }

  return (
    <div className={`mchat${compact ? " compact" : ""}`}>
      {msgs.length > 0 && (
        <div className="mchat-thread" ref={scroller}>
          {msgs.map((m, i) => (
            <div key={i} className={`mchat-msg ${m.role}`}>{m.text}</div>
          ))}
          {busy && <div className="mchat-msg beagle thinking">…</div>}
        </div>
      )}
      <form onSubmit={ask} className="mchat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder ?? (compact ? "ask beagle about that day…" : "ask beagle about this hangout…")}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="ask">↑</button>
      </form>
    </div>
  );
}
