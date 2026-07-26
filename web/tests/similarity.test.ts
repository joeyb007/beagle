// Matching: cosine similarity over taste vectors, ranked nearby candidates.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, expect, test } from "vitest";

import { cosineSimilarity, nearbyMatches, tasteVector } from "../lib/similarity";

let dbPath: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "beagle-")), "data.sqlite");
  new Database(dbPath).exec(readFileSync(join(__dirname, "../../schema.sql"), "utf8"));
  process.env.DATABASE_PATH = dbPath;
});

function seedProfile(handle: string, name: string, data: Record<string, unknown>) {
  new Database(dbPath)
    .prepare("INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0.5)")
    .run(handle, name, JSON.stringify({ handle, name, ...data }));
}

const me = {
  cuisines: ["sushi", "tacos"],
  vibe: ["low-key"],
  hard_nos: ["clubs"],
  typical_availability: "weekend evenings",
};

test("identical tastes score 1, disjoint tastes score 0", () => {
  const a = tasteVector(me);
  expect(cosineSimilarity(a, tasteVector(me))).toBeCloseTo(1);
  const stranger = tasteVector({
    cuisines: ["vegan"],
    vibe: ["loud"],
    hard_nos: [],
    typical_availability: "weekday mornings",
  });
  expect(cosineSimilarity(a, stranger)).toBeCloseTo(0, 1);
});

test("nearbyMatches ranks by cosine similarity, highest first", () => {
  seedProfile("+me", "Joseph", me);
  seedProfile("+twin", "Twin", { ...me, nearby: true, km: 1.2 });
  seedProfile("+half", "Half", {
    cuisines: ["sushi"], vibe: ["outdoors"], hard_nos: [], typical_availability: "weekends only", nearby: true, km: 3,
  });
  seedProfile("+opposite", "Opposite", {
    cuisines: ["steak"], vibe: ["loud"], hard_nos: ["sushi"], typical_availability: "weekday mornings", nearby: true, km: 2,
  });
  seedProfile("+friend", "Friend", { ...me }); // not nearby → excluded

  const ranked = nearbyMatches("+me");
  expect(ranked.map((m) => m.name)).toEqual(["Twin", "Half", "Opposite"]);
  expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  expect(ranked[1].score).toBeGreaterThan(ranked[2].score);
  expect(ranked[0].km).toBe(1.2);
});

test("matches carry human-readable shared-taste reasons and real days", () => {
  seedProfile("+me", "Joseph", me);
  seedProfile("+twin", "Twin", { ...me, nearby: true, km: 1.2 });
  const [twin] = nearbyMatches("+me");
  expect(twin.reasons.join(" ")).toMatch(/sushi/);
  expect(twin.reasons.join(" ")).toMatch(/clubs/);
  expect(twin.days).toEqual([5, 6]); // weekend evenings → Sat+Sun
});
