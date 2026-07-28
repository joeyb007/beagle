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
  attachments?: Attachment[];
}

type Attachment =
  | { type: "slots"; duration_hours: number; slots: { day: string; date: string; start: string; end: string; free: string[]; count: number }[] }
  | { type: "venues"; venues: { name: string; area: string | null; note: string | null; url: string | null }[] }
  | { type: "plan_started"; crew: string; occasion: string; members: string[] }
  | { type: "nudged"; crew: string; message: string }
  | { type: "intros"; people: { handle: string; name: string; persona: string | null; km: number | null; tastes: string[]; days: number[]; why: string }[] }
  | { type: "intro_sent"; name: string; message: string };

function AttachmentView({ a }: { a: Attachment }) {
  if (a.type === "slots") {
    return (
      <div className="attach attach-slots">
        {a.slots.map((s, i) => (
          <div key={i} className="slot-chip" title={s.free.join(", ")}>
            <span className="slot-when">{s.day} {s.date} · {s.start}–{s.end}</span>
            <span className="slot-who">
              <span className="status-dot" />{s.count} free · {s.free.map((n) => n.split(" ")[0]).join(", ")}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (a.type === "venues") {
    return (
      <div className="attach attach-venues">
        {a.venues.map((v) => (
          <div key={v.name} className="venue-card">
            <strong>{v.name}</strong>
            {v.area && <span className="muted"> · {v.area}</span>}
            {v.note && <p className="muted">{v.note}</p>}
          </div>
        ))}
      </div>
    );
  }
  if (a.type === "plan_started") {
    return (
      <div className="attach plan-card">
        <span className="plan-badge">plan started</span>
        <strong>{a.occasion}</strong>
        <p className="muted">
          {a.crew} · DMing {a.members.map((n) => n.split(" ")[0]).join(", ")}
        </p>
      </div>
    );
  }
  if (a.type === "nudged") {
    return (
      <div className="attach plan-card">
        <span className="plan-badge">nudge sent</span>
        <p className="muted">to {a.crew}: &ldquo;{a.message}&rdquo;</p>
      </div>
    );
  }
  if (a.type === "intros") {
    return (
      <div className="attach attach-intros">
        {a.people.map((p) => (
          <div key={p.handle} className="intro-card">
            <div className="intro-card-body">
              <strong>{p.name}</strong>
              {p.persona && <span className="muted"> · {p.persona}</span>}
              {p.km != null && <span className="muted"> · {p.km} km</span>}
              {p.tastes.length > 0 && (
                <div className="chips" style={{ margin: "6px 0 0" }}>
                  {p.tastes.map((t) => (
                    <span key={t} className="chip chip-likes">{t}</span>
                  ))}
                </div>
              )}
              <p className="intro-why muted">{p.why}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (a.type === "intro_sent") {
    return (
      <div className="attach plan-card">
        <span className="plan-badge">intro sent</span>
        <strong>{a.name}</strong>
        <p className="muted">&ldquo;{a.message}&rdquo;</p>
      </div>
    );
  }
  return null;
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

  async function reveal(full: string, attachments?: Attachment[]) {
    setTyping(true);
    setMessages((m) => [...m, { role: "assistant", text: "" }]);
    for (let i = 0; i < full.length && alive.current; i += 3) {
      const part = full.slice(0, i + 3);
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", text: part }]);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 26));
    }
    if (alive.current) {
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", text: full, attachments }]);
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
      await reveal(data.reply ?? "…", data.attachments?.length ? data.attachments : undefined);
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
            <div className="pchat-msg-body">
              <p>{m.text}</p>
              {m.attachments?.map((a, j) => (
                <AttachmentView key={j} a={a} />
              ))}
            </div>
          </div>
        ))}
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

      {messages.length === 1 && !busy && !typing && (
        <div className="pchat-suggest">
          {chips.map((c, i) => (
            <button
              key={c}
              type="button"
              className="suggest-pill"
              style={{ animationDelay: `${140 + i * 80}ms` }}
              onClick={() => send(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
