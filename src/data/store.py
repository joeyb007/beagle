"""T1 — SqliteProfileStore: CRUD over the `profiles` table (implements ProfileStore).

The full Profile lives in the `json` column (authoritative, contracts.py shape).
`constraint_score` and `profile_vector` are mirrored into their own columns so A
(fan-out order) and C (web app) can read them without parsing JSON.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..contracts import Profile
from .db import connect


class SqliteProfileStore:
    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db = db_path

    async def get(self, handle: str) -> Profile | None:
        conn = connect(self._db)
        try:
            row = conn.execute(
                "SELECT json FROM profiles WHERE handle = ?", (handle,)
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        return Profile.model_validate_json(row["json"])

    async def upsert(self, p: Profile) -> None:
        vec = json.dumps(p.profile_vector) if p.profile_vector is not None else None
        conn = connect(self._db)
        try:
            conn.execute(
                """
                INSERT INTO profiles (handle, name, json, constraint_score,
                                      profile_vector, updated_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(handle) DO UPDATE SET
                    name             = excluded.name,
                    json             = excluded.json,
                    constraint_score = excluded.constraint_score,
                    profile_vector   = excluded.profile_vector,
                    updated_at       = datetime('now')
                """,
                (p.handle, p.name, p.model_dump_json(), p.constraint_score, vec),
            )
            conn.commit()
        finally:
            conn.close()

    async def list(self) -> list[Profile]:
        conn = connect(self._db)
        try:
            rows = conn.execute(
                "SELECT json FROM profiles ORDER BY constraint_score DESC"
            ).fetchall()
        finally:
            conn.close()
        # nearby:true marks match-pool candidates (web's swipe deck); bench:true
        # temporarily sidelines a member (solo demo). Neither is ever fanned out.
        return [
            Profile.model_validate_json(r["json"])
            for r in rows
            if not (json.loads(r["json"]).get("nearby") or json.loads(r["json"]).get("bench"))
        ]
