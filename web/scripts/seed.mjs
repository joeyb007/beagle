// Seed data.sqlite so every screen renders with zero agent dependency
// (docs/branch-c.md: "That's your independence.")
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH ?? join(here, "..", "..", "data.sqlite");
const db = new Database(dbPath);
db.exec(readFileSync(join(here, "..", "..", "schema.sql"), "utf8"));

const profile = db.prepare(
  "INSERT OR REPLACE INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, ?)"
);
const profiles = [
  ["+15550000001", "Rayhan", { cuisines: ["sushi", "thai"], vibe: ["low-key"], hard_nos: ["clubs"], typical_availability: "weekends only", persona_label: "the picky one", notes: "training for a half marathon" }, 0.9],
  ["+15550000002", "Maya", { cuisines: ["tacos"], vibe: ["casual", "outdoors"], hard_nos: [], typical_availability: "most evenings", persona_label: "down for anything", notes: null }, 0.2],
  ["+15550000003", "Jules", { cuisines: ["korean", "pizza"], vibe: ["loud"], hard_nos: ["hiking"], typical_availability: "after 8pm", persona_label: "the night owl", notes: "new to the city" }, 0.5],
];
for (const [handle, name, data, score] of profiles) {
  profile.run(handle, name, JSON.stringify({ handle, name, ...data }), score);
}

db.prepare(
  "INSERT OR REPLACE INTO artifacts (plan_id, place, time, attendees, playlist, photos) VALUES (?, ?, ?, ?, ?, ?)"
).run(
  "plan-demo-1",
  JSON.stringify({ name: "Ebisu Sushi", area: "Inner Sunset", url: null, note: "counter seats" }),
  "2026-08-01T19:00:00",
  JSON.stringify(["+15550000001", "+15550000002", "+15550000003"]),
  JSON.stringify([
    { title: "Blend Opener", artist: "The Stubs" },
    { title: "Saturday Anthem", artist: "Seed Data" },
    { title: "Inner Sunset", artist: "Fog Line" },
  ]),
  JSON.stringify([])
);

const match = db.prepare(
  "INSERT INTO matches (handle, match_name, score, reasons, is_sample) VALUES (?, ?, ?, ?, ?)"
);
db.prepare("DELETE FROM matches").run();
match.run("+15550000002", "Sam K.", 0.92, JSON.stringify(["also loves tacos", "2 km away", "free most evenings"]), 1);
match.run("+15550000002", "Priya N.", 0.87, JSON.stringify(["outdoors vibe", "runs on Saturdays"]), 1);
match.run("+15550000003", "Diego M.", 0.81, JSON.stringify(["korean food", "night owl hours"]), 1);

db.prepare("DELETE FROM routing_log").run();
const log = db.prepare(
  "INSERT INTO routing_log (model, tier, cost_estimate, latency_ms) VALUES (?, ?, ?, ?)"
);
const calls = [
  ["openai/gpt-4o-mini", "cheap", 0.0002, 310],
  ["openai/gpt-4o-mini", "cheap", 0.0002, 288],
  ["anthropic/claude-sonnet-4-5", "frontier", 0.0041, 920],
  ["openai/gpt-4o-mini", "cheap", 0.0003, 342],
  ["anthropic/claude-sonnet-4-5", "frontier", 0.0038, 1104],
  ["openai/gpt-4o-mini", "cheap", 0.0002, 264],
];
for (const c of calls) log.run(...c);

console.log(`seeded ${dbPath}`);
