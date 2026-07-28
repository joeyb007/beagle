// MATCHES CONCEPT A — "Sniff report" dossier: one curated pick at a time on
// keepsake paper. Polaroid pinned to the card, Beagle's pitch as a speech
// bubble, overlap as prose, decisions as words. No scores, no leaderboard.
import Link from "next/link";
import { nearbyMatches } from "@/lib/similarity";
import { currentUser } from "@/lib/session";
import type { SwipeCard } from "../matches/swipe-deck";
import { DossierStack } from "./dossier";

export default async function MatchesMockA() {
  const user = await currentUser();
  if (!user) return null;

  const cards: SwipeCard[] = nearbyMatches(user.handle).map((m) => ({
    handle: m.handle,
    match_name: m.name,
    score: m.score,
    reasons: m.reasons,
    days: m.days,
    km: m.km,
    persona: m.persona,
    tastes: m.tastes,
    says: m.says,
    hook: m.hook,
  }));

  return (
    <>
      <div className="mock-switch">
        <span className="muted">matches mockups:</span>
        <Link href="/matches-mock-a" className="on">A · sniff report</Link>
        <Link href="/matches-mock-b">B · chat intros</Link>
        <Link href="/matches">current page</Link>
      </div>
      <p className="eyebrow">beagle&apos;s picks</p>
      <h1>People worth meeting</h1>
      <p className="sub">
        Beagle sniffed out {Math.min(cards.length, 4)} people near you this week. Say the word and
        he texts the intro for both of you.
      </p>
      <DossierStack cards={cards.slice(0, 4)} />
    </>
  );
}

export const dynamic = "force-dynamic";
