// Web-side reader/writer over the shared SQLite seam (schema.sql, frozen).
// The agent process writes profiles/matches/routing_log/artifacts; we render
// them and own the human-facing writes (profile edits, imports, tokens, photos).
import Database from "better-sqlite3";
import { join } from "node:path";

export function db(): Database.Database {
  const path = process.env.DATABASE_PATH ?? join(process.cwd(), "..", "data.sqlite");
  const conn = new Database(path);
  conn.pragma("journal_mode = WAL"); // two processes, one file
  return conn;
}

export interface ProfileRow {
  handle: string;
  name: string;
  data: Record<string, unknown> & {
    cuisines?: string[];
    price_band?: string | null;
    vibe?: string[];
    hard_nos?: string[];
    typical_availability?: string | null;
    persona_label?: string | null;
    notes?: string | null;
  };
  constraint_score: number;
  updated_at: string;
}

function parseProfile(row: {
  handle: string;
  name: string;
  json: string;
  constraint_score: number;
  updated_at: string;
}): ProfileRow {
  return {
    handle: row.handle,
    name: row.name,
    data: JSON.parse(row.json),
    constraint_score: row.constraint_score,
    updated_at: row.updated_at,
  };
}

export function listProfiles(): ProfileRow[] {
  const rows = db().prepare("SELECT * FROM profiles ORDER BY name").all();
  return (rows as Parameters<typeof parseProfile>[0][]).map(parseProfile);
}

export function getProfile(handle: string): ProfileRow | null {
  const row = db().prepare("SELECT * FROM profiles WHERE handle = ?").get(handle);
  return row ? parseProfile(row as Parameters<typeof parseProfile>[0]) : null;
}

export function updateProfile(
  handle: string,
  patch: { name?: string; data?: Record<string, unknown>; constraint_score?: number }
): void {
  const existing = getProfile(handle);
  if (!existing) throw new Error(`no profile for ${handle}`);
  const merged = {
    name: patch.name ?? existing.name,
    data: { ...existing.data, ...(patch.data ?? {}), name: patch.name ?? existing.name },
    constraint_score: patch.constraint_score ?? existing.constraint_score,
  };
  db()
    .prepare(
      "UPDATE profiles SET name=?, json=?, constraint_score=?, updated_at=datetime('now') WHERE handle=?"
    )
    .run(merged.name, JSON.stringify(merged.data), merged.constraint_score, handle);
}

export function addImport(rawText: string): void {
  db().prepare("INSERT INTO imports (raw_text) VALUES (?)").run(rawText);
}

export function upsertToken(
  handle: string,
  provider: "spotify" | "google",
  token: { access_token: string; refresh_token?: string; expires_at?: string }
): void {
  db()
    .prepare(
      `INSERT INTO oauth_tokens (handle, provider, access_token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(handle, provider) DO UPDATE SET
         access_token=excluded.access_token,
         refresh_token=excluded.refresh_token,
         expires_at=excluded.expires_at`
    )
    .run(handle, provider, token.access_token, token.refresh_token ?? null, token.expires_at ?? null);
}

export interface MatchRow {
  handle: string;
  match_name: string;
  score: number;
  reasons: string[];
  is_sample: boolean;
  created_at: string;
}

export function listMatches(): MatchRow[] {
  const rows = db()
    .prepare("SELECT * FROM matches ORDER BY score DESC")
    .all() as (Omit<MatchRow, "reasons" | "is_sample"> & { reasons: string; is_sample: number })[];
  return rows.map((r) => ({ ...r, reasons: JSON.parse(r.reasons), is_sample: !!r.is_sample }));
}

// ------------------------------------------------- groups (frontend re-arch)

export interface HangoutRef {
  plan_id: string;
  place: { name: string };
  time: string;
}

export interface GroupRow {
  id: number;
  name: string;
  chat_id: string | null;
  members: string[];
  lastHangout: HangoutRef | null;
  upcomingHangout: HangoutRef | null;
}

function hangoutRef(row: { plan_id: string; place: string; time: string } | undefined): HangoutRef | null {
  return row ? { plan_id: row.plan_id, place: JSON.parse(row.place), time: row.time } : null;
}

export function createGroup(name: string, members: string[], chatId?: string): number {
  const res = db()
    .prepare("INSERT INTO groups (name, members, chat_id) VALUES (?, ?, ?)")
    .run(name, JSON.stringify(members), chatId ?? null);
  return Number(res.lastInsertRowid);
}

export function getGroup(id: number): GroupRow | null {
  const rows = listGroupsWithHangouts();
  return rows.find((g) => g.id === id) ?? null;
}

export function listGroupsWithHangouts(): GroupRow[] {
  const conn = db();
  const groups = conn.prepare("SELECT * FROM groups ORDER BY created_at DESC").all() as {
    id: number; name: string; chat_id: string | null; members: string;
  }[];
  const past = conn.prepare(
    "SELECT plan_id, place, time FROM artifacts WHERE group_id = ? AND time <= datetime('now') ORDER BY time DESC LIMIT 1"
  );
  const future = conn.prepare(
    "SELECT plan_id, place, time FROM artifacts WHERE group_id = ? AND time > datetime('now') ORDER BY time ASC LIMIT 1"
  );
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    chat_id: g.chat_id,
    members: JSON.parse(g.members),
    lastHangout: hangoutRef(past.get(g.id) as never),
    upcomingHangout: hangoutRef(future.get(g.id) as never),
  }));
}

// -------------------------------------- person<->photos + artifact metadata

export function photosOf(handle: string): string[] {
  const rows = db()
    .prepare("SELECT attendees, photos FROM artifacts ORDER BY time DESC")
    .all() as { attendees: string; photos: string }[];
  return rows
    .filter((r) => (JSON.parse(r.attendees) as string[]).includes(handle))
    .flatMap((r) => JSON.parse(r.photos) as string[]);
}

export interface PhotoMemory {
  src: string;
  plan_id: string;
  place: string;
  time: string;
  note: string | null;
  others: string[]; // names of the other people who were there
}

export function photoMemories(handle: string): PhotoMemory[] {
  const conn = db();
  const names = new Map(
    (conn.prepare("SELECT handle, name FROM profiles").all() as { handle: string; name: string }[])
      .map((r) => [r.handle, r.name])
  );
  const rows = conn
    .prepare("SELECT plan_id, place, time, attendees, photos, note FROM artifacts ORDER BY time DESC")
    .all() as { plan_id: string; place: string; time: string; attendees: string; photos: string; note: string | null }[];
  return rows
    .filter((r) => (JSON.parse(r.attendees) as string[]).includes(handle))
    .flatMap((r) => {
      const others = (JSON.parse(r.attendees) as string[])
        .filter((h) => h !== handle)
        .map((h) => names.get(h) ?? h);
      return (JSON.parse(r.photos) as string[]).map((src) => ({
        src,
        plan_id: r.plan_id,
        place: (JSON.parse(r.place) as { name: string }).name,
        time: r.time,
        note: r.note,
        others,
      }));
    });
}

// ------------------------------------------------------------- home widgets

export interface UpcomingHangout {
  plan_id: string;
  place: string;
  time: string;
  others: string[];
}

function nameMap(conn: Database.Database): Map<string, string> {
  return new Map(
    (conn.prepare("SELECT handle, name FROM profiles").all() as { handle: string; name: string }[])
      .map((r) => [r.handle, r.name])
  );
}

export function upcomingFor(handle: string): UpcomingHangout | null {
  const conn = db();
  const rows = conn
    .prepare("SELECT plan_id, place, time, attendees FROM artifacts WHERE time > datetime('now') ORDER BY time ASC")
    .all() as { plan_id: string; place: string; time: string; attendees: string }[];
  const mine = rows.find((r) => (JSON.parse(r.attendees) as string[]).includes(handle));
  if (!mine) return null;
  const names = nameMap(conn);
  return {
    plan_id: mine.plan_id,
    place: (JSON.parse(mine.place) as { name: string }).name,
    time: mine.time,
    others: (JSON.parse(mine.attendees) as string[]).filter((h) => h !== handle).map((h) => names.get(h) ?? h),
  };
}

export interface PeopleStats {
  mostSeen: { name: string; count: number } | null;
  longestUnseen: { name: string; lastTime: string } | null;
}

export function peopleStats(handle: string): PeopleStats {
  const conn = db();
  const rows = conn
    .prepare("SELECT time, attendees FROM artifacts WHERE time <= datetime('now') ORDER BY time ASC")
    .all() as { time: string; attendees: string }[];
  const counts = new Map<string, { count: number; lastTime: string }>();
  for (const r of rows) {
    const attendees = JSON.parse(r.attendees) as string[];
    if (!attendees.includes(handle)) continue;
    for (const h of attendees) {
      if (h === handle) continue;
      const entry = counts.get(h) ?? { count: 0, lastTime: r.time };
      entry.count += 1;
      entry.lastTime = r.time; // rows are time-ascending
      counts.set(h, entry);
    }
  }
  if (counts.size === 0) return { mostSeen: null, longestUnseen: null };
  const names = nameMap(conn);
  const entries = [...counts.entries()];
  const most = entries.reduce((a, b) => (b[1].count > a[1].count ? b : a));
  const unseen = entries.reduce((a, b) => (b[1].lastTime < a[1].lastTime ? b : a));
  return {
    mostSeen: { name: names.get(most[0]) ?? most[0], count: most[1].count },
    longestUnseen: { name: names.get(unseen[0]) ?? unseen[0], lastTime: unseen[1].lastTime },
  };
}

/** Distance in days between two dates on the calendar wheel (ignoring year). */
function anniversaryDistance(a: Date, b: Date): number {
  const dayMs = 24 * 3600 * 1000;
  const doy = (d: Date) => Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / dayMs);
  const diff = Math.abs(doy(a) - doy(b));
  return Math.min(diff, 365 - diff);
}

export function onThisDay(handle: string): PhotoMemory | null {
  const now = new Date();
  const candidates = photoMemories(handle).filter((m) => new Date(m.time) <= now);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) =>
    anniversaryDistance(new Date(b.time), now) < anniversaryDistance(new Date(a.time), now) ? b : a
  );
}

export function createSpark(planId: string, requestedBy: string, photo?: string): void {
  db()
    .prepare("INSERT INTO sparks (plan_id, requested_by, photo) VALUES (?, ?, ?)")
    .run(planId, requestedBy, photo ?? null);
}

// Post-it notes pinned to individual photos — extra agent context + something
// to look back on. Keepsake-page only; never surfaced on the home carousel.
export function getPhotoNotes(planId: string): Record<string, string> {
  const row = db().prepare("SELECT photo_notes FROM artifacts WHERE plan_id = ?").get(planId) as
    | { photo_notes: string }
    | undefined;
  return row ? JSON.parse(row.photo_notes || "{}") : {};
}

export function setPhotoNote(planId: string, src: string, note: string): void {
  const notes = getPhotoNotes(planId);
  if (note.trim()) notes[src] = note.trim();
  else delete notes[src];
  db()
    .prepare("UPDATE artifacts SET photo_notes = ? WHERE plan_id = ?")
    .run(JSON.stringify(notes), planId);
}

export interface SwipeRow {
  match_handle: string;
  decision: "intro" | "pass";
  status: string;
}

export function recordSwipe(handle: string, matchHandle: string, decision: "intro" | "pass"): void {
  db()
    .prepare(
      `INSERT INTO intros (handle, match_handle, decision) VALUES (?, ?, ?)
       ON CONFLICT(handle, match_handle) DO UPDATE SET decision = excluded.decision`
    )
    .run(handle, matchHandle, decision);
}

export function listSwipes(handle: string): SwipeRow[] {
  return db()
    .prepare("SELECT match_handle, decision, status FROM intros WHERE handle = ?")
    .all(handle) as SwipeRow[];
}

export interface MotiveAsk {
  motive_id: number;
  motive_text: string;
  asker_handle: string;
  asker_name: string;
  created_at: string;
}

export interface IntroReply {
  handle: string;
  name: string;
  last_text: string;
}

export interface JoinedMotive {
  motive_text: string;
  time_window: string;
  host_name: string;
}

/** The inbox rail: only rows that need you or reward you.
 *  asks    — pending join requests on motives YOU host (actionable)
 *  replies — intros where the match has since texted back (the payoff)
 *  joined  — open motives you're in (the reminder) */
export function railItems(handle: string): {
  asks: MotiveAsk[];
  replies: IntroReply[];
  joined: JoinedMotive[];
} {
  const asks = db()
    .prepare(
      `SELECT j.motive_id, m.text AS motive_text, j.handle AS asker_handle,
              COALESCE(p.name, j.handle) AS asker_name, j.created_at
       FROM motive_joins j
       JOIN motives m ON m.id = j.motive_id
       LEFT JOIN profiles p ON p.handle = j.handle
       WHERE m.host_handle = ? AND j.status = 'pending' AND m.status = 'open'
       ORDER BY j.created_at DESC`
    )
    .all(handle) as MotiveAsk[];

  const replies = (
    db()
      .prepare(
        `SELECT i.match_handle AS handle, COALESCE(p.name, i.match_handle) AS name,
                (SELECT ms.text FROM messages ms
                 WHERE ms.handle = i.match_handle AND ms.direction = 'in'
                   AND ms.ts >= i.created_at
                 ORDER BY ms.id DESC LIMIT 1) AS last_text
         FROM intros i LEFT JOIN profiles p ON p.handle = i.match_handle
         WHERE i.handle = ? AND i.decision = 'intro' AND i.status = 'sent'`
      )
      .all(handle) as (IntroReply & { last_text: string | null })[]
  ).filter((r): r is IntroReply => r.last_text != null);

  const joined = db()
    .prepare(
      `SELECT m.text AS motive_text, m.time_window,
              COALESCE(p.name, m.host_handle) AS host_name
       FROM motive_joins j
       JOIN motives m ON m.id = j.motive_id
       LEFT JOIN profiles p ON p.handle = m.host_handle
       WHERE j.handle = ? AND j.status = 'in' AND m.status = 'open'
       ORDER BY j.created_at DESC`
    )
    .all(handle) as JoinedMotive[];

  return { asks, replies, joined };
}

/** Host decides on a pending ask. Ownership-guarded: only the motive's host
 *  can decide, and only pending rows flip. Returns whether a row changed. */
export function decideJoin(
  hostHandle: string,
  motiveId: number,
  asker: string,
  decision: "in" | "declined"
): boolean {
  const res = db()
    .prepare(
      `UPDATE motive_joins SET status = ?
       WHERE motive_id = ? AND handle = ? AND status = 'pending'
         AND motive_id IN (SELECT id FROM motives WHERE host_handle = ?)`
    )
    .run(decision, motiveId, asker, hostHandle);
  return res.changes > 0;
}

export function setArtifactVisibility(planId: string, visibility: "private" | "public"): void {
  db().prepare("UPDATE artifacts SET visibility = ? WHERE plan_id = ?").run(visibility, planId);
}

export function setArtifactNote(planId: string, note: string): void {
  db().prepare("UPDATE artifacts SET note = ? WHERE plan_id = ?").run(note, planId);
}

export interface RoutingRow {
  ts: string;
  model: string;
  tier: string;
  cost_estimate: number | null;
  latency_ms: number | null;
}

export function listRoutingLog(): RoutingRow[] {
  return db()
    .prepare("SELECT ts, model, tier, cost_estimate, latency_ms FROM routing_log ORDER BY id DESC LIMIT 200")
    .all() as RoutingRow[];
}


// Provision-on-sign-in: the number IS the account. Creates a bare profile the
// first time a handle appears; upgrades a placeholder name once a real one is
// given. Never overwrites a name the agent or user already set.
export function ensureProfile(handle: string, name?: string): void {
  const existing = getProfile(handle);
  if (existing) {
    if (name && existing.name === existing.handle) {
      updateProfile(handle, { name });
    }
    return;
  }
  db()
    .prepare(
      "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0)"
    )
    .run(handle, name ?? handle, JSON.stringify({ name: name ?? handle }));
}

// ------------------------------------------------- home mockups: activity + groups

export interface ActivityRow {
  chat_id: string;
  handle: string;
  direction: "in" | "out";
  text: string;
  ts: string;
}

/** Latest agent traffic (the message log) — "what Beagle's been up to". */
export function recentActivity(limit = 10): ActivityRow[] {
  try {
    return db()
      .prepare("SELECT chat_id, handle, direction, text, ts FROM messages ORDER BY id DESC LIMIT ?")
      .all(limit) as ActivityRow[];
  } catch {
    return []; // messages table may not exist on an old db
  }
}

/** Groups this handle belongs to, with a staleness read for the pulse dot. */
export function groupsFor(handle: string): (GroupRow & { daysSince: number | null })[] {
  return listGroupsWithHangouts()
    .filter((g) => g.members.includes(handle))
    .map((g) => ({
      ...g,
      daysSince: g.lastHangout
        ? Math.floor((Date.now() - new Date(g.lastHangout.time).getTime()) / 86400000)
        : null,
    }));
}

/** Handles with a Google token — the availability grid marks them synced. */
export function googleSyncedHandles(): Set<string> {
  try {
    const rows = db()
      .prepare("SELECT DISTINCT handle FROM oauth_tokens WHERE provider='google'")
      .all() as { handle: string }[];
    return new Set(rows.map((r) => r.handle));
  } catch {
    return new Set();
  }
}

// ---------------------------------------------- up-next: full event detail

export interface UpNextDetail {
  plan_id: string;
  place: string;
  time: string;
  groupName: string | null;
  roster: { name: string; going: boolean }[];
}

/** The next locked hangout for a handle, with per-member going/out status
 * relative to the group chat it came from. */
export function upcomingDetail(handle: string): UpNextDetail | null {
  const conn = db();
  const rows = conn
    .prepare(
      "SELECT plan_id, place, time, attendees, group_id FROM artifacts WHERE time > datetime('now') ORDER BY time ASC"
    )
    .all() as { plan_id: string; place: string; time: string; attendees: string; group_id: number | null }[];
  const mine = rows.find((r) => (JSON.parse(r.attendees) as string[]).includes(handle));
  if (!mine) return null;

  const going = new Set(JSON.parse(mine.attendees) as string[]);
  const names = nameMap(conn);

  let groupName: string | null = null;
  let members: string[] = [...going];
  if (mine.group_id != null) {
    const g = conn
      .prepare("SELECT name, members FROM groups WHERE id = ?")
      .get(mine.group_id) as { name: string; members: string } | undefined;
    if (g) {
      groupName = g.name;
      members = JSON.parse(g.members) as string[];
      for (const h of going) if (!members.includes(h)) members.push(h);
    }
  }

  return {
    plan_id: mine.plan_id,
    place: (JSON.parse(mine.place) as { name: string }).name,
    time: mine.time,
    groupName,
    roster: members.map((h) => ({ name: names.get(h) ?? h, going: going.has(h) })),
  };
}
