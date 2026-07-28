// MATCHES CONCEPT B — chat-native intros: the page is a conversation with
// Beagle. He introduces each pick as a message with an embedded intro card;
// you decide inline with pills. Same attachment grammar as the home chat.
import Link from "next/link";
import { nearbyMatches } from "@/lib/similarity";
import { currentUser } from "@/lib/session";
import type { SwipeCard } from "../matches/swipe-deck";
import { IntroThread } from "./intro-thread";

export default async function MatchesMockB() {
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
        <Link href="/matches-mock-a">A · sniff report</Link>
        <Link href="/matches-mock-b" className="on">B · chat intros</Link>
        <Link href="/matches">current page</Link>
      </div>
      <p className="eyebrow">beagle&apos;s picks</p>
      <h1>People worth meeting</h1>
      <p className="sub">Beagle walks you through this week&apos;s picks, one intro at a time.</p>
      <IntroThread cards={cards.slice(0, 4)} firstName={user.name.split(" ")[0]} />
    </>
  );
}

export const dynamic = "force-dynamic";
