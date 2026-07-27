// T7: matching UI — nearby people you'd actually click with. Samples labeled.
import { listMatches, listProfiles } from "@/lib/db";
import { Chip } from "@/components/chip";
import { Meter } from "@/components/meter";

export default function Matches() {
  const matches = listMatches();
  const names = new Map(listProfiles().map((p) => [p.handle, p.name]));

  return (
    <>
      <h1>People nearby</h1>
      <p className="sub">
        Matched on the full picture — taste, music, photos — not a signup form.
      </p>
      <div className="matches">
        {matches.map((m, i) => (
          <div key={i} className="card match">
            <div className="name">{m.match_name}</div>
            <div className="for">
              for {names.get(m.handle) ?? m.handle}{" "}
              {m.is_sample && <Chip tone="muted">sample</Chip>}
            </div>
            <div className="fit">
              <Meter value={m.score} label={`${Math.round(m.score * 100)}% fit`} />{" "}
              <span className="num">{Math.round(m.score * 100)}% fit</span>
            </div>
            <ul>
              {m.reasons.map((r, j) => (<li key={j}>{r}</li>))}
            </ul>
          </div>
        ))}
      </div>
      {matches.length === 0 && (
        <div className="card">No matches yet — they appear once profiles have vectors.</div>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
