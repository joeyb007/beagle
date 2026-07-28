"use client";
// Up next — the locked plan with a live countdown, who's in and who's out
// (and which group chat it came from), and the road to the plan page.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (!cardRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
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
    <div className="card widget upnext" ref={cardRef}>
      <h2 style={{ marginTop: 0 }}>Up next</h2>
      <p className="widget-big">{plan.place}</p>

      <div className="upnext-body">
        <div className="count-big" aria-label="Time until the hangout">
          {/* server and client clocks/locales differ; client wins quietly */}
          <span className="count-big-num" suppressHydrationWarning>{big.value}</span>
          <span className="count-big-label" suppressHydrationWarning>{big.label}</span>
        </div>

        <div className="upnext-info">
          <p className="upnext-when">
            <span suppressHydrationWarning>{when}</span>
            {plan.groupName && (
              <span className="muted"> · from {plan.groupName}</span>
            )}
          </p>
          <button type="button" className="going-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span className="status-dot" />
            {going.length} going{out.length > 0 && <span className="muted"> · {out.length} out</span>}
          </button>
        </div>
      </div>

      <Link href={`/hangouts/${plan.plan_id}`} className="upnext-cta">
        see the plan →
      </Link>

      <div className={`upnext-pop${open ? " open" : ""}`} aria-hidden={!open}>
        <button type="button" className="pop-close" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
        <p className="roster-head">going</p>
        <ul>
          {going.map((r) => (
            <li key={r.name}><span className="status-dot" />{r.name}</li>
          ))}
        </ul>
        {out.length > 0 && (
          <>
            <p className="roster-head" style={{ marginTop: 10 }}>out</p>
            <ul>
              {out.map((r) => (
                <li key={r.name} className="is-out"><span className="status-dot off" />{r.name}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
