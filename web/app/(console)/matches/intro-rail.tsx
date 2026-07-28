"use client";
// Intros in flight: the receipts for your right-swipes. Each row is who
// Beagle texted, when, and (expandable) the actual intro he sent.
import { useState } from "react";
import type { IntroOutcome } from "@/lib/db";

function ago(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso + "Z").getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_LABEL: Record<string, string> = {
  sent: "intro texted",
  pending: "drafting",
  skipped: "couldn't reach",
};

export function IntroRail({ intros, passed }: { intros: IntroOutcome[]; passed: number }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <aside className="intro-rail card">
      <p className="rail-head">intros in flight</p>

      {intros.length === 0 && (
        <p className="muted rail-empty">
          swipe right and beagle&apos;s texts show up here.
        </p>
      )}

      {intros.map((r) => (
        <div key={r.match_handle} className="rail-row">
          <button
            type="button"
            className="rail-row-top"
            onClick={() => r.message && setOpen((o) => (o === r.match_handle ? null : r.match_handle))}
            aria-expanded={open === r.match_handle}
          >
            <span className={`status-dot${r.status === "sent" ? "" : " off"}`} />
            <span className="rail-name">{r.name}</span>
            <span className="muted rail-meta">
              {STATUS_LABEL[r.status] ?? r.status} · {ago(r.created_at)}
            </span>
          </button>
          <div className={`reveal${open === r.match_handle ? " open" : ""}`} aria-hidden={open !== r.match_handle}>
            <div className="reveal-inner">
              {r.message && <p className="rail-message">&ldquo;{r.message}&rdquo;</p>}
            </div>
          </div>
        </div>
      ))}

      {passed > 0 && (
        <p className="muted rail-foot">{passed} passed</p>
      )}
      <p className="muted rail-note">
        matching against your tastes · <a href="/home">edit them on home</a>
      </p>
    </aside>
  );
}
