-- Beagle shared SQLite schema — FROZEN after hour 0.
-- Seam between the Python agent (A/B/D) and the Next.js web app (C).
-- Writers/readers per table are specified in docs/branch-*.md. Request
-- changes from A (owner); never edit unilaterally.

-- D writes (distillation + refresh); C renders + edits. (FR10-14)
CREATE TABLE IF NOT EXISTS profiles (
  handle           TEXT PRIMARY KEY,      -- E.164 / email; REQUIRED for fan-out
  name             TEXT NOT NULL,
  json             TEXT NOT NULL,         -- full Profile as JSON (contracts.py shape)
  constraint_score REAL NOT NULL DEFAULT 0,  -- drives fan-out order (§9)
  profile_vector   TEXT,                  -- fused multi-modal embedding, JSON array
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- C writes raw chat text from onboarding; D reads + distills. (FR10)
CREATE TABLE IF NOT EXISTS imports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_text   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | processed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- C writes after OAuth callback; D reads to pull data. (FR20, FR22)
CREATE TABLE IF NOT EXISTS oauth_tokens (
  handle        TEXT NOT NULL,
  provider      TEXT NOT NULL,            -- 'spotify' | 'google'
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TEXT,
  PRIMARY KEY (handle, provider)
);

-- Agent (A's SqliteArtifactStore) writes at plan-lock; C reads + adds photos. (FR17-19)
CREATE TABLE IF NOT EXISTS artifacts (
  plan_id    TEXT PRIMARY KEY,
  place      TEXT NOT NULL,               -- Candidate as JSON
  time       TEXT NOT NULL,
  attendees  TEXT NOT NULL,               -- JSON array of handles
  playlist   TEXT NOT NULL DEFAULT '[]',  -- JSON array of Track
  photos     TEXT NOT NULL DEFAULT '[]',  -- JSON array of URLs; non-empty = keepsake state
  group_id   INTEGER,                     -- nullable link to groups
  visibility TEXT NOT NULL DEFAULT 'private',  -- 'private' | 'public'
  note       TEXT,                        -- Beagle's memory note (LLM-genned)
  photo_notes TEXT NOT NULL DEFAULT '{}', -- JSON {photo_url: post-it text} — agent context, keepsake-only UI
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Group chats Beagle lives in; web manages, agent may reference. (frontend re-arch)
CREATE TABLE IF NOT EXISTS groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  chat_id    TEXT,                        -- iMessage space id once known
  members    TEXT NOT NULL DEFAULT '[]',  -- JSON array of handles
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- D writes ranked matches; C renders; A sends top match as iMessage card. (FR28-30)
CREATE TABLE IF NOT EXISTS matches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  handle       TEXT NOT NULL,             -- who the match is for
  match_name   TEXT NOT NULL,
  score        REAL NOT NULL,
  reasons      TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  is_sample    INTEGER NOT NULL DEFAULT 1, -- seeded pool rows are narrated as samples
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A's MergeRouter writes one row per LLM call (sole producer); C renders dashboard. (FR33)
CREATE TABLE IF NOT EXISTS routing_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL DEFAULT (datetime('now')),
  model         TEXT NOT NULL,
  tier          TEXT NOT NULL,            -- 'cheap' | 'frontier'
  cost_estimate REAL,
  latency_ms    INTEGER
);

-- Serendipity sparks: web requests a "remember this day" nudge; agent sends it.
CREATE TABLE IF NOT EXISTS sparks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id      TEXT NOT NULL,
  requested_by TEXT NOT NULL,               -- handle of the person sparking
  photo        TEXT,                        -- specific photo to send with the nudge
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | skipped
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at      TEXT
);

-- Swipe decisions on the nearby pool: web writes; agent later texts intros.
CREATE TABLE IF NOT EXISTS intros (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  handle       TEXT NOT NULL,               -- who swiped
  match_handle TEXT NOT NULL,               -- who they swiped on
  decision     TEXT NOT NULL,               -- 'intro' | 'pass'
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | sent
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(handle, match_handle)
);

-- Autonomous outreach: Beagle noticing a quiet group and reaching out first.
CREATE TABLE IF NOT EXISTS outreach (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  sent_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
