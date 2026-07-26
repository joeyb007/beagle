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

export function createSpark(planId: string, requestedBy: string): void {
  db()
    .prepare("INSERT INTO sparks (plan_id, requested_by) VALUES (?, ?)")
    .run(planId, requestedBy);
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
