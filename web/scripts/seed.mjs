// Seed data.sqlite so every screen renders with zero agent dependency.
// The friend group uses the four REAL allowlisted numbers so the live demo and
// the web demo are one world. Nearby people carry nearby:true — the agent's
// profile store excludes them from fan-out; they exist only for the swipe deck.
// Photos are real stock scenery (Lorem Picsum), pre-downloaded into
// public/uploads by this script's sibling step — regenerate with seed-photos.
import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
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
  "ALTER TABLE sparks ADD COLUMN photo TEXT",
  "ALTER TABLE artifacts ADD COLUMN photo_notes TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE groups ADD COLUMN voice TEXT",
]) {
  try { db.exec(ddl); } catch { /* column exists */ }
}

// ---------------------------------------------------------------- profiles
// The real crew (allowlisted numbers — safe to fan out).
const JOSEPH = "+16475550132";
const MADHAV = "+19295550252";
const ANTHONY = "+13475550788";
const MAX = "+19145550081";

const profile = db.prepare(
  "INSERT OR REPLACE INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, ?)"
);
const crew = [
  [JOSEPH, "Joseph Barbosa", {
    cuisines: ["sushi", "tacos"], vibe: ["low-key", "outdoors"], hard_nos: ["clubs"],
    typical_availability: "weekend evenings", persona_label: "the planner",
    notes: "keeps the thread alive; will drive if someone else picks the playlist",
  }, 0.5],
  [MADHAV, "Madhav", {
    cuisines: ["indian", "sushi"], vibe: ["low-key"], hard_nos: ["hiking before 10am"],
    typical_availability: "after 8pm on weekdays", persona_label: "the night owl",
    notes: "always down after 8, never before coffee",
  }, 0.6],
  [ANTHONY, "Anthony", {
    cuisines: ["korean bbq", "tacos"], vibe: ["loud", "spontaneous"], hard_nos: [],
    typical_availability: "most evenings", persona_label: "down for anything",
    notes: "said yes to everything so far. everything.",
  }, 0.15],
  [MAX, "Max", {
    cuisines: ["pizza", "ramen"], vibe: ["outdoors", "casual"], hard_nos: ["karaoke"],
    typical_availability: "weekends only", persona_label: "the weekend warrior",
    notes: "will hike anything, will not sing anything",
  }, 0.7],
];

// The nearby pool — swipe-deck candidates, graded overlap with Joseph.
const nearby = [
  ["+14155550101", "Sam K.", {
    cuisines: ["sushi", "tacos"], vibe: ["low-key", "outdoors"], hard_nos: ["clubs"],
    typical_availability: "weekend evenings", persona_label: "your taste twin",
    nearby: true, km: 1.2,
  }, 0.5],
  ["+14155550102", "Priya N.", {
    cuisines: ["tacos", "thai"], vibe: ["outdoors"], hard_nos: ["clubs"],
    typical_availability: "weekends only", persona_label: "the sunrise hiker",
    nearby: true, km: 2.8,
  }, 0.4],
  ["+14155550103", "Kaito S.", {
    cuisines: ["sushi", "ramen"], vibe: ["low-key"], hard_nos: [],
    typical_availability: "weekend evenings", persona_label: "the omakase scholar",
    nearby: true, km: 0.8,
  }, 0.6],
  ["+14155550104", "Lena T.", {
    cuisines: ["pizza", "tacos"], vibe: ["casual"], hard_nos: ["hiking"],
    typical_availability: "most evenings", persona_label: "the flexible one",
    nearby: true, km: 4.1,
  }, 0.3],
  ["+14155550105", "Noor A.", {
    cuisines: ["lebanese", "sushi"], vibe: ["low-key"], hard_nos: ["clubs"],
    typical_availability: "after 8pm", persona_label: "the late-dinner loyalist",
    nearby: true, km: 3.3,
  }, 0.5],
  ["+14155550106", "Theo B.", {
    cuisines: ["korean bbq"], vibe: ["loud", "spontaneous"], hard_nos: [],
    typical_availability: "most evenings", persona_label: "the plus-one magnet",
    nearby: true, km: 5.6,
  }, 0.2],
  ["+14155550107", "Mia C.", {
    cuisines: ["vegan", "thai"], vibe: ["outdoors"], hard_nos: ["late nights"],
    typical_availability: "weekday mornings", persona_label: "the 7am person",
    nearby: true, km: 6.9,
  }, 0.4],
  ["+14155550108", "Diego M.", {
    cuisines: ["steak"], vibe: ["loud"], hard_nos: ["sushi"],
    typical_availability: "weekday mornings", persona_label: "the contrarian",
    nearby: true, km: 7.4,
  }, 0.5],
];
// retire earlier seed generations (fake +1555 numbers must never fan out live;
// plan-demo-* artifacts point at deleted SVG placeholders)
db.prepare("DELETE FROM profiles WHERE handle LIKE '+1555%'").run();
db.prepare("DELETE FROM artifacts WHERE plan_id LIKE 'plan-demo-%'").run();

for (const [handle, name, data, score] of [...crew, ...nearby]) {
  profile.run(handle, name, JSON.stringify({ handle, name, ...data }), score);
}

// ---------------------------------------------------------------- groups
db.prepare("DELETE FROM groups").run();
const group = db.prepare("INSERT INTO groups (id, name, members, chat_id) VALUES (?, ?, ?, ?)");
group.run(1, "the usual suspects", JSON.stringify([JOSEPH, MADHAV, ANTHONY, MAX]), null);
group.run(2, "roomies", JSON.stringify([JOSEPH, MAX]), null);
group.run(3, "ex-coworkers 🫠", JSON.stringify([JOSEPH, MADHAV, ANTHONY]), null);

// ---------------------------------------------------------------- artifacts
const photo = (id) => `/uploads/${id}.jpg`;
for (const id of [
  "golden-hour-bridge", "city-towers", "waterfall-trail", "alpine-lake",
  "summit-scramble", "northern-lights", "night-moon", "canyon-drive",
  "river-lookout", "fog-ridge", "harbor-night", "snow-summit", "lake-sunset",
]) {
  if (!existsSync(join(webRoot, "public", "uploads", `${id}.jpg`)))
    console.warn(`warning: missing photo ${id}.jpg — run the photo download step`);
}

const artifact = db.prepare(
  `INSERT OR REPLACE INTO artifacts
   (plan_id, place, time, attendees, playlist, photos, group_id, visibility, note)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const A = (planId, place, time, attendees, playlist, photos, groupId, visibility, note) =>
  artifact.run(planId, JSON.stringify(place), time, JSON.stringify(attendees),
    JSON.stringify(playlist), JSON.stringify(photos), groupId, visibility, note);

// ~a year of hangouts: spread for cadence, one near today's date last year
// (on-this-day), one upcoming (up-next).
A("plan-twin-peaks",
  { name: "Twin Peaks sunset", area: "Twin Peaks, SF", note: "bring layers, the fog is undefeated" },
  "2025-07-27T19:30:00", [JOSEPH, MADHAV, ANTHONY, MAX],
  [
    { title: "Sofia", artist: "Clairo" },
    { title: "Show Me How", artist: "Men I Trust" },
    { title: "Myth", artist: "Beach House" },
    { title: "Golden Hour", artist: "Kacey Musgraves" },
  ],
  [photo("golden-hour-bridge"), photo("city-towers")],
  1, "public",
  "the fog held off for exactly forty minutes and we got all of them"),

A("plan-tahoe",
  { name: "Tahoe snow day", area: "South Lake Tahoe", note: "max drove, blizzard chains and all" },
  "2026-01-17T09:00:00", [JOSEPH, MADHAV, ANTHONY, MAX],
  [
    { title: "Mess Is Mine", artist: "Vance Joy" },
    { title: "Big Sur", artist: "Jack Johnson" },
    { title: "Holocene", artist: "Bon Iver" },
  ],
  [photo("snow-summit"), photo("lake-sunset")],
  1, "public",
  "anthony ate it on the bunny hill six times and rated the day 10/10"),

A("plan-aurora",
  { name: "Aurora watch", area: "Point Reyes", note: "the solar storm actually delivered" },
  "2026-02-21T22:30:00", [JOSEPH, MADHAV, ANTHONY],
  [
    { title: "Space Song", artist: "Beach House" },
    { title: "Nightcall", artist: "Kavinsky" },
    { title: "Midnight City", artist: "M83" },
  ],
  [photo("northern-lights"), photo("night-moon")],
  3, "public",
  "madhav said 'it's just clouds' four seconds before the sky went green"),

A("plan-canyon",
  { name: "Canyon road trip", area: "Highway 1 south", note: "no destination, one aux cord" },
  "2026-04-11T10:00:00", [JOSEPH, MADHAV, ANTHONY, MAX],
  [
    { title: "The Less I Know the Better", artist: "Tame Impala" },
    { title: "Electric Feel", artist: "MGMT" },
    { title: "Alright", artist: "Supergrass" },
  ],
  [photo("canyon-drive"), photo("river-lookout"), photo("fog-ridge")],
  1, "private",
  "four hours of driving, zero plans, best day of the spring"),

A("plan-falls-hike",
  { name: "Cascade Falls hike", area: "Marin", note: "max's pick — 'easy 5 miler' (it was 9)" },
  "2026-06-13T08:30:00", [JOSEPH, MAX],
  [
    { title: "Harvest Moon", artist: "Neil Young" },
    { title: "Bloom", artist: "The Paper Kites" },
  ],
  [photo("waterfall-trail"), photo("alpine-lake"), photo("summit-scramble")],
  2, "public",
  "'easy five miles' — max, at mile eight, still lying"),

A("plan-harbor",
  { name: "Harbor night walk", area: "Embarcadero", note: "post-dinner drift that became a night" },
  "2026-07-12T21:00:00", [JOSEPH, MADHAV, ANTHONY, MAX],
  [
    { title: "Best Part", artist: "Daniel Caesar" },
    { title: "Come Through and Chill", artist: "Miguel" },
    { title: "Get You", artist: "Daniel Caesar" },
  ],
  [photo("harbor-night")],
  1, "private",
  "nobody wanted to call it so we just kept walking until the bridge"),

A("plan-ggp-picnic",
  { name: "Golden Gate Park picnic", area: "GGP, near the windmill", note: "bring frisbee + one snack each" },
  "2026-08-02T15:00:00", [JOSEPH, MADHAV, ANTHONY, MAX],
  [
    { title: "Sunday Best", artist: "Surfaces" },
    { title: "Put Your Records On", artist: "Corinne Bailey Rae" },
  ],
  [], 1, "private", null);

// post-its — per-photo AND free-standing ("note:*") — extra agent context,
// keepsake-page only, scattered through the year
const photoNotes = {
  "plan-twin-peaks": {
    "/uploads/golden-hour-bridge.jpg": "the exact minute the fog lost",
    "/uploads/city-towers.jpg": "madhav swore he could see his apartment",
    "note:1": "we stayed 40 min past sunset and nobody said the word 'leave'",
  },
  "plan-tahoe": {
    "/uploads/snow-summit.jpg": "before the six bunny-hill falls",
    "note:1": "anthony rated the day 10/10 from the ground",
  },
  "plan-aurora": {
    "note:1": "'it's just clouds' — madhav, four seconds too early",
  },
  "plan-canyon": {
    "/uploads/river-lookout.jpg": "the pull-over that saved the whole day",
    "note:1": "one aux cord, zero skips",
  },
  "plan-falls-hike": {
    "/uploads/summit-scramble.jpg": "mile eight. 'easy five miles.'",
  },
  "plan-harbor": {
    "/uploads/harbor-night.jpg": "nobody wanted to call it",
  },
};
const setNotes = db.prepare("UPDATE artifacts SET photo_notes = ? WHERE plan_id = ?");
for (const [planId, notes] of Object.entries(photoNotes)) setNotes.run(JSON.stringify(notes), planId);

// full-run reset: clear queued work so a fresh demo starts quiet
db.prepare("DELETE FROM intros").run();
db.prepare("UPDATE sparks SET status = 'skipped' WHERE status = 'pending'").run();

// ---------------------------------------------------------------- matches + routing
db.prepare("DELETE FROM matches").run();
const match = db.prepare(
  "INSERT INTO matches (handle, match_name, score, reasons, is_sample) VALUES (?, ?, ?, ?, ?)"
);
match.run(JOSEPH, "Sam K.", 0.96, JSON.stringify(["both crave sushi & tacos", "both allergic to clubs"]), 1);
match.run(JOSEPH, "Kaito S.", 0.83, JSON.stringify(["both crave sushi", "weekend evenings overlap"]), 1);
match.run(JOSEPH, "Priya N.", 0.74, JSON.stringify(["outdoors energy on both sides"]), 1);

// Motives: same-day intents from the nearby pool for the social page band.
db.prepare("DELETE FROM motive_joins").run();
db.prepare("DELETE FROM motives").run();
const motive = db.prepare(
  "INSERT INTO motives (host_handle, text, time_window, spots) VALUES (?, ?, ?, ?)"
);
motive.run("+14155550102", "tacos + pool tn", "tonight 8pm-late", 2);
motive.run("+14155550103", "late night ramen run", "tonight 10pm", 1);
motive.run("+14155550105", "sunset climb + beers after", "saturday 5pm", 3);
motive.run("+14155550107", "flea market crawl, coffee after", "tomorrow 11am", 2);
motive.run(JOSEPH, "pickup volleyball + smash burgers", "this weekend", 3);

db.prepare("DELETE FROM routing_log").run();
const log = db.prepare(
  "INSERT INTO routing_log (model, tier, cost_estimate, latency_ms) VALUES (?, ?, ?, ?)"
);
for (const c of [
  ["claude-haiku-4-5-20251001", "cheap", 0.0004, 410],
  ["claude-haiku-4-5-20251001", "cheap", 0.0003, 388],
  ["claude-sonnet-5", "frontier", 0.0058, 1220],
  ["claude-haiku-4-5-20251001", "cheap", 0.0004, 352],
  ["claude-sonnet-5", "frontier", 0.0049, 1054],
  ["claude-haiku-4-5-20251001", "cheap", 0.0003, 296],
]) log.run(...c);

console.log(`seeded ${dbPath}: ${crew.length} crew + ${nearby.length} nearby, 3 groups, 7 hangouts, real photos`);
