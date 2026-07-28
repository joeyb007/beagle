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
    typical_availability: "sunday mornings, coffee first", persona_label: "the planner",
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

// The "hometown guys" crew — the demo GC. Fictional 555 numbers so nothing ever
// texts a real stranger; swap in real numbers for the live demo.
const CAM = "+14165550201";
const PAUL = "+14165550202";
const FORTUNE = "+14165550203";
const CRISTIANO = "+14165550204";
const LEANDRO = "+14165550205";

const lockInCrew = [
  [CAM, "Cam Fletcher", {
    cuisines: ["korean fried chicken", "wings"], vibe: ["loud", "competitive"],
    hard_nos: ["museums"], typical_availability: "sunday mornings (post run club)",
    persona_label: "the hype man",
    notes: "declares every plan 'the best night of our lives' in advance. right about half the time.",
  }, 0.3],
  [PAUL, "Paul Cseke", {
    cuisines: ["pho", "smash burgers"], vibe: ["low-key", "competitive"],
    hard_nos: ["clubs"], typical_availability: "sunday mornings, sharp",
    persona_label: "the strategist",
    notes: "shows up with a spreadsheet energy but no spreadsheet. calls dibs on navigator.",
  }, 0.55],
  [FORTUNE, "Fortune", {
    cuisines: ["jollof", "tacos"], vibe: ["spontaneous", "loud"],
    hard_nos: ["planning ahead"], typical_availability: "sunday mornings allegedly",
    persona_label: "the wildcard",
    notes: "40 minutes late, arrives with two strangers who become everyone's friends",
  }, 0.2],
  [CRISTIANO, "Cristiano", {
    cuisines: ["steak", "espresso"], vibe: ["competitive", "late night"],
    hard_nos: ["hiking"], typical_availability: "sunday mornings, espresso doubles",
    persona_label: "the closer",
    notes: "will not leave a game unfinished. any game. anyone's game.",
  }, 0.6],
  [LEANDRO, "Leandro", {
    cuisines: ["churrasco", "acai"], vibe: ["casual", "outdoors"],
    hard_nos: ["karaoke"], typical_availability: "sunday mornings, will drive",
    persona_label: "the calm one",
    notes: "brings the speaker, never fights over the aux, somehow always drives",
  }, 0.45],
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

for (const [handle, name, data, score] of [...crew, ...lockInCrew, ...nearby]) {
  profile.run(handle, name, JSON.stringify({ handle, name, ...data }), score);
}

// ---------------------------------------------------------------- groups
db.prepare("DELETE FROM groups").run();
const group = db.prepare("INSERT INTO groups (id, name, members, chat_id) VALUES (?, ?, ?, ?)");
group.run(1, "the usual suspects", JSON.stringify([JOSEPH, MADHAV, ANTHONY, MAX]), null);
group.run(2, "roomies", JSON.stringify([JOSEPH, MAX]), null);
group.run(3, "ex-coworkers 🫠", JSON.stringify([JOSEPH, MADHAV, ANTHONY]), null);
group.run(4, "hometown guys", JSON.stringify([JOSEPH, CAM, PAUL, FORTUNE, CRISTIANO, LEANDRO]), null);

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
    { title: "Pink + White", artist: "Frank Ocean" },
    { title: "Apocalypse", artist: "Cigarettes After Sex" },
    { title: "Cherry Wine", artist: "Hozier" },
    { title: "Ivy", artist: "Frank Ocean" },
    { title: "Chateau", artist: "Angus & Julia Stone" },
    { title: "Sweet", artist: "Cigarettes After Sex" },
    { title: "For the First Time", artist: "Mac DeMarco" },
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
    { title: "Skinny Love", artist: "Bon Iver" },
    { title: "Rivers and Roads", artist: "The Head and the Heart" },
    { title: "The Night We Met", artist: "Lord Huron" },
    { title: "First Day of My Life", artist: "Bright Eyes" },
    { title: "Winter Winds", artist: "Mumford & Sons" },
    { title: "Northern Attitude", artist: "Noah Kahan" },
    { title: "To Build a Home", artist: "The Cinematic Orchestra" },
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
    { title: "Intro", artist: "The xx" },
    { title: "Wait", artist: "M83" },
    { title: "Innerbloom", artist: "RÜFÜS DU SOL" },
    { title: "Open Eye Signal", artist: "Jon Hopkins" },
    { title: "Genesis", artist: "Grimes" },
    { title: "Night Owl", artist: "Galimatias" },
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
    { title: "Borderline", artist: "Tame Impala" },
    { title: "Kids", artist: "MGMT" },
    { title: "Dreams", artist: "Fleetwood Mac" },
    { title: "Go Your Own Way", artist: "Fleetwood Mac" },
    { title: "Tongue Tied", artist: "Grouplove" },
    { title: "Pumped Up Kicks", artist: "Foster the People" },
    { title: "Feels Like We Only Go Backwards", artist: "Tame Impala" },
    { title: "Take a Walk", artist: "Passion Pit" },
  ],
  [photo("canyon-drive"), photo("river-lookout"), photo("fog-ridge")],
  1, "private",
  "four hours of driving, zero plans, best day of the spring"),

A("plan-falls-hike",
  { name: "Cascade Falls hike", area: "Marin", note: "max's pick, 'easy 5 miler' (it was 9)" },
  "2026-06-13T08:30:00", [JOSEPH, MAX],
  [
    { title: "Harvest Moon", artist: "Neil Young" },
    { title: "Bloom", artist: "The Paper Kites" },
    { title: "Heartbeats", artist: "Jose Gonzalez" },
    { title: "Holocene", artist: "Bon Iver" },
    { title: "Wild Horses", artist: "The Rolling Stones" },
    { title: "Upward Over the Mountain", artist: "Iron & Wine" },
    { title: "Landslide", artist: "Fleetwood Mac" },
    { title: "Chicago", artist: "Sufjan Stevens" },
  ],
  [photo("waterfall-trail"), photo("alpine-lake"), photo("summit-scramble")],
  2, "public",
  "'easy five miles', max said. at mile eight he was still lying"),

A("plan-harbor",
  { name: "Harbor night walk", area: "Embarcadero", note: "post-dinner drift that became a night" },
  "2026-07-12T21:00:00", [JOSEPH, MADHAV, ANTHONY, MAX],
  [
    { title: "Best Part", artist: "Daniel Caesar" },
    { title: "Come Through and Chill", artist: "Miguel" },
    { title: "Get You", artist: "Daniel Caesar" },
    { title: "Japanese Denim", artist: "Daniel Caesar" },
    { title: "Adorn", artist: "Miguel" },
    { title: "Location", artist: "Khalid" },
    { title: "Redbone", artist: "Childish Gambino" },
    { title: "The Beach", artist: "The Neighbourhood" },
    { title: "Often", artist: "The Weeknd" },
    { title: "Lost", artist: "Frank Ocean" },
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
    { title: "Banana Pancakes", artist: "Jack Johnson" },
    { title: "Valerie", artist: "Amy Winehouse" },
    { title: "Three Little Birds", artist: "Bob Marley & The Wailers" },
    { title: "Lovely Day", artist: "Bill Withers" },
    { title: "Steal My Sunshine", artist: "Len" },
    { title: "Island In The Sun", artist: "Weezer" },
  ],
  [], 1, "private", null);

// ---- the "hometown guys" archive: five months of the demo GC actually using it
A("plan-li-gokarts",
  { name: "Go-kart grand prix", area: "K1 Speed", note: "cristiano called winner before we left the gc" },
  "2026-03-14T19:30:00", [JOSEPH, CAM, PAUL, FORTUNE, CRISTIANO, LEANDRO],
  [
    { title: "TiK ToK", artist: "Kesha" },
    { title: "Die Young", artist: "Kesha" },
    { title: "Starships", artist: "Nicki Minaj" },
    { title: "I Love It", artist: "Icona Pop ft. Charli XCX" },
    { title: "We Found Love", artist: "Rihanna ft. Calvin Harris" },
    { title: "Domino", artist: "Jessie J" },
    { title: "Timber", artist: "Pitbull ft. Kesha" },
    { title: "Dark Horse", artist: "Katy Perry" },
    { title: "Roar", artist: "Katy Perry" },
    { title: "Firework", artist: "Katy Perry" },
    { title: "Blow", artist: "Kesha" },
    { title: "S&M", artist: "Rihanna" },
  ],
  [photo("canyon-drive"), photo("night-moon")],
  4, "public",
  "cristiano demanded rematches until the staff turned the lights off. paul kept the lap times"),

A("plan-li-sunrise",
  { name: "Sunrise mission", area: "Grouse lookout", note: "leandro drove, paul brought a thermos like a legend" },
  "2026-04-26T05:45:00", [JOSEPH, CAM, PAUL, CRISTIANO, LEANDRO],
  [
    { title: "Wide Awake", artist: "Katy Perry" },
    { title: "Lights", artist: "Ellie Goulding" },
    { title: "Burn", artist: "Ellie Goulding" },
    { title: "Royals", artist: "Lorde" },
    { title: "Team", artist: "Lorde" },
    { title: "Summertime Sadness", artist: "Lana Del Rey" },
    { title: "Video Games", artist: "Lana Del Rey" },
    { title: "Young and Beautiful", artist: "Lana Del Rey" },
    { title: "Stay", artist: "Rihanna ft. Mikky Ekko" },
    { title: "Clarity", artist: "Zedd ft. Foxes" },
  ],
  [photo("fog-ridge"), photo("summit-scramble")],
  4, "private",
  "five of six made it. fortune said 'if the sun needs me it knows where i live'"),

A("plan-li-lake",
  { name: "Lake day reset", area: "Buntzen Lake", note: "one speaker, zero plans, all day" },
  "2026-05-30T13:00:00", [JOSEPH, CAM, PAUL, FORTUNE, CRISTIANO, LEANDRO],
  [
    { title: "Party in the U.S.A.", artist: "Miley Cyrus" },
    { title: "California Gurls", artist: "Katy Perry" },
    { title: "Good Time", artist: "Owl City & Carly Rae Jepsen" },
    { title: "Call Me Maybe", artist: "Carly Rae Jepsen" },
    { title: "22", artist: "Taylor Swift" },
    { title: "Shake It Off", artist: "Taylor Swift" },
    { title: "I Really Like You", artist: "Carly Rae Jepsen" },
    { title: "Cool for the Summer", artist: "Demi Lovato" },
    { title: "Rather Be", artist: "Clean Bandit ft. Jess Glynne" },
    { title: "Problem", artist: "Ariana Grande ft. Iggy Azalea" },
    { title: "Fancy", artist: "Iggy Azalea ft. Charli XCX" },
    { title: "Teenage Dream", artist: "Katy Perry" },
  ],
  [photo("alpine-lake"), photo("lake-sunset"), photo("river-lookout")],
  4, "public",
  "leandro's aux, zero skips. fortune showed up at 2:40 with two new friends"),

A("plan-li-trivia",
  { name: "Trivia night takeover", area: "The Annex", note: "paul's window: wednesday. paul's plan: domination" },
  "2026-06-17T20:00:00", [JOSEPH, CAM, PAUL, CRISTIANO],
  [
    { title: "What Makes You Beautiful", artist: "One Direction" },
    { title: "Story of My Life", artist: "One Direction" },
    { title: "Steal My Girl", artist: "One Direction" },
    { title: "Night Changes", artist: "One Direction" },
    { title: "Best Song Ever", artist: "One Direction" },
    { title: "Kiss You", artist: "One Direction" },
    { title: "Blank Space", artist: "Taylor Swift" },
    { title: "Style", artist: "Taylor Swift" },
    { title: "Love Story", artist: "Taylor Swift" },
  ],
  [],
  4, "private",
  "second place. paul has not recovered. we do not discuss round five"),

A("plan-li-market",
  { name: "Night market sweep", area: "Richmond night market", note: "fortune's 9pm idea that actually worked" },
  "2026-07-11T21:00:00", [JOSEPH, CAM, FORTUNE, CRISTIANO],
  [
    { title: "We Can't Stop", artist: "Miley Cyrus" },
    { title: "Wrecking Ball", artist: "Miley Cyrus" },
    { title: "Bang Bang", artist: "Jessie J, Ariana Grande, Nicki Minaj" },
    { title: "Into You", artist: "Ariana Grande" },
    { title: "Love Me Harder", artist: "Ariana Grande" },
    { title: "Side To Side", artist: "Ariana Grande ft. Nicki Minaj" },
    { title: "Super Bass", artist: "Nicki Minaj" },
    { title: "Boom Clap", artist: "Charli XCX" },
    { title: "Worth It", artist: "Fifth Harmony" },
    { title: "7/11", artist: "Beyonce" },
  ],
  [photo("city-towers"), photo("night-moon")],
  4, "private",
  "four stalls deep before anyone checked a price. cristiano won the claw machine on principle"),

A("plan-li-champ",
  { name: "Championship night: kbbq + fifa", area: "Gen Korean BBQ, then cristiano's", note: "controllers charged, grudges optional" },
  "2026-07-31T20:00:00", [JOSEPH, CAM, PAUL, FORTUNE, CRISTIANO, LEANDRO],
  [
    { title: "Last Friday Night (T.G.I.F.)", artist: "Katy Perry" },
    { title: "Run the World (Girls)", artist: "Beyonce" },
    { title: "We R Who We R", artist: "Kesha" },
    { title: "Till the World Ends", artist: "Britney Spears" },
    { title: "Raise Your Glass", artist: "P!nk" },
    { title: "On the Floor", artist: "Jennifer Lopez ft. Pitbull" },
    { title: "Give Me Everything", artist: "Pitbull ft. Ne-Yo" },
    { title: "Stronger (What Doesn't Kill You)", artist: "Kelly Clarkson" },
    { title: "Part of Me", artist: "Katy Perry" },
    { title: "Break Free", artist: "Ariana Grande ft. Zedd" },
  ],
  [], 4, "private", null);

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
    "note:1": "'it's just clouds', said madhav, four seconds too early",
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
  "plan-li-gokarts": {
    "/uploads/canyon-drive.jpg": "lap 11. the overtake cristiano still denies",
    "note:1": "cam yelled 'best night of our lives' before we even raced. correct, for once",
  },
  "plan-li-sunrise": {
    "/uploads/fog-ridge.jpg": "worth it. barely. don't tell paul",
  },
  "plan-li-lake": {
    "/uploads/lake-sunset.jpg": "the speaker survived the canoe. barely",
    "note:1": "fortune's two strangers are in the gc now. obviously",
  },
  "plan-li-market": {
    "/uploads/night-moon.jpg": "claw machine: cristiano 1, machine 0",
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
motive.run("+14155550101", "omakase counter, splitting the bill", "tonight 7pm", 1);
motive.run("+14155550104", "gallery hop then wine bar", "tomorrow 6pm", 2);
motive.run("+14155550106", "board game cafe, bring your sweats", "tonight 8pm", 4);
motive.run("+14155550108", "steakhouse happy hour, loud table", "tonight 6pm", 3);
motive.run("+14155550102", "sunrise hike, coffee on the summit", "tomorrow 6am", 2);
motive.run("+14155550103", "night market food crawl", "saturday 8pm", 2);
motive.run("+14155550105", "bouldering intro sesh, newbies welcome", "tomorrow 7pm", 3);
motive.run("+14155550107", "thrift run + listening party after", "this weekend", 2);
motive.run("+14155550101", "taco truck tour, three stops minimum", "saturday 1pm", 3);
motive.run("+14155550106", "karaoke basement, zero judgment", "tonight late", 4);
// Group threads: the chats page mirrors these (chat_id = web:<group id>).
db.prepare("DELETE FROM messages WHERE chat_id LIKE 'web:%'").run();
const msg = db.prepare(
  "INSERT INTO messages (chat_id, handle, direction, text, ts) VALUES (?, ?, ?, ?, datetime('now', ?))"
);
const threads = {
  "web:1": [
    ["+19295550252", "in", "yo who's around this weekend", "-3 days"],
    ["+13475550788", "in", "i could do saturday, sunday's dead for me", "-3 days"],
    [JOSEPH, "in", "saturday works. @beagle find us something", "-3 days"],
    ["beagle", "out", "on it. sniffing everyone's schedules, brb 🐶", "-3 days"],
    ["beagle", "out", "ok: saturday 7pm works for all four of you. thinking tacos el rey, patio's open and nobody's vetoed tacos yet", "-3 days"],
    ["+19145550081", "in", "tacos el rey goes crazy, i'm in", "-3 days"],
    ["+19295550252", "in", "in", "-3 days"],
    ["beagle", "out", "locked: tacos el rey, saturday 7pm. calendar invites are out, don't be late anthony", "-2 days"],
    ["+13475550788", "in", "one time i was late ONE time", "-2 days"],
  ],
  "web:2": [
    ["+19145550081", "in", "rent's due and the fridge is a crime scene", "-5 days"],
    [JOSEPH, "in", "grocery run + cook night? @beagle when are we both free", "-5 days"],
    ["beagle", "out", "you two overlap thursday after 7. want me to pencil in a cook night?", "-5 days"],
    ["+19145550081", "in", "yes chef", "-5 days"],
    ["beagle", "out", "thursday 7:30, cook night at the apartment. i'll remind you wednesday to actually buy groceries", "-5 days"],
  ],
  "web:3": [
    ["+19295550252", "in", "we haven't done happy hour since the reorg lol", "-9 days"],
    ["beagle", "out", "flagging that this chat has been quiet for 3 weeks. someone say the word and i'll find a bar", "-9 days"],
    ["+13475550788", "in", "the word", "-9 days"],
    ["beagle", "out", "say less. scouting patios now 🐶", "-9 days"],
  ],
  // the demo GC: five months of actually using it
  "web:4": [
    [CAM, "in", "new gc. hometown guys only.", "-137 days"],
    [PAUL, "in", "the prodigal gc returns", "-137 days"],
    [CAM, "in", "we never left", "-137 days"],
    [JOSEPH, "in", "added beagle. it plans so we actually leave the house", "-137 days"],
    ["beagle", "out", "hey hometown guys, i'm beagle. i learn what everyone's into, find when you're all free, and set the thing up. say the word when you want a night 🐶", "-137 days"],
    [CRISTIANO, "in", "i need to drive something fast and legal", "-136 days"],
    [JOSEPH, "in", "@beagle handle that", "-136 days"],
    ["beagle", "out", "on it. dming everyone for schedules, brb 🐶", "-136 days"],
    ["beagle", "out", "verdict: saturday 7:30 works for all six. k1 speed has open slots. locking unless someone objects", "-136 days"],
    [FORTUNE, "in", "i'll be there at 7:30 (8:15)", "-136 days"],
    ["beagle", "out", "locked: go-kart grand prix, saturday 7:30. fortune i booked you for 8:15", "-136 days"],
    [CAM, "in", "BEST NIGHT OF OUR LIVES INCOMING", "-136 days"],
    [CRISTIANO, "in", "rematch gets scheduled tonight or i riot", "-134 days"],
    ["beagle", "out", "grudge logged. it'll resurface at the right moment 🐶", "-134 days"],
    [PAUL, "in", "who's up for a sunrise hike. serious inquiries only", "-95 days"],
    [FORTUNE, "in", "if the sun needs me it knows where i live", "-95 days"],
    ["beagle", "out", "5 of 6 in for sunday 5:45am, grouse lookout. leandro's driving. fortune i'll send you the pictures", "-94 days"],
    [LEANDRO, "in", "thermos count: one. paul you legend", "-92 days"],
    [LEANDRO, "in", "borrowed my cousin's speaker. need a lake", "-60 days"],
    ["beagle", "out", "saturday 1pm is clean for all six. buntzen lake, leandro drives, fortune arrives at 2:40. some things i just know now", "-60 days"],
    [FORTUNE, "in", "slander. accurate slander", "-60 days"],
    ["beagle", "out", "it's been three weeks since the lake. cam has typed and deleted four times. someone say the word", "-42 days"],
    [CAM, "in", "TRIVIA. tomorrow", "-42 days"],
    ["beagle", "out", "wednesday 8pm works for four of you, the annex has a table. paul this is your window", "-42 days"],
    [PAUL, "in", "i've been preparing my whole life", "-42 days"],
    [CAM, "in", "we do not talk about round five", "-40 days"],
    [FORTUNE, "in", "who's up RIGHT NOW", "-17 days"],
    ["beagle", "out", "cam and cristiano are free, night market's open till 1. joseph's a maybe. that's a quorum 🐶", "-17 days"],
    [JOSEPH, "in", "fine. one hour (four hours)", "-17 days"],
    [CRISTIANO, "in", "claw machine owes me nothing. i took everything", "-16 days"],
    [JOSEPH, "in", "boys. friday. thoughts", "-3 days"],
    [CRISTIANO, "in", "kbbq then fifa at mine. non negotiable", "-3 days"],
    [CAM, "in", "negotiable if you unplug my controller again", "-3 days"],
    [JOSEPH, "in", "@beagle settle it", "-3 days"],
    ["beagle", "out", "checked all six calendars: friday 8pm is clean across the board. gen korean bbq first, fifa at cristiano's after. locking in one hour unless someone objects", "-3 days"],
    [PAUL, "in", "objection withheld strategically", "-3 days"],
    ["beagle", "out", "locked: championship night, friday 8pm. kbbq then fifa at cristiano's. controllers charged, grudges optional. calendar invites are out", "-3 days"],
    [CAM, "in", "BEST NIGHT OF OUR LIVES INCOMING (again)", "-3 days"],
    [LEANDRO, "in", "i'll drive. obviously", "-2 days"],
    [FORTUNE, "in", "there by 8 sharp (8:40)", "-2 days"],
    [PAUL, "in", "beagle drop the fifa power rankings", "-4 hours"],
    ["beagle", "out", "1. cristiano 2. paul 3. cam 4. joseph 5. leandro 6. fortune, retired undefeated, never played 🐶", "-4 hours"],
    [CRISTIANO, "in", "the list is correct and friday it gets embarrassing", "-1 hours"],
  ],
};
for (const [chatId, rows] of Object.entries(threads)) {
  for (const [handle, direction, text, ts] of rows) msg.run(chatId, handle, direction, text, ts);
}

// Inbox rail: Kaito asks into Joseph's motive; Sam texts back after his intro
// (the intro row must predate the reply for reply-detection to fire).
db.prepare(
  "INSERT INTO motive_joins (motive_id, handle) SELECT id, '+14155550103' FROM motives WHERE host_handle = ? AND text LIKE 'pickup volleyball%'"
).run(JOSEPH);
db.prepare(
  "INSERT INTO intros (handle, match_handle, decision, status, message, created_at)" +
  " VALUES (?, '+14155550101', 'intro', 'sent', 'hey! i''m beagle, joseph''s hangout dog. you two are basically taste twins, he''s at ' || ? || ' if you''re down 🐶', datetime('now', '-3 hours'))"
).run(JOSEPH, JOSEPH);
db.prepare(
  "INSERT INTO messages (chat_id, handle, direction, text, ts) VALUES ('dm-+14155550101', '+14155550101', 'in', 'yo joseph! beagle told me about you, sounds like we have the same taste in literally everything. tacos saturday?', datetime('now', '-2 hours'))"
).run();

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

console.log(`seeded ${dbPath}: ${crew.length + lockInCrew.length} crew + ${nearby.length} nearby, 4 groups, 13 hangouts, real photos`);

// ---------------------------------------------------------------- the wider world
// 30 more friends + 10 background GCs with their own hangouts and photos, so
// the app reads like months of real use. Fictional 555 numbers throughout.
const FRIEND_NAMES = [
  "Ava Chen", "Marcus Reid", "Sofia Marino", "Dev Patel", "Ella Brooks",
  "Jonas Weber", "Nia Thompson", "Liam Doyle", "Grace Park", "Theo Laurent",
  "Zoe Ferreira", "Owen Marsh", "Amara Diallo", "Felix Tan", "Ruby Castillo",
  "Nate Kowalski", "Ines Duarte", "Cole Barrett", "Yuki Tanaka", "Hana Ali",
  "Marco Silva", "Tessa Wright", "Andre Gomes", "Lily Zhao", "Sasha Petrov",
  "Maya Iyer", "Jack Whitfield", "Bianca Rossi", "Kofi Mensah", "Erin Walsh",
];
const personaPool = [
  "the early bird", "the foodie", "the gym rat", "the aux gremlin", "the photographer",
  "the debater", "the snack dealer", "the trip planner", "the couch anchor",
  "the birthday rememberer", "the group historian", "the last to leave",
];
const cuisinePool = ["ramen", "tacos", "dim sum", "pizza", "pho", "shawarma", "jerk chicken", "pasta", "bibimbap", "falafel", "poke", "birria"];
const vibePool = ["low-key", "loud", "outdoors", "casual", "spontaneous", "competitive", "late night"];
const noPool = ["clubs", "karaoke", "early mornings", "hiking", "museums", "spicy food", null, null];
const availPool = [
  "weekend evenings", "weeknights after 9", "weekends only", "most evenings",
  "friday and saturday nights", "weekend afternoons", "after 8pm", "wednesday and sunday nights",
];
const friendHandles = FRIEND_NAMES.map((name, i) => {
  const handle = `+1604555${String(300 + i).padStart(4, "0")}`;
  const data = {
    cuisines: [cuisinePool[i % cuisinePool.length], cuisinePool[(i + 5) % cuisinePool.length]],
    vibe: [vibePool[i % vibePool.length], vibePool[(i + 3) % vibePool.length]],
    hard_nos: noPool[i % noPool.length] ? [noPool[i % noPool.length]] : [],
    typical_availability: availPool[i % availPool.length],
    persona_label: personaPool[i % personaPool.length],
  };
  profile.run(handle, name, JSON.stringify({ handle, name, ...data }), (i % 8) / 10);
  return handle;
});

const PHOTO_POOL = [
  "golden-hour-bridge", "city-towers", "waterfall-trail", "alpine-lake",
  "summit-scramble", "northern-lights", "night-moon", "canyon-drive",
  "river-lookout", "fog-ridge", "harbor-night", "snow-summit", "lake-sunset",
];
const TRACK_POOL = [
  ["Dog Days Are Over", "Florence + The Machine"], ["Electric Feel", "MGMT"],
  ["Midnight City", "M83"], ["Tongue Tied", "Grouplove"], ["Riptide", "Vance Joy"],
  ["Feel It Still", "Portugal. The Man"], ["Take a Walk", "Passion Pit"],
  ["Safe and Sound", "Capital Cities"], ["Ho Hey", "The Lumineers"],
  ["On Top of the World", "Imagine Dragons"], ["Pompeii", "Bastille"],
  ["Shut Up and Dance", "WALK THE MOON"], ["Sweater Weather", "The Neighbourhood"],
  ["Young Folks", "Peter Bjorn and John"], ["Cool Kids", "Echosmith"],
  ["Budapest", "George Ezra"], ["Stolen Dance", "Milky Chance"],
  ["Are You Bored Yet?", "Wallows"], ["Heat Waves", "Glass Animals"],
];
const tracks = (start, n) =>
  Array.from({ length: n }, (_, k) => {
    const [title, artist] = TRACK_POOL[(start + k) % TRACK_POOL.length];
    return { title, artist };
  });
const daysAgoISO = (d, hour) =>
  new Date(Date.now() - d * 864e5).toISOString().slice(0, 11) + `${String(hour).padStart(2, "0")}:00:00`;

const bgGroups = [
  { id: 5, name: "sunday league", size: 6, events: [["Season opener", 148, 11], ["Playoff scare", 32, 10]] },
  { id: 6, name: "cottage szn", size: 5, events: [["Cottage weekend vol. 3", 55, 14]] },
  { id: 7, name: "brunch cabinet", size: 4, events: [["Benny summit", 96, 11], ["Patio quarterly", 12, 11]] },
  { id: 8, name: "poker night", size: 5, events: [["March bloodbath", 130, 20], ["The rebuy incident", 47, 20]] },
  { id: 9, name: "climbing crew", size: 4, events: [["Outdoor lead day", 71, 9]] },
  { id: 10, name: "intramural legends", size: 6, events: [["Championship loss (again)", 102, 19]] },
  { id: 11, name: "book club (real)", size: 4, events: [["We actually read it", 26, 19]] },
  { id: 12, name: "concert buddies", size: 3, events: [["Amphitheater field trip", 83, 18]] },
  { id: 13, name: "the cousins", size: 6, events: [["Backyard cookout", 62, 15], ["Aunties' anniversary", 20, 17]] },
  { id: 14, name: "ski szn", size: 5, events: [["First chair mission", 160, 7]] },
];
const bgNotes = [
  "nobody remembers the score, everybody remembers the wings",
  "we said one hour. it was five",
  "attendance was perfect. punctuality was not",
  "the photo doesn't cover the sound of that laugh",
  null,
];
let photoCursor = 0;
bgGroups.forEach((g, gi) => {
  const members = [JOSEPH, ...Array.from({ length: g.size - 1 }, (_, k) => friendHandles[(gi * 3 + k) % friendHandles.length])];
  group.run(g.id, g.name, JSON.stringify(members), null);
  g.events.forEach(([title, daysAgo, hour], ei) => {
    const nPhotos = (gi + ei) % 3; // 0..2 photos; some stay photoless
    const photos = Array.from({ length: nPhotos }, () => photo(PHOTO_POOL[photoCursor++ % PHOTO_POOL.length]));
    A(`plan-bg-${g.id}-${ei}`,
      { name: title, area: null, note: null },
      daysAgoISO(daysAgo, hour), members,
      tracks(gi * 2 + ei, 4 + ((gi + ei) % 4)),
      photos, g.id, (gi + ei) % 2 ? "public" : "private",
      bgNotes[(gi + ei) % bgNotes.length]);
  });
  const first = (h) => (FRIEND_NAMES[friendHandles.indexOf(h)] ?? "someone").split(" ")[0].toLowerCase();
  const m1 = members[1], m2 = members[2] ?? members[1];
  const d = 4 + gi * 2;
  msg.run(`web:${g.id}`, m1, "in", `who's in for the next one`, `-${d} days`);
  msg.run(`web:${g.id}`, "beagle", "out", `${first(m2)} and ${members.length - 2} others are free this weekend. want me to set it up?`, `-${d} days`);
  msg.run(`web:${g.id}`, m2, "in", "say the word and i'm there", `-${d - 1} days`);
});

console.log(`wider world: ${FRIEND_NAMES.length} friends + ${bgGroups.length} background gcs`);
