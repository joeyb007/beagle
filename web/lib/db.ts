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
