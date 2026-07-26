"""T9: agent-side ArtifactStore — writes the artifacts row at plan-lock (FR17).

C's web app reads/writes the same table; this class is never imported by web/.
"""

import json
import sqlite3

from src.contracts import Candidate, FinalPlan, HangoutArtifact, Track


class SqliteArtifactStore:
    def __init__(self, db_path: str):
        self._db_path = db_path

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    async def create(self, plan: FinalPlan, playlist: list[Track]) -> HangoutArtifact:
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO artifacts (plan_id, place, time, attendees, playlist)"
                " VALUES (?, ?, ?, ?, ?)",
                (
                    plan.plan_id,
                    plan.place.model_dump_json(),
                    plan.time.isoformat(),
                    json.dumps(plan.attendees),
                    json.dumps([t.model_dump() for t in playlist]),
                ),
            )
        return HangoutArtifact(
            plan_id=plan.plan_id,
            place=plan.place,
            time=plan.time,
            attendees=plan.attendees,
            playlist=playlist,
        )

    async def get(self, plan_id: str) -> HangoutArtifact | None:
        row = self._conn().execute(
            "SELECT place, time, attendees, playlist, photos, created_at"
            " FROM artifacts WHERE plan_id = ?",
            (plan_id,),
        ).fetchone()
        if row is None:
            return None
        return HangoutArtifact(
            plan_id=plan_id,
            place=Candidate.model_validate_json(row[0]),
            time=row[1],
            attendees=json.loads(row[2]),
            playlist=[Track(**t) for t in json.loads(row[3])],
            photos=json.loads(row[4]),
            created_at=row[5],
        )

    async def add_photos(self, plan_id: str, urls: list[str]) -> None:
        with self._conn() as conn:
            (existing,) = conn.execute(
                "SELECT photos FROM artifacts WHERE plan_id = ?", (plan_id,)
            ).fetchone()
            conn.execute(
                "UPDATE artifacts SET photos = ? WHERE plan_id = ?",
                (json.dumps(json.loads(existing) + urls), plan_id),
            )
