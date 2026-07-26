// People: swipe through nearby candidates, ranked by cosine similarity over
// the same earned taste vectors the agent builds — highest similarity on top.
import { redirect } from "next/navigation";
import { nearbyMatches } from "@/lib/similarity";
import { currentUser } from "@/lib/session";
import { MatchStage } from "./match-stage";
import { SwipeCard } from "./swipe-deck";

export default async function Matches() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const matches = nearbyMatches(user.handle);
  const cards: SwipeCard[] = matches.map((m) => ({
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
      <p className="eyebrow">beagle&apos;s intros</p>
      <h1>People your plans would love</h1>
      <p className="sub">
        Beagle matched {matches.length} people nearby against everything it knows about you. Swipe
        right and it texts the intro for you — that&apos;s the whole point of a dog with a phone.
      </p>
      <MatchStage cards={cards} />
    </>
  );
}

export const dynamic = "force-dynamic";
