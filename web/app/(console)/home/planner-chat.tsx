"use client";
// The hero: free-form chat with Beagle the planner. Opens with his brief
// (a real observation from the data) plus tappable suggestions; then it's a
// conversation — "who's free thursday?" gets grounded answers via the agent.
import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "assistant" | "user";
  text: string;
}

export function PlannerChat({
  handle,
  brief,
  chips,
}: {
  handle: string;
  brief: string;
  chips: string[];
}) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: brief }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const resp = await fetch("/api/beagle-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, question, history: messages }),
      });
      const data = await resp.json();
      setMessages((m) => [...m, { role: "assistant", text: data.reply ?? "…" }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "lost the scent — try that again?" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card pchat">
      <div className="pchat-scroll" ref={scroller}>
        {messages.map((m, i) => (
          <div key={i} className={`pchat-msg ${m.role}`}>
            {m.role === "assistant" && <span className="pchat-dog" aria-hidden>🐶</span>}
            <p>{m.text}</p>
          </div>
        ))}
        {busy && (
          <div className="pchat-msg assistant">
            <span className="pchat-dog" aria-hidden>🐶</span>
            <p className="pchat-typing"><span /><span /><span /></p>
          </div>
        )}
        {messages.length === 1 && (
          <div className="pchat-chips">
            {chips.map((c) => (
              <button key={c} type="button" className="chip chip-likes group-pick" onClick={() => send(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        className="pchat-bar"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ask beagle — plans, people, who's free when…"
          aria-label="Message Beagle"
        />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          send
        </button>
      </form>
    </div>
  );
}
