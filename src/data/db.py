"""SQLite access for Branch D.

One SQLite file (`data.sqlite` at repo root) is the language-neutral seam
between the Python agent and the Next.js web app. D writes `profiles` and
`matches`; reads `imports` and `oauth_tokens`. The schema is frozen
(`schema.sql`, A owns) — we only ever apply it, never edit it.

Everything here is plain stdlib `sqlite3`. The ports in `contracts.py` are
async, so callers wrap these sync helpers in `async def` methods; for a
single-file hackathon store that is plenty fast and avoids an extra dep.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

# repo root = .../beagle ; this file is .../beagle/src/data/db.py
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "data.sqlite"
SCHEMA_SQL = REPO_ROOT / "schema.sql"


def connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    """Open a connection with dict-like rows and FK enforcement."""
    path = Path(db_path) if db_path else DEFAULT_DB
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: str | Path | None = None) -> Path:
    """Apply the frozen schema (idempotent — all `CREATE TABLE IF NOT EXISTS`)."""
    path = Path(db_path) if db_path else DEFAULT_DB
    ddl = SCHEMA_SQL.read_text(encoding="utf-8")
    conn = connect(path)
    try:
        conn.executescript(ddl)
        conn.commit()
    finally:
        conn.close()
    return path
