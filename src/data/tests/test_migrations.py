"""init_db must heal databases created before post-freeze columns landed."""

import sqlite3

from src.data.db import init_db

OLD_SPARKS = """
CREATE TABLE IF NOT EXISTS sparks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id      TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS artifacts (
  plan_id    TEXT PRIMARY KEY,
  place      TEXT NOT NULL,
  time       TEXT NOT NULL,
  attendees  TEXT NOT NULL,
  playlist   TEXT NOT NULL DEFAULT '[]',
  photos     TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def cols(path, table):
    conn = sqlite3.connect(path)
    try:
        return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    finally:
        conn.close()


def test_init_db_adds_missing_columns_to_old_database(tmp_path):
    path = str(tmp_path / "old.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(OLD_SPARKS)
    conn.close()
    assert "photo" not in cols(path, "sparks")

    init_db(path)

    assert "photo" in cols(path, "sparks")
    assert {"group_id", "visibility", "note"} <= cols(path, "artifacts")


def test_init_db_stays_idempotent_on_current_schema(tmp_path):
    path = str(tmp_path / "new.sqlite")
    init_db(path)
    init_db(path)  # second run must not raise on already-present columns
    assert "photo" in cols(path, "sparks")
