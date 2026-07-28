// People: Beagle's curated picks, ranked by the agent's semantic matching
// engine (person-card embeddings + cosine KNN). Falls back to the local
// taste-vector cosine when the agent is down, so the page always renders.
import { introOutcomes } from "@/lib/db";
import { nearbyMatches, wouldLove } from "@/lib/similarity";
import { currentUser } from "@/lib/session";
import { DossierStack, MatchCard } from "./dossier";
import { IntroRail } from "./intro-rail";

const AGENT = process.env.AGENT_URL ?? "http://127.0.0.1:8100";

interface AgentMatch {
  handle: string;
  name: string;
  km: number | null;
  days: number[];
  reasons: string[];
  persona: string | null;
  tastes: string[];
  says: string;
}

async function agentMatches(handle: string): Promise<AgentMatch[] | null> {
  try {
    const resp = await fetch(`${AGENT}/api/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, limit: 4 }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const { matches } = (await resp.json()) as { matches: AgentMatch[] };
    return matches;
  } catch {
    return null;
  }
}

export default async function Matches() {
  const user = await currentUser();
  if (!user) return null; // AuthGate shows the sign-in modal

  const fromAgent = await agentMatches(user.handle);
  const seed = (h: string) => [...h].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const cards: MatchCard[] = (
    fromAgent ??
    nearbyMatches(user.handle).map((m) => ({
      handle: m.handle,
      name: m.name,
      km: m.km,
      days: m.days,
      reasons: m.reasons,
      persona: m.persona,
      tastes: m.tastes,
      says: m.says,
    }))
  )
    .slice(0, 4)
    .map((m) => ({
      handle: m.handle,
      match_name: m.name,
      reasons: m.reasons,
      days: m.days,
      km: m.km,
      persona: m.persona,
      tastes: m.tastes,
      says: m.says,
      hook: wouldLove(user.handle, m.tastes, seed(m.handle)),
    }));

  const receipts = introOutcomes(user.handle);

  return (
    <>
      <p className="eyebrow">beagle&apos;s picks</p>
      <h1>People worth meeting</h1>
      <p className="sub">
        Beagle sniffed out {cards.length} people near you this week. Say the word and he texts the
        warm intro for you.
      </p>
      <div className="match-layout">
        <DossierStack cards={cards} />
        <IntroRail intros={receipts.intros} passed={receipts.passed} />
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
