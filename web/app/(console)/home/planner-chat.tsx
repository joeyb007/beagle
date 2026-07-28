"use client";
// The hero: free-form chat with Beagle the planner. The pixel beagle himself
// lives on the input bar — wandering while idle, thought-bubbling while he
// thinks, speech-bubbling (tail wagging) while the reply types out.
// The thread survives reloads (sessionStorage).
import { useEffect, useRef, useState } from "react";
import { PixelBeagle } from "@/components/pixel-beagle";

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
  const storageKey = `beagle-chat-${handle}`;
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: brief }]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false); // request in flight -> thought bubble
  const [typing, setTyping] = useState(false); // reply revealing -> speech bubble
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

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
  }, [messages, busy, typing, hydrated, storageKey]);

  async function reveal(full: string) {
    setTyping(true);
    setMessages((m) => [...m, { role: "assistant", text: "" }]);
    for (let i = 0; i < full.length && alive.current; i += 3) {
      const part = full.slice(0, i + 3);
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", text: part }]);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 26));
    }
    if (alive.current) {
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", text: full }]);
      setTyping(false);
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || typing) return;
    setInput("");
    const history = messages;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const resp = await fetch("/api/beagle-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, question, history }),
      });
      const data = await resp.json();
      setBusy(false);
      await reveal(data.reply ?? "…");
    } catch {
      setBusy(false);
      await reveal("lost the scent. try that again?");
    } finally {
      inputRef.current?.focus();
    }
  }

  const mood = busy ? "think" : typing ? "talk" : "free";

  return (
    <div className="card pchat">
      {messages.length > 1 && !busy && !typing && (
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

      <div className="pchat-scroll" ref={scroller}>
        {messages.map((m, i) => (
          <div key={i} className={`pchat-msg ${m.role}`}>
            <p>{m.text}</p>
          </div>
        ))}
        {messages.length === 1 && !busy && !typing && (
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

      <PixelBeagle targetIds={["pchat-input"]} host=".pchat" mood={mood} />

      <form
        className="pchat-bar"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          id="pchat-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ask beagle. plans, people, who's free when…"
          aria-label="Message Beagle"
        />
        <button className="primary" type="submit" disabled={busy || typing || !input.trim()}>
          {busy || typing ? "…" : "send"}
        </button>
      </form>
    </div>
  );
}
