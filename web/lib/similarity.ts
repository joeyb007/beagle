// Friend matching: cosine similarity over sparse taste vectors built from the
// same earned-profile fields the agent collects. "Nearby" candidates are
// profiles flagged nearby:true (the sample pool / non-friends), ranked highest
// similarity first for the swipe deck.
import { availableDays } from "./availability";
import { listProfiles, photoMemories, ProfileRow } from "./db";

interface Taste {
  cuisines?: string[];
  vibe?: string[];
  hard_nos?: string[];
  typical_availability?: string | null;
}

export type Vector = Map<string, number>;

const DAY_WEIGHT = 0.5; // availability overlap matters, but taste dominates

export function tasteVector(t: Taste): Vector {
  const v: Vector = new Map();
  for (const c of t.cuisines ?? []) v.set(`cuisine:${c.toLowerCase()}`, 1);
  for (const x of t.vibe ?? []) v.set(`vibe:${x.toLowerCase()}`, 1);
  for (const n of t.hard_nos ?? []) v.set(`no:${n.toLowerCase()}`, 1); // shared aversions bond people
  for (const d of availableDays(t.typical_availability ?? null)) v.set(`day:${d}`, DAY_WEIGHT);
  return v;
}

export function cosineSimilarity(a: Vector, b: Vector): number {
  let dot = 0;
  for (const [k, va] of a) dot += va * (b.get(k) ?? 0);
  const norm = (v: Vector) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  const denom = norm(a) * norm(b);
  return denom === 0 ? 0 : dot / denom;
}

export interface NearbyMatch {
  handle: string;
  name: string;
  score: number; // cosine similarity, 0..1
  km: number | null;
  days: number[]; // their real availability
  reasons: string[];
  persona: string | null;
  tastes: string[]; // their cuisines + vibes, for chips
  says: string; // beagle's matchmaker pitch
  hook: { src: string; place: string } | null; // my memory they'd have loved
}

function sharedReasons(mine: Taste, theirs: Taste): string[] {
  const shared = (a?: string[], b?: string[]) =>
    (a ?? []).filter((x) => (b ?? []).map((y) => y.toLowerCase()).includes(x.toLowerCase()));
  const reasons: string[] = [];
  const cuisines = shared(mine.cuisines, theirs.cuisines);
  if (cuisines.length) reasons.push(`both crave ${cuisines.join(" & ")}`);
  const vibes = shared(mine.vibe, theirs.vibe);
  if (vibes.length) reasons.push(`${vibes.join(", ")} energy on both sides`);
  const nos = shared(mine.hard_nos, theirs.hard_nos);
  if (nos.length) reasons.push(`both allergic to ${nos.join(" & ")}`);
  const myDays = new Set(availableDays(mine.typical_availability ?? null));
  const dayOverlap = availableDays(theirs.typical_availability ?? null).filter((d) => myDays.has(d));
  if (dayOverlap.length) reasons.push(`${dayOverlap.length} free day${dayOverlap.length === 1 ? "" : "s"} in common`);
  return reasons;
}

/** Beagle's one-line matchmaker pitch, in its own voice. Priority: shared
 *  aversions bond hardest, then food, then vibe, then plain optimism. */
export function beagleLine(mine: Taste, theirs: Taste): string {
  const shared = (a?: string[], b?: string[]) =>
    (a ?? []).filter((x) => (b ?? []).map((y) => y.toLowerCase()).includes(x.toLowerCase()));
  const nos = shared(mine.hard_nos, theirs.hard_nos);
  if (nos.length) return `you both say no to ${nos[0]} — that's basically friendship already 🐶`;
  const cuisines = shared(mine.cuisines, theirs.cuisines);
  if (cuisines.length) return `two people who'd split the ${cuisines[0]} order without discussion`;
  const vibes = shared(mine.vibe, theirs.vibe);
  if (vibes.length) return `${vibes[0]} energy on both ends — beagle can feel it`;
  return "beagle just has a feeling about this one 🐶";
}

// taste → words that show up in hangout names when that taste is being fed
const MEMORY_HOOKS: Record<string, string[]> = {
  outdoors: ["peak", "park", "hike", "falls", "trail", "canyon", "lake", "picnic", "sunset", "snow", "harbor", "aurora"],
  "low-key": ["picnic", "sunset", "walk", "harbor"],
  casual: ["picnic", "park", "walk"],
  loud: ["karaoke", "arcade"],
  spontaneous: ["road trip", "canyon", "aurora"],
};

/** A photo from MY hangouts that someone with these tastes would have loved.
 *  `seed` varies which matching memory is chosen, so cards don't all repeat
 *  the same photo. */
export function wouldLove(
  myHandle: string, tastes: string[], seed = 0
): { src: string; place: string } | null {
  const memories = photoMemories(myHandle);
  for (const taste of tastes.map((t) => t.toLowerCase())) {
    const hooks = MEMORY_HOOKS[taste] ?? [taste];
    const hits = memories.filter((m) => hooks.some((h) => m.place.toLowerCase().includes(h)));
    if (hits.length) return { src: hits[seed % hits.length].src, place: hits[seed % hits.length].place };
  }
  return null;
}

export function nearbyMatches(handle: string): NearbyMatch[] {
  const all = listProfiles();
  const mine = all.find((p) => p.handle === handle);
  if (!mine) return [];
  const myVec = tasteVector(mine.data);

  return all
    .filter((p): p is ProfileRow => p.handle !== handle && p.data.nearby === true)
    .map((p) => ({
      handle: p.handle,
      name: p.name,
      score: cosineSimilarity(myVec, tasteVector(p.data)),
      km: typeof p.data.km === "number" ? (p.data.km as number) : null,
      days: availableDays(p.data.typical_availability ?? null),
      reasons: sharedReasons(mine.data, p.data),
      persona: p.data.persona_label ?? null,
      tastes: [...(p.data.cuisines ?? []), ...(p.data.vibe ?? [])],
      says: beagleLine(mine.data, p.data),
      hook: wouldLove(
        handle,
        [...(p.data.vibe ?? []), ...(p.data.cuisines ?? [])],
        [...p.handle].reduce((s, ch) => s + ch.charCodeAt(0), 0)
      ),
    }))
    .sort((a, b) => b.score - a.score);
}
