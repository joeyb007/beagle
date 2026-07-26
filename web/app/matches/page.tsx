// People: swipe through nearby candidates, ranked by cosine similarity over
// the same earned taste vectors the agent builds — highest similarity on top.
import { redirect } from "next/navigation";
import { nearbyMatches } from "@/lib/similarity";
import { currentUser } from "@/lib/session";
import { SwipeCard, SwipeDeck } from "./swipe-deck";

export default async function Matches() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const cards: SwipeCard[] = nearbyMatches(user.handle).map((m) => ({
    match_name: m.name,
    score: m.score,
    reasons: m.reasons,
    days: m.days,
    km: m.km,
  }));

  return (
    <>
      <p className="eyebrow">people nearby</p>
      <h1>You&apos;d actually click</h1>
      <p className="sub">
        Ranked by cosine similarity over earned taste — not a signup form. Drag, or use the buttons.
      </p>
      <SwipeDeck cards={cards} />
    </>
  );
}

export const dynamic = "force-dynamic";
