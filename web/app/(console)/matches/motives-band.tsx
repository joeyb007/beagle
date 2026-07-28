"use client";
// Motives near you: the live bottom band. Same-day intents from nearby
// people, scored semantically against YOU ("82% your thing"), filtered by
// radius. Ask to join -> Beagle pitches you to the host; float your own
// via the + tile, which opens the standard modal. Polls while an ask is
// pending so the host's yes lands without a reload.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Motive {
  id: number;
  host_handle: string;
  host_name: string;
  persona: string | null;
  text: string;
  time_window: string;
  km: number | null;
  spots_left: number;
  score: number;
  my_status: "none" | "pending" | "in" | "host";
}

const RADII = [2, 5, 10, 25] as const;

export function MotivesBand() {
  const [motives, setMotives] = useState<Motive[] | null | undefined>(undefined);
  const [radius, setRadius] = useState<number>(10);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [window_, setWindow] = useState("tonight");
  const [spots, setSpots] = useState(2);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const updateFades = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth > el.scrollWidth - 8);
  }, []);

  // fades reflect real overflow once cards render / change
  useEffect(() => {
    updateFades();
  }, [motives, updateFades]);

  useEffect(() => {
    if (!composing) return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setComposing(false);
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [composing]);

  const load = useCallback(async (r: number) => {
    try {
      const resp = await fetch(`/api/motives?radius=${r}`, { cache: "no-store" });
      const data = await resp.json();
      setMotives(data.motives ?? null);
    } catch {
      setMotives(null);
    }
  }, []);

  useEffect(() => {
    void load(radius);
  }, [radius, load]);

  // while any ask is pending, poll so the host's yes appears live
  useEffect(() => {
    const pending = (motives ?? []).some((m) => m.my_status === "pending");
    if (pending && !pollRef.current) {
      pollRef.current = setInterval(() => void load(radius), 8000);
    }
    if (!pending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [motives, radius, load]);

  async function join(id: number) {
    setMotives((ms) =>
      (ms ?? []).map((m) => (m.id === id ? { ...m, my_status: "pending" as const } : m))
    );
    await fetch("/api/motives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", motive_id: id }),
    }).catch(() => {});
    void load(radius);
  }

  async function float(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    await fetch("/api/motives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", text, time_window: window_, spots }),
    }).catch(() => {});
    setDraft("");
    setBusy(false);
    setComposing(false);
    void load(radius);
  }

  function action(m: Motive) {
    if (m.my_status === "host") return <span className="motive-state">yours · waiting for bites</span>;
    const asked = m.my_status === "pending" || m.my_status === "in";
    if (!asked && m.spots_left === 0) return <span className="motive-state">full</span>;
    const first = m.host_name.split(" ")[0];
    // one button across none -> pending -> in, so the green sweep transitions
    // in place and the checked state survives polls and reloads; the status
    // caption sits to the button's left on the same bottom row
    return (
      <div className="motive-act">
        {m.my_status === "pending" && <span className="muted motive-wait">waiting on {first}</span>}
        {m.my_status === "in" && <span className="muted motive-wait">{first} said yes</span>}
        <button
          type="button"
          className={`motive-join${asked ? " asked" : ""}`}
          disabled={asked}
          onClick={() => join(m.id)}
        >
          {asked && (
            <svg className="spark-check" viewBox="0 0 24 24" width="15" height="15" aria-hidden>
              <circle className="ck-circle" cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
              <path className="ck-mark" d="M7 12.5l3.4 3.4L17 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {m.my_status === "in" ? "you're in" : asked ? "asked" : "ask to join"}
        </button>
      </div>
    );
  }

  return (
    <section className="motives-band card">
      <div className="motives-head">
        <p className="rail-head" style={{ margin: 0 }}>motives near you</p>
        <div className="radius-pick">
          <button
            type="button"
            className="radius-trigger"
            onClick={() => setRadiusOpen((o) => !o)}
            aria-expanded={radiusOpen}
          >
            within {radius} km <span className="radius-caret">▾</span>
          </button>
          <div className={`radius-menu${radiusOpen ? " open" : ""}`}>
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                className={r === radius ? "on" : ""}
                onClick={() => {
                  setRadius(r);
                  setRadiusOpen(false);
                }}
              >
                {r} km
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`motives-scroll${atStart ? "" : " fade-l"}${atEnd ? "" : " fade-r"}`}>
      <div className="motives-row" ref={rowRef} onScroll={updateFades}>
        <button
          type="button"
          className="motive-add"
          onClick={() => setComposing(true)}
          aria-label="Float a motive"
        >
          <span className="motive-add-plus">+</span>
          <span className="motive-add-label">float a motive</span>
        </button>

        {motives === undefined && <p className="muted motives-note">sniffing around…</p>}
        {motives === null && (
          <p className="muted motives-note">beagle&apos;s brain is napping, motives are offline.</p>
        )}
        {motives?.length === 0 && (
          <p className="muted motives-note">nothing moving near you tonight. float one and see who bites.</p>
        )}

        {(motives ?? []).map((m) => (
          <div key={m.id} className={`motive-card${m.my_status === "host" ? " mine" : ""}`}>
            <div className="motive-fit">
              {m.my_status === "host" ? "your motive" : `${Math.round(m.score * 100)}% your thing`}
            </div>
            {m.my_status !== "host" && (
              <div className="motive-fit-bar" aria-hidden>
                <span style={{ width: `${Math.round(m.score * 100)}%` }} />
              </div>
            )}
            <p className="motive-text">{m.text}</p>
            <p className="motive-host">
              {m.host_name}
              {m.persona && <span className="muted"> · {m.persona}</span>}
            </p>
            <p className="muted motive-meta">
              {m.time_window}
              {m.km != null && <> · {m.km} km</>}
              {" · "}
              {m.spots_left} spot{m.spots_left === 1 ? "" : "s"} left
            </p>
            {action(m)}
          </div>
        ))}
      </div>
      </div>

      {/* portal to <body>: same stacking-context escape as the edit modal */}
      {composing && createPortal(
        <div
          className="auth-overlay wl-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Float a motive"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setComposing(false);
          }}
        >
          <div className="card auth-modal you-modal">
            <button type="button" className="pop-close" onClick={() => setComposing(false)} aria-label="Close">
              ×
            </button>
            <h2>Float a motive</h2>
            <p className="muted" style={{ margin: "0 0 4px" }}>
              nearby people who fit it will see it and ask in.
            </p>
            <form className="you-form" onSubmit={float}>
              <label>
                The motive
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="tacos + pool tn…"
                  autoFocus
                />
              </label>
              <label>
                When
                <select value={window_} onChange={(e) => setWindow(e.target.value)}>
                  <option value="tonight">tonight</option>
                  <option value="tonight late">tonight late</option>
                  <option value="tomorrow">tomorrow</option>
                  <option value="this weekend">this weekend</option>
                </select>
              </label>
              <label>
                Open spots
                <select value={spots} onChange={(e) => setSpots(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button className="primary" type="submit" disabled={busy || !draft.trim()}>
                {busy ? "floating…" : "float it"}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
