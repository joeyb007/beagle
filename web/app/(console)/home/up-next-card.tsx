"use client";
// Up next — the locked plan with a live countdown, who's in and who's out
// (and which group chat it came from), and the road to the plan page.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { UpNextDetail } from "@/lib/db";

function parts(msLeft: number): { label: string; value: string }[] {
  if (msLeft <= 0) return [{ label: "now", value: "🎉" }];
  const mins = Math.floor(msLeft / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const s = Math.floor((msLeft % 60000) / 1000);
  if (d > 0)
    return [
      { label: "days", value: String(d) },
      { label: "hrs", value: String(h) },
      { label: "min", value: String(m) },
    ];
  return [
    { label: "hrs", value: String(h) },
    { label: "min", value: String(m) },
    { label: "sec", value: String(s) },
  ];
}

export function UpNextCard({ plan }: { plan: UpNextDetail }) {
  const [now, setNow] = useState(() => Date.now());
  const target = new Date(plan.time).getTime();
  const underDay = target - now < 86400000;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), underDay ? 1000 : 30000);
    return () => clearInterval(id);
  }, [underDay]);

  const going = plan.roster.filter((r) => r.going);
  const out = plan.roster.filter((r) => !r.going);
  const when = new Date(plan.time).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="card widget upnext">
      <h2 style={{ marginTop: 0 }}>Up next</h2>
      <p className="widget-big">{plan.place}</p>
      <p className="muted upnext-when">
        {when}
        {plan.groupName && <> · from <strong>{plan.groupName}</strong></>}
      </p>

      <div className="countdown" aria-label="Time until the hangout">
        {parts(target - now).map((p) => (
          <div key={p.label} className="count-cell">
            <span className="count-num">{p.value}</span>
            <span className="count-label">{p.label}</span>
          </div>
        ))}
      </div>

      <div className="roster">
        <div className="roster-col">
          <span className="roster-head">going</span>
          <ul>
            {going.map((r) => (
              <li key={r.name}><span className="status-dot" />{r.name}</li>
            ))}
          </ul>
        </div>
        {out.length > 0 && (
          <div className="roster-col">
            <span className="roster-head">out</span>
            <ul>
              {out.map((r) => (
                <li key={r.name} className="is-out"><span className="status-dot off" />{r.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Link href={`/hangouts/${plan.plan_id}`} className="upnext-cta">
        see the plan →
      </Link>
    </div>
  );
}
