// People: swipe through nearby matches — cosine-ranked fused vectors,
// radius-prefiltered. Availability-at-a-glance is the point.
import { listMatches, listProfiles } from "@/lib/db";
import { SwipeCard, SwipeDeck } from "./swipe-deck";

// deterministic stub until sample-pool people carry real availability
function stubDays(name: string): number[] {
  const seed = [...name].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => (seed >> d) & 1 || d >= 5);
}
function stubKm(name: string): number {
  return ([...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 80) / 10 + 0.4;
}

export default function Matches() {
  const names = new Map(listProfiles().map((p) => [p.handle, p.name]));
  const cards: SwipeCard[] = listMatches().map((m) => ({
    match_name: m.match_name,
    forName: names.get(m.handle) ?? m.handle,
    score: m.score,
    reasons: m.reasons,
    is_sample: m.is_sample,
    days: stubDays(m.match_name),
    km: Math.round(stubKm(m.match_name) * 10) / 10,
  }));

  return (
    <>
      <p className="eyebrow">people nearby</p>
      <h1>You&apos;d actually click</h1>
      <p className="sub">
        Matched on the whole picture — taste, music, photos — not a signup form. Drag, or use the buttons.
      </p>
      <SwipeDeck cards={cards} />
    </>
  );
}

export const dynamic = "force-dynamic";
