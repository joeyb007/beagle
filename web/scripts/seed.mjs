// Seed data.sqlite so every screen renders with zero agent dependency —
// now including groups, photos (generated SVG polaroids), notes, visibility.
import Database from "better-sqlite3";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const dbPath = process.env.DATABASE_PATH ?? join(webRoot, "..", "data.sqlite");
const db = new Database(dbPath);
db.exec(readFileSync(join(webRoot, "..", "schema.sql"), "utf8"));

// -- migrations for DBs created before the frontend re-arch (idempotent)
for (const ddl of [
  "ALTER TABLE artifacts ADD COLUMN group_id INTEGER",
  "ALTER TABLE artifacts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'",
  "ALTER TABLE artifacts ADD COLUMN note TEXT",
]) {
  try { db.exec(ddl); } catch { /* column exists */ }
}

// -- profiles (Joseph is the live, allowlisted human)
const profile = db.prepare(
  "INSERT OR REPLACE INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, ?)"
);
const profiles = [
  ["+16475550132", "Joseph", { cuisines: ["sushi", "tacos"], vibe: ["low-key"], hard_nos: ["clubs"], typical_availability: "weekend evenings", persona_label: "the planner", notes: "keeps the group alive" }, 0.5],
  ["+15550000001", "Rayhan", { cuisines: ["sushi", "thai"], vibe: ["low-key"], hard_nos: ["clubs"], typical_availability: "weekends only", persona_label: "the picky one", notes: "training for a half marathon" }, 0.9],
  ["+15550000002", "Maya", { cuisines: ["tacos"], vibe: ["casual", "outdoors"], hard_nos: [], typical_availability: "most evenings", persona_label: "down for anything", notes: null }, 0.2],
  ["+15550000003", "Jules", { cuisines: ["korean", "pizza"], vibe: ["loud"], hard_nos: ["hiking"], typical_availability: "after 8pm", persona_label: "the night owl", notes: "new to the city" }, 0.5],
];
for (const [handle, name, data, score] of profiles) {
  profile.run(handle, name, JSON.stringify({ handle, name, ...data }), score);
}

// -- generated polaroid photos (self-contained SVGs, no network)
const uploads = join(webRoot, "public", "uploads");
mkdirSync(uploads, { recursive: true });
const scenes = [
  ["seed-sunset", "#F4A261", "#7A6FA0", "🌉"],
  ["seed-tacos", "#E9C46A", "#C4703F", "🌮"],
  ["seed-karaoke", "#5B7FA6", "#1D1C24", "🎤"],
  ["seed-hike", "#4F7A5A", "#A8C6A1", "⛰️"],
  ["seed-sushi", "#B56576", "#FAF3E7", "🍣"],
  ["seed-arcade", "#6D597A", "#355070", "🕹️"],
];
const photoUrl = (id) => `/uploads/${id}.svg`;
for (const [id, c1, c2, emoji] of scenes) {
  writeFileSync(
    join(uploads, `${id}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="236">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
      </linearGradient></defs>
      <rect width="300" height="236" fill="url(#g)"/>
      <text x="150" y="132" font-size="64" text-anchor="middle">${emoji}</text>
    </svg>`
  );
}

// -- groups
db.prepare("DELETE FROM groups").run();
const group = db.prepare("INSERT INTO groups (id, name, members, chat_id) VALUES (?, ?, ?, ?)");
group.run(1, "the usual suspects", JSON.stringify(["+16475550132", "+15550000001", "+15550000002"]), null);
group.run(2, "ex-coworkers 🫠", JSON.stringify(["+16475550132", "+15550000003"]), null);

// -- artifacts: two past keepsakes + one upcoming, tied to groups
const artifact = db.prepare(
  `INSERT OR REPLACE INTO artifacts
   (plan_id, place, time, attendees, playlist, photos, group_id, visibility, note)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
artifact.run(
  "plan-demo-1",
  JSON.stringify({ name: "Ebisu Sushi", area: "Inner Sunset", note: "counter seats" }),
  "2026-07-18T19:00:00",
  JSON.stringify(["+16475550132", "+15550000001", "+15550000002"]),
  JSON.stringify([
    { title: "Blend Opener", artist: "The Stubs" },
    { title: "Saturday Anthem", artist: "Seed Data" },
    { title: "Inner Sunset", artist: "Fog Line" },
  ]),
  JSON.stringify([photoUrl("seed-sushi"), photoUrl("seed-sunset"), photoUrl("seed-karaoke")]),
  1,
  "public",
  "the night Rayhan finally admitted the omakase was worth it"
);
artifact.run(
  "plan-demo-2",
  JSON.stringify({ name: "Tacos El Rey", area: "Mission", note: "cash only" }),
  "2026-07-05T19:30:00",
  JSON.stringify(["+16475550132", "+15550000002"]),
  JSON.stringify([{ title: "Mission Nights", artist: "Seed Data" }]),
  JSON.stringify([photoUrl("seed-tacos"), photoUrl("seed-arcade")]),
  1,
  "private",
  "two-person taco summit; maya ordered for six"
);
artifact.run(
  "plan-demo-3",
  JSON.stringify({ name: "Golden Gate Park picnic", area: "GGP", note: "bring frisbee" }),
  "2026-08-01T16:00:00",
  JSON.stringify(["+16475550132", "+15550000003"]),
  JSON.stringify([]),
  JSON.stringify([]),
  2,
  "private",
  null
);

// -- matches + routing log
db.prepare("DELETE FROM matches").run();
const match = db.prepare(
  "INSERT INTO matches (handle, match_name, score, reasons, is_sample) VALUES (?, ?, ?, ?, ?)"
);
match.run("+16475550132", "Sam K.", 0.92, JSON.stringify(["also loves tacos", "2 km away", "free most evenings"]), 1);
match.run("+16475550132", "Priya N.", 0.87, JSON.stringify(["outdoors vibe", "runs on Saturdays"]), 1);
match.run("+16475550132", "Diego M.", 0.81, JSON.stringify(["korean food", "night owl hours"]), 1);

db.prepare("DELETE FROM routing_log").run();
const log = db.prepare(
  "INSERT INTO routing_log (model, tier, cost_estimate, latency_ms) VALUES (?, ?, ?, ?)"
);
for (const c of [
  ["google/gemini-2.0-flash", "cheap", 0.0002, 310],
  ["google/gemini-2.0-flash", "cheap", 0.0002, 288],
  ["anthropic/claude-sonnet-4-20250514", "frontier", 0.0041, 920],
  ["google/gemini-2.0-flash", "cheap", 0.0003, 342],
  ["anthropic/claude-sonnet-4-20250514", "frontier", 0.0038, 1104],
  ["google/gemini-2.0-flash", "cheap", 0.0002, 264],
]) log.run(...c);

console.log(`seeded ${dbPath} (profiles, groups, artifacts+photos, matches, routing)`);
