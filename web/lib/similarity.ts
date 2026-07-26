// Friend matching: cosine similarity over sparse taste vectors built from the
// same earned-profile fields the agent collects. "Nearby" candidates are
// profiles flagged nearby:true (the sample pool / non-friends), ranked highest
// similarity first for the swipe deck.
import { availableDays } from "./availability";
import { listProfiles, ProfileRow } from "./db";

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
    }))
    .sort((a, b) => b.score - a.score);
}
