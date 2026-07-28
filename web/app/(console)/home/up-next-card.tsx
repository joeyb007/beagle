"use client";
// Up next — the locked plan with a live countdown, who's in and who's out
// (and which group chat it came from), and the road to the plan page.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { UpNextDetail } from "@/lib/db";

function bigUnit(msLeft: number): { value: string; label: string } {
  if (msLeft <= 0) return { value: "now", label: "have fun" };
  const mins = Math.floor(msLeft / 60000);
  const d = Math.floor(mins / 1440);
  if (d >= 1) return { value: String(d), label: d === 1 ? "day" : "days" };
  const h = Math.floor(mins / 60);
  if (h >= 1) return { value: String(h), label: h === 1 ? "hour" : "hours" };
  return { value: String(mins), label: "min" };
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
  const big = bigUnit(target - now);
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

      <div className="upnext-body">
        <div className="count-big" aria-label="Time until the hangout">
          <span className="count-big-num">{big.value}</span>
          <span className="count-big-label">{big.label}</span>
        </div>

        <div className="upnext-info">
          <p className="upnext-when">
            {when}
            {plan.groupName && (
              <span className="muted"> · from {plan.groupName}</span>
            )}
          </p>
          <ul className="going-list">
            {going.map((r) => (
              <li key={r.name}><span className="status-dot" />{r.name}</li>
            ))}
          </ul>
          {out.length > 0 && (
            <p className="muted upnext-out">
              {out.map((r) => r.name).join(", ")} can&apos;t make it
            </p>
          )}
        </div>
      </div>

      <Link href={`/hangouts/${plan.plan_id}`} className="upnext-cta">
        see the plan →
      </Link>
    </div>
  );
}
