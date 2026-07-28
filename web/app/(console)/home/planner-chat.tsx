"use client";
// The hero: free-form chat with Beagle the planner. Opens with his brief
// (a real observation from the data) plus tappable suggestions; then it's a
// conversation — "who's free thursday?" gets grounded answers via the agent.
// The thread survives reloads (sessionStorage) so it feels like a real desk.
import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "assistant" | "user";
  text: string;
}

function DogMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 5.5C8 4 9.9 3.5 12 3.5s4 .5 5 2" />
      <path d="M7 5.5C5.2 6.3 4.1 8.6 4.6 11c.3 1.5 1.1 2.7 2.3 3.4" />
      <path d="M17 5.5c1.8.8 2.9 3.1 2.4 5.5-.3 1.5-1.1 2.7-2.3 3.4" />
      <path d="M7 5.5c-.3 2.1 0 4.6.9 6.9C9 15.7 10.4 18 12 18s3-2.3 4.1-5.6c.9-2.3 1.2-4.8.9-6.9" />
      <circle cx="12" cy="12.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
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
  const storageKey = `beagle-chat-${handle}`;
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: brief }]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // restore the running conversation; a fresh session starts from the brief
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Msg[];
        if (parsed.length > 1) setMessages(parsed);
      }
    } catch {
      /* fresh start */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)));
    } catch {
      /* storage full/blocked — fine */
    }
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, hydrated, storageKey]);

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
      setMessages((m) => [...m, { role: "assistant", text: "lost the scent. try that again?" }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="card pchat">
      <div className="pchat-head">
        <span className="pchat-avatar"><DogMark /></span>
        <div className="pchat-id">
          <strong>beagle</strong>
          <span className="pchat-status">
            <span className="status-dot" /> on the case
          </span>
        </div>
        {messages.length > 1 && (
          <button
            type="button"
            className="pchat-clear"
            onClick={() => {
              sessionStorage.removeItem(storageKey);
              setMessages([{ role: "assistant", text: brief }]);
            }}
          >
            new chat
          </button>
        )}
      </div>

      <div className="pchat-scroll" ref={scroller}>
        {messages.map((m, i) => (
          <div key={i} className={`pchat-msg ${m.role}`}>
            {m.role === "assistant" && (
              <span className="pchat-avatar sm" aria-hidden><DogMark /></span>
            )}
            <p>{m.text}</p>
          </div>
        ))}
        {busy && (
          <div className="pchat-msg assistant">
            <span className="pchat-avatar sm" aria-hidden><DogMark /></span>
            <p className="pchat-typing"><span /><span /><span /></p>
          </div>
        )}
        {messages.length === 1 && !busy && (
          <div className="pchat-chips">
            {chips.map((c, i) => (
              <button
                key={c}
                type="button"
                className="chip chip-likes group-pick"
                style={{ animationDelay: `${180 + i * 90}ms` }}
                onClick={() => send(c)}
              >
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
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ask beagle. plans, people, who's free when…"
          aria-label="Message Beagle"
        />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "send"}
        </button>
      </form>
    </div>
  );
}
