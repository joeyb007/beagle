"use client";
// Motives near you: the live bottom band. Same-day intents from nearby
// people, scored semantically against YOU ("82% your thing"), filtered by
// radius. Ask to join -> Beagle pitches you to the host; float your own
// from the composer card. Polls while an ask is pending so the host's yes
// lands without a reload.
import { useCallback, useEffect, useRef, useState } from "react";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    void load(radius);
  }

  function action(m: Motive) {
    if (m.my_status === "host") return <span className="motive-state">yours · waiting for bites</span>;
    if (m.my_status === "in") return <span className="motive-state in">you&apos;re in · {m.host_name.split(" ")[0]} said yes</span>;
    if (m.my_status === "pending")
      return <span className="motive-state">asked · waiting on {m.host_name.split(" ")[0]}</span>;
    if (m.spots_left === 0) return <span className="motive-state">full</span>;
    return (
      <button type="button" className="motive-join" onClick={() => join(m.id)}>
        ask to join
      </button>
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

      <div className="motives-row">
        <form className="motive-card composer" onSubmit={float}>
          <p className="motive-compose-head">float a motive</p>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="tacos + pool tn…"
            aria-label="What's the motive"
          />
          <div className="compose-row">
            <select value={window_} onChange={(e) => setWindow(e.target.value)} aria-label="When">
              <option value="tonight">tonight</option>
              <option value="tonight late">tonight late</option>
              <option value="tomorrow">tomorrow</option>
              <option value="this weekend">this weekend</option>
            </select>
            <select value={spots} onChange={(e) => setSpots(Number(e.target.value))} aria-label="Spots">
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} spot{n > 1 ? "s" : ""}</option>
              ))}
            </select>
          </div>
          <button className="motive-join" type="submit" disabled={busy || !draft.trim()}>
            {busy ? "floating…" : "float it"}
          </button>
        </form>

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
    </section>
  );
}
